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

const Sidebar = ({ user, activeTab, setActiveTab, onOpenCreateShipment, sidebarOpen, setSidebarOpen }) => {
  const { t } = useLanguage();
  const isAdmin = user?.role === "Admin";
  const isManager = user?.role === "Manager";
  const isStaff = user?.role === "Staff";
  const isWarehouse = user?.role === "Warehouse";

  const canViewShipments = isAdmin || isManager || isStaff || isWarehouse;
  const canViewInventory = isAdmin || isManager || isWarehouse;
  const canViewPartners = isAdmin || isManager;

  const handleNavClick = (tabKey) => {
    setActiveTab(tabKey);
    setSidebarOpen(false);
  };

  const navBtn = (tabKey, Icon, label) => (
    <button
      key={tabKey}
      className={`btn d-flex align-items-center gap-3 py-3 px-3 border-0 text-start transition-all w-100
                ${activeTab === tabKey ? "btn-gold text-black shadow" : "text-dim hover-light"}`}
      onClick={() => handleNavClick(tabKey)}
    >
      <Icon size={20} />
      <span className="fw-semibold">{label}</span>
    </button>
  );

  return (
    <>
      {/* Overlay backdrop */}
      {sidebarOpen && (
        <div className="sidebar-overlay" onClick={() => setSidebarOpen(false)} />
      )}

      {/* Sidebar panel */}
      <div className={`sidebar-panel d-flex flex-column p-3 glass border-0 rounded-0 ${sidebarOpen ? 'sidebar-open' : ''}`}>
        {/* Close button */}
        <div className="d-flex justify-content-end mb-2">
          <button
            className="sidebar-close-btn"
            onClick={() => setSidebarOpen(false)}
            aria-label="Close sidebar"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
              <path d="M18.707 6.707a1 1 0 0 0-1.414-1.414L12 10.586 6.707 5.293a1 1 0 0 0-1.414 1.414L10.586 12l-5.293 5.293a1 1 0 1 0 1.414 1.414L12 13.414l5.293 5.293a1 1 0 0 0 1.414-1.414L13.414 12z" />
            </svg>
          </button>
        </div>

        {/* Brand / Logo */}
        <div className="d-flex align-items-center gap-3 px-2 mb-4">
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
              onClick={() => { onOpenCreateShipment(); setSidebarOpen(false); }}
            >
              <Plus size={20} />
              <span className="fw-bold">{t('sidebar.shipments')}</span>
            </button>
          )}
          <button
            className="btn w-100 py-3 mt-2 d-flex align-items-center justify-content-center gap-2 text-dim hover-light border-0"
            onClick={() => handleNavClick("settings")}
          >
            <Settings size={18} />
            <span className="fw-semibold">{t('sidebar.settings')}</span>
          </button>
        </div>
      </div>
    </>
  );
};

export default Sidebar;
