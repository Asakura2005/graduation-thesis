const sql = require('mssql');
require('dotenv').config();

async function main() {
    const pool = await sql.connect({
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        server: process.env.DB_SERVER,
        database: process.env.DB_NAME,
        options: { encrypt: true, trustServerCertificate: true }
    });

    const r = await pool.request().query(`
        SELECT COLUMN_NAME, DATA_TYPE, COLUMN_DEFAULT, IS_NULLABLE
        FROM INFORMATION_SCHEMA.COLUMNS 
        WHERE TABLE_NAME = 'shipments'
    `);
    console.log(JSON.stringify(r.recordset, null, 2));
    process.exit(0);
}
main().catch(e => { console.error(e.message); process.exit(1); });
