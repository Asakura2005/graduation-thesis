const sql = require('mssql');
const { encrypt } = require('./EncryptionService');
require('dotenv').config();

async function migrateShipmentDate() {
    const pool = await sql.connect({
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        server: process.env.DB_SERVER,
        database: process.env.DB_NAME,
        options: { encrypt: true, trustServerCertificate: true }
    });

    try {
        console.log('Step 1: Adding temp column shipment_date_enc...');
        await pool.request().query(`
            ALTER TABLE shipments ADD shipment_date_enc NVARCHAR(MAX) NULL
        `).catch(e => console.log('Column may already exist:', e.message));

        console.log('Step 2: Reading existing shipment_date values...');
        const rows = await pool.request().query(`SELECT shipment_id, shipment_date FROM shipments`);
        console.log(`Found ${rows.recordset.length} rows.`);

        for (const row of rows.recordset) {
            const dateVal = row.shipment_date;
            if (!dateVal) continue;

            const isoDate = new Date(dateVal).toISOString();
            const encrypted = encrypt(isoDate);

            await pool.request()
                .input('id', row.shipment_id)
                .input('enc', sql.NVarChar, encrypted)
                .query(`UPDATE shipments SET shipment_date_enc = @enc WHERE shipment_id = @id`);
            console.log(`Encrypted: ${isoDate}`);
        }

        console.log('Step 3: Dropping old shipment_date column...');
        await pool.request().query(`ALTER TABLE shipments DROP COLUMN shipment_date`);

        console.log('Step 4: Renaming shipment_date_enc => shipment_date...');
        await pool.request().query(`EXEC sp_rename 'shipments.shipment_date_enc', 'shipment_date', 'COLUMN'`);

        console.log('Done! shipment_date is now encrypted.');
    } catch (e) {
        console.error('Migration error:', e.message);
    } finally {
        process.exit(0);
    }
}

migrateShipmentDate();
