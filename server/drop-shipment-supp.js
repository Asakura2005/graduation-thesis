const sql = require('mssql');
require('dotenv').config();

const config = {
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    server: process.env.DB_SERVER,
    database: process.env.DB_NAME,
    options: {
        instanceName: process.env.DB_INSTANCE,
        encrypt: true,
        trustServerCertificate: true
    }
};

async function run() {
    try {
        const pool = await sql.connect(config);
        await pool.request().query("ALTER TABLE shipments DROP CONSTRAINT IF EXISTS FK_shipments_supplier");
        await pool.request().query("ALTER TABLE shipments DROP COLUMN IF EXISTS supplier_id");
        console.log("Dropped supplier_id from shipments");
        pool.close();
    } catch (e) { console.error(e); }
}
run();
