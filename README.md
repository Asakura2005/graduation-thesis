# 🔐 SecureChain — Enterprise Supply Chain Management System

> **Đồ Án Tốt Nghiệp 2026** — Hệ thống quản lý chuỗi cung ứng bảo mật cao với AI anomaly detection, mã hóa AES-256-GCM và xác thực 2 lớp.

---

## 🌐 Demo Trực Tuyến

**Link công khai:** [https://bethany-phonatory-dominica.ngrok-free.dev](https://bethany-phonatory-dominica.ngrok-free.dev)

> ⚡ Link hoạt động khi máy chủ đang bật. Liên hệ tác giả để yêu cầu demo.

---

## ✨ Tính Năng Chính

| Module | Mô tả |
|--------|-------|
| 🔐 **Bảo mật AI** | Phát hiện đăng nhập bất thường bằng Neural Network |
| 🔒 **Mã hóa AES-256-GCM** | Toàn bộ dữ liệu nhạy cảm được mã hóa |
| 📦 **Quản lý Vận Đơn** | Theo dõi và phê duyệt shipment real-time |
| 🏭 **Kho Hàng** | Quản lý tồn kho đa kho với phân quyền |
| 🤝 **Đối Tác** | Quản lý nhà cung cấp và đối tác |
| 👥 **Phê duyệt Tài Khoản** | Admin duyệt tài khoản mới |
| 📋 **Nhật Ký Kiểm Toán** | Audit log toàn bộ hoạt động hệ thống |
| 🔑 **Xác thực 2FA** | Google Authenticator / TOTP |
| 🤖 **Auto-Ban AI** | Tự động khóa tài khoản khi phát hiện tấn công |

---

## 🛠️ Công Nghệ Sử Dụng

**Frontend:**
- React 18 + Vite
- React Router v7
- Recharts (biểu đồ)
- Framer Motion (animation)
- Bootstrap 5

**Backend:**
- Node.js + Express
- Microsoft SQL Server (mssql)
- JWT Authentication
- Argon2 Password Hashing
- AES-256-GCM Encryption
- Synaptic Neural Network (AI)
- Google reCAPTCHA v2
- TOTP / Speakeasy (2FA)

---

## 🚀 Cài Đặt & Chạy Local

### Yêu cầu
- Node.js v18+
- Microsoft SQL Server
- npm

### 1. Clone repository
```bash
git clone https://github.com/Asakura2005/graduation-thesis.git
cd graduation-thesis
```

### 2. Cấu hình Backend
```bash
cd server
```

Tạo file `.env`:
```env
PORT=5001
AES_SECRET_KEY=your_aes_key
JWT_SECRET=your_jwt_secret
TLS_TICKET_KEY=your_tls_key

DB_SERVER=localhost
DB_NAME=eco_test
DB_USER=your_db_user
DB_PASSWORD=your_db_password
DB_TRUST_SERVER_CERTIFICATE=true

RECAPTCHA_SECRET_KEY=your_recaptcha_key
```

Cài dependencies và chạy:
```bash
npm install
node index.js
```

### 3. Cấu hình Frontend
```bash
cd ../client
npm install
npm run dev
```

### 4. Truy cập
- **Local:** http://localhost:3000
- **Public (ngrok):** https://bethany-phonatory-dominica.ngrok-free.dev

---

## ⚡ Khởi động nhanh (Windows)

Double-click file **`start.bat`** tại thư mục gốc để tự động bật toàn bộ hệ thống.

---

## 🔐 Tài Khoản Demo

| Vai trò | Username | Password |
|---------|----------|----------|
| Admin | `admin` | *(liên hệ tác giả)* |
| Staff | `staff01` | *(liên hệ tác giả)* |

---

## 📁 Cấu Trúc Dự Án

```
graduation-thesis/
├── client/                 # React Frontend
│   ├── src/
│   │   ├── admin/          # Trang quản trị
│   │   ├── layout/         # Dashboard, Sidebar
│   │   ├── security/       # Login, Register
│   │   └── ...
│   └── vite.config.js
├── server/                 # Node.js Backend
│   ├── index.js            # Entry point (2800+ dòng)
│   ├── AnomalyDetectionService.js  # AI Security
│   ├── EncryptionService.js        # AES-256-GCM
│   └── ...
├── start.bat               # Script khởi động nhanh
└── README.md
```

---

## 👨‍💻 Tác Giả

**Trần Tiến Hưng**  
Đồ Án Tốt Nghiệp — 2026  
GitHub: [@Asakura2005](https://github.com/Asakura2005)

---

## 📄 License

MIT License — Dự án học thuật, không sử dụng cho mục đích thương mại.
