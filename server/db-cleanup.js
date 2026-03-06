const sql = require('mssql');
require('dotenv').config();

async function cleanup() {
    let pool;
    try {
        console.log("Starting Database Cleanup: Dropping legacy columns...");
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
            { table: 'system_users', columns: ['username_old', 'role_old'] },
            { table: 'audit_logs', columns: ['action_old', 'timestamp_old'] },
            { table: 'shipment_details', columns: ['quantity_old', 'subtotal_old', 'batch_number_old'] }
        ];

        for (const target of targets) {
            for (const col of target.columns) {
                console.log(`Checking ${target.table}.${col}...`);
                try {
                    // Check if column exists
                    const check = await pool.request().query(`
                        SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS 
                        WHERE TABLE_NAME = '${target.table}' AND COLUMN_NAME = '${col}'
                    `);

                    if (check.recordset.length > 0) {
                        console.log(`Dropping ${target.table}.${col}...`);
                        await pool.request().query(`ALTER TABLE ${target.table} DROP COLUMN ${col}`);
                    } else {
                        console.log(`${target.table}.${col} does not exist.`);
                    }
                } catch (e) {
                    console.error(`Error dropping ${target.table}.${col}:`, e.message);
                }
            }
        }

        console.log("Cleanup Complete.");
        process.exit(0);
    } catch (err) {
        console.error("Cleanup Fatal Error:", err.message);
        process.exit(1);
    }
}

cleanup();
