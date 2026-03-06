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
        console.log("Migrating supply_items for full encryption...");

        // 1. item_name -> NVARCHAR(MAX)
        console.log("Altering item_name...");
        await sql.query("ALTER TABLE supply_items ALTER COLUMN item_name NVARCHAR(MAX)");

        // 2. category -> NVARCHAR(MAX)
        console.log("Altering category...");
        await sql.query("ALTER TABLE supply_items ALTER COLUMN category NVARCHAR(MAX)");

        // 3. quantity_in_stock -> NVARCHAR(MAX)
        // First drop default constraint if exists (because INT usually has default 0)
        console.log("Altering quantity_in_stock...");
        try {
            const constraint = await sql.query(`
                SELECT default_constraints.name
                FROM sys.all_columns
                INNER JOIN sys.tables ON all_columns.object_id = tables.object_id
                INNER JOIN sys.default_constraints ON all_columns.default_object_id = default_constraints.object_id
                WHERE tables.name = 'supply_items' AND all_columns.name = 'quantity_in_stock'
            `);
            if (constraint.recordset.length > 0) {
                const cName = constraint.recordset[0].name;
                console.log(`Dropping default constraint: ${cName}`);
                await sql.query(`ALTER TABLE supply_items DROP CONSTRAINT ${cName}`);
            }
        } catch (e) { console.log(e.message); }

        await sql.query("ALTER TABLE supply_items ALTER COLUMN quantity_in_stock NVARCHAR(MAX)");

        console.log("Migration complete.");
    } catch (err) {
        console.error("Migration Failed:", err);
    } finally {
        await sql.close();
    }
}

migrate();
