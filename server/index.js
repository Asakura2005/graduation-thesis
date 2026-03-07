require('dotenv').config();
const express = require('express');
const cors = require('cors');
const sql = require('mssql');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const argon2 = require('argon2');
const { encrypt, decrypt, hashData } = require('./EncryptionService');
const speakeasy = require('speakeasy');
const QRCode = require('qrcode');
const anomalyDetector = require('./AnomalyDetectionService');

const app = express();
app.use(cors());
app.use(express.json());

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
            try {
                const qty = parseInt(decrypt(row.quantity));
                if (!isNaN(qty)) total += qty;
            } catch (e) {
                // Fallback to raw if not encrypted integer (legacy)
                total += (parseInt(row.quantity) || 0);
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

// Middleware
const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    if (!token) return res.sendStatus(401);
    jwt.verify(token, process.env.JWT_SECRET || 'secret', (err, user) => {
        if (err) return res.sendStatus(403);
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

// 0. Audit Logs
app.get('/api/audit-logs', authenticateToken, async (req, res) => {
    try {
        const pool = await connectDB();
        const result = await pool.request().query("SELECT a.*, u.username FROM audit_logs a LEFT JOIN system_users u ON a.user_id = u.user_id");

        const logs = result.recordset.map(log => {
            let uName = log.username;
            let act = log.action;
            let time = log.timestamp;
            let details = log.details;

            try { uName = decrypt(log.username) || log.username; } catch (e) { }
            try { act = decrypt(log.action) || log.action; } catch (e) { }
            try {
                const rawTime = decrypt(log.timestamp) || log.timestamp;
                // Convert any date format (including SQL Server 'Mar 6 2026 1:36PM') to ISO string
                const parsed = new Date(rawTime);
                time = !isNaN(parsed) ? parsed.toISOString() : rawTime;
            } catch (e) { }

            try {
                const decryptedStr = decrypt(log.details);
                if (decryptedStr) details = JSON.parse(decryptedStr);
                else details = JSON.parse(log.details);
            } catch (e) {
                try { details = JSON.parse(log.details); } catch (ex) { details = log.details; }
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
app.post('/api/auth/login', async (req, res) => {
    const { username, password } = req.body;
    const clientIP = req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'unknown';
    const userAgent = req.headers['user-agent'] || 'unknown';

    try {
        const pool = await connectDB();
        const usernameHash = hashData(username);

        // === AI ANOMALY DETECTION: Pre-authentication analysis ===
        let preAnalysis = { riskScore: 0, riskFactors: [], decision: 'ALLOW' };
        try {
            preAnalysis = await anomalyDetector.analyzeLogin(pool, {
                usernameHash, ipAddress: clientIP, userAgent, userId: null
            });
        } catch (aiErr) {
            console.error('[AI Anomaly] Pre-analysis error (non-blocking):', aiErr.message);
        }

        // Nếu bị BLOCK bởi AI (ví dụ: brute force) → từ chối ngay
        if (preAnalysis.decision === 'BLOCK') {
            try {
                await anomalyDetector.recordAttempt(pool, {
                    usernameHash, userId: null, ipAddress: clientIP, userAgent,
                    success: false, riskScore: preAnalysis.riskScore,
                    riskFactors: preAnalysis.riskFactors, blocked: true
                });
            } catch (recErr) { console.error('[AI Anomaly] Record error:', recErr.message); }

            await logAudit(null, 'LOGIN_BLOCKED_BY_AI', {
                username, riskScore: preAnalysis.riskScore,
                factors: preAnalysis.riskFactors.map(f => f.type)
            }).catch(() => {});

            return res.status(403).json({
                error: 'Tài khoản tạm thời bị khóa do phát hiện hoạt động bất thường. Vui lòng thử lại sau.',
                riskScore: preAnalysis.riskScore,
                blocked: true
            });
        }

        const result = await pool.request()
            .input('hash', sql.NVarChar, usernameHash)
            .query("SELECT * FROM system_users WHERE username_hash = @hash");

        // Tìm user để lấy userId cho auto-ban (nếu cần)
        const foundUser = result.recordset[0];
        if (foundUser) {
            // Auto-ban nếu bị BLOCK và đủ điều kiện
            try {
                const banResult = await anomalyDetector.autoBan(pool, {
                    userId: foundUser.user_id,
                    usernameHash,
                    riskScore: preAnalysis.riskScore,
                    riskFactors: preAnalysis.riskFactors,
                    ipAddress: clientIP
                });

                if (banResult?.banned) {
                    await logAudit(foundUser.user_id, 'ACCOUNT_AUTO_BANNED', {
                        username, riskScore: preAnalysis.riskScore,
                        duration: banResult.duration,
                        banLevel: banResult.banLevel
                    }).catch(() => {});
                }
            } catch (banErr) { console.error('[AutoBan] Error:', banErr.message); }
        }

        const user = result.recordset[0];
        if (!user) {
            // Ghi nhận login fail - user not found
            try {
                await anomalyDetector.recordAttempt(pool, {
                    usernameHash, userId: null, ipAddress: clientIP, userAgent,
                    success: false, riskScore: preAnalysis.riskScore,
                    riskFactors: preAnalysis.riskFactors, blocked: false
                });
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
                    blocked: true
                }).catch(() => {});

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
                    riskFactors: preAnalysis.riskFactors, blocked: false
                });
            } catch (recErr) { console.error('[AI Anomaly] Record error:', recErr.message); }
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

        // Ghi nhận login thành công
        try {
            await anomalyDetector.recordAttempt(pool, {
                usernameHash, userId: user.user_id, ipAddress: clientIP, userAgent,
                success: true, riskScore: fullAnalysis.riskScore,
                riskFactors: fullAnalysis.riskFactors, blocked: false
            });
        } catch (recErr) { console.error('[AI Anomaly] Record error:', recErr.message); }

        // 2FA Check
        if (user.is_two_fa_enabled) {
            const tempToken = jwt.sign({ id: user.user_id, role: decryptedRole, username: decryptedUsername, pending2FA: true }, process.env.JWT_SECRET || 'secret', { expiresIn: '5m' });
            return res.json({ requires2FA: true, tempToken, riskScore: fullAnalysis.riskScore });
        }

        const token = jwt.sign({ id: user.user_id, role: decryptedRole, username: decryptedUsername }, process.env.JWT_SECRET || 'secret');

        await logAudit(user.user_id, 'USER_LOGIN', {
            username: decryptedUsername,
            riskScore: fullAnalysis.riskScore,
            aiDecision: fullAnalysis.decision
        });

        res.json({
            token,
            role: decryptedRole,
            username: decryptedUsername,
            riskScore: fullAnalysis.riskScore,
            warnings: fullAnalysis.decision === 'WARN' ? fullAnalysis.riskFactors : []
        });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// 1.1 Verify 2FA for Login
app.post('/api/auth/verify-2fa', async (req, res) => {
    const { tempToken, token } = req.body;
    try {
        if (!tempToken || !token) return res.status(400).json({ error: 'Missing tokens' });

        const decoded = jwt.verify(tempToken, process.env.JWT_SECRET || 'secret');
        if (!decoded.pending2FA) return res.status(400).json({ error: 'Invalid token type' });

        const pool = await connectDB();
        const result = await pool.request()
            .input('id', sql.UniqueIdentifier, decoded.id)
            .query("SELECT two_fa_secret FROM system_users WHERE user_id = @id");

        const user = result.recordset[0];
        if (!user || !user.two_fa_secret) return res.status(400).json({ error: '2FA not setup' });

        // Decrypt the secret from the DB
        let decryptedSecret = '';
        try { decryptedSecret = decrypt(user.two_fa_secret); }
        catch (e) { decryptedSecret = user.two_fa_secret; } // Fallback for old unencrypted secrets

        console.log(`[2FA Login] User: ${user.username}, Received: ${token}, Expected: ${speakeasy.totp({ secret: decryptedSecret, encoding: 'base32' })}`);
        const isValid = speakeasy.totp.verify({ secret: decryptedSecret, encoding: 'base32', token: token, window: 4 });

        if (!isValid) return res.status(401).json({ error: 'Mã xác thực không hợp lệ. Hãy kiểm tra lại Google Authenticator.' });

        const finalToken = jwt.sign({ id: decoded.id, role: decoded.role, username: decoded.username }, process.env.JWT_SECRET || 'secret');
        await logAudit(decoded.id, 'USER_LOGIN_2FA', { username: decoded.username });

        res.json({ token: finalToken, role: decoded.role, username: decoded.username });
    } catch (err) { res.status(401).json({ error: 'Token expired or invalid' }); }
});

app.post('/api/auth/register', async (req, res) => {
    const { username, password, fullName, email, phone, role } = req.body;

    // Password complexity validation
    const passwordRegex = /^(?=.*[A-Z])(?=.*[!@#$&*.,?<>^%\-_\=+~]).{8,}$/;
    if (!passwordRegex.test(password)) {
        return res.status(400).json({ error: 'Mật khẩu phải chứa ít nhất 8 ký tự, 1 chữ hoa và 1 ký tự đặc biệt' });
    }

    try {
        const pool = await connectDB();
        const emailHash = hashData(email);
        const usernameHash = hashData(username);

        const checkRes = await pool.request()
            .input('u', sql.NVarChar, usernameHash)
            .input('e', sql.NVarChar, emailHash)
            .query("SELECT * FROM system_users WHERE username_hash = @u OR email_hash = @e");

        if (checkRes.recordset.length > 0) {
            return res.status(400).json({ error: 'Username or email already exists' });
        }

        const passHash = await argon2.hash(password);
        const encUsername = encrypt(username);
        const encRole = encrypt(role || 'Staff');
        const encName = encrypt(fullName);
        const encEmail = encrypt(email);
        const encPhone = encrypt(phone || '');

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

        await logAudit(r.recordset[0].user_id, 'USER_REGISTER', { username });
        res.status(201).json({ message: 'User registered' });
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

        let username = user.username, fullName = user.full_name, email = user.email, phone = user.phone, role = user.role;
        try { username = decrypt(user.username) || user.username; } catch (e) { }
        try { fullName = decrypt(user.full_name) || user.full_name; } catch (e) { }
        try { email = decrypt(user.email) || user.email; } catch (e) { }
        try { phone = decrypt(user.phone) || user.phone; } catch (e) { }
        try { role = decrypt(user.role) || user.role; } catch (e) { }

        res.json({
            user_id: user.user_id,
            username,
            full_name: fullName,
            email, phone: phone || '',
            role,
            is2FAEnabled: !!user.is_two_fa_enabled
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

// Change password
app.put('/api/auth/me/password', authenticateToken, async (req, res) => {
    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword) return res.status(400).json({ error: 'Vui lòng nhập đầy đủ thông tin' });
    if (newPassword.length < 8) return res.status(400).json({ error: 'Mật khẩu mới phải có ít nhất 8 ký tự' });
    try {
        const pool = await connectDB();
        const result = await pool.request()
            .input('id', sql.UniqueIdentifier, req.user.id)
            .query('SELECT password_hash FROM system_users WHERE user_id = @id');

        const user = result.recordset[0];
        if (!user) return res.status(404).json({ error: 'User not found' });

        const isMatch = await argon2.verify(user.password_hash, currentPassword);
        if (!isMatch) return res.status(401).json({ error: 'Mật khẩu hiện tại không đúng' });

        const newHash = await argon2.hash(newPassword);
        await pool.request()
            .input('ph', sql.NVarChar, newHash)
            .input('id', sql.UniqueIdentifier, req.user.id)
            .query('UPDATE system_users SET password_hash = @ph WHERE user_id = @id');

        await logAudit(req.user.id, 'CHANGE_PASSWORD', { userId: req.user.id });
        res.json({ message: 'Đổi mật khẩu thành công' });
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
        console.log(`[2FA Verification] Received Token: ${token}, Secret: ${secret}`);
        // Calculate the current expected token for debugging
        const expectedToken = speakeasy.totp({ secret: secret, encoding: 'base32' });
        console.log(`[2FA Verification] Expected Token right now: ${expectedToken}`);

        // window: 4 allows a 2-minute margin of error (pre/post 4*30s)
        const isValid = speakeasy.totp.verify({ secret: secret, encoding: 'base32', token: token, window: 4 });

        if (!isValid) {
            console.error('[2FA Verification] Failed. Token rejected.');
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

// 2. Get All Items (Master Data)
app.get('/api/items', authenticateToken, async (req, res) => {
    try {
        const pool = await connectDB();
        const result = await pool.request().query("SELECT * FROM supply_items");

        const decryptedItems = result.recordset.map(item => {
            let dName = item.item_name;
            let dCat = item.category;
            let dQty = item.quantity_in_stock;
            let dCost = item.unit_cost;

            try { dName = decrypt(item.item_name) || item.item_name; } catch (e) { }
            try { dCat = decrypt(item.category) || item.category; } catch (e) { }
            try { dQty = parseInt(decrypt(item.quantity_in_stock)); } catch (e) { dQty = item.quantity_in_stock; }
            try { dCost = decrypt(item.unit_cost) || item.unit_cost; } catch (e) { }

            return {
                ...item,
                item_name: dName,
                category: dCat,
                quantity_in_stock: isNaN(dQty) ? 0 : dQty,
                unit_cost: dCost
            };
        });

        res.json(decryptedItems);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 3. Add Supply Item (Master Data + Auto Stock In)
app.post('/api/items', authenticateToken, authorizeRole(['Admin']), async (req, res) => {
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
app.put('/api/items/:id', authenticateToken, authorizeRole(['Admin']), async (req, res) => {
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
app.delete('/api/items/:id', authenticateToken, authorizeRole(['Admin']), async (req, res) => {
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
            let qty = 0;
            let bin = '';
            let wName = stock.warehouse_name;
            try { qty = parseInt(decrypt(stock.quantity)); } catch (e) { qty = stock.quantity; }
            try { bin = decrypt(stock.bin_location); } catch (e) { bin = stock.bin_location; }
            try { wName = decrypt(stock.warehouse_name) || stock.warehouse_name; } catch (e) { }

            return {
                ...stock,
                quantity: isNaN(qty) ? 0 : qty,
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
            let name = w.name, location = w.location, type = w.type, total_shelves = w.total_shelves;
            try { name = decrypt(w.name) || w.name; } catch (e) { }
            try { location = decrypt(w.location) || w.location; } catch (e) { }
            try { type = decrypt(w.type) || w.type; } catch (e) { }
            try { total_shelves = decrypt(w.total_shelves) || w.total_shelves; } catch (e) { }
            return { ...w, name, location, type, total_shelves };
        });
        res.json(decryptedWarehouses);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// 6.1 Create Warehouse (Updated: No Capacity, has Total Shelves)
app.post('/api/warehouses', authenticateToken, authorizeRole(['Admin']), async (req, res) => {
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
            let decryptedQty = 0;
            let decryptedBin = '';
            let decryptedName = item.item_name;
            let decryptedCat = item.category;

            try { decryptedQty = parseInt(decrypt(item.quantity)); } catch (e) { decryptedQty = item.quantity; }
            try { decryptedBin = decrypt(item.bin_location); } catch (e) { decryptedBin = item.bin_location; }
            try { decryptedName = decrypt(item.item_name) || item.item_name; } catch (e) { }
            try { decryptedCat = decrypt(item.category) || item.category; } catch (e) { }

            return {
                ...item,
                item_name: decryptedName,
                category: decryptedCat,
                quantity: isNaN(decryptedQty) ? 0 : decryptedQty,
                bin_location: decryptedBin,
                unit_cost: decrypt(item.unit_cost)
            };
        });

        res.json(decryptedInventory);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// 8. Add/Update Stock (Secure Encrypted Update)
app.post('/api/inventory/add', authenticateToken, authorizeRole(['Admin', 'Warehouse']), async (req, res) => {
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
app.put('/api/inventory/:id', authenticateToken, authorizeRole(['Admin', 'Warehouse']), async (req, res) => {
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
app.delete('/api/inventory/:id', authenticateToken, authorizeRole(['Admin', 'Warehouse']), async (req, res) => {
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
            let tracking = s.tracking_number, origin = s.origin_address, dest = s.destination_address, status = s.status, val = s.total_value;
            let logName = s.logistics_name;
            try { tracking = decrypt(s.tracking_number) || s.tracking_number; } catch (e) { }
            try { origin = decrypt(s.origin_address) || s.origin_address; } catch (e) { }
            try { dest = decrypt(s.destination_address) || s.destination_address; } catch (e) { }
            try {
                val = decrypt(s.total_value) || s.total_value;
                val = decrypt(s.total_value);
                if (!val || val === "NaN") val = "0";
            } catch (e) { val = s.total_value; } // Fallback to original if decryption fails
            try { status = decrypt(s.status) || s.status; } catch (e) { }
            try { logName = decrypt(s.logistics_name) || s.logistics_name; } catch (e) { }

            // Handle shipment_date (might be DATETIME or encrypted NVARCHAR)
            let shipDate = s.shipment_date;
            if (s.shipment_date) {
                if (s.shipment_date instanceof Date) {
                    shipDate = s.shipment_date.toISOString();
                } else {
                    try {
                        const decDate = decrypt(s.shipment_date);
                        if (decDate) shipDate = new Date(decDate).toISOString();
                    } catch (e) { }
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
            let name = item.item_name;
            let cat = item.category;
            let wName = item.warehouse_name;
            let qty = item.quantity;
            let sub = item.subtotal;
            let batch = item.batch_number;

            try { name = decrypt(item.item_name) || item.item_name; } catch (e) { }
            try { cat = decrypt(item.category) || item.category; } catch (e) { }
            try { wName = decrypt(item.warehouse_name) || item.warehouse_name; } catch (e) { }
            try { qty = decrypt(item.quantity) || item.quantity; } catch (e) { }
            try { sub = decrypt(item.subtotal) || item.subtotal; } catch (e) { }
            try { batch = decrypt(item.batch_number) || item.batch_number; } catch (e) { }

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
            let tracking = s.tracking_number;
            try { tracking = decrypt(s.tracking_number) || s.tracking_number; } catch (e) { }
            if (tracking === trackingQuery) {
                let logName = s.logistics_name;
                let origin = s.origin_address;
                let dest = s.destination_address;
                let status = s.status;

                try { logName = decrypt(s.logistics_name) || s.logistics_name; } catch (e) { }
                try { origin = decrypt(s.origin_address) || s.origin_address; } catch (e) { }
                try { dest = decrypt(s.destination_address) || s.destination_address; } catch (e) { }
                try { status = decrypt(s.status) || s.status; } catch (e) { }

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
app.post('/api/shipments', authenticateToken, authorizeRole(['Admin', 'Staff']), async (req, res) => {
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

        // 2. Insert Shipment (date is DATETIME now, not encrypted)
        const shipRes = await transaction.request()
            .input('track', sql.NVarChar, encTracking)
            .input('log', sql.UniqueIdentifier, logisticsId)
            .input('date', sql.DateTime, new Date())
            .input('origin', sql.NVarChar, encOrigin)
            .input('dest', sql.NVarChar, encDest)
            .input('val', sql.NVarChar, encTotalVal)
            .input('status', sql.NVarChar, encrypt('Pending'))
            .query(`
                INSERT INTO shipments (shipment_id, tracking_number, logistics_id, shipment_date, origin_address, destination_address, total_value, status)
                OUTPUT INSERTED.shipment_id
                VALUES (NEWID(), @track, @log, @date, @origin, @dest, @val, @status)
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
app.put('/api/shipments/:id/status', authenticateToken, authorizeRole(['Admin', 'Staff']), async (req, res) => {
    const { status } = req.body;
    try {
        const pool = await connectDB();
        await pool.request()
            .input('status', sql.NVarChar, encrypt(status))
            .input('id', sql.UniqueIdentifier, req.params.id)
            .query("UPDATE shipments SET status = @status WHERE shipment_id = @id");

        await logAudit(req.user.id, 'UPDATE_SHIPMENT_STATUS', { shipmentId: req.params.id, status });
        res.json({ message: 'Status updated' });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.put('/api/shipments/:id', authenticateToken, authorizeRole(['Admin']), async (req, res) => {
    const { logisticsId, originAddress, destinationAddress, totalValue, items } = req.body;
    let transaction;
    try {
        const pool = await connectDB();

        // Security check: Only allow if pending
        const checkRes = await pool.request().input('id', sql.UniqueIdentifier, req.params.id).query("SELECT status FROM shipments WHERE shipment_id = @id");
        if (checkRes.recordset.length === 0) return res.status(404).json({ error: 'Shipment not found' });
        let decodedStatus = checkRes.recordset[0].status;
        try { decodedStatus = decrypt(decodedStatus) || decodedStatus; } catch (e) { }
        if (decodedStatus !== 'Pending') {
            return res.status(400).json({ error: 'Không thể sửa đơn hàng đã xử lý (Không còn ở trạng thái Pending).' });
        }

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

        await logAudit(req.user.id, 'UPDATE_SHIPMENT', { shipmentId: req.params.id, originAddress, destinationAddress });
        res.json({ message: 'Shipment updated successfully' });
    } catch (err) {
        if (transaction) await transaction.rollback();
        console.error("Update Shipment Error:", err);
        res.status(500).json({ error: err.message });
    }
});

// 16. Delete Shipment (Admin Only)
app.delete('/api/shipments/:id', authenticateToken, authorizeRole(['Admin']), async (req, res) => {
    let transaction;
    try {
        const pool = await connectDB();

        // Security check: Only allow if pending
        const checkRes = await pool.request().input('id', sql.UniqueIdentifier, req.params.id).query("SELECT status FROM shipments WHERE shipment_id = @id");
        if (checkRes.recordset.length === 0) return res.status(404).json({ error: 'Shipment not found' });
        let decodedStatus = checkRes.recordset[0].status;
        try { decodedStatus = decrypt(decodedStatus) || decodedStatus; } catch (e) { }
        if (decodedStatus !== 'Pending') {
            return res.status(400).json({ error: 'Không thể xóa đơn hàng đã xử lý (Không còn ở trạng thái Pending).' });
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

// --- DASHBOARD APIs ---
app.get('/api/dashboard/stats', authenticateToken, async (req, res) => {
    // This might be calculated on client from shipments list, or separate API.
    // App.jsx fetches /api/shipments and passes to DashboardStats.
    // So distinct API might not be needed if App.jsx purely relies on shipments list.
    // User said "Dashboard not showing". App.jsx:115: <DashboardStats shipments={shipments} />
    // So fixing /api/shipments should fix Dashboard!
    res.json({ message: 'Stats from shipments' });
});

// --- PARTNERS APIs ---

// 8. Get All Partners
app.get('/api/partners', authenticateToken, async (req, res) => {
    try {
        const pool = await connectDB();
        const result = await pool.request().query("SELECT * FROM partners");

        const partners = result.recordset.map(p => {
            // Try to decrypt fields, fallback to original if fail
            let name = p.partner_name, contact = p.contact_person, phone = p.contact_phone, email = p.email, type = p.type;
            try { name = decrypt(p.partner_name) || p.partner_name; } catch (e) { }
            try { contact = decrypt(p.contact_person) || p.contact_person; } catch (e) { }
            try { phone = decrypt(p.contact_phone) || p.contact_phone; } catch (e) { }
            try { email = decrypt(p.email) || p.email; } catch (e) { }
            try { type = decrypt(p.type) || p.type; } catch (e) { }

            return { ...p, partner_name: name, contact_person: contact, contact_phone: phone, email: email, type: type };
        });
        res.json(partners);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// 9. Create Partner
app.post('/api/partners', authenticateToken, authorizeRole(['Admin', 'Staff']), async (req, res) => {
    const { name, contact, phone, email, type } = req.body;
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
app.put('/api/partners/:id', authenticateToken, authorizeRole(['Admin']), async (req, res) => {
    const { id } = req.params;
    const { name, contact, phone, email, type } = req.body;
    try {
        const pool = await connectDB();

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

        await logAudit(req.user.id, 'UPDATE_PARTNER', { partnerId: id, name, type });
        res.json({ message: 'Partner updated' });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// 11. Delete Partner
app.delete('/api/partners/:id', authenticateToken, authorizeRole(['Admin']), async (req, res) => {
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

        const history = result.recordset.map(row => {
            let ip = row.ip_address;
            let ua = row.user_agent;
            let factors = row.risk_factors;
            try { ip = decrypt(row.ip_address); } catch (e) { }
            try { ua = decrypt(row.user_agent); } catch (e) { }
            try { factors = JSON.parse(decrypt(row.risk_factors)); } catch (e) { }
            return { ...row, ip_address: ip, user_agent: ua, risk_factors: factors };
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

        // Thống kê bổ sung: Tổng số user bị ban hiện tại
        const bannedCount = await pool.request().query(`
            SELECT COUNT(*) as count FROM system_users
            WHERE banned_until IS NOT NULL AND banned_until > GETDATE()
        `);

        // Thống kê 7 ngày gần nhất
        const weeklyStats = await pool.request().query(`
            SELECT
                CAST(attempt_time AS DATE) as date,
                COUNT(*) as totalAttempts,
                SUM(CASE WHEN success = 1 THEN 1 ELSE 0 END) as successCount,
                SUM(CASE WHEN success = 0 THEN 1 ELSE 0 END) as failCount,
                SUM(CASE WHEN blocked = 1 THEN 1 ELSE 0 END) as blockedCount,
                AVG(risk_score) as avgRisk
            FROM login_attempts
            WHERE attempt_time >= DATEADD(DAY, -7, GETDATE())
            GROUP BY CAST(attempt_time AS DATE)
            ORDER BY date DESC
        `);

        // Top IPs bị block nhiều nhất
        const topBlockedIPs = await pool.request().query(`
            SELECT TOP 5 ip_address, COUNT(*) as blockCount
            FROM login_attempts
            WHERE blocked = 1 AND attempt_time >= DATEADD(DAY, -7, GETDATE())
            GROUP BY ip_address
            ORDER BY blockCount DESC
        `);

        const decryptedIPs = topBlockedIPs.recordset.map(row => {
            let ip = row.ip_address;
            try { ip = decrypt(row.ip_address); } catch (e) { }
            return { ip, blockCount: row.blockCount };
        });

        // Phân bố risk score
        const riskDistribution = await pool.request().query(`
            SELECT
                CASE
                    WHEN risk_score < 20 THEN 'SAFE'
                    WHEN risk_score < 40 THEN 'LOW'
                    WHEN risk_score < 70 THEN 'MEDIUM'
                    ELSE 'HIGH'
                END as riskLevel,
                COUNT(*) as count
            FROM login_attempts
            WHERE attempt_time >= DATEADD(DAY, -7, GETDATE())
            GROUP BY CASE
                WHEN risk_score < 20 THEN 'SAFE'
                WHEN risk_score < 40 THEN 'LOW'
                WHEN risk_score < 70 THEN 'MEDIUM'
                ELSE 'HIGH'
            END
        `);

        res.json({
            ...analytics,
            bannedUsersCount: bannedCount.recordset[0].count,
            weeklyStats: weeklyStats.recordset,
            topBlockedIPs: decryptedIPs,
            riskDistribution: riskDistribution.recordset,
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
    const { resetCount } = req.body;
    try {
        const pool = await connectDB();
        const result = await anomalyDetector.unbanUser(pool, userId, resetCount || false);

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
            try { ip = decrypt(row.ip_address); } catch (e) { }
            try { ua = decrypt(row.user_agent); } catch (e) { }
            try { factors = JSON.parse(decrypt(row.risk_factors)); } catch (e) { }
            try { uname = decrypt(row.username); } catch (e) { }
            return { ...row, ip_address: ip, user_agent: ua, risk_factors: factors, username: uname };
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
            SELECT TOP 30 la.*, su.username
            FROM login_attempts la
            LEFT JOIN system_users su ON la.user_id = su.user_id
            WHERE la.risk_score >= 40
              AND la.attempt_time >= DATEADD(HOUR, -24, GETDATE())
            ORDER BY la.attempt_time DESC
        `);

        const alerts = result.recordset.map(row => {
            let ip = row.ip_address;
            let ua = row.user_agent;
            let factors = row.risk_factors;
            let uname = row.username;
            try { ip = decrypt(row.ip_address); } catch (e) { }
            try { ua = decrypt(row.user_agent); } catch (e) { }
            try { factors = JSON.parse(decrypt(row.risk_factors)); } catch (e) { }
            try { uname = decrypt(row.username); } catch (e) { }
            return { ...row, ip_address: ip, user_agent: ua, risk_factors: factors, username: uname };
        });

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

        await pool.request()
            .input('userId', sql.UniqueIdentifier, userId)
            .input('bannedUntil', sql.DateTime, bannedUntil)
            .input('banReason', sql.NVarChar, encrypt(JSON.stringify(banReason)))
            .query(`
                UPDATE system_users
                SET banned_until = @bannedUntil,
                    ban_reason = @banReason,
                    ban_count = ISNULL(ban_count, 0) + 1
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
            SELECT su.user_id, su.username, su.role, su.banned_until, su.ban_reason, su.ban_count,
                   (SELECT COUNT(*) FROM login_attempts la WHERE la.user_id = su.user_id AND la.attempt_time >= DATEADD(DAY, -7, GETDATE())) as loginAttempts7d,
                   (SELECT COUNT(*) FROM login_attempts la WHERE la.user_id = su.user_id AND la.blocked = 1 AND la.attempt_time >= DATEADD(DAY, -7, GETDATE())) as blockedAttempts7d,
                   (SELECT AVG(la.risk_score) FROM login_attempts la WHERE la.user_id = su.user_id AND la.attempt_time >= DATEADD(DAY, -7, GETDATE())) as avgRisk7d
            FROM system_users su
        `);

        const users = result.recordset.map(u => {
            let username = u.username;
            let role = u.role;
            let banReason = u.ban_reason;
            try { username = decrypt(u.username); } catch (e) { }
            try { role = decrypt(u.role); } catch (e) { }
            try { banReason = JSON.parse(decrypt(u.ban_reason)); } catch (e) { }

            return {
                userId: u.user_id,
                username,
                role,
                bannedUntil: u.banned_until,
                banReason,
                banCount: u.ban_count || 0,
                isBanned: u.banned_until && new Date(u.banned_until) > new Date(),
                isPermanent: u.banned_until && new Date(u.banned_until).getFullYear() >= 9000,
                loginAttempts7d: u.loginAttempts7d || 0,
                blockedAttempts7d: u.blockedAttempts7d || 0,
                avgRisk7d: Math.round(u.avgRisk7d || 0)
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

    const HTTPS_PORT = parseInt(PORT) + 1; // 5002
    httpsServer.listen(HTTPS_PORT, () => {
        console.log(`[SECURITY] HTTPS Server Cấu hình TLS Session Resumption đang chạy tại port ${HTTPS_PORT}`);
    });
} catch (error) {
    console.log("Không thể giả lập HTTPS Server (Thiếu 'selfsigned'). Chạy: npm install selfsigned");
}
