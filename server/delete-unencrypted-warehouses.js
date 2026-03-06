const sql = require('mssql');
require('dotenv').config();
const { decrypt, encrypt } = require('./EncryptionService');

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

        // Let's just delete all inventory_stock and then warehouses to start fresh
        // The user specifically said "delete unencrypted ones".
        const wRes = await pool.request().query("SELECT * FROM warehouses");

        let deletedCount = 0;
        for (const w of wRes.recordset) {
            let isEncrypted = true;
            try {
                const dec = decrypt(w.name);
                if (!dec) isEncrypted = false;
            } catch (e) { isEncrypted = false; }

            if (!isEncrypted) {
                // Delete stock first
                await pool.request().input('id', sql.UniqueIdentifier, w.warehouse_id).query("DELETE FROM inventory_stock WHERE warehouse_id = @id");

                // Delete warehouse
                await pool.request().input('id', sql.UniqueIdentifier, w.warehouse_id).query("DELETE FROM warehouses WHERE warehouse_id = @id");
                deletedCount++;
            }
        }

        console.log(`Deleted ${deletedCount} unencrypted warehouses (and their inventory stock).`);

        // Sync items stock to 0 or correct value
        const itemsRes = await pool.request().query("SELECT item_id FROM supply_items");
        for (const i of itemsRes.recordset) {
            const stockRes = await pool.request().input('id', sql.UniqueIdentifier, i.item_id).query("SELECT quantity FROM inventory_stock WHERE item_id = @id");
            let total = 0;
            for (const stock of stockRes.recordset) {
                try { total += parseInt(decrypt(stock.quantity)); } catch (e) { total += parseInt(stock.quantity) || 0; }
            }
            await pool.request().input('qty', sql.NVarChar, encrypt(total.toString())).input('id', sql.UniqueIdentifier, i.item_id).query("UPDATE supply_items SET quantity_in_stock = @qty WHERE item_id = @id");
        }

        pool.close();
    } catch (e) { console.error(e); }
}
run();
