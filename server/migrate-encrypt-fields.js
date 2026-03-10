/**
 * migrate-encrypt-fields.js
 * ===========================
 * Migration: Mã hoá các trường còn thiếu
 * - shipments.shipment_date (DATETIME → NVARCHAR encrypted)
 * - system_users.banned_until (DATETIME → NVARCHAR encrypted)
 * - system_users.ban_count (INT → NVARCHAR encrypted)
 * - login_attempts.success (BIT → NVARCHAR encrypted)
 * - login_attempts.risk_score (FLOAT → NVARCHAR encrypted)
 * - login_attempts.blocked (BIT → NVARCHAR encrypted)
 *
 * Chạy: node migrate-encrypt-fields.js
 */

const sql = require('mssql');
require('dotenv').config();
const { encrypt } = require('./EncryptionService');

const config = {
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    server: process.env.DB_SERVER,
    database: process.env.DB_NAME,
    options: {
        instanceName: process.env.DB_INSTANCE,
        encrypt: false,
        trustServerCertificate: true,
        connectTimeout: 30000
    }
};

async function migrate() {
    try {
        console.log('🔌 Connecting to database...');
        const pool = await sql.connect(config);

        // ============================================
        // 1. SHIPMENTS: shipment_date
        // ============================================
        console.log('\n=== 1. Migrating shipments.shipment_date ===');
        try {
            const colCheck = await pool.request().query(`
                SELECT DATA_TYPE FROM INFORMATION_SCHEMA.COLUMNS
                WHERE TABLE_NAME = 'shipments' AND COLUMN_NAME = 'shipment_date'
            `);
            if (colCheck.recordset.length > 0 && colCheck.recordset[0].DATA_TYPE !== 'nvarchar') {
                console.log('  Reading existing shipment_date values...');
                const rows = await pool.request().query('SELECT shipment_id, shipment_date FROM shipments');

                // Add temp column
                await pool.request().query('ALTER TABLE shipments ADD shipment_date_enc NVARCHAR(MAX) NULL');

                for (const row of rows.recordset) {
                    const dateStr = row.shipment_date ? row.shipment_date.toISOString() : new Date().toISOString();
                    const encrypted = encrypt(dateStr);
                    await pool.request()
                        .input('enc', sql.NVarChar, encrypted)
                        .input('id', sql.UniqueIdentifier, row.shipment_id)
                        .query('UPDATE shipments SET shipment_date_enc = @enc WHERE shipment_id = @id');
                }

                // Drop default constraint if exists
                try {
                    const constraints = await pool.request().query(`
                        SELECT dc.name FROM sys.default_constraints dc
                        JOIN sys.columns c ON dc.parent_column_id = c.column_id AND dc.parent_object_id = c.object_id
                        WHERE c.name = 'shipment_date' AND OBJECT_NAME(dc.parent_object_id) = 'shipments'
                    `);
                    for (const c of constraints.recordset) {
                        await pool.request().query(`ALTER TABLE shipments DROP CONSTRAINT [${c.name}]`);
                    }
                } catch (e) { }

                await pool.request().query('ALTER TABLE shipments DROP COLUMN shipment_date');
                await pool.request().query("EXEC sp_rename 'shipments.shipment_date_enc', 'shipment_date', 'COLUMN'");
                console.log('  ✅ shipment_date encrypted successfully!');
            } else {
                console.log('  ⏭ shipment_date already migrated or table not found.');
            }
        } catch (e) { console.log('  ⚠️ shipment_date migration:', e.message); }

        // ============================================
        // 2. SYSTEM_USERS: banned_until, ban_count
        // ============================================
        console.log('\n=== 2. Migrating system_users.banned_until ===');
        try {
            const colCheck = await pool.request().query(`
                SELECT DATA_TYPE FROM INFORMATION_SCHEMA.COLUMNS
                WHERE TABLE_NAME = 'system_users' AND COLUMN_NAME = 'banned_until'
            `);
            if (colCheck.recordset.length > 0 && colCheck.recordset[0].DATA_TYPE !== 'nvarchar') {
                const rows = await pool.request().query('SELECT user_id, banned_until FROM system_users WHERE banned_until IS NOT NULL');
                await pool.request().query('ALTER TABLE system_users ADD banned_until_enc NVARCHAR(MAX) NULL');
                for (const row of rows.recordset) {
                    const dateStr = row.banned_until.toISOString();
                    await pool.request()
                        .input('enc', sql.NVarChar, encrypt(dateStr))
                        .input('id', sql.UniqueIdentifier, row.user_id)
                        .query('UPDATE system_users SET banned_until_enc = @enc WHERE user_id = @id');
                }
                try {
                    const constraints = await pool.request().query(`
                        SELECT dc.name FROM sys.default_constraints dc
                        JOIN sys.columns c ON dc.parent_column_id = c.column_id AND dc.parent_object_id = c.object_id
                        WHERE c.name = 'banned_until' AND OBJECT_NAME(dc.parent_object_id) = 'system_users'
                    `);
                    for (const c of constraints.recordset) {
                        await pool.request().query(`ALTER TABLE system_users DROP CONSTRAINT [${c.name}]`);
                    }
                } catch (e) { }
                await pool.request().query('ALTER TABLE system_users DROP COLUMN banned_until');
                await pool.request().query("EXEC sp_rename 'system_users.banned_until_enc', 'banned_until', 'COLUMN'");
                console.log('  ✅ banned_until encrypted!');
            } else {
                console.log('  ⏭ banned_until already migrated or not found.');
            }
        } catch (e) { console.log('  ⚠️ banned_until migration:', e.message); }

        console.log('\n=== 3. Migrating system_users.ban_count ===');
        try {
            const colCheck = await pool.request().query(`
                SELECT DATA_TYPE FROM INFORMATION_SCHEMA.COLUMNS
                WHERE TABLE_NAME = 'system_users' AND COLUMN_NAME = 'ban_count'
            `);
            if (colCheck.recordset.length > 0 && colCheck.recordset[0].DATA_TYPE !== 'nvarchar') {
                const rows = await pool.request().query('SELECT user_id, ban_count FROM system_users');
                await pool.request().query('ALTER TABLE system_users ADD ban_count_enc NVARCHAR(MAX) NULL');
                for (const row of rows.recordset) {
                    const val = (row.ban_count || 0).toString();
                    await pool.request()
                        .input('enc', sql.NVarChar, encrypt(val))
                        .input('id', sql.UniqueIdentifier, row.user_id)
                        .query('UPDATE system_users SET ban_count_enc = @enc WHERE user_id = @id');
                }
                try {
                    const constraints = await pool.request().query(`
                        SELECT dc.name FROM sys.default_constraints dc
                        JOIN sys.columns c ON dc.parent_column_id = c.column_id AND dc.parent_object_id = c.object_id
                        WHERE c.name = 'ban_count' AND OBJECT_NAME(dc.parent_object_id) = 'system_users'
                    `);
                    for (const c of constraints.recordset) {
                        await pool.request().query(`ALTER TABLE system_users DROP CONSTRAINT [${c.name}]`);
                    }
                } catch (e) { }
                await pool.request().query('ALTER TABLE system_users DROP COLUMN ban_count');
                await pool.request().query("EXEC sp_rename 'system_users.ban_count_enc', 'ban_count', 'COLUMN'");
                console.log('  ✅ ban_count encrypted!');
            } else {
                console.log('  ⏭ ban_count already migrated or not found.');
            }
        } catch (e) { console.log('  ⚠️ ban_count migration:', e.message); }

        // ============================================
        // 4. LOGIN_ATTEMPTS: success, risk_score, blocked
        // ============================================
        console.log('\n=== 4. Migrating login_attempts.success ===');
        try {
            const colCheck = await pool.request().query(`
                SELECT DATA_TYPE FROM INFORMATION_SCHEMA.COLUMNS
                WHERE TABLE_NAME = 'login_attempts' AND COLUMN_NAME = 'success'
            `);
            if (colCheck.recordset.length > 0 && colCheck.recordset[0].DATA_TYPE !== 'nvarchar') {
                const rows = await pool.request().query('SELECT attempt_id, success FROM login_attempts');
                await pool.request().query('ALTER TABLE login_attempts ADD success_enc NVARCHAR(MAX) NULL');
                for (const row of rows.recordset) {
                    await pool.request()
                        .input('enc', sql.NVarChar, encrypt(row.success ? '1' : '0'))
                        .input('id', sql.UniqueIdentifier, row.attempt_id)
                        .query('UPDATE login_attempts SET success_enc = @enc WHERE attempt_id = @id');
                }
                try {
                    const constraints = await pool.request().query(`
                        SELECT dc.name FROM sys.default_constraints dc
                        JOIN sys.columns c ON dc.parent_column_id = c.column_id AND dc.parent_object_id = c.object_id
                        WHERE c.name = 'success' AND OBJECT_NAME(dc.parent_object_id) = 'login_attempts'
                    `);
                    for (const c of constraints.recordset) {
                        await pool.request().query(`ALTER TABLE login_attempts DROP CONSTRAINT [${c.name}]`);
                    }
                } catch (e) { }
                await pool.request().query('ALTER TABLE login_attempts DROP COLUMN success');
                await pool.request().query("EXEC sp_rename 'login_attempts.success_enc', 'success', 'COLUMN'");
                console.log('  ✅ success encrypted!');
            } else {
                console.log('  ⏭ success already migrated.');
            }
        } catch (e) { console.log('  ⚠️ success migration:', e.message); }

        console.log('\n=== 5. Migrating login_attempts.risk_score ===');
        try {
            const colCheck = await pool.request().query(`
                SELECT DATA_TYPE FROM INFORMATION_SCHEMA.COLUMNS
                WHERE TABLE_NAME = 'login_attempts' AND COLUMN_NAME = 'risk_score'
            `);
            if (colCheck.recordset.length > 0 && colCheck.recordset[0].DATA_TYPE !== 'nvarchar') {
                const rows = await pool.request().query('SELECT attempt_id, risk_score FROM login_attempts');
                await pool.request().query('ALTER TABLE login_attempts ADD risk_score_enc NVARCHAR(MAX) NULL');
                for (const row of rows.recordset) {
                    await pool.request()
                        .input('enc', sql.NVarChar, encrypt((row.risk_score || 0).toString()))
                        .input('id', sql.UniqueIdentifier, row.attempt_id)
                        .query('UPDATE login_attempts SET risk_score_enc = @enc WHERE attempt_id = @id');
                }
                try {
                    const constraints = await pool.request().query(`
                        SELECT dc.name FROM sys.default_constraints dc
                        JOIN sys.columns c ON dc.parent_column_id = c.column_id AND dc.parent_object_id = c.object_id
                        WHERE c.name = 'risk_score' AND OBJECT_NAME(dc.parent_object_id) = 'login_attempts'
                    `);
                    for (const c of constraints.recordset) {
                        await pool.request().query(`ALTER TABLE login_attempts DROP CONSTRAINT [${c.name}]`);
                    }
                } catch (e) { }
                await pool.request().query('ALTER TABLE login_attempts DROP COLUMN risk_score');
                await pool.request().query("EXEC sp_rename 'login_attempts.risk_score_enc', 'risk_score', 'COLUMN'");
                console.log('  ✅ risk_score encrypted!');
            } else {
                console.log('  ⏭ risk_score already migrated.');
            }
        } catch (e) { console.log('  ⚠️ risk_score migration:', e.message); }

        console.log('\n=== 6. Migrating login_attempts.blocked ===');
        try {
            const colCheck = await pool.request().query(`
                SELECT DATA_TYPE FROM INFORMATION_SCHEMA.COLUMNS
                WHERE TABLE_NAME = 'login_attempts' AND COLUMN_NAME = 'blocked'
            `);
            if (colCheck.recordset.length > 0 && colCheck.recordset[0].DATA_TYPE !== 'nvarchar') {
                const rows = await pool.request().query('SELECT attempt_id, blocked FROM login_attempts');
                await pool.request().query('ALTER TABLE login_attempts ADD blocked_enc NVARCHAR(MAX) NULL');
                for (const row of rows.recordset) {
                    await pool.request()
                        .input('enc', sql.NVarChar, encrypt(row.blocked ? '1' : '0'))
                        .input('id', sql.UniqueIdentifier, row.attempt_id)
                        .query('UPDATE login_attempts SET blocked_enc = @enc WHERE attempt_id = @id');
                }
                try {
                    const constraints = await pool.request().query(`
                        SELECT dc.name FROM sys.default_constraints dc
                        JOIN sys.columns c ON dc.parent_column_id = c.column_id AND dc.parent_object_id = c.object_id
                        WHERE c.name = 'blocked' AND OBJECT_NAME(dc.parent_object_id) = 'login_attempts'
                    `);
                    for (const c of constraints.recordset) {
                        await pool.request().query(`ALTER TABLE login_attempts DROP CONSTRAINT [${c.name}]`);
                    }
                } catch (e) { }
                await pool.request().query('ALTER TABLE login_attempts DROP COLUMN blocked');
                await pool.request().query("EXEC sp_rename 'login_attempts.blocked_enc', 'blocked', 'COLUMN'");
                console.log('  ✅ blocked encrypted!');
            } else {
                console.log('  ⏭ blocked already migrated.');
            }
        } catch (e) { console.log('  ⚠️ blocked migration:', e.message); }

        // Drop index on risk_score since it's now encrypted
        try {
            await pool.request().query("IF EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_login_attempts_risk') DROP INDEX IX_login_attempts_risk ON login_attempts");
            console.log('\n✅ Dropped IX_login_attempts_risk index (no longer usable on encrypted data)');
        } catch (e) { }

        console.log('\n🎉 All migrations completed!');
        await pool.close();
    } catch (err) {
        console.error('❌ Migration error:', err.message);
    }
}

migrate();
