const sql = require('mssql');
require('dotenv').config();

const dbConfig = {
    user: process.env.DB_USER || 'sa',
    password: process.env.DB_PASSWORD || '123123',
    server: process.env.DB_SERVER || 'localhost',
    database: process.env.DB_NAME || 'SCMS',
    options: {
        encrypt: false,
        trustServerCertificate: true
    }
};

async function migrate() {
    try {
        await sql.connect(dbConfig);
        console.log("Migrating partners for full encryption...");

        const cols = ['partner_name', 'contact_person', 'contact_phone', 'email'];
        for (const col of cols) {
            console.log(`Altering ${col}...`);
            // Drop constraint if any
            try {
                const constraint = await sql.query(`
                    SELECT default_constraints.name
                    FROM sys.all_columns
                    INNER JOIN sys.tables ON all_columns.object_id = tables.object_id
                    INNER JOIN sys.default_constraints ON all_columns.default_object_id = default_constraints.object_id
                    WHERE tables.name = 'partners' AND all_columns.name = '${col}'
                `);
                if (constraint.recordset.length > 0) {
                    const cName = constraint.recordset[0].name;
                    await sql.query(`ALTER TABLE partners DROP CONSTRAINT ${cName}`);
                }
            } catch (e) { }

            await sql.query(`ALTER TABLE partners ALTER COLUMN ${col} NVARCHAR(MAX)`);
        }

        // Truncate to start fresh
        await sql.query("DELETE FROM partners");
        console.log("Partners migrated and truncated.");
    } catch (err) {
        console.error("Migration Failed:", err);
    } finally {
        await sql.close();
    }
}

migrate();
