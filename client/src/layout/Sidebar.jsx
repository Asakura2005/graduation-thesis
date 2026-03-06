import React from "react";
import {
  LayoutDashboard,
  Truck,
  Users,
  Activity,
  Plus,
  Box,
  Settings,
} from "lucide-react";

const Sidebar = ({ user, activeTab, setActiveTab, onOpenCreateShipment }) => {
  const isAdmin = user?.role === "Admin";

  const navBtn = (tabKey, Icon, label) => (
    <button
      key={tabKey}
      className={`btn d-flex align-items-center gap-3 py-3 px-3 border-0 text-start transition-all w-100
                ${activeTab === tabKey ? "btn-gold text-black shadow" : "text-dim hover-light"}`}
      onClick={() => setActiveTab(tabKey)}
    >
      <Icon size={20} />
      <span className="fw-semibold">{label}</span>
    </button>
  );

  return (
    <div
      className="d-flex flex-column p-3 glass border-0 rounded-0"
      style={{
        width: "280px",
        position: "fixed",
        left: 0,
        top: 0,
        height: "100vh",
        zIndex: 1000,
      }}
    >
      {/* Brand */}
      <div className="d-flex align-items-center gap-3 px-2 mb-4 mt-2">
        <Box size={32} className="text-gold" />
        <div>
          <h5 className="mb-0 fw-bold text-white">
            <span className="text-gold">Secure</span>Chain
          </h5>
          <span className="text-dim x-small">Enterprise Dashboard</span>
        </div>
      </div>

      {/* Menu */}
      <div className="nav flex-column gap-2">
        {navBtn("dashboard", LayoutDashboard, "Bảng điều khiển")}
        {navBtn("shipments", Truck, "Quản lý Vận đơn")}

        {/* Các mục này trong mẫu có luôn, nhưng bạn vẫn có thể giới hạn cho Admin */}
        {isAdmin && (
          <>
            {navBtn("partners", Users, "Đối tác & NCC")}
            {navBtn("inventory", Box, "Quản lý Kho hàng")}
            {navBtn("audit", Activity, "Nhật ký Hệ thống")}
          </>
        )}
      </div>

      {/* Bottom actions */}
      <div className="mt-auto pt-3">
        <button
          className="btn btn-outline-gold w-100 py-3 d-flex align-items-center justify-content-center gap-2"
          onClick={onOpenCreateShipment}
        >
          <Plus size={20} />
          <span className="fw-bold">Tạo Vận đơn</span>
        </button>

        <button
          className="btn w-100 py-3 mt-2 d-flex align-items-center justify-content-center gap-2 text-dim hover-light border-0"
          onClick={() => setActiveTab("settings")}
        >
          <Settings size={18} />
          <span className="fw-semibold">Cài đặt</span>
        </button>
      </div>
    </div>
  );
};

export default Sidebar;
