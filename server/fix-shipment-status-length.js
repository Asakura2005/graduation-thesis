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
        console.log("Altering shipments.status column to NVARCHAR(MAX)...");
        await pool.request().query("ALTER TABLE shipments ALTER COLUMN status NVARCHAR(MAX)");
        console.log("Success!");
        pool.close();
    } catch (e) { console.error(e); }
}
run();
