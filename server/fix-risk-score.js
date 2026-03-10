const sql = require('mssql');
require('dotenv').config();
const { encrypt } = require('./EncryptionService');

async function fix() {
    const pool = await sql.connect({
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        server: process.env.DB_SERVER,
        database: process.env.DB_NAME,
        options: { encrypt: false, trustServerCertificate: true }
    });

    try {
        // Drop the index first if it still exists
        try {
            await pool.request().query("IF EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_login_attempts_risk') DROP INDEX IX_login_attempts_risk ON login_attempts");
            console.log('Dropped IX_login_attempts_risk index');
        } catch (e) { console.log('Index drop:', e.message); }

        // Drop any default constraints on risk_score
        try {
            const cs = await pool.request().query(
                "SELECT dc.name FROM sys.default_constraints dc " +
                "JOIN sys.columns c ON dc.parent_column_id = c.column_id AND dc.parent_object_id = c.object_id " +
                "WHERE c.name = 'risk_score' AND OBJECT_NAME(dc.parent_object_id) = 'login_attempts'"
            );
            for (const c of cs.recordset) {
                await pool.request().query('ALTER TABLE login_attempts DROP CONSTRAINT [' + c.name + ']');
                console.log('Dropped constraint:', c.name);
            }
        } catch (e) { console.log('Constraint drop:', e.message); }

        // Drop risk_score_enc if exists due to failed previous run
        try {
            await pool.request().query("ALTER TABLE login_attempts DROP COLUMN risk_score_enc");
            console.log('Dropped existing risk_score_enc');
        } catch (e) {
            // Might not exist, ignore
        }

        // Check if migration is needed
        const check = await pool.request().query(
            "SELECT DATA_TYPE FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'login_attempts' AND COLUMN_NAME = 'risk_score'"
        );

        if (check.recordset.length > 0 && check.recordset[0].DATA_TYPE !== 'nvarchar') {
            console.log('Migrating risk_score...');
            const rows = await pool.request().query('SELECT attempt_id, risk_score FROM login_attempts');
            await pool.request().query('ALTER TABLE login_attempts ADD risk_score_enc NVARCHAR(MAX) NULL');

            for (const r of rows.recordset) {
                await pool.request()
                    .input('e', sql.NVarChar, encrypt((r.risk_score || 0).toString()))
                    .input('id', sql.UniqueIdentifier, r.attempt_id)
                    .query('UPDATE login_attempts SET risk_score_enc = @e WHERE attempt_id = @id');
            }

            await pool.request().query('ALTER TABLE login_attempts DROP COLUMN risk_score');
            await pool.request().query("EXEC sp_rename 'login_attempts.risk_score_enc', 'risk_score', 'COLUMN'");
            console.log('✅ risk_score encrypted!');
        } else {
            console.log('risk_score already migrated');
        }
    } catch (e) {
        console.error('Error:', e.message);
    }

    await pool.close();
}

fix();
