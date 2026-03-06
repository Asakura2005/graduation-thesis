const sql = require('mssql');
require('dotenv').config();

const config = {
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    server: process.env.DB_SERVER,
    database: process.env.DB_NAME,
    options: {
        encrypt: true,
        trustServerCertificate: true,
    }
};

async function migrate() {
    try {
        console.log("Đang kết nối Database để nâng cấp tính năng 2FA...");
        const pool = await sql.connect(config);

        // Thêm cột two_fa_secret
        await pool.request().query(`
            IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('system_users') AND name = 'two_fa_secret')
            ALTER TABLE system_users ADD two_fa_secret NVARCHAR(MAX) NULL
        `);

        // Thêm cột is_two_fa_enabled
        await pool.request().query(`
            IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('system_users') AND name = 'is_two_fa_enabled')
            ALTER TABLE system_users ADD is_two_fa_enabled BIT DEFAULT 0 WITH VALUES
        `);

        console.log("✅ Cấu trúc Database đã được cập nhật thành công (Bổ sung 2FA)!");
        await pool.close();
    } catch (err) {
        console.error("❌ Lỗi nâng cấp Database:", err.message);
    }
}

migrate();
