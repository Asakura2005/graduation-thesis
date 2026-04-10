/**
 * Migration: Add is_email_otp_enabled column to system_users
 * This enables per-user Email OTP 2FA alongside Google Authenticator
 */
const sql = require('mssql');
require('dotenv').config();

const config = {
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    server: process.env.DB_SERVER,
    database: process.env.DB_NAME,
    options: {
        encrypt: true,
        trustServerCertificate: true,
    }
};

async function migrate() {
    try {
        console.log('[Migration] Connecting to database...');
        const pool = await sql.connect(config);

        console.log('[Migration] Adding is_email_otp_enabled column to system_users...');
        await pool.request().query(`
            IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('system_users') AND name = 'is_email_otp_enabled')
            ALTER TABLE system_users ADD is_email_otp_enabled BIT DEFAULT 0 WITH VALUES
        `);

        console.log('[Migration] ✅ Column is_email_otp_enabled added successfully');
        await pool.close();
    } catch (err) {
        console.error('[Migration] ❌ Error:', err.message);
    }
}

migrate();
