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
                role NVARCHAR(MAX) NOT NULL
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
                shipment_date DATETIME NOT NULL DEFAULT GETDATE(),
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
