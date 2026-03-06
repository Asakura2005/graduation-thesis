# TÀI LIỆU THIẾT KẾ CẤP CAO (HIGH-LEVEL DESIGN - HLD)
## Dự án: Hệ thống Quản lý Chuỗi cung ứng Bảo mật (Secure Supply Chain Management System - SCMS)

---

## 1. Giới thiệu tổng quan
Hệ thống Quản lý Chuỗi cung ứng Bảo mật (SCMS) là giải pháp phần mềm được thiết kế để quản lý các quy trình trong chuỗi cung ứng như đối tác, hàng hóa, và vận đơn. Điểm nổi bật của hệ thống là khả năng bảo mật dữ liệu nhạy cảm bằng công nghệ mã hóa tiên tiến, đảm bảo tính toàn vẹn và quyền riêng tư của thông tin doanh nghiệp.

## 2. Mục tiêu hệ thống
- Quản lý thông tin đối tác (nhà cung cấp, đơn vị vận chuyển).
- Quản lý hàng hóa và tồn kho.
- Theo dõi quá trình vận chuyển (vận đơn).
- **Bảo mật tuyệt đối**: Mã hóa các thông tin nhạy cảm (PII, chi phí, địa chỉ) trước khi lưu trữ vào cơ sở dữ liệu.
- Lưu vết hoạt động hệ thống qua nhật ký kiểm toán (Audit Logs).

## 3. Kiến trúc tổng quan
Hệ thống sử dụng mô hình kiến trúc **Client-Server (3-Tier Architecture)**, chia tách rõ ràng giữa giao diện người dùng, logic xử lý và lưu trữ dữ liệu.

### 3.1. Sơ đồ kiến trúc (Conceptual Model)
1.  **Presentation Tier (Frontend)**: React.js App chạy trên trình duyệt của người dùng.
2.  **Application Tier (Backend)**: Express API (Node.js) xử lý các yêu cầu nghiệp vụ và mã hóa dữ liệu.
3.  **Data Tier (Database)**: Microsoft SQL Server lưu trữ dữ liệu đã được mã hóa.

### 3.2. Mô hình giao tiếp
- **Giao thức**: HTTPS / RESTful API.
- **Định dạng dữ liệu**: JSON.
- **Xác thực**: JSON Web Token (JWT) được sử dụng để duy trì phiên làm việc bảo mật giữa Client và Server.

---

## 4. Các thành phần chính của hệ thống

### 4.1. Client (Frontend)
- **Công nghệ**: React.js (Vite), Bootstrap (UI), Lucid React (Icons).
- **Chức năng**:
    - Hiển thị giao diện Dashboard quản lý.
    - Quản lý trạng thái người dùng (Login/Logout).
    - Tương tác với API để hiển thị và cập nhật dữ liệu.
    - Phản hồi chuyển động mượt mà với Framer Motion.

### 4.2. Server (Backend)
- **Công nghệ**: Node.js, Express.js.
- **Chức năng**:
    - Xử lý các Endpoint API (`/api/auth`, `/api/partners`, `/api/shipments`, ...).
    - **Security Service**: Thực hiện mã hóa AES-256-GCM cho dữ liệu đầu vào và giải mã cho dữ liệu đầu ra.
    - **Authentication**: Xác thực người dùng bằng Argon2/Bcrypt và cấp phát JWT.
    - Kết nối và truy vấn cơ sở dữ liệu qua thư viện `mssql`.

### 4.3. Database (Cơ sở dữ liệu)
- **Công nghệ**: Microsoft SQL Server.
- **Cấu trúc lưu trữ**:
    - Dữ liệu thông thường (ID, ngày tháng, số lượng) lưu trữ dạng bản rõ.
    - Dữ liệu nhạy cảm (Tên, Email, Chi phí, Vị trí) lưu trữ dưới dạng chuỗi đã mã hóa: `iv:authTag:ciphertext`.

---

## 5. Cơ chế Bảo mật và Công nghệ

### 5.1. Mã hóa dữ liệu (Encryption)
- **Thuật toán**: **AES-256-GCM** (Advanced Encryption Standard in Galois/Counter Mode).
- **Đặc điểm**: Cung cấp khả năng mã hóa mạnh mẽ kèm theo xác thực dữ liệu (AEAD), ngăn chặn việc giả mạo dữ liệu trong DB.
- **Phạm vi mã hóa**:
    - Thông tin cá nhân (PII): Tên, Email, Điện thoại.
    - Thông tin kinh doanh: Giá vốn, Địa chỉ vận chuyển, Số vận đơn (Tracking number).

### 5.2. Công nghệ bảo mật bổ sung
- **Hasing**: Sử dụng Argon2 hoặc Bcrypt để băm mật khẩu, đảm bảo không thể khôi phục mật khẩu gốc.
- **Email Hashing**: Sử dụng SHA-256 để băm email phục vụ việc tìm kiếm nhanh mà không cần giải mã toàn bộ bảng.
- **Helmet.js**: Cung cấp các HTTP header bảo mật để chống lại các cuộc tấn công web phổ biến (XSS, Clickjacking).

---

## 6. Luồng dữ liệu (Data Flow)

1.  **Người dùng** nhập dữ liệu vào Form trên React UI (ví dụ: Tạo vận đơn mới).
2.  **Frontend** gửi yêu cầu POST JSON chứa dữ liệu bản rõ đến **Backend API**.
3.  **Backend** nhận dữ liệu, kiểm tra quyền hạn (JWT).
4.  **Encryption Service** tại Backend thực hiện mã hóa các trường nhạy cảm bằng Secret Key.
5.  **Backend** gọi truy vấn SQL để lưu dữ liệu đã mã hóa vào **SQL Server**.
6.  Khi **Người dùng** xem thông tin, quy trình ngược lại được thực hiện: Backend lấy dữ liệu mã hóa từ DB -> Giải mã -> Gửi bản rõ về Frontend.

---

## 7. Danh mục công nghệ (Tech Stack)

| Thành phần | Công nghệ sử dụng |
| :--- | :--- |
| **Frontend Framework** | React.js (v18+) |
| **Build Tool** | Vite |
| **Style & UI** | Bootstrap 5, Lucide Icons, Framer Motion |
| **Backend Environment** | Node.js |
| **API Framework** | Express.js |
| **Database** | Microsoft SQL Server |
| **Authentications** | JWT, Argon2/Bcrypt |
| **Cryptography** | AES-256-GCM (Node.js Crypto module) |
| **HTTP Client** | Axios |

---
*Tài liệu này phục vụ cho mục đích mô tả kiến trúc tổng quát của đồ án tốt nghiệp.*
