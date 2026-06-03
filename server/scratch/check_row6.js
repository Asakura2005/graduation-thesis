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

async function checkRow6() {
    try {
        const pool = await sql.connect(dbConfig);
        // Get rows 1-10 to be sure we find the one the user sees as '6'
        const result = await pool.request().query('SELECT TOP 10 * FROM shipments');
        
        console.log('--- SHIPMENT ROW 6 DETAIL ---');
        const row6 = result.recordset[5]; // 0-indexed index 5 is row 6
        if (row6) {
            console.log(JSON.stringify(row6, null, 2));
        } else {
            console.log('Row 6 not found');
        }
        
        await pool.close();
    } catch (err) {
        console.error('Error:', err.message);
    }
}

checkRow6();
