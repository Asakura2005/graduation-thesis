const sql = require('mssql');
require('dotenv').config();
const { encrypt, decrypt, hashData } = require('./EncryptionService');

async function migrateData() {
    let pool;
    try {
        console.log("Starting Data Migration (Old -> New Encrypted)...");
        pool = await sql.connect({
            user: process.env.DB_USER,
            password: process.env.DB_PASSWORD,
            server: process.env.DB_SERVER,
            database: process.env.DB_NAME,
            options: {
                encrypt: true,
                trustServerCertificate: true
            }
        });

        // 1. system_users
        console.log("Migrating system_users...");
        const users = await pool.request().query("SELECT user_id, username_old, role_old FROM system_users");
        for (const user of users.recordset) {
            const encUsername = encrypt(user.username_old);
            const encRole = encrypt(user.role_old || 'Staff');
            const uHash = hashData(user.username_old);
            await pool.request()
                .input('id', sql.UniqueIdentifier, user.user_id)
                .input('u', sql.NVarChar, encUsername)
                .input('r', sql.NVarChar, encRole)
                .input('h', sql.NVarChar, uHash)
                .query("UPDATE system_users SET username = @u, role = @r, username_hash = @h WHERE user_id = @id");
        }

        // 2. audit_logs
        console.log("Migrating audit_logs...");
        const logs = await pool.request().query("SELECT log_id, action_old, timestamp_old FROM audit_logs");
        for (const log of logs.recordset) {
            const encAction = encrypt(log.action_old);
            const timeStr = (log.timestamp_old instanceof Date) ? log.timestamp_old.toISOString() : String(log.timestamp_old);
            const encTimestamp = encrypt(timeStr);
            await pool.request()
                .input('id', sql.UniqueIdentifier, log.log_id)
                .input('a', sql.NVarChar, encAction)
                .input('t', sql.NVarChar, encTimestamp)
                .query("UPDATE audit_logs SET action = @a, timestamp = @t WHERE log_id = @id");
        }

        // 3. shipment_details
        console.log("Migrating shipment_details...");
        const details = await pool.request().query("SELECT detail_id, quantity_old, subtotal_old, batch_number_old FROM shipment_details");
        for (const d of details.recordset) {
            const encQty = encrypt(String(d.quantity_old || '0'));
            const encSub = encrypt(String(d.subtotal_old || '0'));
            const encBatch = encrypt(String(d.batch_number_old || ''));
            await pool.request()
                .input('id', sql.UniqueIdentifier, d.detail_id)
                .input('q', sql.NVarChar, encQty)
                .input('s', sql.NVarChar, encSub)
                .input('b', sql.NVarChar, encBatch)
                .query("UPDATE shipment_details SET quantity = @q, subtotal = @s, batch_number = @b WHERE detail_id = @id");
        }

        console.log("Data Migration Complete.");
        process.exit(0);
    } catch (err) {
        console.error("Migration Fatal Error:", err.message);
        process.exit(1);
    }
}

migrateData();
