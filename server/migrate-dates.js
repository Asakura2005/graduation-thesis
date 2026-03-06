const sql = require('mssql');
const { decrypt, encrypt } = require('./EncryptionService');
require('dotenv').config();

async function migrateDates() {
    let pool;
    try {
        pool = await sql.connect({
            user: process.env.DB_USER,
            password: process.env.DB_PASSWORD,
            server: process.env.DB_SERVER,
            database: process.env.DB_NAME,
            options: { encrypt: true, trustServerCertificate: true }
        });

        console.log("Forcing all audit_logs timestamps to strict ISO format...");
        const result = await pool.request().query("SELECT log_id, timestamp FROM audit_logs");

        for (const log of result.recordset) {
            const encryptedTime = log.timestamp;
            if (!encryptedTime) continue;

            const pt = decrypt(encryptedTime);
            if (pt) {
                const date = new Date(pt);
                if (!isNaN(date)) {
                    const iso = date.toISOString();
                    // If the current PT is already equal to ISO, skip
                    if (pt === iso) continue;

                    await pool.request()
                        .input('id', log.log_id)
                        .input('time', sql.NVarChar, encrypt(iso))
                        .query("UPDATE audit_logs SET timestamp = @time WHERE log_id = @id");
                    console.log(`[FIXED] ${pt} -> ${iso}`);
                } else {
                    console.log(`[SKIP] Invalid Date PT: ${pt}`);
                }
            }
        }
        console.log("Migration finished.");
    } catch (e) { console.error(e); } finally { process.exit(); }
}

migrateDates();
