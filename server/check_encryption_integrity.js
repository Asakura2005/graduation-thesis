const sql = require('mssql');
require('dotenv').config();
const { decrypt, safeDecrypt } = require('./EncryptionService');

const config = {
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    server: process.env.DB_SERVER,
    database: process.env.DB_NAME,
    options: {
        encrypt: true,
        trustServerCertificate: true
    }
};

const TABLES_TO_CHECK = {
    'system_users': ['username', 'full_name', 'email', 'role', 'phone', 'two_fa_secret', 'banned_until', 'ban_reason'],
    'inventory_stock': ['quantity', 'bin_location'],
    'supply_items': ['item_name', 'category', 'unit_cost', 'quantity_in_stock'],
    'audit_logs': ['action', 'details', 'timestamp'],
    'notifications': ['target_role', 'title', 'message', 'type'],
    'login_attempts': ['ip_address', 'user_agent', 'success', 'risk_score', 'risk_factors', 'blocked', 'captcha_verified'],
    'warehouses': ['name', 'location', 'total_shelves'],
    'partners': ['name', 'type', 'contact_info'],
    'shipments': ['tracking_number', 'status', 'ship_date', 'delivery_date'],
    'auth_refresh_tokens': ['device_fingerprint', 'location', 'ip'],
    'trusted_devices': ['ip_address', 'user_agent', 'browser', 'os', 'location', 'is_trusted'],
    'pending_registrations': ['username', 'full_name', 'email', 'phone', 'role'],
    'otp_tokens': ['email', 'otp_code']
};

async function runScan() {
    try {
        const pool = await sql.connect(config);
        console.log("Connected to Database. Scanning for plaintext data...\n");

        for (const [tableName, columns] of Object.entries(TABLES_TO_CHECK)) {
            console.log(`Scanning Table: ${tableName}...`);
            
            const result = await pool.request().query(`SELECT * FROM ${tableName}`);
            const records = result.recordset;
            let plaintextCount = 0;
            const recordsToDelete = [];

            for (const row of records) {
                let isPlaintext = false;
                for (const col of columns) {
                    const value = row[col];
                    if (value && typeof value === 'string') {
                        // Check if it's NOT an envelope (missing colons)
                        if (!value.includes(':')) {
                            isPlaintext = true;
                            // console.log(`  [PLAINTEXT] ${tableName}.${col}: ${value.substring(0, 20)}...`);
                            break;
                        }
                        // Check if it contains colons but is still plaintext (decrypt fails)
                        const decrypted = decrypt(value);
                        if (decrypted === null) {
                            isPlaintext = true;
                            break;
                        }
                    }
                }

                if (isPlaintext) {
                    plaintextCount++;
                    const idCol = tableName === 'system_users' ? 'user_id' : 
                                  tableName === 'inventory_stock' ? 'stock_id' :
                                  tableName === 'supply_items' ? 'item_id' :
                                  tableName === 'audit_logs' ? 'log_id' :
                                  tableName === 'notifications' ? 'notification_id' :
                                  tableName === 'login_attempts' ? 'attempt_id' :
                                  tableName === 'warehouses' ? 'warehouse_id' :
                                  tableName === 'partners' ? 'partner_id' :
                                  tableName === 'shipments' ? 'shipment_id' :
                                  tableName === 'auth_refresh_tokens' ? 'session_id' :
                                  tableName === 'trusted_devices' ? 'id' :
                                  tableName === 'pending_registrations' ? 'id' :
                                  tableName === 'otp_tokens' ? 'id' : 'id';
                    recordsToDelete.push(row[idCol]);
                }
            }

            console.log(`Result: Found ${plaintextCount} unencrypted records in ${tableName}.`);
            
            if (plaintextCount > 0) {
                console.log(`Action: Deleting ${plaintextCount} records...`);
                for (const id of recordsToDelete) {
                    const idCol = tableName === 'system_users' ? 'user_id' : 
                                  tableName === 'inventory_stock' ? 'stock_id' :
                                  tableName === 'supply_items' ? 'item_id' :
                                  tableName === 'audit_logs' ? 'log_id' :
                                  tableName === 'notifications' ? 'notification_id' :
                                  tableName === 'login_attempts' ? 'attempt_id' :
                                  tableName === 'warehouses' ? 'warehouse_id' :
                                  tableName === 'partners' ? 'partner_id' :
                                  tableName === 'shipments' ? 'shipment_id' :
                                  tableName === 'auth_refresh_tokens' ? 'session_id' :
                                  tableName === 'trusted_devices' ? 'id' :
                                  tableName === 'pending_registrations' ? 'id' :
                                  tableName === 'otp_tokens' ? 'id' : 'id';
                    
                    // console.log(`Deleting ${tableName} where ${idCol} = ${id}`);
                    await pool.request()
                        .input('id', sql.UniqueIdentifier, id)
                        .query(`DELETE FROM ${tableName} WHERE ${idCol} = @id`);
                }
                console.log(`Done cleanup for ${tableName}.\n`);
            }
        }

        await pool.close();
        console.log("Scan and Cleanup finished.");
    } catch (err) {
        console.error("Scan Error:", err.message);
    }
}

runScan();
