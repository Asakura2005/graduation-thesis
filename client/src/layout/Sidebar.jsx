import React from "react";
import {
  LayoutDashboard,
  Truck,
  Users,
  Activity,
  Plus,
  Box,
  Settings,
  Brain,
} from "lucide-react";
import { useLanguage } from "../i18n/LanguageContext";

const Sidebar = ({ user, activeTab, setActiveTab, onOpenCreateShipment }) => {
  const { t } = useLanguage();
  const isAdmin = user?.role === "Admin";
  const isManager = user?.role === "Manager";
  const isStaff = user?.role === "Staff";
  const isWarehouse = user?.role === "Warehouse";

  const canViewShipments = isAdmin || isManager || isStaff || isWarehouse;
  const canViewInventory = isAdmin || isManager || isWarehouse;
  const canViewPartners = isAdmin || isManager;

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
        {navBtn("dashboard", LayoutDashboard, t('sidebar.dashboard'))}
        
        {canViewShipments && navBtn("shipments", Truck, t('sidebar.shipments'))}
        {isWarehouse && navBtn("shipment-approval", Truck, t('sidebar.shipmentApproval'))}
        {canViewPartners && navBtn("partners", Users, t('sidebar.partners'))}
        {canViewInventory && navBtn("inventory", Box, t('sidebar.inventory'))}

        {isAdmin && (
          <>
            {navBtn("account-approval", Users, t('sidebar.accountApproval'))}
            {navBtn("audit", Activity, t('sidebar.audit'))}
            {navBtn("ai-security", Brain, t('sidebar.aiSecurity') || 'AI Security')}
          </>
        )}
      </div>

      {/* Bottom actions */}
      <div className="mt-auto pt-3">
        {canViewShipments && !isWarehouse && (
          <button
            className="btn btn-outline-gold w-100 py-3 d-flex align-items-center justify-content-center gap-2"
            onClick={onOpenCreateShipment}
          >
            <Plus size={20} />
            <span className="fw-bold">{t('sidebar.shipments')}</span>
          </button>
        )}

        <button
          className="btn w-100 py-3 mt-2 d-flex align-items-center justify-content-center gap-2 text-dim hover-light border-0"
          onClick={() => setActiveTab("settings")}
        >
          <Settings size={18} />
          <span className="fw-semibold">{t('sidebar.settings')}</span>
        </button>
      </div>
    </div>
  );
};

export default Sidebar;
