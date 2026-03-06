# Thiết kế Chi tiết Hệ thống Quản lý Chuỗi cung ứng Bảo mật (Secure Supply Chain - Phase 2)

Tài liệu này trình bày thiết kế chi tiết cấp hệ thống, tập trung vào việc bảo mật 8 danh mục dữ liệu nhạy cảm bằng chuẩn AES-256-GCM.

## 1. Cơ chế Bảo mật Cốt lõi (AES-256-GCM)

Hệ thống sử dụng thuật toán **AES-256-GCM** (Galois/Counter Mode) để đảm bảo đồng thời tính **Bảo mật** (Confidentiality) và tính **Toàn vẹn** (Integrity).

*   **Khóa (Key)**: 32 bytes (256-bit Hex), lưu trữ trong `AES_SECRET_KEY`.
*   **Định dạng lưu trữ DB**: `iv(hex):authTag(hex):ciphertext(hex)`.

---

## 2. Mã SQL Thực thi (Schema chuẩn)

Dữ liệu được tổ chức theo cấu trúc SQL Server tối ưu sau đây:

```sql
CREATE TABLE system_users (
    user_id INT IDENTITY(1,1) PRIMARY KEY,
    username NVARCHAR(50) NOT NULL UNIQUE,
    password_hash NVARCHAR(MAX) NOT NULL,   -- Argon2
    full_name NVARCHAR(MAX) NOT NULL,        -- Encrypted (PII)
    email NVARCHAR(MAX) NOT NULL,             -- Encrypted (PII)
    email_hash NVARCHAR(64) NOT NULL,
    phone NVARCHAR(MAX) NULL,                  -- Encrypted (PII)
    role NVARCHAR(20) NOT NULL
);
CREATE INDEX IX_system_users_email_hash ON system_users(email_hash);

CREATE TABLE partners (
    partner_id INT IDENTITY(1,1) PRIMARY KEY,
    partner_name NVARCHAR(MAX) NOT NULL,      -- Encrypted
    contact_person NVARCHAR(MAX) NOT NULL,    -- Encrypted (PII)
    email NVARCHAR(MAX) NOT NULL,              -- Encrypted
    email_hash NVARCHAR(64) NOT NULL,
    contact_phone NVARCHAR(MAX) NULL,          -- Encrypted (PII)
    type NVARCHAR(50) NOT NULL                
);
CREATE INDEX IX_partners_email_hash ON partners(email_hash);

CREATE TABLE supply_items (
    item_id INT IDENTITY(1,1) PRIMARY KEY,
    item_name NVARCHAR(255) NOT NULL,
    unit_cost NVARCHAR(MAX) NOT NULL,          -- Encrypted (Cost)
    category NVARCHAR(100)
);

CREATE TABLE shipments (
    shipment_id INT IDENTITY(1,1) PRIMARY KEY,
    supplier_id INT NOT NULL,
    logistics_id INT NOT NULL,
    origin_address NVARCHAR(MAX) NOT NULL,     
    destination_address NVARCHAR(MAX) NOT NULL,
    shipment_date DATETIME NOT NULL,
    status NVARCHAR(50) NOT NULL,               
    total_value NVARCHAR(MAX) NOT NULL,         
    tracking_number NVARCHAR(MAX) NOT NULL,     
    CONSTRAINT FK_shipments_supplier FOREIGN KEY (supplier_id) REFERENCES partners(partner_id),
    CONSTRAINT FK_shipments_logistics FOREIGN KEY (logistics_id) REFERENCES partners(partner_id)
);

CREATE TABLE shipment_details (
    detail_id INT IDENTITY(1,1) PRIMARY KEY,
    shipment_id INT NOT NULL,
    item_id INT NOT NULL,
    quantity INT NOT NULL,
    batch_number NVARCHAR(MAX) NOT NULL,        -- Encrypted
    CONSTRAINT FK_shipment_details_shipment FOREIGN KEY (shipment_id) REFERENCES shipments(shipment_id),
    CONSTRAINT FK_shipment_details_item FOREIGN KEY (item_id) REFERENCES supply_items(item_id)
);

CREATE TABLE audit_logs (
    log_id INT IDENTITY(1,1) PRIMARY KEY,
    action NVARCHAR(100) NOT NULL,
    user_id INT NOT NULL,
    [timestamp] DATETIME NOT NULL DEFAULT GETDATE(),
    details NVARCHAR(MAX) NOT NULL,             
    CONSTRAINT FK_audit_logs_user FOREIGN KEY (user_id) REFERENCES system_users(user_id)
);
```

---

## 3. Danh sách API Chính

| Endpoint | Method | Mô tả | Dữ liệu Mã hóa |
| :--- | :--- | :--- | :--- |
| `/api/auth/login` | POST | Đăng nhập hệ thống | Password (Hash) |
| `/api/partners` | POST | Thêm đối tác mới | Name, Contact, Email |
| `/api/items` | POST | Thêm hàng hóa | Unit Cost |
| `/api/shipments` | POST | Tạo vận đơn mới | Addresses, Value, Tracking |
| `/api/shipments/:id` | GET | Chi tiết vận đơn | Tự động giải mã các trường |
| `/api/logs` | GET | Truy xuất nhật ký | Tự động giải mã details |
