/**
 * migrate-autoban.js
 * ==================
 * Thêm cột banned_until và ban_reason vào bảng system_users
 * để hỗ trợ tính năng tự động ban tài khoản bất thường.
 * 
 * Chạy: node migrate-autoban.js
 */
const sql = require('mssql');
require('dotenv').config();

const config = {
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    server: process.env.DB_SERVER,
    database: process.env.DB_NAME,
    options: {
        instanceName: process.env.DB_INSTANCE,
        encrypt: true,
        trustServerCertificate: true,
        connectTimeout: 30000
    }
};

async function migrate() {
    try {
        console.log('[AutoBan Migration] Connecting...');
        const pool = await sql.connect(config);

        // Thêm cột banned_until (DATETIME, NULL = không bị ban)
        await pool.request().query(`
            IF NOT EXISTS (
                SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
                WHERE TABLE_NAME = 'system_users' AND COLUMN_NAME = 'banned_until'
            )
            ALTER TABLE system_users ADD banned_until DATETIME NULL;
        `);
        console.log('[AutoBan Migration] ✅ Added banned_until column');

        // Thêm cột ban_reason (lý do bị ban, mã hóa AES)
        await pool.request().query(`
            IF NOT EXISTS (
                SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
                WHERE TABLE_NAME = 'system_users' AND COLUMN_NAME = 'ban_reason'
            )
            ALTER TABLE system_users ADD ban_reason NVARCHAR(MAX) NULL;
        `);
        console.log('[AutoBan Migration] ✅ Added ban_reason column');

        // Thêm cột ban_count (số lần bị ban, dùng để escalate thời gian ban)
        await pool.request().query(`
            IF NOT EXISTS (
                SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
                WHERE TABLE_NAME = 'system_users' AND COLUMN_NAME = 'ban_count'
            )
            ALTER TABLE system_users ADD ban_count INT DEFAULT 0;
        `);
        console.log('[AutoBan Migration] ✅ Added ban_count column');

        console.log('[AutoBan Migration] 🎉 All migrations completed successfully!');
        await pool.close();
    } catch (err) {
        console.error('[AutoBan Migration] ❌ Error:', err.message);
    }
}

migrate();
