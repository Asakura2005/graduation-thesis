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

async function checkCorruptData() {
    try {
        const pool = await sql.connect(dbConfig);
        const result = await pool.request().query('SELECT TOP 25 shipment_id, status FROM shipments');
        
        console.log('--- SHIPMENT STATUS CHECK ---');
        result.recordset.forEach((row, index) => {
            console.log(`${index + 1}: ID=${row.shipment_id}, Status="${row.status}"`);
        });
        
        await pool.close();
    } catch (err) {
        console.error('Error:', err.message);
    }
}

checkCorruptData();
