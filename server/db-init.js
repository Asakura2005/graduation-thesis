const sql = require('mssql');
require('dotenv').config();
const { encrypt, hashData } = require('./EncryptionService');
const argon2 = require('argon2');

const config = {
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    server: process.env.DB_SERVER,
    database: process.env.DB_NAME, // Kết nối thẳng vào eco_test ngay từ đầu
    options: {
        instanceName: process.env.DB_INSTANCE,
        encrypt: true,
        trustServerCertificate: true,
        connectTimeout: 30000
    }
};

async function initDatabase() {
    try {
        console.log(`Connecting to ${config.server}...`);
        const pool = await sql.connect(config);

        console.log("Cleaning up existing tables for a clean start...");
        await pool.request().query(`
            IF OBJECT_ID('login_attempts', 'U') IS NOT NULL DROP TABLE login_attempts;
            IF OBJECT_ID('inventory_stock', 'U') IS NOT NULL DROP TABLE inventory_stock;
            IF OBJECT_ID('warehouses', 'U') IS NOT NULL DROP TABLE warehouses;
            IF OBJECT_ID('audit_logs', 'U') IS NOT NULL DROP TABLE audit_logs;
            IF OBJECT_ID('shipment_details', 'U') IS NOT NULL DROP TABLE shipment_details;
            IF OBJECT_ID('shipments', 'U') IS NOT NULL DROP TABLE shipments;
            IF OBJECT_ID('supply_items', 'U') IS NOT NULL DROP TABLE supply_items;
            IF OBJECT_ID('partners', 'U') IS NOT NULL DROP TABLE partners;
            IF OBJECT_ID('system_users', 'U') IS NOT NULL DROP TABLE system_users;
        `);

        console.log("Executing your SQL Schema...");

        // A. SYSTEM USERS
        await pool.request().query(`
            CREATE TABLE system_users (
                user_id UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
                username NVARCHAR(MAX) NOT NULL,
                username_hash NVARCHAR(64) NOT NULL UNIQUE,
                password_hash NVARCHAR(MAX) NOT NULL,
                full_name NVARCHAR(MAX) NOT NULL,
                email NVARCHAR(MAX) NOT NULL,
                email_hash NVARCHAR(64) NOT NULL,
                phone NVARCHAR(MAX) NULL,
                role NVARCHAR(MAX) NOT NULL,
                two_fa_secret NVARCHAR(MAX) NULL,
                is_two_fa_enabled BIT DEFAULT 0,
                banned_until NVARCHAR(MAX) NULL,
                ban_reason NVARCHAR(MAX) NULL,
                ban_count NVARCHAR(MAX) NULL
            );
            CREATE INDEX IX_system_users_email_hash ON system_users(email_hash);
            CREATE INDEX IX_system_users_username_hash ON system_users(username_hash);
        `);

        // B. PARTNERS & SUPPLY CHAIN
        await pool.request().query(`
            CREATE TABLE partners (
                partner_id UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
                partner_name NVARCHAR(MAX) NOT NULL,
                contact_person NVARCHAR(MAX) NOT NULL,
                email NVARCHAR(MAX) NOT NULL,
                email_hash NVARCHAR(64) NOT NULL,
                contact_phone NVARCHAR(MAX) NULL,
                type NVARCHAR(MAX) NOT NULL
            );
            CREATE INDEX IX_partners_email_hash ON partners(email_hash);
        `);

        // C. SUPPLY ITEMS
        await pool.request().query(`
            CREATE TABLE supply_items (
                item_id UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
                item_name NVARCHAR(MAX) NOT NULL,
                unit_cost NVARCHAR(MAX) NOT NULL,
                category NVARCHAR(MAX),
                quantity_in_stock NVARCHAR(MAX) DEFAULT '0'
            );
        `);

        // D. SHIPMENTS
        await pool.request().query(`
            CREATE TABLE shipments (
                shipment_id UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
                logistics_id UNIQUEIDENTIFIER NOT NULL,
                origin_address NVARCHAR(MAX) NOT NULL,
                destination_address NVARCHAR(MAX) NOT NULL,
                shipment_date NVARCHAR(MAX) NOT NULL,
                status NVARCHAR(MAX) NOT NULL,
                total_value NVARCHAR(MAX) NOT NULL,
                tracking_number NVARCHAR(MAX) NOT NULL,
                CONSTRAINT FK_shipments_logistics FOREIGN KEY (logistics_id) REFERENCES partners(partner_id)
            );
        `);

        // E. SHIPMENT DETAILS
        await pool.request().query(`
            CREATE TABLE shipment_details (
                detail_id UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
                shipment_id UNIQUEIDENTIFIER NOT NULL,
                item_id UNIQUEIDENTIFIER NOT NULL,
                stock_id UNIQUEIDENTIFIER NULL,
                quantity NVARCHAR(MAX) NOT NULL,
                subtotal NVARCHAR(MAX) NOT NULL,
                batch_number NVARCHAR(MAX) NOT NULL,
                CONSTRAINT FK_shipment_details_shipment FOREIGN KEY (shipment_id) REFERENCES shipments(shipment_id),
                CONSTRAINT FK_shipment_details_item FOREIGN KEY (item_id) REFERENCES supply_items(item_id)
            );
        `);

        // F. AUDIT LOGS
        await pool.request().query(`
            CREATE TABLE audit_logs (
                log_id UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
                action NVARCHAR(MAX) NOT NULL,
                user_id UNIQUEIDENTIFIER NOT NULL,
                [timestamp] NVARCHAR(MAX) NOT NULL,
                details NVARCHAR(MAX) NOT NULL,
                CONSTRAINT FK_audit_logs_user FOREIGN KEY (user_id) REFERENCES system_users(user_id)
            );
        `);

        // G. LOGIN ATTEMPTS (AI Anomaly Detection)
        await pool.request().query(`
            CREATE TABLE login_attempts (
                attempt_id UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
                user_id UNIQUEIDENTIFIER NULL,
                username_hash NVARCHAR(64) NOT NULL,
                ip_address NVARCHAR(MAX) NOT NULL,
                user_agent NVARCHAR(MAX) NOT NULL,
                attempt_time DATETIME DEFAULT GETDATE(),
                success NVARCHAR(MAX) NOT NULL,
                risk_score NVARCHAR(MAX) NULL,
                risk_factors NVARCHAR(MAX) NULL,
                blocked NVARCHAR(MAX) NULL,
                CONSTRAINT FK_login_attempts_user FOREIGN KEY (user_id) REFERENCES system_users(user_id)
            );
            CREATE INDEX IX_login_attempts_username ON login_attempts(username_hash);
            CREATE INDEX IX_login_attempts_time ON login_attempts(attempt_time);
            CREATE INDEX IX_login_attempts_user_id ON login_attempts(user_id);
        `);

        // H. OTP TOKENS (Email OTP: Đăng ký, 2FA, Quên mật khẩu)
        await pool.request().query(`
            CREATE TABLE otp_tokens (
                id UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
                email_hash NVARCHAR(64) NOT NULL,
                otp_hash NVARCHAR(64) NOT NULL,
                type NVARCHAR(50) NOT NULL,
                expires_at DATETIME NOT NULL,
                used BIT DEFAULT 0,
                created_at DATETIME DEFAULT GETDATE()
            );
            CREATE INDEX IX_otp_email_type ON otp_tokens(email_hash, type);
            CREATE INDEX IX_otp_expires ON otp_tokens(expires_at);
        `);

        // I. TRUSTED DEVICES (Device Fingerprinting - Facebook Style)
        await pool.request().query(`
            CREATE TABLE trusted_devices (
                id UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
                user_id UNIQUEIDENTIFIER NOT NULL,
                device_fingerprint NVARCHAR(64) NOT NULL,
                ip_address NVARCHAR(MAX) NULL,
                user_agent NVARCHAR(MAX) NULL,
                browser NVARCHAR(MAX) NULL,
                os NVARCHAR(MAX) NULL,
                location NVARCHAR(MAX) NULL,
                first_seen DATETIME DEFAULT GETDATE(),
                last_seen DATETIME DEFAULT GETDATE(),
                is_trusted BIT DEFAULT 1,
                CONSTRAINT FK_trusted_devices_user FOREIGN KEY (user_id) REFERENCES system_users(user_id) ON DELETE CASCADE
            );
            CREATE INDEX IX_trusted_devices_user ON trusted_devices(user_id);
            CREATE INDEX IX_trusted_devices_fp ON trusted_devices(device_fingerprint);
        `);

        // J. PENDING REGISTRATIONS (Lưu tạm thông tin đăng ký chờ OTP)
        await pool.request().query(`
            CREATE TABLE pending_registrations (
                id UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
                username NVARCHAR(MAX) NOT NULL,
                username_hash NVARCHAR(64) NOT NULL,
                password_hash NVARCHAR(MAX) NOT NULL,
                full_name NVARCHAR(MAX) NOT NULL,
                email NVARCHAR(MAX) NOT NULL,
                email_hash NVARCHAR(64) NOT NULL,
                phone NVARCHAR(MAX) NULL,
                created_at DATETIME DEFAULT GETDATE(),
                expires_at DATETIME NOT NULL
            );
            CREATE INDEX IX_pending_reg_email ON pending_registrations(email_hash);
            CREATE INDEX IX_pending_reg_expires ON pending_registrations(expires_at);
        `);

        // K. AUTH REFRESH TOKENS (with session tracking)
        await pool.request().query(`
            CREATE TABLE auth_refresh_tokens (
                id UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
                session_id UNIQUEIDENTIFIER DEFAULT NEWID(),
                user_id UNIQUEIDENTIFIER NOT NULL,
                token_hash NVARCHAR(MAX) NOT NULL,
                device_fingerprint NVARCHAR(64) NULL,
                ip_address NVARCHAR(MAX) NULL,
                expires_at DATETIME NOT NULL,
                created_at DATETIME DEFAULT GETDATE(),
                CONSTRAINT FK_refresh_tokens_user FOREIGN KEY (user_id) REFERENCES system_users(user_id) ON DELETE CASCADE
            );
            CREATE INDEX IX_refresh_tokens_user ON auth_refresh_tokens(user_id);
            CREATE INDEX IX_refresh_tokens_session ON auth_refresh_tokens(session_id);
        `);

        console.log("Database Schema created perfectly!");

        // Seeding initial Admin
        console.log("Seeding initial data...");
        const adminUser = 'admin';
        const passHash = await argon2.hash("admin123");
        const adminEmail = "admin@securechain.com";

        await pool.request()
            .input('u', sql.NVarChar, encrypt(adminUser))
            .input('uh', sql.NVarChar, hashData(adminUser))
            .input('p', sql.NVarChar, passHash)
            .input('f', sql.NVarChar, encrypt("Administrator"))
            .input('e', sql.NVarChar, encrypt(adminEmail))
            .input('eh', sql.NVarChar, hashData(adminEmail))
            .input('r', sql.NVarChar, encrypt('Admin'))
            .query("INSERT INTO system_users (username, username_hash, password_hash, full_name, email, email_hash, role) VALUES (@u, @uh, @p, @f, @e, @eh, @r)");

        console.log("All set! Admin created (admin / admin123)");

        await pool.close();
    } catch (err) {
        console.error('Initialization error:', err.message);
    }
}

initDatabase();
