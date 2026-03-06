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

async function createTable() {
    try {
        await sql.connect(dbConfig);
        console.log("Creating shipment_details table if not exists...");

        await sql.query(`
            IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='shipment_details' AND xtype='U')
            BEGIN
                CREATE TABLE shipment_details (
                    detail_id INT PRIMARY KEY IDENTITY(1,1),
                    shipment_id INT FOREIGN KEY REFERENCES shipments(shipment_id) ON DELETE CASCADE,
                    item_id INT FOREIGN KEY REFERENCES supply_items(item_id),
                    quantity INT NOT NULL,
                    subtotal DECIMAL(18,2)
                );
                PRINT 'Table shipment_details created.';
            END
            ELSE
                PRINT 'Table shipment_details already exists.';
        `);

    } catch (err) {
        console.error("Error:", err);
    } finally {
        await sql.close();
    }
}

createTable();
