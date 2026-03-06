# Kế hoạch Cải cấu trúc Giao diện Dashboard (New Layout)

## Mục tiêu
Chuyển đổi giao diện hiện tại sang mô hình **Dashboard chuyên nghiệp** với Sidebar bên trái và Header cố định bên trên.

## Cấu trúc Giao diện Mới
1.  **Sidebar (Thanh bên trái)**:
    *   **Vị trí**: Cố định bên trái (Fixed Left), chiều cao 100vh.
    *   **Chức năng**: Chứa các menu điều hướng chính.
        *   Dashboard (Mặc định)
        *   Quản lý Vận đơn (Shipments)
        *   Đối tác (Partners) - *Admin Only*
        *   Nhật ký Hệ thống (Audit Logs) - *Admin Only*
        *   Tạo Vận đơn (Create Shipment) - *Nút nổi bật*

2.  **Top Header (Thanh trên cùng)**:
    *   **Vị trí**: Cố định bên trên (Fixed Top), kéo dài toàn màn hình (trừ phần Sidebar).
    *   **Chức năng**:
        *   Logo / Tên ứng dụng (Có thể để ở Sidebar hoặc góc trái Header).
        *   Thông tin User (Avatar, Tên).
        *   Dropdown Menu: Profile, Settings, Đăng xuất (Logout).

3.  **Main Content (Nội dung chính)**:
    *   Nằm bên phải Sidebar và dưới Header.
    *   Hiển thị nội dung tương ứng khi chọn menu.

## Các bước thực hiện
1.  **Tạo Component `Sidebar.jsx`**:
    *   Sử dụng `lucide-react` cho các icon.
    *   Logic active state cho menu.
2.  **Cập nhật Component `Header.jsx`**:
    *   Loại bỏ các nút chức năng cũ.
    *   Thêm User Profile Dropdown (Bootstrap Dropdown).
3.  **Cập nhật `App.jsx`**:
    *   Thiết lập Layout Grid/Flexbox: `d-flex`.
    *   Kết nối State giữa Sidebar và các Form (PartnerForms, Logs).
4.  **Cập nhật CSS**:
    *   Đảm bảo Sidebar cố định và Content scroll độc lập.

## Demo Layout code
```jsx
<div className="d-flex h-100vh">
   <Sidebar />
   <div className="flex-grow-1 d-flex flex-column">
      <Header />
      <MainContent className="overflow-auto" />
   </div>
</div>
```
