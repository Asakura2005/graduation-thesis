const sql = require('mssql');
require('dotenv').config();

async function migrate() {
    let pool;
    try {
        console.log("Starting Migration: Rename & Recreate Columns...");
        pool = await sql.connect({
            user: process.env.DB_USER,
            password: process.env.DB_PASSWORD,
            server: process.env.DB_SERVER,
            database: process.env.DB_NAME,
            options: {
                encrypt: true,
                trustServerCertificate: true
            }
        });

        const targets = [
            ['system_users', 'username'],
            ['system_users', 'role'],
            ['shipment_details', 'quantity'],
            ['shipment_details', 'subtotal'],
            ['shipment_details', 'batch_number'],
            ['audit_logs', 'action'],
            ['audit_logs', 'timestamp']
        ];

        for (const [table, col] of targets) {
            console.log(`Processing ${table}.${col}...`);
            try {
                // Rename old col
                await pool.request().query(`EXEC sp_rename '${table}.${col}', '${col}_old', 'COLUMN'`);
                // Add new col with correct type
                await pool.request().query(`ALTER TABLE ${table} ADD ${col} NVARCHAR(MAX)`);
            } catch (e) {
                console.log(`Warning: ${table}.${col} rename/recreate skipped (maybe already done?): ${e.message}`);
            }
        }

        // Add username_hash separately
        try {
            await pool.request().query("ALTER TABLE system_users ADD username_hash NVARCHAR(64)");
        } catch (e) { }

        console.log("Renaming done. Redefining logic in index.js should use new columns.");
        process.exit(0);
    } catch (err) {
        console.error("Migration Fatal Error:", err.message);
        process.exit(1);
    }
}

migrate();
