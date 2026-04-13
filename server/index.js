require('dotenv').config();
const express = require('express');
const os = require('os');
const cors = require('cors');
const helmet = require('helmet');
const sql = require('mssql');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const argon2 = require('argon2');
const { encrypt, decrypt, hashData, safeDecrypt, safeDecryptInt, safeDecryptFloat, TAMPERED_DATA } = require('./EncryptionService');
const speakeasy = require('speakeasy');
const QRCode = require('qrcode');
const anomalyDetector = require('./AnomalyDetectionService');
const cookieParser = require('cookie-parser');
const emailService = require('./EmailService');
const otpService = require('./OTPService');
const deviceService = require('./DeviceService');

const path = require('path');

const app = express();

// === Cấu hình Bảo mật: HELMET ===
// Thêm HTTP Security Headers để chặn XSS, Clickjacking, Sniffing...
app.use(helmet({
    contentSecurityPolicy: false, // Tắt CSP để Google reCAPTCHA không bị chặn
    crossOriginEmbedderPolicy: false,
    crossOriginOpenerPolicy: false, // Tắt COOP để iframe reCAPTCHA hoạt động
    crossOriginResourcePolicy: false // Tắt CORP để tải script bên thứ 3
}));

// === Cấu hình Bảo mật: CORS (Danh sách trắng + Ngrok) ===
const allowedOrigins = [
    'http://localhost:5173',
    'http://127.0.0.1:5173',
    'http://localhost:3000',
    'http://127.0.0.1:3000',
    'http://localhost:5001',
    'http://127.0.0.1:5001'
];

app.use(cors({
    origin: function (origin, callback) {
        // - !origin: Cho phép Postman hoặc Server-to-server request
        // - allowedOrigins: Cho phép client dev local
        // - ngrok regex: Cho phép tất cả subdomain của ngrok
        if (!origin || allowedOrigins.includes(origin) || /ngrok(-free)?\.(app|io|dev)$/i.test(origin)) {
            callback(null, true);
        } else {
            console.log('[SECURITY ALERT] Blocked CORS Origin:', origin);
            callback(new Error('CORS Policy: Access Denied. Lỗi bảo mật: Domain của bạn không được cấp phép truy cập hệ thống này.'));
        }
    },
    credentials: true // Cho phép gửi cookie/token
}));

app.use(express.json());
app.use(cookieParser());

// Skip ngrok browser warning page for all responses
app.use((req, res, next) => {
    res.setHeader('ngrok-skip-browser-warning', 'true');
    next();
});

// Serve React frontend (built files)
app.use(express.static(path.join(__dirname, '..', 'client', 'dist')));

// Helper: Resolve loopback IP (::1, 127.0.0.1) to real LAN IP
function getLocalIP() {
    const interfaces = os.networkInterfaces();
    for (const name of Object.keys(interfaces)) {
        for (const iface of interfaces[name]) {
            if (iface.family === 'IPv4' && !iface.internal) {
                return iface.address;
            }
        }
    }
    return '127.0.0.1';
}

function resolveClientIP(req) {
    let ip = req.headers['x-forwarded-for'] || req.headers['x-real-ip'] || req.socket?.remoteAddress || 'unknown';
    // Take first IP if comma-separated
    if (ip.includes(',')) ip = ip.split(',')[0].trim();
    // Remove IPv6 prefix
    if (ip.startsWith('::ffff:')) ip = ip.substring(7);
    // Replace loopback with real LAN IP
    if (ip === '::1' || ip === '127.0.0.1' || ip === 'unknown') {
        ip = getLocalIP();
    }
    return ip;
}

// Database Config
const dbConfig = {
    user: process.env.DB_USER || 'meuu41',
    password: process.env.DB_PASSWORD || 'Meuu411@',
    server: process.env.DB_SERVER || 'localhost',
    database: process.env.DB_NAME || 'SCMS',
    options: {
        encrypt: false,
        trustServerCertificate: true
    }
};

// --- SECURITY UTILS (AES-256-GCM provided by EncryptionService) ---
// Local implementation removed in favor of strict Envelope Encryption

// Connect to Database
async function connectDB() {
    try {
        const pool = await sql.connect(dbConfig);

        // --- AUTO MIGRATION: USERS & AUTH ---
        // --- AUTO MIGRATION: USERS REMOVED (Now using system_users) ---
        // Legacy 'users' table creation block removed.


        // --- AUTO MIGRATION: SUPPLY ITEMS ---
        try {
            const checkCol = await pool.request().query("SELECT COL_LENGTH('supply_items', 'quantity_in_stock') as col_len");
            if (checkCol.recordset[0].col_len === null) {
                console.log("Migrating supply_items: Adding quantity_in_stock...");
                await pool.request().query("ALTER TABLE supply_items ADD quantity_in_stock INT DEFAULT 0 WITH VALUES");
            }
        } catch (e) { console.log("Migration Warn (supply_items):", e.message); }

        // --- AUTO MIGRATION: WAREHOUSE SYSTEM ---
        try {
            // 1. Create Warehouses Table (Removed Capacity, Added total_shelves)
            await pool.request().query(`
                IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'warehouses')
                CREATE TABLE warehouses (
                    warehouse_id UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
                    name NVARCHAR(255) NOT NULL,
                    location NVARCHAR(255),
                    type NVARCHAR(50),
                    total_shelves INT DEFAULT 50
                )
            `);

            // Migration: Add total_shelves if missing
            const checkShelf = await pool.request().query("SELECT COL_LENGTH('warehouses', 'total_shelves') as col_len");
            if (checkShelf.recordset[0].col_len === null) {
                await pool.request().query("ALTER TABLE warehouses ADD total_shelves INT DEFAULT 50 WITH VALUES");
            }

            // Migration: REMOVE 'capacity' if exists (Cleanup)
            try {
                const checkCap = await pool.request().query("SELECT COL_LENGTH('warehouses', 'capacity') as col_len");
                if (checkCap.recordset[0].col_len !== null) {
                    console.log("Removing legacy column 'capacity'...");
                    await pool.request().query("ALTER TABLE warehouses DROP CONSTRAINT IF EXISTS DF__warehouse__capac__123456"); // Tên constraint thường random, nên ta dùng catch bỏ qua lỗi nếu ko drop dc default constraint
                    // Lưu ý: Drop column có default constraint hơi phức tạp trong SQL Server, ta sẽ thử Drop column trực tiếp, nếu lỗi thì bỏ qua (không ảnh hưởng logic).
                    await pool.request().query("ALTER TABLE warehouses DROP COLUMN capacity");
                }
            } catch (e) {
                // console.log("Cleanup Warn (capacity):", e.message); 
            }

            // 2. Create Inventory Stock Table
            await pool.request().query(`
                IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'inventory_stock')
                CREATE TABLE inventory_stock (
                    stock_id UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
                    warehouse_id UNIQUEIDENTIFIER FOREIGN KEY REFERENCES warehouses(warehouse_id) ON DELETE CASCADE,
                    item_id UNIQUEIDENTIFIER FOREIGN KEY REFERENCES supply_items(item_id) ON DELETE CASCADE,
                    quantity NVARCHAR(255) DEFAULT '0', 
                    bin_location NVARCHAR(255)
                )
            `);

            // Migration: Encrypt Quantity
            try {
                const checkType = await pool.request().query(`
                    SELECT DATA_TYPE 
                    FROM INFORMATION_SCHEMA.COLUMNS
                    WHERE TABLE_NAME = 'inventory_stock' AND COLUMN_NAME = 'quantity'
                `);

                if (checkType.recordset[0] && checkType.recordset[0].DATA_TYPE === 'int') {
                    console.log('Migrating inventory_stock.quantity to encrypted format...');
                    await pool.request().query(`ALTER TABLE inventory_stock ALTER COLUMN quantity NVARCHAR(255)`);
                }
            } catch (e) { }

            // Migration: Widen warehouses columns for encrypted data
            try {
                // type: NVARCHAR(50) -> NVARCHAR(MAX) (encrypted values are ~100+ chars)
                const checkTypeCol = await pool.request().query(`
                    SELECT CHARACTER_MAXIMUM_LENGTH as max_len 
                    FROM INFORMATION_SCHEMA.COLUMNS 
                    WHERE TABLE_NAME = 'warehouses' AND COLUMN_NAME = 'type'
                `);
                if (checkTypeCol.recordset[0] && checkTypeCol.recordset[0].max_len !== -1) {
                    console.log('Migrating warehouses.type to NVARCHAR(MAX) for encryption...');
                    await pool.request().query("ALTER TABLE warehouses ALTER COLUMN type NVARCHAR(MAX)");
                }

                // name: NVARCHAR(255) -> NVARCHAR(MAX)
                const checkNameCol = await pool.request().query(`
                    SELECT CHARACTER_MAXIMUM_LENGTH as max_len 
                    FROM INFORMATION_SCHEMA.COLUMNS 
                    WHERE TABLE_NAME = 'warehouses' AND COLUMN_NAME = 'name'
                `);
                if (checkNameCol.recordset[0] && checkNameCol.recordset[0].max_len !== -1) {
                    console.log('Migrating warehouses.name to NVARCHAR(MAX) for encryption...');
                    await pool.request().query("ALTER TABLE warehouses ALTER COLUMN name NVARCHAR(MAX) NOT NULL");
                }

                // location: NVARCHAR(255) -> NVARCHAR(MAX)
                const checkLocCol = await pool.request().query(`
                    SELECT CHARACTER_MAXIMUM_LENGTH as max_len 
                    FROM INFORMATION_SCHEMA.COLUMNS 
                    WHERE TABLE_NAME = 'warehouses' AND COLUMN_NAME = 'location'
                `);
                if (checkLocCol.recordset[0] && checkLocCol.recordset[0].max_len !== -1) {
                    console.log('Migrating warehouses.location to NVARCHAR(MAX) for encryption...');
                    await pool.request().query("ALTER TABLE warehouses ALTER COLUMN location NVARCHAR(MAX)");
                }

                // total_shelves: INT -> NVARCHAR(MAX) (if still INT)
                const checkShelvesType = await pool.request().query(`
                    SELECT DATA_TYPE 
                    FROM INFORMATION_SCHEMA.COLUMNS 
                    WHERE TABLE_NAME = 'warehouses' AND COLUMN_NAME = 'total_shelves'
                `);
                if (checkShelvesType.recordset[0] && checkShelvesType.recordset[0].DATA_TYPE !== 'nvarchar') {
                    console.log('Migrating warehouses.total_shelves to NVARCHAR(MAX) for encryption...');
                    // Drop default constraint first
                    await pool.request().query(`
                        DECLARE @constraintName NVARCHAR(200)
                        SELECT @constraintName = d.name 
                        FROM sys.default_constraints d
                        JOIN sys.columns c ON d.parent_column_id = c.column_id AND d.parent_object_id = c.object_id
                        WHERE c.name = 'total_shelves' AND OBJECT_NAME(d.parent_object_id) = 'warehouses'
                        IF @constraintName IS NOT NULL
                            EXEC('ALTER TABLE warehouses DROP CONSTRAINT ' + @constraintName)
                    `);
                    await pool.request().query("ALTER TABLE warehouses ALTER COLUMN total_shelves NVARCHAR(MAX)");
                }
            } catch (migWidenErr) { console.error("Migration Warn (widen warehouses):", migWidenErr.message); }

            // 3. Seed Sample Warehouses
            const checkWarehouse = await pool.request().query("SELECT COUNT(*) as count FROM warehouses");
            if (checkWarehouse.recordset[0].count === 0) {
                await pool.request().query(`
                    INSERT INTO warehouses (name, location, type, total_shelves) VALUES 
                    (N'Kho Tổng Miền Bắc', N'Hà Nội', 'Distribution Center', 100),
                    (N'Kho Lạnh Tân Sơn Nhất', N'TP.HCM', 'Cold Storage', 50),
                    (N'Kho Cảng Hải Phòng', N'Hải Phòng', 'Port Warehouse', 200)
                `);
                console.log("Seeded sample warehouses.");
            }

        } catch (migErr) { console.error("Migration Error:", migErr.message); }

        // --- AUTO MIGRATION: NOTIFICATIONS TABLE ---
        try {
            await pool.request().query(`
                IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'notifications')
                CREATE TABLE notifications (
                    notification_id UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
                    user_id UNIQUEIDENTIFIER NULL,
                    target_role NVARCHAR(MAX) NULL,
                    title NVARCHAR(MAX) NOT NULL,
                    message NVARCHAR(MAX) NOT NULL,
                    type NVARCHAR(100) DEFAULT 'info',
                    related_id NVARCHAR(MAX) NULL,
                    is_read BIT DEFAULT 0,
                    created_at DATETIME DEFAULT GETDATE()
                )
            `);
            console.log("Notifications table ready.");
        } catch (notifErr) { console.log("Migration Warn (notifications):", notifErr.message); }

        // --- AUTO MIGRATION: SHIPMENTS created_by ---
        try {
            const checkCreatedBy = await pool.request().query("SELECT COL_LENGTH('shipments', 'created_by') as col_len");
            if (checkCreatedBy.recordset[0].col_len === null) {
                console.log("Migrating shipments: Adding created_by...");
                await pool.request().query("ALTER TABLE shipments ADD created_by UNIQUEIDENTIFIER NULL");
            }
        } catch (e) { console.log("Migration Warn (shipments.created_by):", e.message); }

        // --- AUTO MIGRATION: SHIPMENTS shipment_date DATETIME -> NVARCHAR(MAX) ---
        try {
            const checkDateType = await pool.request().query(`
                SELECT DATA_TYPE 
                FROM INFORMATION_SCHEMA.COLUMNS 
                WHERE TABLE_NAME = 'shipments' AND COLUMN_NAME = 'shipment_date'
            `);
            if (checkDateType.recordset[0] && checkDateType.recordset[0].DATA_TYPE !== 'nvarchar') {
                console.log("Migrating shipments.shipment_date to NVARCHAR(MAX) for encryption...");
                // Drop default constraint if exists
                await pool.request().query(`
                    DECLARE @constraintName NVARCHAR(200)
                    SELECT @constraintName = d.name 
                    FROM sys.default_constraints d
                    JOIN sys.columns c ON d.parent_column_id = c.column_id AND d.parent_object_id = c.object_id
                    WHERE c.name = 'shipment_date' AND OBJECT_NAME(d.parent_object_id) = 'shipments'
                    IF @constraintName IS NOT NULL
                        EXEC('ALTER TABLE shipments DROP CONSTRAINT ' + @constraintName)
                `);
                await pool.request().query("ALTER TABLE shipments ALTER COLUMN shipment_date NVARCHAR(MAX)");
                console.log("shipment_date migrated successfully.");
            }
        } catch (e) { console.log("Migration Warn (shipments.shipment_date):", e.message); }

        // --- AUTO MIGRATION: LOGIN_ATTEMPTS columns to NVARCHAR(MAX) ---
        try {
            const columnsToMigrate = ['success', 'risk_score', 'risk_factors', 'blocked'];
            for (const colName of columnsToMigrate) {
                const checkCol = await pool.request().query(`
                    SELECT DATA_TYPE, IS_NULLABLE
                    FROM INFORMATION_SCHEMA.COLUMNS 
                    WHERE TABLE_NAME = 'login_attempts' AND COLUMN_NAME = '${colName}'
                `);
                if (checkCol.recordset[0] && checkCol.recordset[0].DATA_TYPE !== 'nvarchar') {
                    console.log(`Migrating login_attempts.${colName} from ${checkCol.recordset[0].DATA_TYPE} to NVARCHAR(MAX)...`);
                    // Drop default constraint if exists
                    await pool.request().query(`
                        DECLARE @cn NVARCHAR(200)
                        SELECT @cn = d.name 
                        FROM sys.default_constraints d
                        JOIN sys.columns c ON d.parent_column_id = c.column_id AND d.parent_object_id = c.object_id
                        WHERE c.name = '${colName}' AND OBJECT_NAME(d.parent_object_id) = 'login_attempts'
                        IF @cn IS NOT NULL
                            EXEC('ALTER TABLE login_attempts DROP CONSTRAINT ' + @cn)
                    `);
                    await pool.request().query(`ALTER TABLE login_attempts ALTER COLUMN [${colName}] NVARCHAR(MAX) NULL`);
                    console.log(`login_attempts.${colName} migrated successfully.`);
                }
            }

            // Also ensure attempt_id has DEFAULT NEWID() if missing
            const checkDefault = await pool.request().query(`
                SELECT d.name FROM sys.default_constraints d
                JOIN sys.columns c ON d.parent_column_id = c.column_id AND d.parent_object_id = c.object_id
                WHERE c.name = 'attempt_id' AND OBJECT_NAME(d.parent_object_id) = 'login_attempts'
            `);
            if (checkDefault.recordset.length === 0) {
                await pool.request().query("ALTER TABLE login_attempts ADD CONSTRAINT DF_login_attempts_id DEFAULT NEWID() FOR attempt_id");
                console.log("Added DEFAULT NEWID() to login_attempts.attempt_id");
            }

            // Ensure attempt_time has DEFAULT GETDATE() if missing
            const checkTimeDefault = await pool.request().query(`
                SELECT d.name FROM sys.default_constraints d
                JOIN sys.columns c ON d.parent_column_id = c.column_id AND d.parent_object_id = c.object_id
                WHERE c.name = 'attempt_time' AND OBJECT_NAME(d.parent_object_id) = 'login_attempts'
            `);
            if (checkTimeDefault.recordset.length === 0) {
                await pool.request().query("ALTER TABLE login_attempts ADD CONSTRAINT DF_login_attempts_time DEFAULT GETDATE() FOR attempt_time");
                console.log("Added DEFAULT GETDATE() to login_attempts.attempt_time");
            }
        } catch (e) { console.log("Migration Warn (login_attempts columns):", e.message); }

        // --- AUTO MIGRATION: LOGIN_ATTEMPTS captcha_verified column ---
        try {
            const checkCaptchaCol = await pool.request().query("SELECT COL_LENGTH('login_attempts', 'captcha_verified') as col_len");
            if (checkCaptchaCol.recordset[0].col_len === null) {
                console.log("Migrating login_attempts: Adding captcha_verified...");
                await pool.request().query("ALTER TABLE login_attempts ADD captcha_verified NVARCHAR(MAX) NULL");
                console.log("login_attempts.captcha_verified added successfully.");
            }
        } catch (e) { console.log("Migration Warn (captcha_verified):", e.message); }

        // --- AUTO MIGRATION: SYSTEM_USERS banned_until (DATETIME -> NVARCHAR(MAX)) & ban_count (INT -> NVARCHAR(MAX)) ---
        try {
            const banColsToMigrate = ['banned_until', 'ban_count'];
            for (const colName of banColsToMigrate) {
                const checkCol = await pool.request().query(`
                    SELECT DATA_TYPE
                    FROM INFORMATION_SCHEMA.COLUMNS 
                    WHERE TABLE_NAME = 'system_users' AND COLUMN_NAME = '${colName}'
                `);
                if (checkCol.recordset[0] && checkCol.recordset[0].DATA_TYPE !== 'nvarchar') {
                    console.log(`Migrating system_users.${colName} from ${checkCol.recordset[0].DATA_TYPE} to NVARCHAR(MAX)...`);
                    // Clear existing data first (it's old unencrypted data)
                    await pool.request().query(`UPDATE system_users SET [${colName}] = NULL`);
                    // Drop default constraint if exists
                    await pool.request().query(`
                        DECLARE @cn NVARCHAR(200)
                        SELECT @cn = d.name 
                        FROM sys.default_constraints d
                        JOIN sys.columns c ON d.parent_column_id = c.column_id AND d.parent_object_id = c.object_id
                        WHERE c.name = '${colName}' AND OBJECT_NAME(d.parent_object_id) = 'system_users'
                        IF @cn IS NOT NULL
                            EXEC('ALTER TABLE system_users DROP CONSTRAINT ' + @cn)
                    `);
                    await pool.request().query(`ALTER TABLE system_users ALTER COLUMN [${colName}] NVARCHAR(MAX) NULL`);
                    console.log(`system_users.${colName} migrated successfully.`);
                }
            }
        } catch (e) { console.log("Migration Warn (system_users ban columns):", e.message); }

        // --- AUTO MIGRATION: REFRESH_TOKENS TABLE ---
        try {
            const checkTable = await pool.request().query("SELECT * FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'auth_refresh_tokens'");
            if (checkTable.recordset.length === 0) {
                console.log("Migrating: Creating auth_refresh_tokens table...");
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
                        FOREIGN KEY (user_id) REFERENCES system_users(user_id) ON DELETE CASCADE
                    )
                `);
                console.log("auth_refresh_tokens table created successfully.");
            } else {
                // Migration: Add session_id if missing
                try {
                    const checkSid = await pool.request().query("SELECT COL_LENGTH('auth_refresh_tokens', 'session_id') as col_len");
                    if (checkSid.recordset[0].col_len === null) {
                        await pool.request().query("ALTER TABLE auth_refresh_tokens ADD session_id UNIQUEIDENTIFIER DEFAULT NEWID()");
                        console.log("Added session_id to auth_refresh_tokens");
                    }
                } catch (e) { }
                // Migration: Add device_fingerprint if missing
                try {
                    const checkFp = await pool.request().query("SELECT COL_LENGTH('auth_refresh_tokens', 'device_fingerprint') as col_len");
                    if (checkFp.recordset[0].col_len === null) {
                        await pool.request().query("ALTER TABLE auth_refresh_tokens ADD device_fingerprint NVARCHAR(64) NULL");
                        console.log("Added device_fingerprint to auth_refresh_tokens");
                    }
                } catch (e) { }
                // Migration: Add ip_address if missing
                try {
                    const checkIp = await pool.request().query("SELECT COL_LENGTH('auth_refresh_tokens', 'ip_address') as col_len");
                    if (checkIp.recordset[0].col_len === null) {
                        await pool.request().query("ALTER TABLE auth_refresh_tokens ADD ip_address NVARCHAR(MAX) NULL");
                        console.log("Added ip_address to auth_refresh_tokens");
                    }
                } catch (e) { }
            }
        } catch (e) { console.log("Migration Warn (auth_refresh_tokens):", e.message); }

        // --- AUTO MIGRATION: OTP_TOKENS TABLE ---
        try {
            const checkOtp = await pool.request().query("SELECT * FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'otp_tokens'");
            if (checkOtp.recordset.length === 0) {
                console.log("Migrating: Creating otp_tokens table...");
                await pool.request().query(`
                    CREATE TABLE otp_tokens (
                        id UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
                        email_hash NVARCHAR(64) NOT NULL,
                        otp_hash NVARCHAR(64) NOT NULL,
                        type NVARCHAR(50) NOT NULL,
                        expires_at DATETIME NOT NULL,
                        used BIT DEFAULT 0,
                        created_at DATETIME DEFAULT GETDATE()
                    )
                `);
                console.log("otp_tokens table created.");
            }
        } catch (e) { console.log("Migration Warn (otp_tokens):", e.message); }

        // --- AUTO MIGRATION: TRUSTED_DEVICES TABLE ---
        try {
            const checkDev = await pool.request().query("SELECT * FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'trusted_devices'");
            if (checkDev.recordset.length === 0) {
                console.log("Migrating: Creating trusted_devices table...");
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
                        FOREIGN KEY (user_id) REFERENCES system_users(user_id) ON DELETE CASCADE
                    )
                `);
                console.log("trusted_devices table created.");
            }
        } catch (e) { console.log("Migration Warn (trusted_devices):", e.message); }

        // --- AUTO MIGRATION: PENDING_REGISTRATIONS TABLE ---
        try {
            const checkPend = await pool.request().query("SELECT * FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'pending_registrations'");
            if (checkPend.recordset.length === 0) {
                console.log("Migrating: Creating pending_registrations table...");
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
                    )
                `);
                console.log("pending_registrations table created.");
            }
        } catch (e) { console.log("Migration Warn (pending_registrations):", e.message); }

        // --- PERIODIC CLEANUP: OTP tokens & expired pending registrations ---
        setInterval(async () => {
            try {
                await otpService.cleanupExpiredOTPs(pool);
                // Cleanup expired pending registrations (older than 10 minutes)
                await pool.request().query("DELETE FROM pending_registrations WHERE expires_at < GETUTCDATE()");
            } catch (e) { }
        }, 5 * 60 * 1000).unref(); // Every 5 minutes

        return pool;
    } catch (err) {
        console.error('Database connection failed:', err.message);
    }
}

// Function to Log Audit
async function logAudit(userId, action, details) {
    console.log(`[AUDIT] Recording action: ${action} for user: ${userId}`);
    try {
        const pool = await connectDB();
        const timestamp = new Date().toISOString();
        const detailsWithTimestamp = {
            ...details,
            timestamp: timestamp // Add timestamp into the details object for traceability in SQL
        };
        const jsonDetails = JSON.stringify(detailsWithTimestamp);
        const encryptedDetails = encrypt(jsonDetails);
        const encryptedAction = encrypt(action);
        const encryptedTimestamp = encrypt(timestamp);

        await pool.request()
            .input('userId', sql.UniqueIdentifier, userId)
            .input('action', sql.NVarChar, encryptedAction)
            .input('details', sql.NVarChar, encryptedDetails)
            .input('timestamp', sql.NVarChar, encryptedTimestamp)
            .query("INSERT INTO audit_logs (log_id, user_id, action, details, [timestamp]) VALUES (NEWID(), @userId, @action, @details, @timestamp)");

        console.log(`[AUDIT] Successfully recorded: ${action}`);
    } catch (err) {
        console.error('[AUDIT ERROR]:', err.message, err.stack);
    }
}

// Helper: Sync Supply Item Total Stock
async function syncItemTotalStock(itemId) {
    try {
        const pool = await connectDB();

        // 1. Get all stock records for this item
        const stockRes = await pool.request()
            .input('id', sql.UniqueIdentifier, itemId)
            .query("SELECT quantity FROM inventory_stock WHERE item_id = @id");

        // 2. Sum decrypted quantities
        let total = 0;
        stockRes.recordset.forEach(row => {
            const qty = safeDecryptInt(row.quantity);
            if (qty === -1) {
                console.warn(`[INTEGRITY] Tampered quantity detected in inventory_stock for item ${itemId}`);
            } else {
                total += qty;
            }
        });

        // 3. Update supply_items
        const encryptedTotal = encrypt(total.toString());
        await pool.request()
            .input('t', sql.NVarChar, encryptedTotal)
            .input('id', sql.UniqueIdentifier, itemId)
            .query("UPDATE supply_items SET quantity_in_stock = @t WHERE item_id = @id");

    } catch (e) {
        console.error(`Sync Stock Error (Item ${itemId}):`, e.message);
    }
}

// === FORCE LOGOUT: In-memory set of user IDs that must be logged out immediately ===
// When a session is revoked (e.g., "This wasn't me" button), the user's access token
// (JWT, valid for 15 min) would still work. This set forces immediate logout.
const forceLogoutUsers = new Map(); // Map<userId, expireTimestamp>
const forceLogoutTokens = new Map(); // Map<tokenHash, expireTimestamp>

function addForceLogout(userId) {
    // Auto-expire after 20 minutes (enough for any JWT access token to expire)
    forceLogoutUsers.set(userId, Date.now() + 20 * 60 * 1000);
    console.log(`[ForceLogout] 🚫 User ${userId} added to force-logout list (all devices)`);
}

function addForceLogoutToken(tokenHash) {
    forceLogoutTokens.set(tokenHash, Date.now() + 20 * 60 * 1000);
    console.log(`[ForceLogout] 🚫 Revoked specific session token`);
}

function isForceLogout(userId, tokenHash = null) {
    const expiry = forceLogoutUsers.get(userId);
    if (expiry) {
        if (Date.now() > expiry) forceLogoutUsers.delete(userId); // Cleanup expired entry
        else return true;
    }

    if (tokenHash) {
        const tokenExpiry = forceLogoutTokens.get(tokenHash);
        if (tokenExpiry) {
            if (Date.now() > tokenExpiry) forceLogoutTokens.delete(tokenHash);
            else return true;
        }
    }

    return false;
}

function clearForceLogout(userId) {
    if (forceLogoutUsers.has(userId)) {
        forceLogoutUsers.delete(userId);
        console.log(`[ForceLogout] ✅ Cleared force-logout for user ${userId} (re-authenticated)`);
    }
}

// Cleanup expired entries every 5 minutes
setInterval(() => {
    const now = Date.now();
    for (const [uid, expiry] of forceLogoutUsers) {
        if (now > expiry) forceLogoutUsers.delete(uid);
    }
}, 5 * 60 * 1000);

// Middleware
const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    if (!token) return res.sendStatus(401);
    jwt.verify(token, process.env.JWT_SECRET || 'secret', (err, user) => {
        if (err) return res.sendStatus(403);
        
        let tokenHash = null;
        if (req.cookies && req.cookies.refreshToken) {
            tokenHash = hashData(req.cookies.refreshToken);
        }

        // Check if user or specific session is force-logged-out
        if (isForceLogout(user.id, tokenHash)) {
            console.log(`[ForceLogout] ⛔ Blocked request from force-logged-out session or user ${user.id}`);
            return res.status(401).json({ error: 'Session revoked', forceLogout: true });
        }
        
        req.user = user;
        next();
    });
};

const authorizeRole = (roles) => {
    return (req, res, next) => {
        if (!roles.includes(req.user.role)) return res.sendStatus(403);
        next();
    };
};

// --- ROUTES ---

// Session Heartbeat: Lightweight endpoint for real-time force-logout detection
// Frontend polls this every 5s to detect if session was revoked (e.g., "Không phải tôi" button)
app.get('/api/auth/session-check', (req, res) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    if (!token) return res.status(401).json({ valid: false });
    
    jwt.verify(token, process.env.JWT_SECRET || 'secret', (err, user) => {
        if (err) return res.status(401).json({ valid: false });
        
        // Extract tokenHash from refresh token cookie (same logic as authenticateToken)
        let tokenHash = null;
        if (req.cookies && req.cookies.refreshToken) {
            tokenHash = hashData(req.cookies.refreshToken);
        }
        
        if (isForceLogout(user.id, tokenHash)) {
            console.log(`[Heartbeat] ⛔ Force-logout detected for user ${user.id} — pushing to login page`);
            return res.status(401).json({ valid: false, forceLogout: true, reason: 'session_revoked' });
        }
        
        return res.json({ valid: true });
    });
});

// 0. Audit Logs
app.get('/api/audit-logs', authenticateToken, async (req, res) => {
    try {
        const pool = await connectDB();
        const result = await pool.request().query("SELECT a.*, u.username FROM audit_logs a LEFT JOIN system_users u ON a.user_id = u.user_id");

        const logs = result.recordset.map(log => {
            let uName = safeDecrypt(log.username) || log.username;
            let act = safeDecrypt(log.action) || log.action;
            let time = log.timestamp;
            let details = log.details;

            try {
                const rawTime = safeDecrypt(log.timestamp) || log.timestamp;
                // Convert any date format (including SQL Server 'Mar 6 2026 1:36PM') to ISO string
                const parsed = new Date(rawTime);
                time = !isNaN(parsed) ? parsed.toISOString() : rawTime;
            } catch (e) { }

            try {
                const decryptedStr = decrypt(log.details);
                if (decryptedStr) details = JSON.parse(decryptedStr);
                else details = JSON.parse(log.details);
            } catch (e) {
                // Nếu dữ liệu bị tampered, hiển thị thông báo lỗi
                const safeDetails = safeDecrypt(log.details);
                if (safeDetails === TAMPERED_DATA) details = { error: TAMPERED_DATA };
                else { try { details = JSON.parse(log.details); } catch (ex) { details = log.details; } }
            }

            return { ...log, username: uName, action: act, timestamp: time, details };
        });

        // Sort in memory by timestamp DESC
        logs.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

        res.json(logs);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// 1. Auth & Users (Legacy)
// 1. Auth & Users (System Users - Secure with Argon2 + AI Anomaly Detection)

// === SETTINGS APIs ===
// Helper: Read/Write settings
function readSettings() {
    try {
        const fs = require('fs');
        return JSON.parse(fs.readFileSync('./settings.json', 'utf8'));
    } catch (e) {
        return { captchaEnabled: true, emailOtpEnabled: false };
    }
}
function writeSettings(data) {
    const fs = require('fs');
    const current = readSettings();
    const merged = { ...current, ...data };
    fs.writeFileSync('./settings.json', JSON.stringify(merged));
    return merged;
}

app.get('/api/settings/captcha', (req, res) => {
    res.json(readSettings());
});

app.post('/api/settings/captcha', authenticateToken, authorizeRole(['Admin']), async (req, res) => {
    try {
        const { captchaEnabled } = req.body;
        const settings = writeSettings({ captchaEnabled });
        await logAudit(req.user.id, 'SETTING_UPDATE', { setting: 'captcha', status: captchaEnabled });
        res.json({ success: true, ...settings });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Email OTP Setting
app.get('/api/settings/email-otp', (req, res) => {
    const settings = readSettings();
    res.json({ emailOtpEnabled: !!settings.emailOtpEnabled });
});

app.post('/api/settings/email-otp', authenticateToken, authorizeRole(['Admin']), async (req, res) => {
    try {
        const { emailOtpEnabled } = req.body;

        // Kiểm tra SMTP có cấu hình chưa trước khi cho bật
        if (emailOtpEnabled) {
            const smtpConfigured = !!(process.env.SMTP_EMAIL && process.env.SMTP_PASSWORD
                && process.env.SMTP_EMAIL !== 'your-email@gmail.com'
                && process.env.SMTP_PASSWORD !== 'your-app-password');
            if (!smtpConfigured) {
                return res.status(400).json({
                    error: 'Không thể bật xác thực email: SMTP chưa được cấu hình. Vui lòng cập nhật SMTP_EMAIL và SMTP_PASSWORD trong file .env trước.'
                });
            }
        }

        const settings = writeSettings({ emailOtpEnabled });
        await logAudit(req.user.id, 'SETTING_UPDATE', { setting: 'email_otp', status: emailOtpEnabled });
        res.json({ success: true, emailOtpEnabled: !!settings.emailOtpEnabled });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/auth/login', async (req, res) => {
    let { username, password, captchaToken, rememberSession, lang } = req.body;
    lang = lang || 'vi';

    username = (username || '').trim();
    password = (password || '').trim();

    const clientIP = resolveClientIP(req);
    const userAgent = req.headers['user-agent'] || 'unknown';

    // === CHECK SETTINGS ===
    let captchaEnabled = true;
    try {
        const fs = require('fs');
        const data = fs.readFileSync('./settings.json', 'utf8');
        captchaEnabled = JSON.parse(data).captchaEnabled;
    } catch (e) { }

    // === reCAPTCHA Verification ===
    if (captchaEnabled && !captchaToken) {
        return res.status(400).json({ error: 'Vui lòng xác nhận reCAPTCHA' });
    }

    try {
        const secretKey = process.env.RECAPTCHA_SECRET_KEY;
        if (captchaEnabled && secretKey && secretKey !== 'YOUR_SECRET_KEY_HERE') {
            const https = require('https');
            const verifyResult = await new Promise((resolve, reject) => {
                const postData = `secret=${encodeURIComponent(secretKey)}&response=${encodeURIComponent(captchaToken)}&remoteip=${encodeURIComponent(clientIP)}`;
                const options = {
                    hostname: 'www.google.com',
                    port: 443,
                    path: '/recaptcha/api/siteverify',
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/x-www-form-urlencoded',
                        'Content-Length': Buffer.byteLength(postData)
                    }
                };
                const req = https.request(options, (res) => {
                    let data = '';
                    res.on('data', chunk => data += chunk);
                    res.on('end', () => resolve(JSON.parse(data)));
                });
                req.on('error', reject);
                req.write(postData);
                req.end();
            });

            if (!verifyResult.success) {
                console.log('[reCAPTCHA] Verification failed:', verifyResult);
                // Ghi log reCAPTCHA fail vào database
                try {
                    const pool = await connectDB();
                    const usernameHash = hashData(username);
                    await anomalyDetector.recordAttempt(pool, {
                        usernameHash, userId: null, ipAddress: clientIP, userAgent,
                        success: false, riskScore: 50,
                        riskFactors: [{ type: 'CAPTCHA_FAILED', score: 50, severity: 'critical', message: 'reCAPTCHA verification failed - possible bot' }],
                        blocked: true, captchaVerified: false
                    });
                } catch (logErr) { console.error('[reCAPTCHA] Log error:', logErr.message); }
                return res.status(400).json({ error: 'Xác nhận reCAPTCHA thất bại. Vui lòng thử lại.' });
            }
            console.log('[reCAPTCHA] ✅ Verification passed');
        } else {
            console.log('[reCAPTCHA] ⚠️ Secret key not configured, skipping server-side verification');
        }
    } catch (captchaErr) {
        console.error('[reCAPTCHA] Error:', captchaErr.message);
        // Non-blocking: allow login if reCAPTCHA service is down
    }

    try {
        const pool = await connectDB();
        const usernameHash = hashData(username);

        // === 1. TÌM TÀI KHOẢN TRƯỚC (để lấy user_id báo cho hệ thống) ===
        const result = await pool.request()
            .input('hash', sql.NVarChar, usernameHash)
            .query("SELECT * FROM system_users WHERE username_hash = @hash");

        const foundUser = result.recordset[0];
        const userId = foundUser ? foundUser.user_id : null;

        // === 2. AI ANOMALY DETECTION: Phân tích trước đăng nhập ===
        let preAnalysis = { riskScore: 0, riskFactors: [], decision: 'ALLOW' };
        try {
            preAnalysis = await anomalyDetector.analyzeLogin(pool, {
                usernameHash, ipAddress: clientIP, userAgent, userId: userId
            });
        } catch (aiErr) {
            console.error('[AI Anomaly] Pre-analysis error (non-blocking):', aiErr.message);
        }

        // === 3. XỬ LÝ NẾU BỊ BLOCK BỞI AI (Khóa tài khoản khẩn cấp) ===
        // Nhưng nếu Admin đã GỠ BAN → cho phép login (downgrade BLOCK → WARN)
        if (preAnalysis.decision === 'BLOCK') {
            // Kiểm tra: user có đang bị ban thực sự không?
            let currentlyBanned = false;
            if (userId) {
                const banStatus = await anomalyDetector.checkBan(pool, userId);
                currentlyBanned = banStatus.isBanned;
            }

            if (!currentlyBanned && userId) {
                // User KHÔNG bị ban (đã được gỡ ban hoặc chưa từng bị ban)
                // → Downgrade BLOCK → WARN để cho phép login, nhưng vẫn ghi cảnh báo
                console.log(`[AI Anomaly] ⚠️ BLOCK downgraded to WARN: User đã được gỡ ban, cho phép login lần này.`);
                preAnalysis.decision = 'WARN';
                preAnalysis.riskFactors.push({
                    type: 'UNBAN_GRACE',
                    severity: 'info',
                    message: 'User đã được Admin gỡ ban — cho phép login lần này'
                });
                // Ghi nhận attempt (không block) để sau khi login thành công, counter reset
            } else {
                // User ĐANG bị ban thật → giữ nguyên BLOCK
                try {
                    // Auto-ban nếu có tài khoản
                    if (userId) {
                        const banResult = await anomalyDetector.autoBan(pool, {
                            userId: userId,
                            usernameHash,
                            riskScore: preAnalysis.riskScore,
                            riskFactors: preAnalysis.riskFactors,
                            ipAddress: clientIP
                        });

                        if (banResult?.banned) {
                            await logAudit(userId, 'ACCOUNT_AUTO_BANNED', {
                                username, riskScore: preAnalysis.riskScore,
                                duration: banResult.duration,
                                banLevel: banResult.banLevel
                            }).catch(() => { });
                        }
                    }

                    // Ghi Log login attempt Blocked
                    await anomalyDetector.recordAttempt(pool, {
                        usernameHash, userId: userId, ipAddress: clientIP, userAgent,
                        success: false, riskScore: preAnalysis.riskScore,
                        riskFactors: preAnalysis.riskFactors, blocked: true, captchaVerified: true
                    });
                } catch (recErr) { console.error('[AI Anomaly] Record / Ban error:', recErr.message); }

                // Only log in audit table if we know which user it is
                if (userId) {
                    await logAudit(userId, 'LOGIN_BLOCKED_BY_AI', {
                        username, riskScore: preAnalysis.riskScore,
                        factors: preAnalysis.riskFactors.map(f => f.type)
                    }).catch(() => { });
                }

                return res.status(403).json({
                    error: 'Tài khoản đã bị Tự động Khóa do hành vi đáng ngờ. Xin vui lòng liên hệ Admin.',
                    riskScore: preAnalysis.riskScore,
                    blocked: true
                });
            } // end else (currentlyBanned)
        }

        const user = foundUser;
        if (!user) {
            // Ghi nhận login fail - user not found
            try {
                await anomalyDetector.recordAttempt(pool, {
                    usernameHash, userId: null, ipAddress: clientIP, userAgent,
                    success: false, riskScore: preAnalysis.riskScore,
                    riskFactors: preAnalysis.riskFactors, blocked: false, captchaVerified: true
                });
                // Tạo thông báo cảnh báo cho Admin
                await pool.request()
                    .input('nTitle', sql.NVarChar, '⚠️ Đăng nhập thất bại')
                    .input('nMsg', sql.NVarChar, `Tài khoản "${username}" không tồn tại nhưng có người cố đăng nhập. Risk Score: ${preAnalysis.riskScore}. IP: ${clientIP}`)
                    .input('nType', sql.NVarChar, 'security')
                    .query(`INSERT INTO notifications (target_role, title, message, type) VALUES ('Admin', @nTitle, @nMsg, @nType)`);
            } catch (recErr) { console.error('[AI Anomaly] Record error:', recErr.message); }
            return res.status(401).json({ error: 'User not found' });
        }

        // === AUTO-BAN: Kiểm tra tài khoản có đang bị ban không ===
        try {
            const banStatus = await anomalyDetector.checkBan(pool, user.user_id);
            if (banStatus.isBanned) {
                // Ghi lại attempt bị từ chối vì đang bị ban
                await anomalyDetector.recordAttempt(pool, {
                    usernameHash, userId: user.user_id, ipAddress: clientIP, userAgent,
                    success: false, riskScore: 100,
                    riskFactors: [{ type: 'ACCOUNT_BANNED', score: 100, severity: 'critical', message: 'Account is currently banned' }],
                    blocked: true, captchaVerified: true
                }).catch(() => { });

                const timeRemaining = banStatus.isPermanent
                    ? 'permanently'
                    : `until ${banStatus.bannedUntil.toLocaleString('vi-VN')}`;

                return res.status(403).json({
                    error: `Tài khoản đã bị khóa ${banStatus.isPermanent ? 'vĩnh viễn' : 'đến ' + banStatus.bannedUntil.toLocaleString('vi-VN')} do hoạt động bất thường (Lần ${banStatus.banCount}).`,
                    banned: true,
                    bannedUntil: banStatus.bannedUntil,
                    isPermanent: banStatus.isPermanent,
                    banCount: banStatus.banCount
                });
            }
        } catch (banErr) {
            console.error('[AutoBan] Check error (non-blocking):', banErr.message);
        }

        let isMatch = false;
        try {
            if (await argon2.verify(user.password_hash, password)) {
                isMatch = true;
            }
        } catch (err) {
            console.error("Argon2 Verify Error:", err);
            return res.status(500).json({ error: 'Authentication service error' });
        }

        if (!isMatch) {
            // Ghi nhận login fail - sai mật khẩu
            try {
                await anomalyDetector.recordAttempt(pool, {
                    usernameHash, userId: user.user_id, ipAddress: clientIP, userAgent,
                    success: false, riskScore: preAnalysis.riskScore,
                    riskFactors: preAnalysis.riskFactors, blocked: false, captchaVerified: true
                });
                // Tạo thông báo cảnh báo cho Admin
                let decryptedUsernameForNotif = username;
                try { decryptedUsernameForNotif = decrypt(user.username) || username; } catch (e) { }
                await pool.request()
                    .input('nTitle', sql.NVarChar, '⚠️ Đăng nhập thất bại')
                    .input('nMsg', sql.NVarChar, `Tài khoản "${decryptedUsernameForNotif}" đăng nhập sai mật khẩu. Risk Score: ${preAnalysis.riskScore}. IP: ${clientIP}`)
                    .input('nType', sql.NVarChar, 'security')
                    .query(`INSERT INTO notifications (target_role, title, message, type) VALUES ('Admin', @nTitle, @nMsg, @nType)`);
            } catch (recErr) { console.error('[AI Anomaly] Record error:', recErr.message); }

            // === AUTO-BAN: Kiểm tra sai mật khẩu >= 3 lần liên tiếp → tự động ban ===
            try {
                const banResult = await anomalyDetector.autobanOnFailedPasswords(pool, {
                    userId: user.user_id,
                    usernameHash,
                    ipAddress: clientIP
                });

                if (banResult?.banned) {
                    let decryptedUsernameForBan = username;
                    try { decryptedUsernameForBan = decrypt(user.username) || username; } catch (e) { }

                    // Ghi audit log
                    await logAudit(user.user_id, 'ACCOUNT_AUTO_BANNED_FAILED_PASSWORDS', {
                        username: decryptedUsernameForBan,
                        duration: banResult.duration,
                        banLevel: banResult.banLevel
                    }).catch(() => { });

                    // Gửi notification cho Admin
                    await pool.request()
                        .input('nTitle2', sql.NVarChar, '🚫 AI tự động khoá tài khoản')
                        .input('nMsg2', sql.NVarChar, `Tài khoản "${decryptedUsernameForBan}" đã bị AI tự động khoá do sai mật khẩu ≥ ${anomalyDetector.MAX_FAILED_BEFORE_BAN} lần liên tiếp. Thời gian khoá: ${banResult.duration}. Ban level: ${banResult.banLevel}. IP: ${clientIP}`)
                        .input('nType2', sql.NVarChar, 'security')
                        .query(`INSERT INTO notifications (target_role, title, message, type) VALUES ('Admin', @nTitle2, @nMsg2, @nType2)`);

                    return res.status(403).json({
                        error: `Tài khoản đã bị AI tự động khoá do sai mật khẩu ${anomalyDetector.MAX_FAILED_BEFORE_BAN} lần liên tiếp. Thời gian khoá: ${banResult.duration === 'PERMANENT' ? 'Vĩnh viễn' : banResult.duration}. Vui lòng liên hệ Admin.`,
                        banned: true,
                        bannedUntil: banResult.bannedUntil,
                        isPermanent: banResult.isPermanent,
                        banLevel: banResult.banLevel
                    });
                }
            } catch (banErr) { console.error('[AutoBan] Failed passwords check error:', banErr.message); }

            return res.status(401).json({ error: 'Invalid credentials' });
        }

        // === AI ANOMALY DETECTION: Post-authentication (có userId để phân tích sâu hơn) ===
        let fullAnalysis = preAnalysis;
        try {
            fullAnalysis = await anomalyDetector.analyzeLogin(pool, {
                usernameHash, ipAddress: clientIP, userAgent, userId: user.user_id
            });
        } catch (aiErr) {
            console.error('[AI Anomaly] Full analysis error (non-blocking):', aiErr.message);
        }

        let decryptedRole = user.role;
        let decryptedUsername = user.username;
        try { decryptedRole = decrypt(user.role) || user.role; } catch (e) { }
        try { decryptedUsername = decrypt(user.username) || user.username; } catch (e) { }

        // Block if account is still Pending
        if (decryptedRole === 'Pending') {
            try {
                await anomalyDetector.recordAttempt(pool, {
                    usernameHash, userId: user.user_id, ipAddress: clientIP, userAgent,
                    success: false, riskScore: fullAnalysis.riskScore,
                    riskFactors: [{ type: 'UNAPPROVED_ACCOUNT', score: 20, severity: 'low', message: 'Pending account login attempt' }],
                    blocked: false, captchaVerified: true
                });
            } catch (recErr) { }
            return res.status(403).json({ error: 'Tài khoản của bạn đang chờ quản lý phê duyệt. Vui lòng liên hệ Admin.', isPending: true });
        }

        // Ghi nhận login thành công
        try {
            await anomalyDetector.recordAttempt(pool, {
                usernameHash, userId: user.user_id, ipAddress: clientIP, userAgent,
                success: true, riskScore: fullAnalysis.riskScore,
                riskFactors: fullAnalysis.riskFactors, blocked: false, captchaVerified: true
            });
        } catch (recErr) { console.error('[AI Anomaly] Record error:', recErr.message); }

        // === DEVICE FINGERPRINTING ===
        const fingerprint = deviceService.generateDeviceFingerprint(req);
        const devInfo = deviceService.getDeviceInfo(req);
        const deviceCheck = await deviceService.checkTrustedDevice(pool, user.user_id, fingerprint);
        let isNewDevice = !deviceCheck.trusted;

        // Send device alert email if new device
        if (isNewDevice) {
            try {
                let userEmail = '';
                try { userEmail = decrypt(user.email); } catch (e) { }
                if (userEmail) {
                    const location = await deviceService.getIPLocation(clientIP);
                    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';

                    // sessionId sẽ được tạo khi verify 2FA thành công
                    // → gửi alert trước, rồi sessionId sẽ được nhúng trong email khi cần
                    console.log(`[Device Alert] ⚠️ New device detected for ${decryptedUsername}: ${devInfo.browser} / ${devInfo.os} from ${clientIP}`);

                    // Gửi notification cho Admin (qua DB) 
                    try {
                        const adminNotif = {
                            type: 'NEW_DEVICE_LOGIN',
                            username: decryptedUsername,
                            device: `${devInfo.browser} / ${devInfo.os}`,
                            ip: clientIP,
                            location: location,
                            time: new Date().toLocaleString('vi-VN')
                        };
                        await logAudit(user.user_id, 'NEW_DEVICE_DETECTED', adminNotif);
                    } catch (notifErr) { console.error('[Admin Notif] Error:', notifErr.message); }
                }
            } catch (alertErr) { console.error('[Device Alert] Error:', alertErr.message); }
        }

        // 2FA Check - Điều kiện:
        // 1. Có Google Authenticator → bắt buộc 2FA (ưu tiên GG Auth)
        // 2. Có Email OTP per-user bật → bắt Email OTP
        // 3. Không có cả hai → cho đăng nhập thẳng
        const has2FAApp = !!user.is_two_fa_enabled;
        const emailOtpEnabled = !!user.is_email_otp_enabled;

        // Nếu KHÔNG có GG Auth VÀ Email OTP chưa bật → login thẳng (không 2FA)
        if (!has2FAApp && !emailOtpEnabled) {
            console.log('[Login] ⚡ No 2FA required (GG Auth off + Email OTP disabled)');

            const token = jwt.sign({ id: user.user_id, role: decryptedRole, username: decryptedUsername }, process.env.JWT_SECRET || 'secret', { expiresIn: '15m' });
            clearForceLogout(user.user_id); // Xóa force-logout khi đăng nhập lại thành công
            const refreshTokenExpiry = rememberSession ? '7d' : '1d';
            const refreshToken = jwt.sign({ id: user.user_id }, process.env.JWT_SECRET || 'secret', { expiresIn: refreshTokenExpiry });

            const hashedRefresh = hashData(refreshToken);
            const expDate = new Date();
            expDate.setDate(expDate.getDate() + (rememberSession ? 7 : 1));
            const encIP = encrypt(clientIP);

            await pool.request()
                .input('uid', sql.UniqueIdentifier, user.user_id)
                .input('th', sql.NVarChar, hashedRefresh)
                .input('exp', sql.DateTime, expDate)
                .input('fp', sql.NVarChar, fingerprint)
                .input('ip', sql.NVarChar, encIP)
                .query("INSERT INTO auth_refresh_tokens (user_id, token_hash, expires_at, device_fingerprint, ip_address) VALUES (@uid, @th, @exp, @fp, @ip)");

            // Register device as trusted
            if (isNewDevice && fingerprint) {
                await deviceService.addTrustedDevice(pool, user.user_id, fingerprint, devInfo, clientIP);
            }

            res.cookie('refreshToken', refreshToken, {
                httpOnly: true, secure: true, sameSite: 'none', path: '/',
                maxAge: (rememberSession ? 7 : 1) * 24 * 60 * 60 * 1000
            });

            await logAudit(user.user_id, 'USER_LOGIN', {
                username: decryptedUsername,
                riskScore: fullAnalysis.riskScore,
                aiDecision: fullAnalysis.decision,
                twoFA: 'skipped_no_smtp'
            });

            return res.json({
                token, role: decryptedRole, username: decryptedUsername,
                riskScore: fullAnalysis.riskScore,
                warnings: fullAnalysis.decision === 'WARN' ? fullAnalysis.riskFactors : []
            });
        }

        // Gửi Email OTP sẵn (chỉ khi Email OTP bật VÀ KHÔNG có Google Authenticator)
        // Nếu có cả 2 method → đợi user chọn "Email OTP" tab rồi mới gửi (qua /otp/resend)
        let emailOTPSent = false;
        if (emailOtpEnabled && !has2FAApp) {
            try {
                let userEmail = '';
                try { userEmail = decrypt(user.email); } catch (e) { }
                if (userEmail) {
                    const otp = otpService.generateOTP();
                    await otpService.storeOTP(pool, userEmail, otp, 'LOGIN_2FA');
                    await emailService.sendOTPEmail(userEmail, otp, 'LOGIN_2FA', decryptedUsername, lang);
                    emailOTPSent = true;
                }
            } catch (otpErr) { console.error('[Login 2FA] Email OTP error:', otpErr.message); }
        }

        const tempToken = jwt.sign({
            id: user.user_id,
            role: decryptedRole,
            username: decryptedUsername,
            pending2FA: true,
            rememberSession: !!rememberSession,
            fingerprint: fingerprint,
            isNewDevice: isNewDevice
        }, process.env.JWT_SECRET || 'secret', { expiresIn: '5m' });

        // Mask email hiển thị
        let maskedEmail = '';
        try {
            let userEmail = decrypt(user.email) || '';
            if (userEmail) {
                const parts = userEmail.split('@');
                maskedEmail = parts[0].substring(0, 2) + '***@' + parts[1];
            }
        } catch (e) { }

        return res.json({
            requires2FA: true,
            tempToken,
            riskScore: fullAnalysis.riskScore,
            has2FAApp: has2FAApp,
            emailOTPSent: emailOTPSent,
            emailOtpEnabled: emailOtpEnabled,
            maskedEmail: maskedEmail,
            isNewDevice: isNewDevice,
            deviceInfo: isNewDevice ? {
                browser: devInfo.browser,
                os: devInfo.os,
                ip: clientIP
            } : null
        });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// 1.1 Verify 2FA for Login (Dual Mode: Google Authenticator OR Email OTP)
app.post('/api/auth/verify-2fa', async (req, res) => {
    const { tempToken, token, method, lang } = req.body;
    const emailLang = lang || 'vi';
    // method: 'authenticator' (Google Auth) hoặc 'email' (Email OTP)
    try {
        if (!tempToken || !token) return res.status(400).json({ error: 'Missing tokens' });

        let decoded;
        try {
            decoded = jwt.verify(tempToken, process.env.JWT_SECRET || 'secret');
        } catch (jwtErr) {
            if (jwtErr.name === 'TokenExpiredError') {
                return res.status(401).json({ error: 'Phiên xác thực đã hết hạn (expired). Vui lòng đăng nhập lại.', expired: true });
            }
            return res.status(400).json({ error: 'Token không hợp lệ. Vui lòng đăng nhập lại.' });
        }
        if (!decoded.pending2FA) return res.status(400).json({ error: 'Invalid token type' });

        const pool = await connectDB();

        // === Verify OTP theo method ===
        if (method === 'authenticator') {
            // Google Authenticator (TOTP)
            const result = await pool.request()
                .input('id', sql.UniqueIdentifier, decoded.id)
                .query("SELECT two_fa_secret FROM system_users WHERE user_id = @id");

            const user = result.recordset[0];
            if (!user || !user.two_fa_secret) return res.status(400).json({ error: '2FA not setup' });

            let decryptedSecret = '';
            try { decryptedSecret = decrypt(user.two_fa_secret); }
            catch (e) { decryptedSecret = user.two_fa_secret; }

            const serverTime2FA = new Date();
            console.log(`[2FA Login] Server Time: ${serverTime2FA.toISOString()} | Method: Authenticator`);
            const isValid = speakeasy.totp.verify({ secret: decryptedSecret, encoding: 'base32', token: token, window: 8 });

            if (!isValid) return res.status(401).json({ error: 'Mã xác thực không hợp lệ. Hãy kiểm tra lại Google Authenticator.' });
        } else {
            // Email OTP (default)
            let userEmail = '';
            const userRes = await pool.request()
                .input('id', sql.UniqueIdentifier, decoded.id)
                .query("SELECT email FROM system_users WHERE user_id = @id");
            try { userEmail = decrypt(userRes.recordset[0]?.email); } catch (e) { }

            if (!userEmail) return res.status(400).json({ error: 'Không tìm thấy email liên kết.' });

            const verification = await otpService.verifyOTP(pool, userEmail, token.trim(), 'LOGIN_2FA');
            if (!verification.valid) {
                return res.status(401).json({ error: verification.error });
            }
        }

        // === OTP verified → Issue tokens + Device management ===
        const tokenExpiry2FA = '15m';
        const finalToken = jwt.sign({ id: decoded.id, role: decoded.role, username: decoded.username }, process.env.JWT_SECRET || 'secret', { expiresIn: tokenExpiry2FA });
        clearForceLogout(decoded.id); // Xóa force-logout khi 2FA xác thực thành công

        // Refresh token
        const refreshTokenExpiry = decoded.rememberSession ? '7d' : '1d';
        const refreshToken = jwt.sign({ id: decoded.id }, process.env.JWT_SECRET || 'secret', { expiresIn: refreshTokenExpiry });

        const hashedRefresh = hashData(refreshToken);
        const expDate = new Date();
        expDate.setDate(expDate.getDate() + (decoded.rememberSession ? 7 : 1));

        // Lưu refresh token + device fingerprint + IP vào DB
        const fingerprint = decoded.fingerprint || '';
        const clientIP = resolveClientIP(req);
        const encIP = encrypt(clientIP);

        const insertResult = await pool.request()
            .input('uid', sql.UniqueIdentifier, decoded.id)
            .input('th', sql.NVarChar, hashedRefresh)
            .input('exp', sql.DateTime, expDate)
            .input('fp', sql.NVarChar, fingerprint)
            .input('ip', sql.NVarChar, encIP)
            .query("INSERT INTO auth_refresh_tokens (user_id, token_hash, expires_at, device_fingerprint, ip_address) OUTPUT INSERTED.session_id VALUES (@uid, @th, @exp, @fp, @ip)");

        const sessionId = insertResult.recordset[0]?.session_id;

        // === Device trust management ===
        if (decoded.isNewDevice && fingerprint) {
            const devInfo = deviceService.getDeviceInfo(req);
            const addResult = await deviceService.addTrustedDevice(pool, decoded.id, fingerprint, devInfo, clientIP);

            // Gửi Device Alert Email (với sessionId để nút "Không phải tôi" hoạt động)
            try {
                let userEmail = '';
                const emailRes = await pool.request()
                    .input('id', sql.UniqueIdentifier, decoded.id)
                    .query("SELECT email FROM system_users WHERE user_id = @id");
                try { userEmail = decrypt(emailRes.recordset[0]?.email); } catch (e) { }

                if (userEmail && sessionId) {
                    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
                    const revokeUrl = `${frontendUrl}/security/device-action?action=revoke&sessionId=${sessionId}`;
                    
                    // Generate a secure token for direct password change (30 min expiry)
                    const changePwToken = jwt.sign(
                        { id: decoded.id, purpose: 'email_change_password' },
                        process.env.JWT_SECRET || 'secret',
                        { expiresIn: '30m' }
                    );
                    const changePasswordUrl = `${frontendUrl}/security/change-password?token=${changePwToken}`;

                    await emailService.sendDeviceAlertEmail(userEmail, decoded.username, {
                        ip: clientIP,
                        browser: devInfo.browser,
                        os: devInfo.os,
                        location: addResult.location,
                        time: new Date().toLocaleString(emailLang === 'en' ? 'en-US' : 'vi-VN')
                    }, revokeUrl, changePasswordUrl, emailLang);
                }
            } catch (emailErr) { console.error('[Device Alert Email] Error:', emailErr.message); }
        }

        res.cookie('refreshToken', refreshToken, {
            httpOnly: true,
            secure: true,
            sameSite: 'none',
            path: '/',
            maxAge: (decoded.rememberSession ? 7 : 1) * 24 * 60 * 60 * 1000
        });

        await logAudit(decoded.id, 'USER_LOGIN_2FA', {
            username: decoded.username,
            method: method || 'email',
            newDevice: decoded.isNewDevice
        });

        res.json({ token: finalToken, role: decoded.role, username: decoded.username });
    } catch (err) {
        console.error('[Verify 2FA] Error:', err.message);
        res.status(401).json({ error: 'Token expired or invalid' });
    }
});

// 1.2 Verify Refresh Token & Issue New Access Token
app.post('/api/auth/refresh', async (req, res) => {
    const refreshToken = req.cookies.refreshToken;
    if (!refreshToken) return res.status(401).json({ error: 'No refresh token provided' });

    try {
        const decoded = jwt.verify(refreshToken, process.env.JWT_SECRET || 'secret');
        const hashedRefresh = hashData(refreshToken);

        const pool = await connectDB();
        const checkRes = await pool.request()
            .input('uid', sql.UniqueIdentifier, decoded.id)
            .input('th', sql.NVarChar, hashedRefresh)
            .query("SELECT * FROM auth_refresh_tokens WHERE user_id = @uid AND token_hash = @th AND expires_at > GETUTCDATE()");

        if (checkRes.recordset.length === 0) {
            // Thông báo bắt đăng nhập lại do Refresh token bị xóa hoặc hết hạn
            res.clearCookie('refreshToken', { path: '/api/auth/refresh' });
            return res.status(401).json({ error: 'Invalid refresh session. Please login again.' });
        }

        // Tạo lại Access Token
        const userRes = await pool.request().input('id', sql.UniqueIdentifier, decoded.id).query("SELECT username, role FROM system_users WHERE user_id = @id");
        if (userRes.recordset.length === 0) return res.status(404).json({ error: 'User not found' });

        const user = userRes.recordset[0];
        let decryptedRole = user.role;
        let decryptedUsername = user.username;
        try { decryptedRole = decrypt(user.role) || user.role; } catch (e) { }
        try { decryptedUsername = decrypt(user.username) || user.username; } catch (e) { }

        const newToken = jwt.sign({ id: decoded.id, role: decryptedRole, username: decryptedUsername }, process.env.JWT_SECRET || 'secret', { expiresIn: '15m' });
        res.json({ token: newToken });
    } catch (err) {
        res.clearCookie('refreshToken', { path: '/api/auth/refresh' });
        res.status(403).json({ error: 'Refresh token expired or invalid' });
    }
});

// 1.3 Logout (Clear Cookies and DB tokens)
app.post('/api/auth/logout', async (req, res) => {
    const refreshToken = req.cookies.refreshToken;
    if (refreshToken) {
        try {
            const hashedRefresh = hashData(refreshToken);
            const pool = await connectDB();
            await pool.request()
                .input('th', sql.NVarChar, hashedRefresh)
                .query("DELETE FROM auth_refresh_tokens WHERE token_hash = @th");
        } catch (e) { }
    }
    res.clearCookie('refreshToken', { path: '/api/auth/refresh' });
    res.json({ message: 'Logged out successfully' });
});

// [REMOVED] Old device/revoke endpoint moved to consolidated endpoint below (with addForceLogout support)

app.post('/api/auth/register', async (req, res) => {
    let { username, password, fullName, email, phone, role, captchaToken, lang } = req.body;
    lang = lang || 'vi';

    // Trim inputs to prevent accidental trailing spaces
    username = (username || '').trim();
    password = (password || '').trim();
    fullName = (fullName || '').trim();
    email = (email || '').trim();
    phone = (phone || '').trim();

    // === Kiểm tra cài đặt CAPTCHA ===
    let captchaEnabled = true;
    try {
        const fs = require('fs');
        const data = fs.readFileSync('./settings.json', 'utf8');
        captchaEnabled = JSON.parse(data).captchaEnabled;
    } catch (e) { }

    // === Verify reCAPTCHA nếu được bật ===
    if (captchaEnabled) {
        if (!captchaToken) {
            return res.status(400).json({ error: 'Vui lòng xác nhận bạn không phải robot' });
        }
        try {
            const secretKey = process.env.RECAPTCHA_SECRET_KEY;
            if (secretKey && secretKey !== 'YOUR_SECRET_KEY_HERE') {
                const https = require('https');
                const clientIP = resolveClientIP(req);
                const verifyResult = await new Promise((resolve, reject) => {
                    const postData = `secret=${encodeURIComponent(secretKey)}&response=${encodeURIComponent(captchaToken)}&remoteip=${encodeURIComponent(clientIP)}`;
                    const options = {
                        hostname: 'www.google.com', port: 443,
                        path: '/recaptcha/api/siteverify', method: 'POST',
                        headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Content-Length': Buffer.byteLength(postData) }
                    };
                    const req2 = https.request(options, (r2) => {
                        let data = '';
                        r2.on('data', chunk => data += chunk);
                        r2.on('end', () => resolve(JSON.parse(data)));
                    });
                    req2.on('error', reject);
                    req2.write(postData);
                    req2.end();
                });
                if (!verifyResult.success) {
                    return res.status(400).json({ error: 'Xác nhận reCAPTCHA thất bại. Vui lòng thử lại.' });
                }
                console.log('[reCAPTCHA Register] ✅ Verification passed');
            }
        } catch (captchaErr) {
            console.error('[reCAPTCHA Register] Error:', captchaErr.message);
            // Non-blocking: cho phép đăng ký nếu reCAPTCHA service bị lỗi
        }
    }

    // Password complexity validation
    const passwordRegex = /^(?=.*[A-Z])(?=.*[!@#$&*.,?<>^%\-_\=+~]).{8,}$/;
    if (!passwordRegex.test(password)) {
        return res.status(400).json({ error: 'Mật khẩu phải chứa ít nhất 8 ký tự, 1 chữ hoa và 1 ký tự đặc biệt' });
    }

    try {
        const pool = await connectDB();
        const emailHash = hashData(email);
        const usernameHash = hashData(username);

        // Check trùng username/email trong system_users
        const checkRes = await pool.request()
            .input('u', sql.NVarChar, usernameHash)
            .input('e', sql.NVarChar, emailHash)
            .query("SELECT * FROM system_users WHERE username_hash = @u OR email_hash = @e");

        if (checkRes.recordset.length > 0) {
            return res.status(400).json({ error: 'Username or email already exists' });
        }

        // Hash password + encrypt data
        const passHash = await argon2.hash(password);
        const encUsername = encrypt(username);
        const encName = encrypt(fullName);
        const encEmail = encrypt(email);
        const encPhone = encrypt(phone || '');

        // Check Email OTP setting
        const emailOtpEnabled = !!readSettings().emailOtpEnabled;

        if (!emailOtpEnabled) {
            // Email OTP tắt → đăng ký thẳng (không cần OTP email)
            console.log('[Register] ⚡ Email OTP disabled → direct registration (no OTP)');
            const encRole = encrypt('Pending');
            const r = await pool.request()
                .input('u', sql.NVarChar, encUsername)
                .input('uh', sql.NVarChar, usernameHash)
                .input('p', sql.NVarChar, passHash)
                .input('f', sql.NVarChar, encName)
                .input('e', sql.NVarChar, encEmail)
                .input('eh', sql.NVarChar, emailHash)
                .input('ph', sql.NVarChar, encPhone)
                .input('r', sql.NVarChar, encRole)
                .query(`INSERT INTO system_users (username, username_hash, password_hash, full_name, email, email_hash, phone, role)
                        OUTPUT INSERTED.user_id
                        VALUES (@u, @uh, @p, @f, @e, @eh, @ph, @r)`);

            await logAudit(r.recordset[0].user_id, 'USER_REGISTER', { username, smtp: 'not_configured' });
            return res.status(201).json({ message: 'Đăng ký thành công! Tài khoản đang chờ Admin phê duyệt.' });
        }

        // === SMTP đã cấu hình → OTP Flow ===

        // Check trùng trong pending_registrations (đang chờ OTP)
        const checkPending = await pool.request()
            .input('u', sql.NVarChar, usernameHash)
            .input('e', sql.NVarChar, emailHash)
            .query("SELECT * FROM pending_registrations WHERE (username_hash = @u OR email_hash = @e) AND expires_at > GETUTCDATE()");

        // Xóa pending cũ nếu có (cho phép đăng ký lại)
        if (checkPending.recordset.length > 0) {
            await pool.request()
                .input('u', sql.NVarChar, usernameHash)
                .input('e', sql.NVarChar, emailHash)
                .query("DELETE FROM pending_registrations WHERE username_hash = @u OR email_hash = @e");
        }

        // Lưu vào pending_registrations (10 phút hết hạn)
        const expiresAt = new Date(Date.now() + 10 * 60 * 1000);
        await pool.request()
            .input('u', sql.NVarChar, encUsername)
            .input('uh', sql.NVarChar, usernameHash)
            .input('p', sql.NVarChar, passHash)
            .input('f', sql.NVarChar, encName)
            .input('e', sql.NVarChar, encEmail)
            .input('eh', sql.NVarChar, emailHash)
            .input('ph', sql.NVarChar, encPhone)
            .input('exp', sql.DateTime, expiresAt)
            .query(`INSERT INTO pending_registrations (username, username_hash, password_hash, full_name, email, email_hash, phone, expires_at)
                    VALUES (@u, @uh, @p, @f, @e, @eh, @ph, @exp)`);

        // Tạo & gửi OTP qua email
        const otp = otpService.generateOTP();
        await otpService.storeOTP(pool, email, otp, 'REGISTER');
        await emailService.sendOTPEmail(email, otp, 'REGISTER', fullName, lang);

        // Mask email để hiển thị trên frontend
        const parts = email.split('@');
        const maskedEmail = parts[0].substring(0, 2) + '***@' + parts[1];

        console.log(`[Register] 📧 OTP sent to ${maskedEmail} for user "${username}"`);
        res.status(200).json({
            requiresOTP: true,
            email: maskedEmail,
            ttl: otpService.OTP_TTL_SECONDS,
            message: 'Mã OTP đã được gửi đến email của bạn. Vui lòng kiểm tra và nhập mã để hoàn tất đăng ký.'
        });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// === VERIFY REGISTRATION OTP ===
app.post('/api/auth/register/verify-otp', async (req, res) => {
    const { email, otp } = req.body;
    if (!email || !otp) return res.status(400).json({ error: 'Thiếu email hoặc mã OTP' });

    try {
        const pool = await connectDB();

        // 1. Verify OTP
        const verification = await otpService.verifyOTP(pool, email.trim(), otp.trim(), 'REGISTER');
        if (!verification.valid) {
            return res.status(400).json({ error: verification.error });
        }

        // 2. Lấy dữ liệu pending registration
        const emailHash = hashData(email.trim());
        const pendingRes = await pool.request()
            .input('eh', sql.NVarChar, emailHash)
            .query("SELECT TOP 1 * FROM pending_registrations WHERE email_hash = @eh AND expires_at > GETUTCDATE() ORDER BY created_at DESC");

        if (pendingRes.recordset.length === 0) {
            return res.status(400).json({ error: 'Yêu cầu đăng ký đã hết hạn. Vui lòng đăng ký lại.' });
        }

        const pending = pendingRes.recordset[0];

        // 3. Chuyển từ pending → system_users (role = 'Pending' chờ Admin duyệt)
        const encRole = encrypt('Pending');
        const r = await pool.request()
            .input('u', sql.NVarChar, pending.username)
            .input('uh', sql.NVarChar, pending.username_hash)
            .input('p', sql.NVarChar, pending.password_hash)
            .input('f', sql.NVarChar, pending.full_name)
            .input('e', sql.NVarChar, pending.email)
            .input('eh', sql.NVarChar, pending.email_hash)
            .input('ph', sql.NVarChar, pending.phone)
            .input('r', sql.NVarChar, encRole)
            .query(`INSERT INTO system_users (username, username_hash, password_hash, full_name, email, email_hash, phone, role)
                    OUTPUT INSERTED.user_id
                    VALUES (@u, @uh, @p, @f, @e, @eh, @ph, @r)`);

        // 4. Xóa pending record
        await pool.request()
            .input('id', sql.UniqueIdentifier, pending.id)
            .query("DELETE FROM pending_registrations WHERE id = @id");

        await logAudit(r.recordset[0].user_id, 'USER_REGISTER_OTP_VERIFIED', { email: 'ENCRYPTED' });
        console.log(`[Register] ✅ User activated via OTP verification`);

        res.status(201).json({ message: 'Đăng ký thành công! Tài khoản đang chờ Admin phê duyệt.' });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// === RESEND OTP ===
app.post('/api/auth/otp/resend', async (req, res) => {
    const { email, type, tempToken } = req.body;
    if (!type) return res.status(400).json({ error: 'Thiếu thông tin' });

    const validTypes = ['REGISTER', 'LOGIN_2FA', 'FORGOT_PASSWORD'];
    if (!validTypes.includes(type)) return res.status(400).json({ error: 'Loại OTP không hợp lệ' });

    try {
        const pool = await connectDB();
        let targetEmail = email ? email.trim() : '';

        // Nếu là LOGIN_2FA và có tempToken → lấy email từ userId trong token
        if (type === 'LOGIN_2FA' && tempToken && !targetEmail) {
            try {
                const decoded = jwt.verify(tempToken, process.env.JWT_SECRET || 'secret');
                const userRes = await pool.request()
                    .input('id', sql.UniqueIdentifier, decoded.id)
                    .query("SELECT email FROM system_users WHERE user_id = @id");
                if (userRes.recordset[0]) {
                    try { targetEmail = decrypt(userRes.recordset[0].email); } catch (e) { }
                }
            } catch (jwtErr) {
                return res.status(401).json({ error: 'Phiên đã hết hạn. Vui lòng đăng nhập lại.', expired: true });
            }
        }

        if (!targetEmail) return res.status(400).json({ error: 'Không tìm thấy email' });

        const otp = otpService.generateOTP();
        await otpService.storeOTP(pool, targetEmail, otp, type);
        const emailLang = req.body.lang || 'vi';
        await emailService.sendOTPEmail(targetEmail, otp, type, '', emailLang);

        console.log(`[OTP Resend] 📧 ${type} OTP sent to ${targetEmail.substring(0, 3)}***`);
        res.json({ success: true, ttl: otpService.OTP_TTL_SECONDS, message: 'Mã OTP mới đã được gửi.' });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// === FORGOT PASSWORD: Step 1 - Send OTP ===
app.post('/api/auth/forgot-password', async (req, res) => {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: 'Vui lòng nhập email' });

    try {
        const pool = await connectDB();
        const emailHash = hashData(email.trim());

        // Kiểm tra email tồn tại
        const userRes = await pool.request()
            .input('eh', sql.NVarChar, emailHash)
            .query("SELECT user_id, username, full_name FROM system_users WHERE email_hash = @eh");

        if (userRes.recordset.length === 0) {
            // Không tiết lộ email có tồn tại hay không (bảo mật)
            return res.json({ success: true, message: 'Nếu email tồn tại trong hệ thống, mã OTP sẽ được gửi.' });
        }

        const user = userRes.recordset[0];
        let username = user.username;
        try { username = decrypt(user.username) || user.username; } catch (e) { }

        // Gửi OTP
        const otp = otpService.generateOTP();
        await otpService.storeOTP(pool, email.trim(), otp, 'FORGOT_PASSWORD');
        const emailLang = req.body.lang || 'vi';
        await emailService.sendOTPEmail(email.trim(), otp, 'FORGOT_PASSWORD', username, emailLang);

        const parts = email.trim().split('@');
        const maskedEmail = parts[0].substring(0, 2) + '***@' + parts[1];

        console.log(`[ForgotPassword] 📧 OTP sent to ${maskedEmail}`);
        res.json({ success: true, email: maskedEmail, ttl: otpService.OTP_TTL_SECONDS, message: 'Mã OTP đã được gửi đến email của bạn.' });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// === FORGOT PASSWORD: Step 2 - Verify OTP ===
app.post('/api/auth/forgot-password/verify', async (req, res) => {
    const { email, otp } = req.body;
    if (!email || !otp) return res.status(400).json({ error: 'Thiếu thông tin' });

    try {
        const pool = await connectDB();
        const verification = await otpService.verifyOTP(pool, email.trim(), otp.trim(), 'FORGOT_PASSWORD');

        if (!verification.valid) {
            return res.status(400).json({ error: verification.error });
        }

        // Tạo temp token (5 phút) để cho phép đặt lại mật khẩu
        const emailHash = hashData(email.trim());
        const userRes = await pool.request()
            .input('eh', sql.NVarChar, emailHash)
            .query("SELECT user_id FROM system_users WHERE email_hash = @eh");

        if (userRes.recordset.length === 0) {
            return res.status(404).json({ error: 'Tài khoản không tồn tại' });
        }

        const resetToken = jwt.sign(
            { id: userRes.recordset[0].user_id, purpose: 'password_reset' },
            process.env.JWT_SECRET || 'secret',
            { expiresIn: '5m' }
        );

        res.json({ success: true, resetToken, message: 'Xác thực thành công. Vui lòng đặt mật khẩu mới.' });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// === FORGOT PASSWORD: Step 3 - Reset Password ===
app.post('/api/auth/forgot-password/reset', async (req, res) => {
    const { resetToken, newPassword } = req.body;
    if (!resetToken || !newPassword) return res.status(400).json({ error: 'Thiếu thông tin' });

    // Password complexity check
    const passwordRegex = /^(?=.*[A-Z])(?=.*[!@#$&*.,?<>^%\-_\=+~]).{8,}$/;
    if (!passwordRegex.test(newPassword)) {
        return res.status(400).json({ error: 'Mật khẩu phải chứa ít nhất 8 ký tự, 1 chữ hoa và 1 ký tự đặc biệt' });
    }

    try {
        const decoded = jwt.verify(resetToken, process.env.JWT_SECRET || 'secret');
        if (decoded.purpose !== 'password_reset') {
            return res.status(400).json({ error: 'Token không hợp lệ' });
        }

        const pool = await connectDB();
        const newHash = await argon2.hash(newPassword);

        // Update password
        await pool.request()
            .input('ph', sql.NVarChar, newHash)
            .input('id', sql.UniqueIdentifier, decoded.id)
            .query('UPDATE system_users SET password_hash = @ph WHERE user_id = @id');

        // Revoke ALL sessions (đăng xuất toàn bộ thiết bị)
        await deviceService.revokeAllSessions(pool, decoded.id);

        // Gửi email thông báo đổi mật khẩu thành công
        try {
            const userRes = await pool.request()
                .input('id', sql.UniqueIdentifier, decoded.id)
                .query("SELECT username, email FROM system_users WHERE user_id = @id");
            if (userRes.recordset[0]) {
                let email = '', username = '';
                try { email = decrypt(userRes.recordset[0].email); } catch (e) { }
                try { username = decrypt(userRes.recordset[0].username); } catch (e) { }
                const emailLang = req.body.lang || 'vi';
                if (email) await emailService.sendPasswordChangedEmail(email, username, emailLang);
            }
        } catch (emailErr) { console.error('[ForgotPassword] Email notification error:', emailErr.message); }

        await logAudit(decoded.id, 'PASSWORD_RESET_VIA_EMAIL', { method: 'forgot_password' });
        res.json({ success: true, message: 'Mật khẩu đã được đặt lại thành công. Tất cả phiên đăng nhập đã bị đăng xuất.' });
    } catch (err) {
        if (err.name === 'TokenExpiredError') {
            return res.status(400).json({ error: 'Link đặt lại mật khẩu đã hết hạn. Vui lòng thử lại.' });
        }
        res.status(500).json({ error: err.message });
    }
});

// === DEVICE ALERT: "Không phải tôi" - Revoke session ===
app.post('/api/auth/device/revoke', async (req, res) => {
    const { sessionId, token } = req.body;

    // Có thể dùng token hoặc sessionId trực tiếp (từ email link)
    if (!sessionId) return res.status(400).json({ error: 'Thiếu session ID' });

    try {
        const pool = await connectDB();
        const result = await deviceService.revokeSession(pool, sessionId);

        if (result.revoked) {
            // Force logout: đảm bảo thiết bị bị đăng xuất ngay lập tức
            // (không cần đợi access token hết hạn)
            // CHỈ blacklist token cụ thể → chỉ thiết bị bị revoke mới bị đẩy ra
            // KHÔNG dùng addForceLogout(userId) vì sẽ đẩy TẤT CẢ thiết bị ra
            if (result.tokenHash) {
                addForceLogoutToken(result.tokenHash);
                console.log(`[Revoke] 🎯 Blacklisted specific token for session, only that device will be forced out`);
            }
            res.json({ success: true, message: 'Phiên đăng nhập của thiết bị lạ đã bị thu hồi thành công.' });
        } else {
            res.json({ success: false, message: 'Phiên đăng nhập không tồn tại hoặc đã hết hạn.' });
        }
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// === DEVICE MANAGEMENT: List trusted devices ===
app.get('/api/auth/devices', authenticateToken, async (req, res) => {
    try {
        const pool = await connectDB();
        const devices = await deviceService.getTrustedDevices(pool, req.user.id);
        res.json(devices);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// === DEVICE MANAGEMENT: Remove trusted device ===
app.delete('/api/auth/devices/:id', authenticateToken, async (req, res) => {
    try {
        const pool = await connectDB();
        const result = await deviceService.removeTrustedDevice(pool, req.params.id, req.user.id);
        if (result.removed) {
            await logAudit(req.user.id, 'REMOVE_TRUSTED_DEVICE', { deviceId: req.params.id });
            res.json({ success: true, message: 'Đã xóa thiết bị tin cậy' });
        } else {
            res.status(404).json({ error: 'Thiết bị không tồn tại' });
        }
    } catch (err) { res.status(500).json({ error: err.message }); }
});


app.get('/api/auth/me', authenticateToken, (req, res) => {
    // req.user contains the decoded JWT loaded by authenticateToken
    res.json({ id: req.user.id, role: req.user.role, username: req.user.username });
});

// Get full profile details
app.get('/api/auth/me/profile', authenticateToken, async (req, res) => {
    try {
        const pool = await connectDB();
        const result = await pool.request()
            .input('id', sql.UniqueIdentifier, req.user.id)
            .query('SELECT * FROM system_users WHERE user_id = @id');

        const user = result.recordset[0];
        if (!user) return res.status(404).json({ error: 'User not found' });

        let username = safeDecrypt(user.username) || user.username;
        let fullName = safeDecrypt(user.full_name) || user.full_name;
        let email = safeDecrypt(user.email) || user.email;
        let phone = safeDecrypt(user.phone) || user.phone;
        let role = safeDecrypt(user.role) || user.role;

        res.json({
            user_id: user.user_id,
            username,
            full_name: fullName,
            email, phone: phone || '',
            role,
            is2FAEnabled: !!user.is_two_fa_enabled,
            isEmailOtpEnabled: !!user.is_email_otp_enabled
        });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// Update profile
app.put('/api/auth/me/profile', authenticateToken, async (req, res) => {
    const { fullName, email, phone, password } = req.body;
    if (!password) return res.status(400).json({ error: 'Vui lòng nhập mật khẩu để xác nhận thay đổi' });

    try {
        const pool = await connectDB();

        // 1. Verify Password
        const userRes = await pool.request()
            .input('id', sql.UniqueIdentifier, req.user.id)
            .query('SELECT password_hash FROM system_users WHERE user_id = @id');

        if (!userRes.recordset.length) return res.status(404).json({ error: 'User not found' });

        const isMatch = await argon2.verify(userRes.recordset[0].password_hash, password);
        if (!isMatch) return res.status(401).json({ error: 'Mật khẩu xác nhận không chính xác' });

        // 2. Check email collision with other users
        const emailHash = hashData(email);
        const check = await pool.request()
            .input('eh', sql.NVarChar, emailHash)
            .input('id', sql.UniqueIdentifier, req.user.id)
            .query('SELECT user_id FROM system_users WHERE email_hash = @eh AND user_id != @id');

        if (check.recordset.length > 0) return res.status(400).json({ error: 'Email đã được sử dụng bởi tài khoản khác' });

        await pool.request()
            .input('fn', sql.NVarChar, encrypt(fullName))
            .input('em', sql.NVarChar, encrypt(email))
            .input('eh', sql.NVarChar, emailHash)
            .input('ph', sql.NVarChar, encrypt(phone || ''))
            .input('id', sql.UniqueIdentifier, req.user.id)
            .query('UPDATE system_users SET full_name=@fn, email=@em, email_hash=@eh, phone=@ph WHERE user_id=@id');

        await logAudit(req.user.id, 'UPDATE_PROFILE', { userId: req.user.id });
        res.json({ message: 'Cập nhật hồ sơ thành công' });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// Change password (+ Logout all sessions + Email notification)
app.put('/api/auth/me/password', authenticateToken, async (req, res) => {
    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword) return res.status(400).json({ error: 'Vui lòng nhập đầy đủ thông tin' });
    if (newPassword.length < 8) return res.status(400).json({ error: 'Mật khẩu mới phải có ít nhất 8 ký tự' });
    try {
        const pool = await connectDB();
        const result = await pool.request()
            .input('id', sql.UniqueIdentifier, req.user.id)
            .query('SELECT password_hash, email, username FROM system_users WHERE user_id = @id');

        const user = result.recordset[0];
        if (!user) return res.status(404).json({ error: 'User not found' });

        const isMatch = await argon2.verify(user.password_hash, currentPassword);
        if (!isMatch) return res.status(401).json({ error: 'Mật khẩu hiện tại không đúng' });

        const newHash = await argon2.hash(newPassword);
        await pool.request()
            .input('ph', sql.NVarChar, newHash)
            .input('id', sql.UniqueIdentifier, req.user.id)
            .query('UPDATE system_users SET password_hash = @ph WHERE user_id = @id');

        // Revoke ALL sessions (đăng xuất tất cả thiết bị)
        await deviceService.revokeAllSessions(pool, req.user.id);

        // Gửi email thông báo đổi mật khẩu
        try {
            let email = '', username = '';
            try { email = decrypt(user.email); } catch (e) { }
            try { username = decrypt(user.username); } catch (e) { }
            const emailLang = req.body.lang || 'vi';
            if (email) await emailService.sendPasswordChangedEmail(email, username, emailLang);
        } catch (emailErr) { console.error('[ChangePassword] Email notification error:', emailErr.message); }

        await logAudit(req.user.id, 'CHANGE_PASSWORD', { userId: req.user.id, allSessionsRevoked: true });
        res.json({ message: 'Đổi mật khẩu thành công. Tất cả phiên đăng nhập đã bị đăng xuất.', logoutAll: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// Change password from email security alert (token-based, no login required)
app.post('/api/auth/email-change-password', async (req, res) => {
    const { token, currentPassword, newPassword } = req.body;
    if (!token || !currentPassword || !newPassword) {
        return res.status(400).json({ error: 'Vui lòng nhập đầy đủ thông tin' });
    }

    // Password complexity check
    const passwordRegex = /^(?=.*[A-Z])(?=.*[!@#$&*.,?<>^%\-_\=+~]).{8,}$/;
    if (!passwordRegex.test(newPassword)) {
        return res.status(400).json({ error: 'Mật khẩu mới phải chứa ít nhất 8 ký tự, 1 chữ hoa và 1 ký tự đặc biệt' });
    }

    try {
        // Verify the token from email
        let decoded;
        try {
            decoded = jwt.verify(token, process.env.JWT_SECRET || 'secret');
        } catch (jwtErr) {
            if (jwtErr.name === 'TokenExpiredError') {
                return res.status(400).json({ error: 'Link đổi mật khẩu đã hết hạn (30 phút). Vui lòng đăng nhập lại để nhận email mới.' });
            }
            return res.status(400).json({ error: 'Link không hợp lệ hoặc đã bị sử dụng.' });
        }

        if (decoded.purpose !== 'email_change_password') {
            return res.status(400).json({ error: 'Token không hợp lệ' });
        }

        const pool = await connectDB();
        const result = await pool.request()
            .input('id', sql.UniqueIdentifier, decoded.id)
            .query('SELECT password_hash, email, username FROM system_users WHERE user_id = @id');

        const user = result.recordset[0];
        if (!user) return res.status(404).json({ error: 'Tài khoản không tồn tại' });

        // Verify current password
        const isMatch = await argon2.verify(user.password_hash, currentPassword);
        if (!isMatch) return res.status(401).json({ error: 'Mật khẩu hiện tại không đúng' });

        // Check new password is different from current
        const isSame = await argon2.verify(user.password_hash, newPassword);
        if (isSame) return res.status(400).json({ error: 'Mật khẩu mới phải khác mật khẩu hiện tại' });

        // Update password
        const newHash = await argon2.hash(newPassword);
        await pool.request()
            .input('ph', sql.NVarChar, newHash)
            .input('id', sql.UniqueIdentifier, decoded.id)
            .query('UPDATE system_users SET password_hash = @ph WHERE user_id = @id');

        // Revoke ALL sessions
        await deviceService.revokeAllSessions(pool, decoded.id);

        // Send email notification
        try {
            let email = '', username = '';
            try { email = decrypt(user.email); } catch (e) { }
            try { username = decrypt(user.username); } catch (e) { }
            const emailLang = req.body.lang || 'vi';
            if (email) await emailService.sendPasswordChangedEmail(email, username, emailLang);
        } catch (emailErr) { console.error('[EmailChangePassword] Email notification error:', emailErr.message); }

        await logAudit(decoded.id, 'CHANGE_PASSWORD_VIA_EMAIL_ALERT', { method: 'security_email', allSessionsRevoked: true });
        console.log(`[EmailChangePassword] ✅ Password changed successfully for user ${decoded.id}`);
        res.json({ success: true, message: 'Đổi mật khẩu thành công! Tất cả phiên đăng nhập đã bị đăng xuất.' });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// Verify email change password token (check if token is still valid)
app.post('/api/auth/email-change-password/verify-token', async (req, res) => {
    const { token } = req.body;
    if (!token) return res.status(400).json({ error: 'Missing token' });

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET || 'secret');
        if (decoded.purpose !== 'email_change_password') {
            return res.status(400).json({ error: 'Invalid token' });
        }

        // Get masked username for display
        const pool = await connectDB();
        const result = await pool.request()
            .input('id', sql.UniqueIdentifier, decoded.id)
            .query('SELECT username FROM system_users WHERE user_id = @id');

        let username = '';
        if (result.recordset[0]) {
            try { username = decrypt(result.recordset[0].username); } catch (e) { }
        }

        // Mask username: show first 2 chars + ***
        const maskedUsername = username ? username.substring(0, 2) + '***' : '***';

        res.json({ valid: true, maskedUsername });
    } catch (err) {
        if (err.name === 'TokenExpiredError') {
            return res.status(400).json({ error: 'Token expired', expired: true });
        }
        res.status(400).json({ error: 'Invalid token' });
    }
});

// --- ADMIN: User Management ---
app.get('/api/admin/users/pending', authenticateToken, authorizeRole(['Admin']), async (req, res) => {
    try {
        const pool = await connectDB();
        const result = await pool.request().query("SELECT user_id, username, full_name, email, phone, role FROM system_users");

        const pendingUsers = result.recordset.map(u => {
            let role = safeDecrypt(u.role) || u.role;
            if (role !== 'Pending') return null;

            let username = safeDecrypt(u.username) || u.username;
            let full_name = safeDecrypt(u.full_name) || u.full_name;
            let email = safeDecrypt(u.email) || u.email;
            let phone = safeDecrypt(u.phone) || u.phone;
            return { user_id: u.user_id, username, full_name, email, phone, role };
        }).filter(u => u !== null);

        res.json(pendingUsers);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.put('/api/admin/users/:id/approve', authenticateToken, authorizeRole(['Admin']), async (req, res) => {
    const { id } = req.params;
    const { role } = req.body;

    if (!role || role === 'Pending') return res.status(400).json({ error: 'Vui lòng chọn quyền truy cập hợp lệ' });

    try {
        const pool = await connectDB();
        const encRole = encrypt(role);

        await pool.request()
            .input('role', sql.NVarChar, encRole)
            .input('id', sql.UniqueIdentifier, id)
            .query("UPDATE system_users SET role = @role WHERE user_id = @id");

        await logAudit(req.user.id, 'APPROVE_USER', { targetUserId: id, newRole: role });
        res.json({ message: 'Đã phê duyệt và cấp quyền thành công!' });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// --- 2FA Setup Routes ---
app.get('/api/auth/2fa/generate', authenticateToken, async (req, res) => {
    try {
        const pool = await connectDB();
        const userRes = await pool.request().input('id', sql.UniqueIdentifier, req.user.id).query("SELECT username, email FROM system_users WHERE user_id = @id");
        if (!userRes.recordset.length) return res.status(404).json({ error: 'User not found' });

        // Decrypt email for the app identifier
        let email = '';
        try { email = decrypt(userRes.recordset[0].email); } catch (e) { email = 'user@securechain.com'; }

        const secretInfo = speakeasy.generateSecret({ name: `SecureChain (${email})` });

        // Return both for the UI to display the QR code and the manual secret text
        res.json({ secret: secretInfo.base32, qrUrl: secretInfo.otpauth_url });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/auth/2fa/verify-setup', authenticateToken, async (req, res) => {
    const { token, secret } = req.body;
    try {
        const serverTime = new Date();
        console.log(`[2FA Verification] Server Time: ${serverTime.toISOString()} (Unix: ${Math.floor(serverTime.getTime() / 1000)})`);
        console.log(`[2FA Verification] Received Token: ${token}, Secret: ${secret}`);
        // Calculate the current expected token for debugging
        const expectedToken = speakeasy.totp({ secret: secret, encoding: 'base32' });
        console.log(`[2FA Verification] Expected Token right now: ${expectedToken}`);

        // window: 8 allows a 4-minute margin of error (pre/post 8*30s) to handle clock skew
        const isValid = speakeasy.totp.verify({ secret: secret, encoding: 'base32', token: token, window: 8 });

        if (!isValid) {
            console.error(`[2FA Verification] Failed. Token '${token}' rejected. Expected '${expectedToken}'. Server epoch: ${Math.floor(serverTime.getTime() / 1000)}`);
            return res.status(400).json({ error: 'Mã xác thực không hợp lệ. Vui lòng thử lại.' });
        }

        const encryptedSecret = encrypt(secret);

        const pool = await connectDB();
        await pool.request()
            .input('secret', sql.NVarChar, encryptedSecret)
            .input('id', sql.UniqueIdentifier, req.user.id)
            .query("UPDATE system_users SET two_fa_secret = @secret, is_two_fa_enabled = 1 WHERE user_id = @id");

        await logAudit(req.user.id, 'ENABLE_2FA', { status: 'Enabled' });
        res.json({ message: 'Xác thực 2 lớp đã được kích hoạt thành công' });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/auth/2fa/disable', authenticateToken, async (req, res) => {
    const { password } = req.body;
    if (!password) return res.status(400).json({ error: 'Vui lòng nhập mật khẩu để xác nhận' });
    try {
        const pool = await connectDB();
        const result = await pool.request()
            .input('id', sql.UniqueIdentifier, req.user.id)
            .query("SELECT password_hash FROM system_users WHERE user_id = @id");

        const isMatch = await argon2.verify(result.recordset[0].password_hash, password);
        if (!isMatch) return res.status(401).json({ error: 'Mật khẩu không đúng' });

        await pool.request()
            .input('id', sql.UniqueIdentifier, req.user.id)
            .query("UPDATE system_users SET two_fa_secret = NULL, is_two_fa_enabled = 0 WHERE user_id = @id");

        await logAudit(req.user.id, 'DISABLE_2FA', { status: 'Disabled' });
        res.json({ message: 'Đã tắt xác thực 2 lớp' });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// --- Email OTP Per-User Enable/Disable ---
app.post('/api/auth/email-otp/enable', authenticateToken, async (req, res) => {
    const { password } = req.body;
    if (!password) return res.status(400).json({ error: 'Vui lòng nhập mật khẩu để xác nhận' });
    try {
        const pool = await connectDB();

        // Kiểm tra SMTP có cấu hình chưa
        const smtpConfigured = !!(process.env.SMTP_EMAIL && process.env.SMTP_PASSWORD
            && process.env.SMTP_EMAIL !== 'your-email@gmail.com'
            && process.env.SMTP_PASSWORD !== 'your-app-password');
        if (!smtpConfigured) {
            return res.status(400).json({ error: 'Không thể bật Email OTP: SMTP chưa được cấu hình. Vui lòng liên hệ Admin.' });
        }

        // Verify password
        const result = await pool.request()
            .input('id', sql.UniqueIdentifier, req.user.id)
            .query("SELECT password_hash, email FROM system_users WHERE user_id = @id");
        if (!result.recordset.length) return res.status(404).json({ error: 'User not found' });

        const isMatch = await argon2.verify(result.recordset[0].password_hash, password);
        if (!isMatch) return res.status(401).json({ error: 'Mật khẩu không đúng' });

        // Check user has email
        let userEmail = '';
        try { userEmail = decrypt(result.recordset[0].email); } catch (e) { }
        if (!userEmail) return res.status(400).json({ error: 'Tài khoản chưa có email. Vui lòng cập nhật email trước.' });

        // Enable
        await pool.request()
            .input('id', sql.UniqueIdentifier, req.user.id)
            .query("UPDATE system_users SET is_email_otp_enabled = 1 WHERE user_id = @id");

        await logAudit(req.user.id, 'ENABLE_EMAIL_OTP', { status: 'Enabled' });
        res.json({ message: 'Đã bật xác thực Email OTP thành công' });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/auth/email-otp/disable', authenticateToken, async (req, res) => {
    const { password } = req.body;
    if (!password) return res.status(400).json({ error: 'Vui lòng nhập mật khẩu để xác nhận' });
    try {
        const pool = await connectDB();

        const result = await pool.request()
            .input('id', sql.UniqueIdentifier, req.user.id)
            .query("SELECT password_hash FROM system_users WHERE user_id = @id");

        const isMatch = await argon2.verify(result.recordset[0].password_hash, password);
        if (!isMatch) return res.status(401).json({ error: 'Mật khẩu không đúng' });

        await pool.request()
            .input('id', sql.UniqueIdentifier, req.user.id)
            .query("UPDATE system_users SET is_email_otp_enabled = 0 WHERE user_id = @id");

        await logAudit(req.user.id, 'DISABLE_EMAIL_OTP', { status: 'Disabled' });
        res.json({ message: 'Đã tắt xác thực Email OTP' });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// 2. Get All Items (Master Data)
app.get('/api/items', authenticateToken, async (req, res) => {
    try {
        const pool = await connectDB();
        const result = await pool.request().query("SELECT * FROM supply_items");

        const decryptedItems = result.recordset.map(item => {
            let dName = safeDecrypt(item.item_name) || item.item_name;
            let dCat = safeDecrypt(item.category) || item.category;
            let dQty = safeDecryptInt(item.quantity_in_stock);
            let dCost = safeDecrypt(item.unit_cost) || item.unit_cost;

            return {
                ...item,
                item_name: dName,
                category: dCat,
                quantity_in_stock: dQty === -1 ? TAMPERED_DATA : (isNaN(dQty) ? 0 : dQty),
                unit_cost: dCost
            };
        });

        res.json(decryptedItems);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 3. Add Supply Item (Master Data + Auto Stock In)
app.post('/api/items', authenticateToken, authorizeRole(['Admin', 'Manager', 'Warehouse']), async (req, res) => {
    const { itemName, unitCost, category, quantity, warehouseId, binLocation } = req.body;

    let transaction;
    try {
        const pool = await connectDB();
        transaction = new sql.Transaction(pool);
        await transaction.begin();

        const encryptedCost = encrypt(unitCost.toString());
        const encryptedName = encrypt(itemName);
        const encryptedCat = encrypt(category);
        const encryptedQtyVal = encrypt(quantity.toString());

        // 1. Create Supply Item
        const itemResult = await transaction.request()
            .input('name', sql.NVarChar, encryptedName)
            .input('cost', sql.NVarChar, encryptedCost)
            .input('category', sql.NVarChar, encryptedCat)
            .input('qty', sql.NVarChar, encryptedQtyVal)
            .query(`INSERT INTO supply_items (item_name, unit_cost, category, quantity_in_stock) 
                    OUTPUT INSERTED.item_id
                    VALUES (@name, @cost, @category, @qty)`);

        const newItemId = itemResult.recordset[0].item_id;

        // 2. Add to Warehouse Inventory (If warehouse selected)
        if (warehouseId) {
            const encryptedQty = encrypt(quantity.toString());
            const encryptedBin = encrypt(binLocation || 'Shelf 1'); // Default to Shelf 1

            await transaction.request()
                .input('wId', sql.UniqueIdentifier, warehouseId)
                .input('iId', sql.UniqueIdentifier, newItemId)
                .input('qty', sql.NVarChar, encryptedQty)
                .input('bin', sql.NVarChar, encryptedBin)
                .query(`INSERT INTO inventory_stock (warehouse_id, item_id, quantity, bin_location) 
                        VALUES (@wId, @iId, @qty, @bin)`);
        }

        await transaction.commit();
        await syncItemTotalStock(newItemId);
        await logAudit(req.user.id, 'ADD_ITEM_WITH_STOCK', { itemName, warehouseId, quantity: 'ENCRYPTED' });
        res.status(201).json({ message: 'Item added and stocked successfully' });
    } catch (err) {
        console.error("Transaction Error (Add Item):", err);
        if (transaction) {
            try {
                await transaction.rollback();
            } catch (rollbackErr) {
                console.error("Rollback Error:", rollbackErr.message);
            }
        }
        res.status(500).json({ error: err.message });
    }
});

// 4. Update Item (Master Data)
app.put('/api/items/:id', authenticateToken, authorizeRole(['Admin', 'Manager', 'Warehouse']), async (req, res) => {
    const { itemName, unitCost, category, warehouseId, binLocation, quantity } = req.body;
    const { id } = req.params;

    try {
        const pool = await connectDB();
        const transaction = new sql.Transaction(pool);
        await transaction.begin();

        const encryptedCost = encrypt(unitCost.toString());
        const encryptedName = encrypt(itemName);
        const encryptedCat = encrypt(category);

        // 1. Update Item Details
        await transaction.request()
            .input('id', sql.UniqueIdentifier, id)
            .input('name', sql.NVarChar, encryptedName)
            .input('cost', sql.NVarChar, encryptedCost)
            .input('category', sql.NVarChar, encryptedCat)
            .query("UPDATE supply_items SET item_name=@name, unit_cost=@cost, category=@category WHERE item_id=@id");

        // 2. Merge or Add New Stock (if provided)
        if (warehouseId && parseInt(quantity) > 0) {
            const targetBinLoc = binLocation || 'Shelf 1';

            // Fetch current stock list to find matching bin
            const stockList = await transaction.request()
                .input('wId', sql.UniqueIdentifier, warehouseId)
                .input('iId', sql.UniqueIdentifier, id)
                .query("SELECT stock_id, quantity, bin_location FROM inventory_stock WHERE warehouse_id = @wId AND item_id = @iId");

            let targetStock = null;
            for (const stock of stockList.recordset) {
                let decryptedBin = '';
                try { decryptedBin = decrypt(stock.bin_location); } catch (e) { decryptedBin = stock.bin_location; }
                if (decryptedBin === targetBinLoc) {
                    targetStock = stock;
                    break;
                }
            }

            if (targetStock) {
                // Update existing record
                let currentQty = 0;
                try { currentQty = parseInt(decrypt(targetStock.quantity)); } catch (e) { currentQty = parseInt(targetStock.quantity) || 0; }

                const newTotal = currentQty + parseInt(quantity);
                await transaction.request()
                    .input('qty', sql.NVarChar, encrypt(newTotal.toString()))
                    .input('sId', sql.UniqueIdentifier, targetStock.stock_id)
                    .query("UPDATE inventory_stock SET quantity = @qty WHERE stock_id = @sId");
            } else {
                // Create new record
                const encryptedQty = encrypt(quantity.toString());
                const encryptedBin = encrypt(targetBinLoc);

                await transaction.request()
                    .input('itemId', sql.UniqueIdentifier, id)
                    .input('whId', sql.UniqueIdentifier, warehouseId)
                    .input('qty', sql.NVarChar, encryptedQty)
                    .input('bin', sql.NVarChar, encryptedBin)
                    .query(`INSERT INTO inventory_stock (item_id, warehouse_id, quantity, bin_location)
                            VALUES (@itemId, @whId, @qty, @bin)`);
            }

            // Log Stock Addition
            await logAudit(req.user.id, 'ADD_STOCK', {
                itemId: id,
                itemName,
                warehouseId,
                quantity,
                bin: targetBinLoc
            });
        }

        await transaction.commit();
        await syncItemTotalStock(id);

        // Log Item Update
        await logAudit(req.user.id, 'UPDATE_ITEM', { itemId: id, itemName });
        res.json({ message: 'Item updated successfully' });
    } catch (err) {
        if (transaction._formed) await transaction.rollback();
        res.status(500).json({ error: err.message });
    }
});

// 5. Delete Item
app.delete('/api/items/:id', authenticateToken, authorizeRole(['Admin', 'Manager']), async (req, res) => {
    const { id } = req.params;
    try {
        const pool = await connectDB();
        await pool.request().input('id', sql.UniqueIdentifier, id).query("DELETE FROM supply_items WHERE item_id = @id");
        await logAudit(req.user.id, 'DELETE_ITEM', { itemId: id });
        res.json({ message: 'Item deleted' });
    } catch (err) {
        if (err.number === 547) {
            return res.status(400).json({ error: 'Không thể xóa sản phẩm này vì đã có giao dịch (Vận đơn hoặc Nhập hàng) liên quan.' });
        }
        res.status(500).json({ error: err.message });
    }
});

// 5.1 Get Item Inventory Details
app.get('/api/items/:id/inventory', authenticateToken, async (req, res) => {
    const { id } = req.params;
    try {
        const pool = await connectDB();
        const result = await pool.request()
            .input('id', sql.UniqueIdentifier, id)
            .query(`
                SELECT s.stock_id, w.name as warehouse_name, s.bin_location, s.quantity 
                FROM inventory_stock s
                JOIN warehouses w ON s.warehouse_id = w.warehouse_id
                WHERE s.item_id = @id
            `);

        const decryptedStock = result.recordset.map(stock => {
            let qty = safeDecryptInt(stock.quantity);
            let bin = safeDecrypt(stock.bin_location) || '';
            let wName = safeDecrypt(stock.warehouse_name) || stock.warehouse_name;

            return {
                ...stock,
                quantity: qty === -1 ? TAMPERED_DATA : (isNaN(qty) ? 0 : qty),
                bin_location: bin,
                warehouse_name: wName
            };
        });

        res.json(decryptedStock);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// --- WMS APIs ---

// 6. Get All Warehouses
app.get('/api/warehouses', authenticateToken, async (req, res) => {
    try {
        const pool = await connectDB();
        const result = await pool.request().query("SELECT * FROM warehouses");
        const decryptedWarehouses = result.recordset.map(w => {
            let name = safeDecrypt(w.name) || w.name;
            let location = safeDecrypt(w.location) || w.location;
            let type = safeDecrypt(w.type) || w.type;
            let total_shelves = safeDecrypt(w.total_shelves) || w.total_shelves;
            return { ...w, name, location, type, total_shelves };
        });
        res.json(decryptedWarehouses);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// 6.1 Create Warehouse (Updated: No Capacity, has Total Shelves)
app.post('/api/warehouses', authenticateToken, authorizeRole(['Admin', 'Manager', 'Warehouse']), async (req, res) => {
    const { name, location, type, total_shelves } = req.body;
    try {
        const pool = await connectDB();
        await pool.request()
            .input('n', sql.NVarChar, encrypt(name))
            .input('l', sql.NVarChar, encrypt(location))
            .input('t', sql.NVarChar, encrypt(type))
            .input('ts', sql.NVarChar, encrypt((total_shelves || 50).toString().trim()))
            .query("INSERT INTO warehouses (name, location, type, total_shelves) VALUES (@n, @l, @t, @ts)");

        await logAudit(req.user.id, 'CREATE_WAREHOUSE', { name, location });
        res.status(201).json({ message: 'Warehouse created successfully' });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// 6.2 Delete Warehouse
app.delete('/api/warehouses/:id', authenticateToken, authorizeRole(['Admin', 'Manager']), async (req, res) => {
    const { id } = req.params;
    console.log(`[DELETE_WAREHOUSE] Attempting to delete warehouse: ${id} by user: ${req.user.id}`);
    try {
        const pool = await connectDB();
        // Check if warehouse has items (foreign key constraint usually handles this, but we can be explicit)
        const checkItems = await pool.request().input('id', sql.UniqueIdentifier, id).query("SELECT COUNT(*) as count FROM inventory_stock WHERE warehouse_id = @id");
        if (checkItems.recordset[0].count > 0) {
            return res.status(400).json({ error: 'Không thể xóa kho đang chứa hàng hóa. Vui lòng chuyển hoặc xóa hết hàng trước.' });
        }

        await pool.request().input('id', sql.UniqueIdentifier, id).query("DELETE FROM warehouses WHERE warehouse_id = @id");
        await logAudit(req.user.id, 'DELETE_WAREHOUSE', { warehouseId: id });
        res.json({ message: 'Warehouse deleted successfully' });
    } catch (err) {
        if (err.number === 547) {
            return res.status(400).json({ error: 'Không thể xóa kho này vì có dữ liệu liên quan (Vận đơn, Tồn kho).' });
        }
        res.status(500).json({ error: err.message });
    }
});

// 7. Get Inventory Inside Warehouse (Specific Box)
app.get('/api/warehouses/:id/inventory', authenticateToken, async (req, res) => {
    const { id } = req.params;
    try {
        const pool = await connectDB();
        const result = await pool.request()
            .input('id', sql.UniqueIdentifier, id)
            .query(`
                SELECT s.stock_id, s.quantity, s.bin_location, i.item_name, i.category, i.unit_cost 
                FROM inventory_stock s
                JOIN supply_items i ON s.item_id = i.item_id
                WHERE s.warehouse_id = @id
            `);

        // Decrypt sensitive inventory data
        const decryptedInventory = result.recordset.map(item => {
            let decryptedQty = safeDecryptInt(item.quantity);
            let decryptedBin = safeDecrypt(item.bin_location) || '';
            let decryptedName = safeDecrypt(item.item_name) || item.item_name;
            let decryptedCat = safeDecrypt(item.category) || item.category;
            let decryptedCost = safeDecrypt(item.unit_cost);

            return {
                ...item,
                item_name: decryptedName,
                category: decryptedCat,
                quantity: decryptedQty === -1 ? TAMPERED_DATA : (isNaN(decryptedQty) ? 0 : decryptedQty),
                bin_location: decryptedBin,
                unit_cost: decryptedCost
            };
        });

        res.json(decryptedInventory);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// 8. Add/Update Stock (Secure Encrypted Update)
app.post('/api/inventory/add', authenticateToken, authorizeRole(['Admin', 'Manager', 'Warehouse']), async (req, res) => {
    const { warehouseId, itemId, quantity, binLocation } = req.body;
    try {
        const pool = await connectDB();

        // Fetch all stock to find bin match
        const stockList = await pool.request()
            .input('wId', sql.UniqueIdentifier, warehouseId)
            .input('iId', sql.UniqueIdentifier, itemId)
            .query("SELECT stock_id, quantity, bin_location FROM inventory_stock WHERE warehouse_id = @wId AND item_id = @iId");

        let targetStock = null;
        const targetBinLoc = binLocation || 'Shelf 1';

        for (const stock of stockList.recordset) {
            let decryptedBin = '';
            try { decryptedBin = decrypt(stock.bin_location); } catch (e) { decryptedBin = stock.bin_location; }
            if (decryptedBin === targetBinLoc) {
                targetStock = stock;
                break;
            }
        }

        if (targetStock) {
            // Update
            let currentQty = 0;
            try { currentQty = parseInt(decrypt(targetStock.quantity)); } catch (e) { currentQty = parseInt(targetStock.quantity) || 0; }

            const newTotal = currentQty + parseInt(quantity);
            const encryptedTotal = encrypt(newTotal.toString());

            await pool.request()
                .input('qty', sql.NVarChar, encryptedTotal)
                .input('sId', sql.UniqueIdentifier, targetStock.stock_id)
                .query("UPDATE inventory_stock SET quantity = @qty WHERE stock_id = @sId");
        } else {
            // Insert
            const encryptedQty = encrypt(quantity.toString());
            const encryptedBin = encrypt(targetBinLoc);

            await pool.request()
                .input('wId', sql.UniqueIdentifier, warehouseId)
                .input('iId', sql.UniqueIdentifier, itemId)
                .input('qty', sql.NVarChar, encryptedQty)
                .input('bin', sql.NVarChar, encryptedBin)
                .query("INSERT INTO inventory_stock (warehouse_id, item_id, quantity, bin_location) VALUES (@wId, @iId, @qty, @bin)");
        }

        await syncItemTotalStock(itemId);

        res.json({ message: 'Stock updated successfully (Encrypted)' });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// 8.1 Update Specific Stock Record (Edit Quantity/Bin)
app.put('/api/inventory/:id', authenticateToken, authorizeRole(['Admin', 'Manager', 'Warehouse']), async (req, res) => {
    const { id } = req.params;
    const { quantity, binLocation } = req.body;
    try {
        const pool = await connectDB();

        // Fetch itemId for sync
        const stockInfo = await pool.request().input('id', sql.UniqueIdentifier, id).query("SELECT item_id FROM inventory_stock WHERE stock_id = @id");
        const itemId = stockInfo.recordset[0]?.item_id;

        const encryptedQty = encrypt(quantity.toString());
        const encryptedBin = encrypt(binLocation);

        await pool.request()
            .input('id', sql.UniqueIdentifier, id)
            .input('qty', sql.NVarChar, encryptedQty)
            .input('bin', sql.NVarChar, encryptedBin)
            .query("UPDATE inventory_stock SET quantity = @qty, bin_location = @bin WHERE stock_id = @id");

        if (itemId) await syncItemTotalStock(itemId);

        await logAudit(req.user.id, 'UPDATE_STOCK', { stockId: id, quantity, bin: binLocation });
        res.json({ message: 'Stock updated successfully' });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// 8.2 Delete Specific Stock Record
app.delete('/api/inventory/:id', authenticateToken, authorizeRole(['Admin', 'Manager']), async (req, res) => {
    const { id } = req.params;
    try {
        const pool = await connectDB();

        // Get details for log before delete
        const stock = await pool.request().input('id', sql.UniqueIdentifier, id).query("SELECT * FROM inventory_stock WHERE stock_id = @id");
        if (stock.recordset.length > 0) {
            const itemId = stock.recordset[0].item_id;
            await logAudit(req.user.id, 'DELETE_STOCK', { stockId: id, details: 'Deleted stock record' });
            await pool.request().input('id', sql.UniqueIdentifier, id).query("DELETE FROM inventory_stock WHERE stock_id = @id");
            await syncItemTotalStock(itemId);
            res.json({ message: 'Stock record deleted' });
            return;
        }

        await pool.request().input('id', sql.UniqueIdentifier, id).query("DELETE FROM inventory_stock WHERE stock_id = @id");
        res.json({ message: 'Stock record deleted' });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// --- SHIPMENT APIs ---
// 12. Get All Shipments
app.get('/api/shipments', authenticateToken, async (req, res) => {
    try {
        const pool = await connectDB();
        const result = await pool.request().query(`
            SELECT s.*, 
                   p2.partner_name as logistics_name 
            FROM shipments s
            LEFT JOIN partners p2 ON s.logistics_id = p2.partner_id
        `);

        // Decrypt Partner Names & Shipment Details
        const decryptedShipments = result.recordset.map(s => {
            let tracking = safeDecrypt(s.tracking_number) || s.tracking_number;
            let origin = safeDecrypt(s.origin_address) || s.origin_address;
            let dest = safeDecrypt(s.destination_address) || s.destination_address;
            let val = safeDecrypt(s.total_value);
            if (!val || val === "NaN") val = "0";
            let status = safeDecrypt(s.status) || s.status;
            let logName = safeDecrypt(s.logistics_name) || s.logistics_name;

            // Handle shipment_date (might be DATETIME or encrypted NVARCHAR)
            let shipDate = s.shipment_date;
            if (s.shipment_date) {
                if (s.shipment_date instanceof Date) {
                    shipDate = s.shipment_date.toISOString();
                } else {
                    const decDate = safeDecrypt(s.shipment_date);
                    if (decDate && decDate !== TAMPERED_DATA) {
                        const parsed = new Date(decDate);
                        shipDate = !isNaN(parsed) ? parsed.toISOString() : TAMPERED_DATA;
                    } else if (decDate === TAMPERED_DATA) {
                        shipDate = TAMPERED_DATA;
                    }
                }
            }

            return {
                ...s,
                tracking_number: tracking,
                origin_address: origin,
                destination_address: dest,
                total_value: val,
                status: status,
                logistics_name: logName || 'Unknown Logistics',
                shipment_date: shipDate
            };
        });

        // Sort in-memory by decrypted shipment_date DESC
        decryptedShipments.sort((a, b) => new Date(b.shipment_date) - new Date(a.shipment_date));

        res.json(decryptedShipments);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/shipments/:id/items', authenticateToken, async (req, res) => {
    try {
        const pool = await connectDB();
        const result = await pool.request()
            .input('id', sql.UniqueIdentifier, req.params.id)
            .query(`
                SELECT d.*, i.item_name, i.category, w.name as warehouse_name
                FROM shipment_details d
                JOIN supply_items i ON d.item_id = i.item_id
                LEFT JOIN inventory_stock s ON d.stock_id = s.stock_id
                LEFT JOIN warehouses w ON s.warehouse_id = w.warehouse_id
                WHERE d.shipment_id = @id
            `);

        const decryptedItems = result.recordset.map(item => {
            let name = safeDecrypt(item.item_name) || item.item_name;
            let cat = safeDecrypt(item.category) || item.category;
            let wName = safeDecrypt(item.warehouse_name) || item.warehouse_name;
            let qty = safeDecrypt(item.quantity) || item.quantity;
            let sub = safeDecrypt(item.subtotal) || item.subtotal;
            let batch = safeDecrypt(item.batch_number) || item.batch_number;

            return {
                ...item,
                item_name: name,
                category: cat,
                warehouse_name: wName || 'Unknown Warehouse',
                quantity: qty,
                subtotal: sub,
                batch_number: batch
            };
        });

        res.json(decryptedItems);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// 12.5 Public Tracking Endpoint
app.get('/api/tracking/:trackingNumber', async (req, res) => {
    try {
        const pool = await connectDB();
        const trackingQuery = req.params.trackingNumber.trim();

        // Cần truy vấn tất cả và verify qua decryption (Mô hình Envelope: IV random)
        const result = await pool.request().query(`
            SELECT s.*, 
                   p2.partner_name as logistics_name 
            FROM shipments s
            LEFT JOIN partners p2 ON s.logistics_id = p2.partner_id
        `);

        let foundShipment = null;
        for (const s of result.recordset) {
            let tracking = safeDecrypt(s.tracking_number) || s.tracking_number;
            if (tracking === trackingQuery) {
                let logName = safeDecrypt(s.logistics_name) || s.logistics_name;
                let origin = safeDecrypt(s.origin_address) || s.origin_address;
                let dest = safeDecrypt(s.destination_address) || s.destination_address;
                let status = safeDecrypt(s.status) || s.status;

                foundShipment = {
                    ...s,
                    logistics_name: logName || 'Unknown Logistics',
                    tracking_number: tracking,
                    origin_address: origin,
                    destination_address: dest,
                    status: status
                };
                break;
            }
        }

        if (foundShipment) {
            res.json(foundShipment);
        } else {
            res.status(404).json({ error: 'Tracking number not found' });
        }
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// 13. Create Shipment
// 13. Create Shipment
app.post('/api/shipments', authenticateToken, authorizeRole(['Admin', 'Manager', 'Staff']), async (req, res) => {
    const { trackingNumber, supplierId, logisticsId, originAddress, destinationAddress, totalValue, items } = req.body;

    let transaction;
    try {
        const pool = await connectDB();
        transaction = new sql.Transaction(pool);
        await transaction.begin();

        const encTracking = encrypt(trackingNumber);
        const encOrigin = encrypt(originAddress);
        const encDest = encrypt(destinationAddress);
        const encTotalVal = encrypt(totalValue.toString());

        // 2. Insert Shipment (shipment_date encrypted) - Status starts as 'Pending Approval'
        const shipRes = await transaction.request()
            .input('track', sql.NVarChar, encTracking)
            .input('log', sql.UniqueIdentifier, logisticsId)
            .input('date', sql.NVarChar, encrypt(new Date().toISOString()))
            .input('origin', sql.NVarChar, encOrigin)
            .input('dest', sql.NVarChar, encDest)
            .input('val', sql.NVarChar, encTotalVal)
            .input('status', sql.NVarChar, encrypt('Pending Approval'))
            .input('createdBy', sql.UniqueIdentifier, req.user.id)
            .query(`
                INSERT INTO shipments (shipment_id, tracking_number, logistics_id, shipment_date, origin_address, destination_address, total_value, status, created_by)
                OUTPUT INSERTED.shipment_id
                VALUES (NEWID(), @track, @log, @date, @origin, @dest, @val, @status, @createdBy)
            `);

        const shipmentId = shipRes.recordset[0].shipment_id;

        // 3. Process Items
        if (items && Array.isArray(items)) {
            for (const item of items) {
                // Fetch current stock to validate and deduct
                const stockRes = await transaction.request()
                    .input('sId', sql.UniqueIdentifier, item.stockId)
                    .query("SELECT * FROM inventory_stock WHERE stock_id = @sId");

                const stockRecord = stockRes.recordset[0];
                if (!stockRecord) throw new Error(`Kho không tìm thấy lô hàng (ID: ${item.stockId})`);

                let currentQty = 0;
                try { currentQty = parseInt(decrypt(stockRecord.quantity)); } catch (e) { currentQty = parseInt(stockRecord.quantity); }

                const reqQty = parseInt(item.quantity);
                if (currentQty < reqQty) {
                    throw new Error(`Kho không đủ hàng (ID: ${item.stockId}). Tồn: ${currentQty}, Yêu cầu: ${reqQty}`);
                }

                const newQty = currentQty - reqQty;
                const encNewQty = encrypt(newQty.toString());

                await transaction.request()
                    .input('qty', sql.NVarChar, encNewQty)
                    .input('sId', sql.UniqueIdentifier, item.stockId)
                    .query("UPDATE inventory_stock SET quantity = @qty WHERE stock_id = @sId");

                // Insert Detail (with subtotal and batch)
                const sub = (item.unitValue || 0) * reqQty;
                const batchNo = 'BATCH-' + new Date().toISOString().slice(0, 10).replace(/-/g, '');

                await transaction.request()
                    .input('shipId', sql.UniqueIdentifier, shipmentId)
                    .input('itemId', sql.UniqueIdentifier, item.itemId)
                    .input('stockId', item.stockId ? sql.UniqueIdentifier : sql.UniqueIdentifier, item.stockId || null)
                    .input('qty', sql.NVarChar, encrypt(reqQty.toString()))
                    .input('sub', sql.NVarChar, encrypt(sub.toString()))
                    .input('batch', sql.NVarChar, encrypt(batchNo))
                    .query("INSERT INTO shipment_details (detail_id, shipment_id, item_id, stock_id, quantity, subtotal, batch_number) VALUES (NEWID(), @shipId, @itemId, @stockId, @qty, @sub, @batch)");
            }
        }

        await transaction.commit();

        // Sync Totals
        if (items && Array.isArray(items)) {
            const uniqueItemIds = [...new Set(items.map(i => i.itemId))];
            for (const iId of uniqueItemIds) await syncItemTotalStock(iId);
        }

        await logAudit(req.user.id, 'CREATE_SHIPMENT', { trackingNumber, itemCount: items?.length });

        // Create notification for Warehouse role
        try {
            await pool.request()
                .input('role', sql.NVarChar, 'Warehouse')
                .input('title', sql.NVarChar, 'Yêu cầu duyệt vận đơn mới')
                .input('msg', sql.NVarChar, `Vận đơn ${trackingNumber} vừa được tạo bởi ${req.user.username}. Vui lòng xem xét và phê duyệt.`)
                .input('type', sql.NVarChar, 'shipment_approval')
                .input('relId', sql.NVarChar, shipmentId)
                .query("INSERT INTO notifications (target_role, title, message, type, related_id) VALUES (@role, @title, @msg, @type, @relId)");
        } catch (notifErr) { console.error('Notification error:', notifErr.message); }

        res.status(201).json({ message: 'Shipment created successfully', shipmentId });

    } catch (err) {
        if (transaction) {
            try { await transaction.rollback(); } catch (e) { /* Already aborted */ }
        }
        console.error("Create Shipment Error:", err);
        res.status(500).json({ error: err.message });
    }
});

// 14. Update Shipment Status
app.put('/api/shipments/:id/status', authenticateToken, authorizeRole(['Admin', 'Manager', 'Staff', 'Warehouse']), async (req, res) => {
    const { status } = req.body;
    try {
        const pool = await connectDB();

        // Validate: Rejected shipments cannot be updated
        const checkRes = await pool.request().input('id', sql.UniqueIdentifier, req.params.id)
            .query("SELECT status FROM shipments WHERE shipment_id = @id");
        if (checkRes.recordset.length === 0) return res.status(404).json({ error: 'Shipment not found' });
        let currentStatus = checkRes.recordset[0].status;
        try { currentStatus = decrypt(currentStatus) || currentStatus; } catch (e) { }
        if (currentStatus === 'Rejected' || currentStatus === 'Cancelled') {
            return res.status(400).json({ error: 'Không thể cập nhật trạng thái vận đơn đã bị từ chối hoặc hủy.' });
        }

        await pool.request()
            .input('status', sql.NVarChar, encrypt(status))
            .input('id', sql.UniqueIdentifier, req.params.id)
            .query("UPDATE shipments SET status = @status WHERE shipment_id = @id");

        // Create notification for the shipment creator when status changes
        try {
            const shipRes = await pool.request().input('id', sql.UniqueIdentifier, req.params.id)
                .query("SELECT created_by, tracking_number FROM shipments WHERE shipment_id = @id");
            const ship = shipRes.recordset[0];
            if (ship && ship.created_by) {
                let trackNum = ship.tracking_number;
                try { trackNum = decrypt(ship.tracking_number) || trackNum; } catch (e) { }
                await pool.request()
                    .input('userId', sql.UniqueIdentifier, ship.created_by)
                    .input('title', sql.NVarChar, `Vận đơn ${status}`)
                    .input('msg', sql.NVarChar, `Vận đơn ${trackNum} đã được cập nhật trạng thái: ${status}`)
                    .input('type', sql.NVarChar, 'status_update')
                    .input('relId', sql.NVarChar, req.params.id)
                    .query("INSERT INTO notifications (user_id, title, message, type, related_id) VALUES (@userId, @title, @msg, @type, @relId)");
            }
        } catch (notifErr) { console.error('Notification error:', notifErr.message); }

        await logAudit(req.user.id, 'UPDATE_SHIPMENT_STATUS', { shipmentId: req.params.id, status });
        res.json({ message: 'Status updated' });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// 14.1 Approve/Reject Shipment (Warehouse Manager)
app.put('/api/shipments/:id/approve', authenticateToken, authorizeRole(['Admin', 'Manager', 'Warehouse']), async (req, res) => {
    const { action, reason } = req.body; // action: 'approve' or 'reject'
    try {
        const pool = await connectDB();

        // Verify shipment is in 'Pending Approval' status
        const checkRes = await pool.request().input('id', sql.UniqueIdentifier, req.params.id)
            .query("SELECT status, tracking_number, created_by FROM shipments WHERE shipment_id = @id");
        if (checkRes.recordset.length === 0) return res.status(404).json({ error: 'Shipment not found' });

        let decodedStatus = checkRes.recordset[0].status;
        try { decodedStatus = decrypt(decodedStatus) || decodedStatus; } catch (e) { }
        if (decodedStatus !== 'Pending Approval') {
            return res.status(400).json({ error: 'Chỉ có thể duyệt/từ chối vận đơn ở trạng thái Chờ duyệt.' });
        }

        let trackNum = checkRes.recordset[0].tracking_number;
        try { trackNum = decrypt(trackNum) || trackNum; } catch (e) { }
        const createdBy = checkRes.recordset[0].created_by;

        const newStatus = action === 'approve' ? 'Approved' : 'Rejected';
        await pool.request()
            .input('status', sql.NVarChar, encrypt(newStatus))
            .input('id', sql.UniqueIdentifier, req.params.id)
            .query("UPDATE shipments SET status = @status WHERE shipment_id = @id");

        // Notify the creator
        if (createdBy) {
            const notifTitle = action === 'approve' ? 'Vận đơn đã được duyệt ✅' : 'Vận đơn bị từ chối ❌';
            const notifMsg = action === 'approve'
                ? `Vận đơn ${trackNum} đã được ${req.user.username} phê duyệt thành công.`
                : `Vận đơn ${trackNum} đã bị ${req.user.username} từ chối. Lý do: ${reason || 'Không có'}`;
            try {
                await pool.request()
                    .input('userId', sql.UniqueIdentifier, createdBy)
                    .input('title', sql.NVarChar, notifTitle)
                    .input('msg', sql.NVarChar, notifMsg)
                    .input('type', sql.NVarChar, action === 'approve' ? 'approved' : 'rejected')
                    .input('relId', sql.NVarChar, req.params.id)
                    .query("INSERT INTO notifications (user_id, title, message, type, related_id) VALUES (@userId, @title, @msg, @type, @relId)");
            } catch (notifErr) { console.error('Notification error:', notifErr.message); }
        }

        await logAudit(req.user.id, action === 'approve' ? 'APPROVE_SHIPMENT' : 'REJECT_SHIPMENT', {
            shipmentId: req.params.id, trackingNumber: trackNum, reason: reason || ''
        });
        res.json({ message: `Vận đơn đã ${action === 'approve' ? 'được duyệt' : 'bị từ chối'} thành công.` });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// 14.2 Confirm Export from Warehouse (Warehouse Manager → In Transit)
app.put('/api/shipments/:id/export', authenticateToken, authorizeRole(['Admin', 'Manager', 'Warehouse']), async (req, res) => {
    try {
        const pool = await connectDB();

        const checkRes = await pool.request().input('id', sql.UniqueIdentifier, req.params.id)
            .query("SELECT status, tracking_number, created_by FROM shipments WHERE shipment_id = @id");
        if (checkRes.recordset.length === 0) return res.status(404).json({ error: 'Shipment not found' });

        let decodedStatus = checkRes.recordset[0].status;
        try { decodedStatus = decrypt(decodedStatus) || decodedStatus; } catch (e) { }
        if (decodedStatus !== 'Approved') {
            return res.status(400).json({ error: 'Chỉ có thể xuất kho vận đơn ở trạng thái Đã duyệt.' });
        }

        let trackNum = checkRes.recordset[0].tracking_number;
        try { trackNum = decrypt(trackNum) || trackNum; } catch (e) { }
        const createdBy = checkRes.recordset[0].created_by;

        await pool.request()
            .input('status', sql.NVarChar, encrypt('In Transit'))
            .input('id', sql.UniqueIdentifier, req.params.id)
            .query("UPDATE shipments SET status = @status WHERE shipment_id = @id");

        // Notify creator
        if (createdBy) {
            try {
                await pool.request()
                    .input('userId', sql.UniqueIdentifier, createdBy)
                    .input('title', sql.NVarChar, 'Hàng đã xuất kho 🚛')
                    .input('msg', sql.NVarChar, `Vận đơn ${trackNum} đã được xuất kho và đang vận chuyển.`)
                    .input('type', sql.NVarChar, 'exported')
                    .input('relId', sql.NVarChar, req.params.id)
                    .query("INSERT INTO notifications (user_id, title, message, type, related_id) VALUES (@userId, @title, @msg, @type, @relId)");
            } catch (notifErr) { console.error('Notification error:', notifErr.message); }
        }

        await logAudit(req.user.id, 'EXPORT_SHIPMENT', { shipmentId: req.params.id, trackingNumber: trackNum });
        res.json({ message: 'Vận đơn đã xuất kho thành công. Trạng thái: In Transit' });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.put('/api/shipments/:id', authenticateToken, authorizeRole(['Admin', 'Manager', 'Staff']), async (req, res) => {
    const { logisticsId, originAddress, destinationAddress, totalValue, items } = req.body;
    let transaction;
    try {
        const pool = await connectDB();

        // Security check: Only allow if pending approval
        const checkRes = await pool.request().input('id', sql.UniqueIdentifier, req.params.id).query("SELECT * FROM shipments WHERE shipment_id = @id");
        if (checkRes.recordset.length === 0) return res.status(404).json({ error: 'Shipment not found' });
        const oldShipment = checkRes.recordset[0];
        let decodedStatus = oldShipment.status;
        try { decodedStatus = decrypt(decodedStatus) || decodedStatus; } catch (e) { }
        if (decodedStatus !== 'Pending Approval') {
            return res.status(400).json({ error: 'Không thể sửa đơn hàng đã xử lý (Không còn ở trạng thái Chờ duyệt).' });
        }

        // Decrypt old values for change comparison
        let oldOrigin = oldShipment.origin_address;
        let oldDest = oldShipment.destination_address;
        let oldTotalVal = oldShipment.total_value;
        let oldLogisticsId = oldShipment.logistics_id;
        try { oldOrigin = decrypt(oldShipment.origin_address) || oldOrigin; } catch (e) { }
        try { oldDest = decrypt(oldShipment.destination_address) || oldDest; } catch (e) { }
        try { oldTotalVal = decrypt(oldShipment.total_value) || oldTotalVal; } catch (e) { }

        transaction = new sql.Transaction(pool);
        await transaction.begin();

        // 1. REVERT OLD STOCK
        const oldItemsRes = await transaction.request()
            .input('shipId', sql.UniqueIdentifier, req.params.id)
            .query("SELECT * FROM shipment_details WHERE shipment_id = @shipId");

        for (const oldItem of oldItemsRes.recordset) {
            if (oldItem.stock_id) {
                const stockRes = await transaction.request()
                    .input('sId', sql.UniqueIdentifier, oldItem.stock_id)
                    .query("SELECT quantity FROM inventory_stock WHERE stock_id = @sId");

                if (stockRes.recordset.length > 0) {
                    let currentQty = 0;
                    try { currentQty = parseInt(decrypt(stockRes.recordset[0].quantity)); } catch (e) { currentQty = parseInt(stockRes.recordset[0].quantity); }

                    let oldQty = 0;
                    try { oldQty = parseInt(decrypt(oldItem.quantity)); } catch (e) { oldQty = parseInt(oldItem.quantity); }

                    const restoredQty = currentQty + oldQty;
                    await transaction.request()
                        .input('qty', sql.NVarChar, encrypt(restoredQty.toString()))
                        .input('sId', sql.UniqueIdentifier, oldItem.stock_id)
                        .query("UPDATE inventory_stock SET quantity = @qty WHERE stock_id = @sId");
                }
            }
        }

        // 2. DELETE OLD DETAILS
        await transaction.request()
            .input('shipId', sql.UniqueIdentifier, req.params.id)
            .query("DELETE FROM shipment_details WHERE shipment_id = @shipId");

        // 3. UPDATE SHIPMENT MAIN INFO
        const encOrigin = encrypt(originAddress);
        const encDest = encrypt(destinationAddress);
        const encTotalVal = encrypt(totalValue.toString());

        await transaction.request()
            .input('id', sql.UniqueIdentifier, req.params.id)
            .input('log', sql.UniqueIdentifier, logisticsId)
            .input('orig', sql.NVarChar, encOrigin)
            .input('dest', sql.NVarChar, encDest)
            .input('val', sql.NVarChar, encTotalVal)
            .query(`UPDATE shipments SET 
                logistics_id=@log, origin_address=@orig, 
                destination_address=@dest, total_value=@val
                WHERE shipment_id=@id`);

        // 4. APPLY NEW ITEMS & DEDUCT STOCK
        if (items && Array.isArray(items)) {
            for (const item of items) {
                if (item.stockId) {
                    const stockRes = await transaction.request()
                        .input('sId', sql.UniqueIdentifier, item.stockId)
                        .query("SELECT quantity FROM inventory_stock WHERE stock_id = @sId");

                    if (stockRes.recordset.length > 0) {
                        let currentQty = 0;
                        try { currentQty = parseInt(decrypt(stockRes.recordset[0].quantity)); } catch (e) { currentQty = parseInt(stockRes.recordset[0].quantity); }
                        const reqQty = parseInt(item.quantity) || 0;
                        const newQty = Math.max(0, currentQty - reqQty);

                        await transaction.request()
                            .input('qty', sql.NVarChar, encrypt(newQty.toString()))
                            .input('sId', sql.UniqueIdentifier, item.stockId)
                            .query("UPDATE inventory_stock SET quantity = @qty WHERE stock_id = @sId");
                    }
                }

                const sub = (item.unitValue || 0) * (item.quantity || 0);
                const batchNo = 'BATCH-' + new Date().toISOString().slice(0, 10).replace(/-/g, '');

                await transaction.request()
                    .input('shipId', sql.UniqueIdentifier, req.params.id)
                    .input('itemId', sql.UniqueIdentifier, item.itemId)
                    .input('stockId', item.stockId ? sql.UniqueIdentifier : sql.UniqueIdentifier, item.stockId || null) // Ensure correct type for null
                    .input('qty', sql.NVarChar, encrypt(item.quantity.toString()))
                    .input('sub', sql.NVarChar, encrypt(sub.toString()))
                    .input('batch', sql.NVarChar, encrypt(batchNo))
                    .query("INSERT INTO shipment_details (detail_id, shipment_id, item_id, stock_id, quantity, subtotal, batch_number) VALUES (NEWID(), @shipId, @itemId, @stockId, @qty, @sub, @batch)");
            }
        }

        await transaction.commit();

        // Sync Totals
        const uniqueItemIds = [...new Set([
            ...oldItemsRes.recordset.map(i => i.item_id),
            ...(items || []).map(i => i.itemId)
        ])];
        for (const iId of uniqueItemIds) await syncItemTotalStock(iId);

        // Build detailed change log (after commit, so errors here won't affect the update)
        try {
            const changes = [];
            if (oldOrigin !== originAddress) changes.push({ field: 'Điểm đi', from: oldOrigin, to: originAddress });
            if (oldDest !== destinationAddress) changes.push({ field: 'Điểm đến', from: oldDest, to: destinationAddress });
            if (String(oldTotalVal) !== String(totalValue)) changes.push({ field: 'Tổng giá trị', from: `$${oldTotalVal}`, to: `$${totalValue}` });
            if (oldLogisticsId !== logisticsId) changes.push({ field: 'Đơn vị vận chuyển', from: oldLogisticsId, to: logisticsId });

            // Compare items: build human-readable summaries of old vs new
            if (items && items.length > 0) {
                const oldSummaries = [];
                for (const oldItem of oldItemsRes.recordset) {
                    let itemName = oldItem.item_id;
                    let qty = 0;
                    try {
                        const nameRes = await pool.request().input('iid', sql.UniqueIdentifier, oldItem.item_id)
                            .query("SELECT item_name FROM supply_items WHERE item_id = @iid");
                        if (nameRes.recordset[0]) {
                            try { itemName = decrypt(nameRes.recordset[0].item_name); } catch (e) { itemName = nameRes.recordset[0].item_name; }
                        }
                    } catch (e) { }
                    try { qty = parseInt(decrypt(oldItem.quantity)); } catch (e) { qty = parseInt(oldItem.quantity) || 0; }
                    oldSummaries.push(`${itemName} (x${qty})`);
                }

                const newSummaries = items.map(i => `${i.item_name || i.itemId} (x${i.quantity})`);

                const oldStr = oldSummaries.join(', ') || '(trống)';
                const newStr = newSummaries.join(', ') || '(trống)';
                if (oldStr !== newStr) {
                    changes.push({ field: 'Sản phẩm', from: oldStr, to: newStr });
                }
            }

            await logAudit(req.user.id, 'UPDATE_SHIPMENT', {
                shipmentId: req.params.id,
                originAddress,
                destinationAddress,
                changes
            });
        } catch (logErr) {
            console.error("Audit log error (non-blocking):", logErr.message);
        }

        res.json({ message: 'Shipment updated successfully' });
    } catch (err) {
        if (transaction) {
            try { await transaction.rollback(); } catch (rbErr) { /* already committed or aborted */ }
        }
        console.error("Update Shipment Error:", err);
        res.status(500).json({ error: err.message });
    }
});

// 16. Delete Shipment (Admin Only)
app.delete('/api/shipments/:id', authenticateToken, authorizeRole(['Admin', 'Manager']), async (req, res) => {
    let transaction;
    try {
        const pool = await connectDB();

        // Security check: Only allow if pending approval
        const checkRes = await pool.request().input('id', sql.UniqueIdentifier, req.params.id).query("SELECT status FROM shipments WHERE shipment_id = @id");
        if (checkRes.recordset.length === 0) return res.status(404).json({ error: 'Shipment not found' });
        let decodedStatus = safeDecrypt(checkRes.recordset[0].status) || checkRes.recordset[0].status;
        if (decodedStatus !== 'Pending Approval') {
            return res.status(400).json({ error: 'Không thể xóa đơn hàng đã xử lý (Không còn ở trạng thái Chờ duyệt).' });
        }

        transaction = new sql.Transaction(pool);
        await transaction.begin();

        await transaction.request()
            .input('id', sql.UniqueIdentifier, req.params.id)
            .query("DELETE FROM shipment_details WHERE shipment_id = @id");

        await transaction.request()
            .input('id', sql.UniqueIdentifier, req.params.id)
            .query("DELETE FROM shipments WHERE shipment_id = @id");

        await transaction.commit();
        await logAudit(req.user.id, 'DELETE_SHIPMENT', { shipmentId: req.params.id });
        res.json({ message: 'Shipment deleted successfully' });
    } catch (err) {
        if (transaction) await transaction.rollback();
        res.status(500).json({ error: err.message });
    }
});

// --- NOTIFICATIONS APIs ---
app.get('/api/notifications', authenticateToken, async (req, res) => {
    try {
        const pool = await connectDB();
        const userRole = req.user.role;
        const userId = req.user.id;

        // Get notifications for this user (by user_id) or by role (target_role)
        const result = await pool.request()
            .input('userId', sql.UniqueIdentifier, userId)
            .input('role', sql.NVarChar, userRole)
            .query(`SELECT * FROM notifications 
                    WHERE user_id = @userId OR target_role = @role 
                    ORDER BY created_at DESC`);

        res.json(result.recordset);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.put('/api/notifications/:id/read', authenticateToken, async (req, res) => {
    try {
        const pool = await connectDB();
        await pool.request()
            .input('id', sql.UniqueIdentifier, req.params.id)
            .query("UPDATE notifications SET is_read = 1 WHERE notification_id = @id");
        res.json({ message: 'Marked as read' });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.put('/api/notifications/read-all', authenticateToken, async (req, res) => {
    try {
        const pool = await connectDB();
        await pool.request()
            .input('userId', sql.UniqueIdentifier, req.user.id)
            .input('role', sql.NVarChar, req.user.role)
            .query("UPDATE notifications SET is_read = 1 WHERE user_id = @userId OR target_role = @role");
        res.json({ message: 'All marked as read' });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// --- DASHBOARD APIs ---
app.get('/api/dashboard/stats', authenticateToken, async (req, res) => {
    res.json({ message: 'Stats from shipments' });
});

// --- PARTNERS APIs ---

// 8. Get All Partners
app.get('/api/partners', authenticateToken, async (req, res) => {
    try {
        const pool = await connectDB();
        const result = await pool.request().query("SELECT * FROM partners");

        const partners = result.recordset.map(p => {
            // Try to decrypt fields, show tamper warning if data corrupted
            let name = safeDecrypt(p.partner_name) || p.partner_name;
            let contact = safeDecrypt(p.contact_person) || p.contact_person;
            let phone = safeDecrypt(p.contact_phone) || p.contact_phone;
            let email = safeDecrypt(p.email) || p.email;
            let type = safeDecrypt(p.type) || p.type;

            return { ...p, partner_name: name, contact_person: contact, contact_phone: phone, email: email, type: type };
        });
        res.json(partners);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// 9. Create Partner
app.post('/api/partners', authenticateToken, authorizeRole(['Admin', 'Manager']), async (req, res) => {
    const { name, contact, phone, email, type } = req.body;

    // Validate phone & email
    if (phone) {
        if (!/^\+\d{8,15}$/.test(phone)) {
            return res.status(400).json({ error: 'SĐT không hợp lệ' });
        }
    }
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
        return res.status(400).json({ error: 'Email không hợp lệ' });
    }

    try {
        const pool = await connectDB();

        const encName = encrypt(name);
        const encContact = encrypt(contact);
        const encPhone = encrypt(phone);
        const encEmail = encrypt(email);
        const emailHash = crypto.createHash('sha256').update(email).digest('hex');
        const encType = encrypt(type);

        await pool.request()
            .input('name', sql.NVarChar, encName)
            .input('contact', sql.NVarChar, encContact)
            .input('phone', sql.NVarChar, encPhone)
            .input('email', sql.NVarChar, encEmail)
            .input('hash', sql.NVarChar, emailHash)
            .input('type', sql.NVarChar, encType)
            .query("INSERT INTO partners (partner_name, contact_person, contact_phone, email, email_hash, type) VALUES (@name, @contact, @phone, @email, @hash, @type)");

        await logAudit(req.user.id, 'CREATE_PARTNER', { name, type });
        res.json({ message: 'Partner created' });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// 10. Update Partner
app.put('/api/partners/:id', authenticateToken, authorizeRole(['Admin', 'Manager']), async (req, res) => {
    const { id } = req.params;
    const { name, contact, phone, email, type } = req.body;

    // Validate phone & email
    if (phone) {
        if (!/^\+\d{8,15}$/.test(phone)) {
            return res.status(400).json({ error: 'SĐT không hợp lệ' });
        }
    }
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
        return res.status(400).json({ error: 'Email không hợp lệ' });
    }

    try {
        const pool = await connectDB();

        // Fetch old data for change comparison
        const oldRes = await pool.request().input('id', sql.UniqueIdentifier, id)
            .query("SELECT * FROM partners WHERE partner_id = @id");
        if (oldRes.recordset.length === 0) return res.status(404).json({ error: 'Partner not found' });

        const old = oldRes.recordset[0];
        let oldName = safeDecrypt(old.partner_name) || old.partner_name;
        let oldContact = safeDecrypt(old.contact_person) || old.contact_person;
        let oldPhone = safeDecrypt(old.contact_phone) || old.contact_phone;
        let oldEmail = safeDecrypt(old.email) || old.email;
        let oldType = safeDecrypt(old.type) || old.type;

        const encName = encrypt(name);
        const encContact = encrypt(contact);
        const encPhone = encrypt(phone);
        const encEmail = encrypt(email);
        const encType = encrypt(type);

        await pool.request()
            .input('id', sql.UniqueIdentifier, id)
            .input('name', sql.NVarChar, encName)
            .input('contact', sql.NVarChar, encContact)
            .input('phone', sql.NVarChar, encPhone)
            .input('email', sql.NVarChar, encEmail)
            .input('type', sql.NVarChar, encType)
            .query(`UPDATE partners SET 
                partner_name=@name, contact_person=@contact, contact_phone=@phone, email=@email, type=@type 
                WHERE partner_id=@id`);

        // Build detailed change log
        const changes = [];
        if (oldName !== name) changes.push({ field: 'Tên đối tác', from: oldName, to: name });
        if (oldContact !== contact) changes.push({ field: 'Người liên hệ', from: oldContact, to: contact });
        if (oldPhone !== phone) changes.push({ field: 'Số điện thoại', from: oldPhone, to: phone });
        if (oldEmail !== email) changes.push({ field: 'Email', from: oldEmail, to: email });
        if (oldType !== type) changes.push({ field: 'Loại đối tác', from: oldType, to: type });

        await logAudit(req.user.id, 'UPDATE_PARTNER', { partnerId: id, partnerName: name, changes });
        res.json({ message: 'Partner updated' });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// 11. Delete Partner
app.delete('/api/partners/:id', authenticateToken, authorizeRole(['Admin', 'Manager']), async (req, res) => {
    const { id } = req.params;
    try {
        const pool = await connectDB();
        await pool.request().input('id', sql.UniqueIdentifier, id).query("DELETE FROM partners WHERE partner_id = @id");
        await logAudit(req.user.id, 'DELETE_PARTNER', { partnerId: id });
        res.json({ message: 'Partner deleted' });
    } catch (err) {
        if (err.number === 547) return res.status(400).json({ error: 'Không thể xóa đối tác đã có giao dịch vận đơn.' });
        res.status(500).json({ error: err.message });
    }
});

// === AI SECURITY ANALYTICS API ===
// Endpoint cho Admin Dashboard - thống kê login + phát hiện bất thường
app.get('/api/security/login-analytics', authenticateToken, authorizeRole(['Admin']), async (req, res) => {
    try {
        const pool = await connectDB();
        const analytics = await anomalyDetector.getAnalytics(pool);
        res.json(analytics);
    } catch (err) {
        console.error('[Security Analytics] Error:', err.message);
        res.status(500).json({ error: err.message });
    }
});

// API lấy lịch sử login attempts của 1 user cụ thể
app.get('/api/security/login-history/:userId', authenticateToken, authorizeRole(['Admin']), async (req, res) => {
    try {
        const pool = await connectDB();
        const result = await pool.request()
            .input('userId', sql.UniqueIdentifier, req.params.userId)
            .query(`
                SELECT TOP 50 attempt_id, ip_address, user_agent, attempt_time,
                       success, risk_score, risk_factors, blocked
                FROM login_attempts
                WHERE user_id = @userId
                ORDER BY attempt_time DESC
            `);

        // Helper: SQL Server DATETIME is local time (UTC+7) but mssql reads it as UTC
        // So subtract 7h to get correct UTC, then client adds UTC+7 back = correct display
        const fixLocalTime = (dt) => {
            if (!dt) return dt;
            const d = new Date(dt);
            const offsetMs = 7 * 60 * 60 * 1000;
            return new Date(d.getTime() - offsetMs).toISOString();
        };

        const history = result.recordset.map(row => {
            let ip = row.ip_address;
            let ua = row.user_agent;
            let factors = row.risk_factors;
            let successVal = row.success, riskVal = row.risk_score, blockedVal = row.blocked;
            ip = safeDecrypt(row.ip_address) || ip;
            ua = safeDecrypt(row.user_agent) || ua;
            try { const df = decrypt(row.risk_factors); if (df) factors = JSON.parse(df); } catch (e) { const sf = safeDecrypt(row.risk_factors); if (sf === TAMPERED_DATA) factors = TAMPERED_DATA; }
            successVal = safeDecryptInt(row.success);
            riskVal = safeDecryptFloat(row.risk_score);
            blockedVal = safeDecryptInt(row.blocked);
            return { ...row, ip_address: ip, user_agent: ua, risk_factors: factors, success: successVal, risk_score: riskVal, blocked: blockedVal, attempt_time: fixLocalTime(row.attempt_time) };
        });

        res.json(history);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// =====================================================
//  AI ANOMALY DETECTION & AUTO-BAN API ENDPOINTS
// =====================================================

// GET /api/ai/analytics - Dashboard tổng quan AI Anomaly Detection (Admin only)
app.get('/api/ai/analytics', authenticateToken, authorizeRole(['Admin']), async (req, res) => {
    try {
        const pool = await connectDB();
        const analytics = await anomalyDetector.getAnalytics(pool);

        // Thống kê bổ sung: Tổng số user bị ban hiện tại (decrypt in-memory)
        const allUsers = await pool.request().query(`
            SELECT banned_until FROM system_users WHERE banned_until IS NOT NULL
        `);
        let bannedUsersCount = 0;
        for (const u of allUsers.recordset) {
            let bu = safeDecrypt(u.banned_until);
            if (bu && bu !== TAMPERED_DATA && new Date(bu) > new Date()) bannedUsersCount++;
        }

        // Thống kê 7 ngày gần nhất (decrypt in-memory)
        const weeklyRaw = await pool.request().query(`
            SELECT attempt_time, success, blocked, risk_score
            FROM login_attempts
            WHERE attempt_time >= DATEADD(DAY, -7, GETDATE())
        `);
        const weeklyMap = {};
        for (const row of weeklyRaw.recordset) {
            const dateKey = new Date(row.attempt_time).toISOString().split('T')[0];
            if (!weeklyMap[dateKey]) weeklyMap[dateKey] = { date: dateKey, totalAttempts: 0, successCount: 0, failCount: 0, blockedCount: 0, riskSum: 0, riskCount: 0 };
            weeklyMap[dateKey].totalAttempts++;
            let s = safeDecryptInt(row.success);
            let b = safeDecryptInt(row.blocked);
            let r = safeDecryptFloat(row.risk_score);
            if (s === -1) s = 0; // tampered → treat as unknown
            if (b === -1) b = 0;
            if (r === -1) r = 0;
            if (s === 1) weeklyMap[dateKey].successCount++;
            else weeklyMap[dateKey].failCount++;
            if (b === 1) weeklyMap[dateKey].blockedCount++;
            weeklyMap[dateKey].riskSum += r;
            weeklyMap[dateKey].riskCount++;
        }
        const weeklyStats = Object.values(weeklyMap).map(d => ({
            date: d.date, totalAttempts: d.totalAttempts, successCount: d.successCount,
            failCount: d.failCount, blockedCount: d.blockedCount,
            avgRisk: d.riskCount > 0 ? Math.round(d.riskSum / d.riskCount) : 0
        })).sort((a, b) => new Date(b.date) - new Date(a.date));

        // Top IPs bị block nhiều nhất (decrypt in-memory)
        const allBlocked7d = await pool.request().query(`
            SELECT ip_address, blocked
            FROM login_attempts
            WHERE attempt_time >= DATEADD(DAY, -7, GETDATE())
        `);
        const ipBlockMap = {};
        for (const row of allBlocked7d.recordset) {
            let b = safeDecrypt(row.blocked);
            if (b === '1' || b === 1) {
                let ip = safeDecrypt(row.ip_address) || row.ip_address;
                ipBlockMap[ip] = (ipBlockMap[ip] || 0) + 1;
            }
        }
        const decryptedIPs = Object.entries(ipBlockMap)
            .map(([ip, blockCount]) => ({ ip, blockCount }))
            .sort((a, b) => b.blockCount - a.blockCount)
            .slice(0, 5);

        // Phân bố risk score (decrypt in-memory)
        const riskDist = { SAFE: 0, LOW: 0, MEDIUM: 0, HIGH: 0 };
        for (const row of weeklyRaw.recordset) {
            let r = safeDecryptFloat(row.risk_score);
            if (r === -1) r = 0;
            if (r < 20) riskDist.SAFE++;
            else if (r < 40) riskDist.LOW++;
            else if (r < 70) riskDist.MEDIUM++;
            else riskDist.HIGH++;
        }
        const riskDistribution = Object.entries(riskDist).map(([riskLevel, count]) => ({ riskLevel, count }));

        res.json({
            ...analytics,
            bannedUsersCount,
            weeklyStats,
            topBlockedIPs: decryptedIPs,
            riskDistribution,
            config: {
                riskThreshold: anomalyDetector.RISK_THRESHOLD,
                warnThreshold: anomalyDetector.WARN_THRESHOLD,
                maxFailedAttempts: anomalyDetector.MAX_FAILED_ATTEMPTS,
                autoBanEnabled: anomalyDetector.AUTO_BAN_ENABLED,
                banEscalation: anomalyDetector.BAN_DURATION_ESCALATION
            }
        });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET /api/ai/banned-users - Danh sách tất cả user đang bị ban
app.get('/api/ai/banned-users', authenticateToken, authorizeRole(['Admin']), async (req, res) => {
    try {
        const pool = await connectDB();
        const bannedUsers = await anomalyDetector.getBannedUsers(pool);
        res.json(bannedUsers);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /api/ai/unban/:userId - Admin gỡ ban cho user
app.post('/api/ai/unban/:userId', authenticateToken, authorizeRole(['Admin']), async (req, res) => {
    const { userId } = req.params;
    const { resetCount, isFalsePositive } = req.body;
    try {
        const pool = await connectDB();
        const result = await anomalyDetector.unbanUser(pool, userId, resetCount || false, isFalsePositive || false);

        if (result.success) {
            await logAudit(req.user.id, 'ADMIN_UNBAN_USER', {
                targetUserId: userId,
                resetCount: resetCount || false,
                admin: req.user.username
            });
        }

        res.json(result);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET /api/ai/user-activity/:userId - Lịch sử hoạt động login của 1 user
app.get('/api/ai/user-activity/:userId', authenticateToken, authorizeRole(['Admin']), async (req, res) => {
    const { userId } = req.params;
    try {
        const pool = await connectDB();
        const result = await pool.request()
            .input('userId', sql.UniqueIdentifier, userId)
            .query(`
                SELECT TOP 50 la.*, su.username
                FROM login_attempts la
                LEFT JOIN system_users su ON la.user_id = su.user_id
                WHERE la.user_id = @userId
                ORDER BY la.attempt_time DESC
            `);

        const activity = result.recordset.map(row => {
            let ip = row.ip_address;
            let ua = row.user_agent;
            let factors = row.risk_factors;
            let uname = row.username;
            let successVal = row.success, riskVal = row.risk_score, blockedVal = row.blocked;
            ip = safeDecrypt(row.ip_address) || ip;
            ua = safeDecrypt(row.user_agent) || ua;
            try { const df = decrypt(row.risk_factors); if (df) factors = JSON.parse(df); } catch (e) { const sf = safeDecrypt(row.risk_factors); if (sf === TAMPERED_DATA) factors = TAMPERED_DATA; }
            uname = safeDecrypt(row.username) || uname;
            successVal = safeDecryptInt(row.success);
            riskVal = safeDecryptFloat(row.risk_score);
            blockedVal = safeDecryptInt(row.blocked);
            return { ...row, ip_address: ip, user_agent: ua, risk_factors: factors, username: uname, success: successVal, risk_score: riskVal, blocked: blockedVal };
        });

        // Lấy thông tin ban hiện tại
        const banStatus = await anomalyDetector.checkBan(pool, userId);

        res.json({ activity, banStatus });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET /api/ai/alerts - Cảnh báo bất thường real-time (24h gần nhất)
app.get('/api/ai/alerts', authenticateToken, authorizeRole(['Admin']), async (req, res) => {
    try {
        const pool = await connectDB();
        const result = await pool.request().query(`
            SELECT TOP 100 la.*, su.username
            FROM login_attempts la
            LEFT JOIN system_users su ON la.user_id = su.user_id
            WHERE la.attempt_time >= DATEADD(HOUR, -24, GETDATE())
            ORDER BY la.attempt_time DESC
        `);

        const fixLocalTime = (dt) => {
            if (!dt) return dt;
            const d = new Date(dt);
            const offsetMs = 7 * 60 * 60 * 1000;
            return new Date(d.getTime() - offsetMs).toISOString();
        };

        const alerts = result.recordset.map(row => {
            let ip = row.ip_address;
            let ua = row.user_agent;
            let factors = row.risk_factors;
            let uname = row.username;
            let riskVal = 0;
            let successVal = 0;
            ip = safeDecrypt(row.ip_address) || ip;
            ua = safeDecrypt(row.user_agent) || ua;
            try { const df = decrypt(row.risk_factors); if (df) factors = JSON.parse(df); } catch (e) { const sf = safeDecrypt(row.risk_factors); if (sf === TAMPERED_DATA) factors = TAMPERED_DATA; }
            uname = safeDecrypt(row.username) || uname;
            riskVal = safeDecryptFloat(row.risk_score); if (riskVal === -1) riskVal = 0;
            successVal = safeDecryptInt(row.success); if (successVal === -1) successVal = 0;
            return { ...row, ip_address: ip, user_agent: ua, risk_factors: factors, username: uname, risk_score: riskVal, success: successVal, attempt_time: fixLocalTime(row.attempt_time) };
        }).filter(r => r.risk_score >= 40 || r.success === 0).slice(0, 50);

        res.json(alerts);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /api/ai/manual-ban/:userId - Admin ban tay cho user
app.post('/api/ai/manual-ban/:userId', authenticateToken, authorizeRole(['Admin']), async (req, res) => {
    const { userId } = req.params;
    const { duration, reason } = req.body; // duration in minutes, -1 = permanent
    try {
        const pool = await connectDB();

        let bannedUntil;
        if (duration === -1) {
            bannedUntil = new Date('9999-12-31T23:59:59.000Z');
        } else {
            bannedUntil = new Date(Date.now() + (duration || 60) * 60 * 1000);
        }

        const banReason = {
            type: 'MANUAL_BAN',
            reason: reason || 'Admin manual ban',
            bannedBy: req.user.username,
            time: new Date().toISOString()
        };

        // Mã hoá banned_until và ban_count
        // Lấy ban_count hiện tại
        const currentUser = await pool.request()
            .input('uid', sql.UniqueIdentifier, userId)
            .query('SELECT ban_count FROM system_users WHERE user_id = @uid');
        let currentBanCount = safeDecryptInt(currentUser.recordset[0]?.ban_count);

        await pool.request()
            .input('userId', sql.UniqueIdentifier, userId)
            .input('bannedUntil', sql.NVarChar, encrypt(bannedUntil.toISOString()))
            .input('banReason', sql.NVarChar, encrypt(JSON.stringify(banReason)))
            .input('banCount', sql.NVarChar, encrypt((currentBanCount + 1).toString()))
            .query(`
                UPDATE system_users
                SET banned_until = @bannedUntil,
                    ban_reason = @banReason,
                    ban_count = @banCount
                WHERE user_id = @userId
            `);

        await logAudit(req.user.id, 'ADMIN_MANUAL_BAN', {
            targetUserId: userId,
            duration: duration === -1 ? 'PERMANENT' : `${duration} minutes`,
            reason: reason
        });

        res.json({ success: true, bannedUntil, isPermanent: duration === -1 });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET /api/ai/all-users - Danh sách tất cả users với trạng thái ban
app.get('/api/ai/all-users', authenticateToken, authorizeRole(['Admin']), async (req, res) => {
    try {
        const pool = await connectDB();
        const result = await pool.request().query(`
            SELECT su.user_id, su.username, su.role, su.banned_until, su.ban_reason, su.ban_count
            FROM system_users su
        `);

        // Get login attempts for last 7 days separately
        const attemptResult = await pool.request().query(`
            SELECT user_id, success, blocked, risk_score
            FROM login_attempts
            WHERE attempt_time >= DATEADD(DAY, -7, GETDATE())
        `);

        // Build per-user stats by decrypting in-memory
        const userStats = {};
        for (const row of attemptResult.recordset) {
            const uid = row.user_id;
            if (!uid) continue;
            if (!userStats[uid]) userStats[uid] = { attempts: 0, blocked: 0, riskSum: 0, riskCount: 0 };
            userStats[uid].attempts++;
            let b = safeDecryptInt(row.blocked); if (b === -1) b = 0;
            let r = safeDecryptFloat(row.risk_score); if (r === -1) r = 0;
            if (b === 1) userStats[uid].blocked++;
            userStats[uid].riskSum += r;
            userStats[uid].riskCount++;
        }

        const users = result.recordset.map(u => {
            let username = safeDecrypt(u.username) || u.username;
            let role = safeDecrypt(u.role) || u.role;
            let banReason = u.ban_reason;
            let bannedUntil = safeDecrypt(u.banned_until);
            let banCount = safeDecryptInt(u.ban_count);
            try { const df = decrypt(u.ban_reason); if (df) banReason = JSON.parse(df); } catch (e) { const sf = safeDecrypt(u.ban_reason); if (sf === TAMPERED_DATA) banReason = TAMPERED_DATA; }

            const stats = userStats[u.user_id] || { attempts: 0, blocked: 0, riskSum: 0, riskCount: 0 };

            return {
                userId: u.user_id,
                username,
                role,
                bannedUntil: bannedUntil,
                banReason,
                banCount: banCount,
                isBanned: bannedUntil && new Date(bannedUntil) > new Date(),
                isPermanent: bannedUntil && new Date(bannedUntil).getFullYear() >= 2900,
                loginAttempts7d: stats.attempts,
                blockedAttempts7d: stats.blocked,
                avgRisk7d: stats.riskCount > 0 ? Math.round(stats.riskSum / stats.riskCount) : 0
            };
        });

        res.json(users);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// --- SERVER ---
const PORT = process.env.PORT || 5001;
app.listen(PORT, () => console.log(`HTTP Server running on port ${PORT}`));

// --- TLS SESSION RESUMPTION IMPLEMENTATION ---
// Cấu hình HTTPS Server hỗ trợ TLS Session Resumption để tái sử dụng xác thực,
// giảm thiểu overhead trong quá trình bắt tay (TLS Handshake)
try {
    const https = require('https');
    const selfsigned = require('selfsigned');

    // Tự sinh chứng chỉ SSL Local
    const attrs = [{ name: 'commonName', value: 'localhost' }];
    const pems = selfsigned.generate(attrs, { days: 365, keySize: 2048 });

    // Đọc TLS_TICKET_KEY từ biến môi trường (Hex string dài 96 ký tự tương đương 48 bytes)
    // Nếu không có, khởi tạo ngẫu nhiên (chỉ dùng cho Dev, sẽ bị reset khi restart server)
    let ticketKey;
    if (process.env.TLS_TICKET_KEY && process.env.TLS_TICKET_KEY.length === 96) {
        ticketKey = Buffer.from(process.env.TLS_TICKET_KEY, 'hex');
    } else {
        ticketKey = crypto.randomBytes(48);
        console.warn("[SECURITY WARN] TLS_TICKET_KEY chưa được cấu hình trong .env. Key sử dụng một lần sẽ bị mất khi khởi động lại server!");
    }

    // Cấu hình HTTPS & bật cơ chế lưu trữ phiên kết nối bảo mật TLS
    const httpsOptions = {
        key: pems.private,
        cert: pems.cert,
        // Khởi tạo chìa khóa lưu ticket TLS để cho phép resuming (TLS 1.2 / TLS 1.3)
        ticketKeys: ticketKey,
    };

    const httpsServer = https.createServer(httpsOptions, app);

    // --- CẢI TIẾN: Sử dụng Map với TTL (Time-To-Live) để tránh Memory Leak ---
    const tlsSessionStore = new Map();
    const SESSION_TIMEOUT = 10 * 60 * 1000; // Phiên hết hạn sau 10 phút không hoạt động

    // Dọn dẹp session cũ mỗi 1 phút
    setInterval(() => {
        const now = Date.now();
        for (const [id, session] of tlsSessionStore.entries()) {
            if (now - session.timestamp > SESSION_TIMEOUT) {
                tlsSessionStore.delete(id);
            }
        }
    }, 60 * 1000).unref(); // unref() để interval không ngăn Node.js thoát

    // Lắng nghe sự kiện bắt tay lần đầu (Tạo mới)
    httpsServer.on('newSession', (id, data, cb) => {
        console.log(`[TLS Resumption] Lưu phiên kết nối bảo mật mới - Session ID: ${id.toString('hex').substring(0, 10)}... (Giúp giảm handshake lần sau)`);
        tlsSessionStore.set(id.toString('hex'), { data, timestamp: Date.now() });
        cb();
    });

    // Lắng nghe sự kiện tái sử dụng session (Resume)
    httpsServer.on('resumeSession', (id, cb) => {
        const sessionIdHex = id.toString('hex');
        const session = tlsSessionStore.get(sessionIdHex);

        if (session) {
            console.log(`[TLS Resumption] Đang phục hồi phiên bảo mật - Session ID: ${sessionIdHex.substring(0, 10)}... -> Bỏ qua Full Handshake!`);
            session.timestamp = Date.now(); // Làm mới thời gian truy cập
            cb(null, session.data);
        } else {
            cb(null, null); // Không tìm thấy session hợp lệ, yêu cầu Full Handshake
        }
    });

    // Health check endpoint (for Railway / Render deployment)
    app.get('/api/health', (req, res) => {
        res.json({ status: 'ok', timestamp: new Date().toISOString() });
    });

    // Catch-all: serve React frontend for any non-API route (SPA support)
    app.get('*', (req, res) => {
        res.sendFile(path.join(__dirname, '..', 'client', 'dist', 'index.html'));
    });

    const HTTPS_PORT = parseInt(PORT) + 1; // 5002
    httpsServer.listen(HTTPS_PORT, () => {
        console.log(`[SECURITY] HTTPS Server Cấu hình TLS Session Resumption đang chạy tại port ${HTTPS_PORT}`);
    });
} catch (error) {
    console.log("Không thể giả lập HTTPS Server (Thiếu 'selfsigned'). Chạy: npm install selfsigned");
}
