const sql = require('mssql');
const path = require('path');
// Chỉ định rõ đường dẫn đến file .env ở cùng thư mục với file này
require('dotenv').config({ path: path.join(__dirname, '.env') });

const config = {
    user: process.env.DB_USER || 'meuu41',
    password: process.env.DB_PASSWORD || 'Meuu411@',
    server: process.env.DB_SERVER || 'Mều', // Dùng mặc định nếu .env chưa load được
    database: process.env.DB_NAME || 'eco_test',
    options: {
        encrypt: true,
        trustServerCertificate: true,
        connectTimeout: 10000
    }
};

async function test() {
    console.log("--- KIỂM TRA KẾT NỐI (DEVELOPER EDITION) ---");
    console.log(`Thông số sử dụng:`);
    console.log(`- Server: ${config.server}`);
    console.log(`- Database: ${config.database}`);
    console.log(`- User: ${config.user}`);

    try {
        let pool = await sql.connect(config);
        console.log("=====================================");
        console.log("   KẾT NỐI THÀNH CÔNG RỒI!           ");
        console.log("=====================================");
        await pool.close();
    } catch (err) {
        console.log("-------------------------------------");
        console.log("Lỗi: ", err.message);

        if (err.message.includes('Login failed')) {
            console.log("\n=> LƯU Ý: Bạn cần bật tài khoản 'sa' và đặt mật khẩu trong SSMS.");
        } else if (err.message.includes('getaddrinfo')) {
            console.log("\n=> Gợi ý: Có thể tên 'Mều' không nhận được. Hãy mở file .env và thử đổi DB_SERVER=localhost");
        }
    }
}

test();
