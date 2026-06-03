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

async function deleteRecord() {
    try {
        const pool = await sql.connect(dbConfig);
        const shipmentId = '5B366D20-1005-4D04-B041-2FC2E9F66F85';
        
        console.log(`Deleting related details for shipment: ${shipmentId}`);
        await pool.request()
            .input('id', sql.UniqueIdentifier, shipmentId)
            .query('DELETE FROM shipment_details WHERE shipment_id = @id');

        console.log(`Deleting shipment with ID: ${shipmentId}`);
        const result = await pool.request()
            .input('id', sql.UniqueIdentifier, shipmentId)
            .query('DELETE FROM shipments WHERE shipment_id = @id');
        
        console.log(`Rows affected in shipments table: ${result.rowsAffected[0]}`);
        await pool.close();
    } catch (err) {
        console.error('Error:', err.message);
    }
}

deleteRecord();
