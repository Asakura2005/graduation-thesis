const sql = require('mssql');
require('dotenv').config();

async function addPhoneColumn() {
    try {
        const dbConfig = {
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

        await sql.connect(dbConfig);

        // Cập nhật bảng partners
        await sql.query(`
            IF NOT EXISTS (
                SELECT * FROM sys.columns 
                WHERE Name = N'contact_phone' AND Object_ID = Object_ID(N'partners')
            )
            BEGIN
                ALTER TABLE partners ADD contact_phone NVARCHAR(MAX) NULL;
                PRINT 'Added contact_phone column to partners table.';
            END
            ELSE
            BEGIN
                PRINT 'Column contact_phone already exists in partners table.';
            END
        `);

    } catch (err) {
        console.error("Lỗi:", err.message);
    } finally {
        await sql.close();
    }
}

addPhoneColumn();
