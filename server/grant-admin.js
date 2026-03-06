const sql = require('mssql');
require('dotenv').config();

async function grantAdmin() {
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

        // Cập nhật user 'admin' thành role 'Admin'
        const result = await sql.query("UPDATE system_users SET role = 'Admin' WHERE username = 'admin'");

        console.log(`Đã cập nhật quyền Admin cho tài khoản 'admin'. Số dòng bị ảnh hưởng: ${result.rowsAffected[0]}`);
    } catch (err) {
        console.error("Lỗi:", err.message);
    } finally {
        await sql.close();
    }
}

grantAdmin();
