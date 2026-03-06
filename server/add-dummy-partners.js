const sql = require('mssql');
require('dotenv').config();

async function addDummyPartners() {
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

        // Check if partners exist
        const check = await sql.query("SELECT COUNT(*) as count FROM partners");
        if (check.recordset[0].count > 0) {
            console.log("Đã có dữ liệu đối tác, bỏ qua bước thêm mẫu.");
            return;
        }

        // Add dummy partners
        await sql.query(`
            INSERT INTO partners (partner_name, contact_person, email, email_hash, type) VALUES 
            (N'Công ty TNHH Hóa chất Việt Nam', N'Nguyễn Văn An', 'contact@vinachem.vn', 'dummyhash1', 'Supplier'),
            (N'Tập đoàn Dệt may ABC', N'Trần Thị Bích', 'sales@abc-textile.com', 'dummyhash2', 'Supplier'),
            (N'Công ty Vận tải Biển Đông', N'Lê Minh Hải', 'ops@biendonglogistics.com', 'dummyhash3', 'Logistics'),
            (N'Giao Hàng Siêu Tốc 247', N'Phạm Tuấn Kiệt', 'support@ghst247.vn', 'dummyhash4', 'Logistics')
        `);

        console.log("Đã thêm 2 Nhà cung cấp và 2 Đơn vị vận chuyển mẫu.");
    } catch (err) {
        console.error("Lỗi:", err.message);
    } finally {
        await sql.close();
    }
}

addDummyPartners();
