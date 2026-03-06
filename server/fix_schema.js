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

async function fixSchema() {
    try {
        await sql.connect(dbConfig);
        console.log("Altering inventory_stock.bin_location to NVARCHAR(MAX)...");

        // Check if Default Constraint exists and drop it if necessary
        try {
            // Find constraint for bin_location
            const constraint = await sql.query(`
                SELECT default_constraints.name
                FROM sys.all_columns
                INNER JOIN sys.tables
                    ON all_columns.object_id = tables.object_id
                INNER JOIN sys.default_constraints
                    ON all_columns.default_object_id = default_constraints.object_id
                WHERE tables.name = 'inventory_stock' AND all_columns.name = 'bin_location'
            `);
            if (constraint.recordset.length > 0) {
                const cName = constraint.recordset[0].name;
                console.log(`Dropping default constraint: ${cName}`);
                await sql.query(`ALTER TABLE inventory_stock DROP CONSTRAINT ${cName}`);
            }
        } catch (e) {
            console.log("Constraint drop warning: " + e.message);
        }

        await sql.query("ALTER TABLE inventory_stock ALTER COLUMN bin_location NVARCHAR(MAX)");
        console.log("Successfully altered bin_location to NVARCHAR(MAX).");

    } catch (err) {
        console.error("Error fixing schema:", err);
    } finally {
        await sql.close();
    }
}

fixSchema();
