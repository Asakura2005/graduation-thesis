const sql = require('mssql');
const crypto = require('crypto');
require('dotenv').config();

const CURRENT_KEY_HEX = process.env.AES_SECRET_KEY || 'aac8690344d44b571ce9f9e49c4158c32492dcd6cddc92c72201a6226010a9a06';
const OLD_KEY_HEX = 'b2f6e9c1d0a5b8f7e6d5c4b3a201928374655647382910abcdef0123456789ab';
const ALGORITHM = 'aes-256-gcm';
const CURRENT_KEK = Buffer.from(CURRENT_KEY_HEX, 'hex');
const OLD_KEK = Buffer.from(OLD_KEY_HEX, 'hex');

function decryptRaw(envelope, kek) {
    if (!envelope || typeof envelope !== 'string') return null;
    const parts = envelope.split(':');
    if (parts.length < 3) return null; // Not an envelope
    if (parts.length < 6) {
        // Legacy 3 parts
        try {
            const [ivHex, authTagHex, encryptedText] = parts;
            const decipher = crypto.createDecipheriv(ALGORITHM, kek, Buffer.from(ivHex, 'hex'));
            decipher.setAuthTag(Buffer.from(authTagHex, 'hex'));
            let decrypted = decipher.update(encryptedText, 'hex', 'utf8');
            decrypted += decipher.final('utf8');
            return decrypted;
        } catch { return null; }
    }
    try {
        const [ivDataHex, authTagDataHex, encryptedText, ivKeyHex, authTagKeyHex, wrappedDEKHex] = parts;
        const decipherKey = crypto.createDecipheriv(ALGORITHM, kek, Buffer.from(ivKeyHex, 'hex'));
        decipherKey.setAuthTag(Buffer.from(authTagKeyHex, 'hex'));
        let DEK = decipherKey.update(wrappedDEKHex, 'hex');
        DEK = Buffer.concat([DEK, decipherKey.final()]);
        const decipherData = crypto.createDecipheriv(ALGORITHM, DEK, Buffer.from(ivDataHex, 'hex'));
        decipherData.setAuthTag(Buffer.from(authTagDataHex, 'hex'));
        let decrypted = decipherData.update(encryptedText, 'hex', 'utf8');
        decrypted += decipherData.final('utf8');
        return decrypted;
    } catch { return null; }
}

function encryptRaw(text, kek) {
    if (!text) return null;
    const DEK = crypto.randomBytes(32);
    const ivData = crypto.randomBytes(12);
    const cipherData = crypto.createCipheriv(ALGORITHM, DEK, ivData);
    let encryptedData = cipherData.update(text, 'utf8', 'hex');
    encryptedData += cipherData.final('hex');
    const authTagData = cipherData.getAuthTag().toString('hex');
    const ivKey = crypto.randomBytes(12);
    const cipherKey = crypto.createCipheriv(ALGORITHM, kek, ivKey);
    let wrappedDEK = cipherKey.update(DEK, null, 'hex');
    wrappedDEK += cipherKey.final('hex');
    const authTagKey = cipherKey.getAuthTag().toString('hex');
    return `${ivData.toString('hex')}:${authTagData}:${encryptedData}:${ivKey.toString('hex')}:${authTagKey}:${wrappedDEK}`;
}

async function fixAllEncryption() {
    let pool;
    try {
        console.log("Starting Full Encryption Re-Sync...");
        pool = await sql.connect({
            user: process.env.DB_USER,
            password: process.env.DB_PASSWORD,
            server: process.env.DB_SERVER,
            database: process.env.DB_NAME,
            options: { encrypt: true, trustServerCertificate: true, connectTimeout: 30000 }
        });

        // Comprehensive table/column map
        const tableMap = {
            'system_users': ['username', 'role', 'full_name', 'email', 'phone'],
            'audit_logs': ['action', 'timestamp', 'details'],
            'shipment_details': ['quantity', 'subtotal', 'batch_number'],
            'shipments': ['tracking_number', 'origin_address', 'destination_address', 'total_value', 'status'],
            'partners': ['partner_name', 'contact_person', 'email', 'contact_phone', 'type'],
            'supply_items': ['item_name', 'unit_cost', 'category', 'quantity_in_stock'],
            'inventory_stock': ['quantity', 'bin_location'],
            'warehouses': ['name', 'location', 'type', 'total_shelves']
        };

        for (const [table, cols] of Object.entries(tableMap)) {
            console.log(`Checking table: ${table}...`);
            // Check if table exists
            const tableExists = await pool.request().query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = '${table}'`);
            if (tableExists.recordset.length === 0) {
                console.log(`Table ${table} does not exist, skipping.`);
                continue;
            }

            const schemaRes = await pool.request().query(`SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = '${table}'`);
            const existingCols = schemaRes.recordset.map(c => c.COLUMN_NAME);
            const targets = cols.filter(c => existingCols.includes(c));

            const pkRes = await pool.request().query(`SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE WHERE TABLE_NAME = '${table}' AND CONSTRAINT_NAME LIKE 'PK%'`);
            const pk = pkRes.recordset[0]?.COLUMN_NAME || null;
            if (!pk) {
                console.log(`Skipping ${table}: Primary Key not found.`);
                continue;
            }

            const rows = await pool.request().query(`SELECT * FROM ${table}`);
            console.log(`Migrating ${rows.recordset.length} rows in ${table}...`);

            for (const row of rows.recordset) {
                const id = row[pk];
                let updateData = {};

                for (const col of targets) {
                    const raw = row[col];
                    if (!raw) continue;
                    const strRaw = String(raw);

                    // 1. Target column (base)
                    let plaintext = decryptRaw(strRaw, CURRENT_KEK);
                    if (plaintext === null) plaintext = decryptRaw(strRaw, OLD_KEK);

                    // 2. Check for _old column if exists and plaintext still null
                    if (plaintext === null && existingCols.includes(col + '_old')) {
                        const oldRaw = String(row[col + '_old'] || '');
                        if (oldRaw) {
                            plaintext = decryptRaw(oldRaw, CURRENT_KEK);
                            if (plaintext === null) plaintext = decryptRaw(oldRaw, OLD_KEK);
                            if (plaintext === null) plaintext = oldRaw; // Fallback
                        }
                    }

                    // 3. Last fallback: if not an envelope, treat as plaintext
                    if (plaintext === null && strRaw.split(':').length < 3) {
                        plaintext = strRaw;
                    }

                    if (plaintext !== null) {
                        updateData[col] = encryptRaw(plaintext, CURRENT_KEK);
                    }
                }

                if (Object.keys(updateData).length > 0) {
                    const request = pool.request();
                    request.input('pkVal', id);
                    const setClauses = Object.entries(updateData).map(([col, val], idx) => {
                        request.input(`val${idx}`, sql.NVarChar, val);
                        return `[${col}] = @val${idx}`;
                    });
                    await request.query(`UPDATE [${table}] SET ${setClauses.join(', ')} WHERE [${pk}] = @pkVal`);
                }
            }
        }

        console.log("Full Encryption Re-Sync Complete.");
        process.exit(0);
    } catch (err) {
        console.error("Fatal Sync Error:", err.message);
        process.exit(1);
    }
}

fixAllEncryption();
