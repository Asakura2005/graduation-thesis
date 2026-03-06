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

    // Add default NEWID() to shipment_id in shipments
    try {
        await pool.request().query(`
            ALTER TABLE shipments 
            ADD CONSTRAINT DF_shipments_shipment_id DEFAULT NEWID() FOR shipment_id
        `);
        console.log('Added DEFAULT NEWID() to shipments.shipment_id');
    } catch (e) {
        console.log('shipments constraint:', e.message);
    }

    // Add default NEWID() to detail_id in shipment_details
    try {
        await pool.request().query(`
            ALTER TABLE shipment_details 
            ADD CONSTRAINT DF_shipment_details_detail_id DEFAULT NEWID() FOR detail_id
        `);
        console.log('Added DEFAULT NEWID() to shipment_details.detail_id');
    } catch (e) {
        console.log('shipment_details constraint:', e.message);
    }

    // Add default NEWID() to log_id in audit_logs
    try {
        await pool.request().query(`
            ALTER TABLE audit_logs 
            ADD CONSTRAINT DF_audit_logs_log_id DEFAULT NEWID() FOR log_id
        `);
        console.log('Added DEFAULT NEWID() to audit_logs.log_id');
    } catch (e) {
        console.log('audit_logs constraint:', e.message);
    }

    console.log('Done.');
    process.exit(0);
}
main().catch(e => { console.error(e.message); process.exit(1); });
