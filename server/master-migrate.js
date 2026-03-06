const sql = require('mssql');
const crypto = require('crypto');
require('dotenv').config();

const NEW_KEY_HEX = 'aac8690344d44b571ce9f9e49c4158c32492dcd6cddc92c72201a6226010a9a06';
const OLD_KEY_HEX = 'b2f6e9c1d0a5b8f7e6d5c4b3a201928374655647382910abcdef0123456789ab';
const ALGORITHM = 'aes-256-gcm';
const NEW_KEK = Buffer.from(NEW_KEY_HEX, 'hex');
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

async function masterMigrate() {
    let pool;
    try {
        console.log("Starting Master Migration...");
        pool = await sql.connect({
            user: process.env.DB_USER,
            password: process.env.DB_PASSWORD,
            server: process.env.DB_SERVER,
            database: process.env.DB_NAME,
            options: { encrypt: true, trustServerCertificate: true }
        });

        // Map tables and columns to migrate
        const map = {
            'system_users': ['username', 'role', 'full_name', 'email', 'phone'],
            'audit_logs': ['action', 'timestamp', 'details'],
            'shipment_details': ['quantity', 'subtotal', 'batch_number'],
            'shipments': ['tracking_number', 'origin_address', 'destination_address', 'total_value', 'status'],
            'partners': ['partner_name', 'contact_person', 'email', 'contact_phone', 'type'],
            'supply_items': ['item_name', 'unit_cost', 'category'],
            'inventory_stock': ['quantity']
        };

        for (const [table, baseCols] of Object.entries(map)) {
            console.log(`Processing table: ${table}...`);
            const checkCols = await pool.request().query(`SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = '${table}'`);
            const existingCols = checkCols.recordset.map(c => c.COLUMN_NAME);

            const pkRes = await pool.request().query(`SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE WHERE TABLE_NAME = '${table}' AND CONSTRAINT_NAME LIKE 'PK%'`);
            const pk = pkRes.recordset[0]?.COLUMN_NAME || null;
            if (!pk) {
                console.log(`Skipping ${table}: No PK found`);
                continue;
            }

            const rows = await pool.request().query(`SELECT * FROM ${table}`);
            for (const row of rows.recordset) {
                const id = row[pk];
                let updateData = {}; // targetCol -> reEncryptedValue

                for (const baseCol of baseCols) {
                    if (!existingCols.includes(baseCol)) continue;

                    // Source priority: baseCol_old then baseCol
                    const sourceCols = [baseCol + '_old', baseCol].filter(c => existingCols.includes(c));
                    let decryptedText = null;

                    for (const sourceCol of sourceCols) {
                        const rawValue = row[sourceCol];
                        if (!rawValue) continue;

                        const strValue = String(rawValue);

                        // Try decrypt with NEW_KEK
                        let pt = decryptRaw(strValue, NEW_KEK);
                        if (pt === null) pt = decryptRaw(strValue, OLD_KEK);

                        if (pt !== null) {
                            decryptedText = pt;
                            break; // Stop at first successful decryption
                        } else if (strValue.split(':').length < 3) {
                            // Fallback to plaintext if not an envelope
                            decryptedText = strValue;
                            break;
                        }
                    }

                    if (decryptedText !== null) {
                        updateData[baseCol] = encryptRaw(decryptedText, NEW_KEK);
                    }
                }

                const updateEntries = Object.entries(updateData);
                if (updateEntries.length > 0) {
                    const request = pool.request();
                    request.input('pkVal', id);
                    const setClause = updateEntries.map(([col, val], idx) => {
                        request.input(`val${idx}`, sql.NVarChar, val);
                        return `${col} = @val${idx}`;
                    }).join(', ');

                    await request.query(`UPDATE ${table} SET ${setClause} WHERE ${pk} = @pkVal`);
                }
            }
        }

        console.log("Master Migration Complete.");
        process.exit(0);
    } catch (err) {
        console.error("Master Migration Fatal Error:", err.message);
        process.exit(1);
    }
}

masterMigrate();
