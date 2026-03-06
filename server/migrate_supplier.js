const sql = require('mssql');
require('dotenv').config();

const dbConfig = {
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    server: process.env.DB_SERVER,
    database: process.env.DB_NAME,
    options: {
        encrypt: false,
        trustServerCertificate: true
    }
};

async function migrate() {
    try {
        await sql.connect(dbConfig);
        console.log("Starting Migration...");

        // 1. Make shipments.supplier_id Nullable
        try {
            await sql.query("ALTER TABLE shipments ALTER COLUMN supplier_id INT NULL");
            console.log("Made shipments.supplier_id NULLABLE.");
        } catch (e) {
            console.log("Warn (Shipments): " + e.message);
        }

        // 2. Add supplier_id to supply_items
        try {
            await sql.query("ALTER TABLE supply_items ADD supplier_id INT");
            console.log("Added supplier_id to supply_items.");
            // Add FK if desired, skipping for simplicity/safety against existing data violations
        } catch (e) {
            console.log("Warn (SupplyItems): " + e.message);
        }

    } catch (err) {
        console.error("Migration Error:", err);
    } finally {
        await sql.close();
    }
}

migrate();
