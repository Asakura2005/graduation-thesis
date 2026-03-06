const sql = require('mssql');
require('dotenv').config();

const config = {
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    server: process.env.DB_SERVER,
    database: process.env.DB_NAME,
    options: { encrypt: true, trustServerCertificate: true }
};

async function updateSchema() {
    try {
        const pool = await sql.connect(config);

        // Add 2FA columns
        const addColumnsQuery = `
            IF NOT EXISTS(SELECT * FROM sys.columns WHERE Name = N'two_fa_secret' AND Object_ID = Object_ID(N'system_users'))
            BEGIN
                ALTER TABLE system_users ADD two_fa_secret NVARCHAR(MAX) NULL, is_two_fa_enabled BIT DEFAULT 0;
            END
        `;

        await pool.request().query(addColumnsQuery);
        console.log("2FA columns added securely.");

        await pool.close();
    } catch (e) {
        console.error("Migration error:", e);
    }
}
updateSchema();
