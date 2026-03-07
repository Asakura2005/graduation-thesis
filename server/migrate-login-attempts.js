/**
 * migrate-login-attempts.js
 * ===========================
 * Migration script: Tạo bảng login_attempts cho AI Anomaly Detection
 * 
 * Chạy: node migrate-login-attempts.js
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
        console.log('🔌 Connecting to database...');
        const pool = await sql.connect(config);

        console.log('📋 Creating login_attempts table for AI Anomaly Detection...');

        await pool.request().query(`
            IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'login_attempts')
            CREATE TABLE login_attempts (
                attempt_id UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
                user_id UNIQUEIDENTIFIER NULL,
                username_hash NVARCHAR(64) NOT NULL,
                ip_address NVARCHAR(MAX) NOT NULL,
                user_agent NVARCHAR(MAX) NOT NULL,
                attempt_time DATETIME DEFAULT GETDATE(),
                success BIT NOT NULL DEFAULT 0,
                risk_score FLOAT DEFAULT 0,
                risk_factors NVARCHAR(MAX) NULL,
                blocked BIT DEFAULT 0,
                CONSTRAINT FK_login_attempts_user FOREIGN KEY (user_id) REFERENCES system_users(user_id)
            );
        `);

        // Tạo indexes để tối ưu query performance
        try {
            await pool.request().query(`
                IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_login_attempts_username')
                CREATE INDEX IX_login_attempts_username ON login_attempts(username_hash);
            `);
            await pool.request().query(`
                IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_login_attempts_time')
                CREATE INDEX IX_login_attempts_time ON login_attempts(attempt_time);
            `);
            await pool.request().query(`
                IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_login_attempts_user_id')
                CREATE INDEX IX_login_attempts_user_id ON login_attempts(user_id);
            `);
            await pool.request().query(`
                IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_login_attempts_risk')
                CREATE INDEX IX_login_attempts_risk ON login_attempts(risk_score);
            `);
        } catch (indexErr) {
            console.log('⚠️ Index creation warning:', indexErr.message);
        }

        console.log('✅ Migration completed successfully!');
        console.log('📊 Table login_attempts created with indexes:');
        console.log('   - IX_login_attempts_username (for brute force detection)');
        console.log('   - IX_login_attempts_time (for time-based queries)');
        console.log('   - IX_login_attempts_user_id (for user history lookup)');
        console.log('   - IX_login_attempts_risk (for risk analytics)');

        await pool.close();
    } catch (err) {
        console.error('❌ Migration error:', err.message);
    }
}

migrate();
