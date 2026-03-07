import React, { useState, useEffect } from "react";
import { Package, ArrowRight, Search, RefreshCcw } from "lucide-react";
import axios from "axios";
import LoginPage from "./security/LoginPage";
import RegisterPage from "./security/RegisterPage";
import ShipmentForm from "./ShipmentForm";
import ShipmentDetails from "./ShipmentDetails";
import PartnerForm from "./admin/PartnerForm";
import InventoryManagement from "./admin/InventoryManagement";
import AuditLogViewer from "./admin/AuditLogViewer";
import AISecurityMonitor from "./admin/AISecurityMonitor";
import Header from "./layout/Header";
import Sidebar from "./layout/Sidebar";
import DashboardStats from "./layout/DashboardStats";
import ProfileSettings from "./layout/ProfileSettings";
import TrackingPage from "./TrackingPage";
import TransportChart from "./layout/TransportChart";
import BlockchainStatus from "./layout/BlockchainStatus";
import Footer from "./layout/Footer";
import { useLanguage } from "./i18n/LanguageContext";

const App = () => {
  const { t } = useLanguage();
  // 1. Intercept for public Tracking Page BEFORE Auth
  const currentPath = window.location.pathname;
  if (currentPath.startsWith("/tracking/")) {
    const trackingNumber = currentPath.split("/")[2];
    return <TrackingPage trackingNumber={trackingNumber} />;
  }
  const [user, setUser] = useState(null);
  const [authMode, setAuthMode] = useState("login");
  const [initialCheck, setInitialCheck] = useState(true); // Need to wait before forcing login
  const [activeTab, setActiveTab] = useState("dashboard");
  const [shipments, setShipments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [showPartnerForm, setShowPartnerForm] = useState(false);
  const [showLogs, setShowLogs] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);

  const shipmentsPerPage = 10;
  const indexOfLast = currentPage * shipmentsPerPage;
  const indexOfFirst = indexOfLast - shipmentsPerPage;

  const currentShipments = shipments.slice(indexOfFirst, indexOfLast);

  // New state for details view
  const [selectedShipment, setSelectedShipment] = useState(null);

  // Xử lý Active Tab trực tiếp khi bấm Sidebar hoặc thoát detail
  useEffect(() => {
    if (activeTab === "audit") setShowLogs(true);
    if (activeTab === "partners") setShowPartnerForm(true);
    // Reset selection when changing tabs
    if (activeTab !== "dashboard" && activeTab !== "shipments") {
      setSelectedShipment(null);
    }
  }, [activeTab]);

  const fetchShipments = async () => {
    setLoading(true);
    try {
      const response = await axios.get("http://localhost:5001/api/shipments");
      setShipments(response.data);

      // Nếu đang xem chi tiết, update lại thông tin lô hàng đang xem
      if (selectedShipment) {
        const updated = response.data.find(
          (s) => s.shipment_id === selectedShipment.shipment_id,
        );
        if (updated) setSelectedShipment(updated);
      }
    } catch (err) {
      console.error("Lỗi lấy dữ liệu vận đơn:", err);
    } finally {
      setLoading(false);
    }
  };

  // Auto Login Check
  useEffect(() => {
    const verifySession = async () => {
      const token = localStorage.getItem("token");
      if (!token) {
        setInitialCheck(false);
        return;
      }

      try {
        // If there's a token, try to fetch user info to auto-reconnect
        const response = await axios.get("http://localhost:5001/api/auth/me", {
          headers: { Authorization: `Bearer ${token}` },
        });
        setUser(response.data);
      } catch (err) {
        localStorage.removeItem("token");
      } finally {
        setInitialCheck(false);
      }
    };

    verifySession();
  }, []);

  useEffect(() => {
    const interceptor = axios.interceptors.request.use(
      (config) => {
        const token = localStorage.getItem("token");
        if (token) config.headers.Authorization = `Bearer ${token}`;
        return config;
      },
      (error) => Promise.reject(error),
    );

    if (user) fetchShipments();

    return () => axios.interceptors.request.eject(interceptor);
  }, [user]);

  const handleLogout = () => {
    localStorage.removeItem("token");
    setUser(null);
  };

  if (initialCheck) {
    return (
      <div className="d-flex h-100vh w-100 justify-content-center align-items-center bg-black">
        <div className="spinner-border text-gold" />
      </div>
    );
  }

  if (!user) {
    return authMode === "login" ? (
      <LoginPage
        onLoginSuccess={(userData) => setUser(userData)}
        onGoToRegister={() => setAuthMode("register")}
      />
    ) : (
      <RegisterPage onBackToLogin={() => setAuthMode("login")} />
    );
  }

  return (
    <div className="d-flex w-100 vh-100">
      {/* Sidebar Left */}
      <Sidebar
        user={user}
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        onOpenCreateShipment={() => setShowForm(true)}
        onOpenAddPartner={() => setShowPartnerForm(true)}
      />

      {/* Main Content Right */}
      <div
        className="flex-grow-1 d-flex flex-column"
        style={{
          marginLeft: "280px",
          minHeight: "100vh",
        }}
      >
        <Header user={user} handleLogout={handleLogout} setActiveTab={setActiveTab} />

        <main className="flex-grow-1 overflow-auto px-4 pt-3 pb-5 custom-scrollbar">
          {/* Modals & Popups (Chỉ còn ShipmentForm là modal) */}
          {showForm && (
            <ShipmentForm
              onSidebarClose={() => setShowForm(false)}
              onSuccess={fetchShipments}
            />
          )}

          {/* --- MAIN CONTENT AREA --- */}

          {/* 1. Dashboard & Shipments Tab */}
          {(activeTab === "dashboard" || activeTab === "shipments") && (
            <>
              {/* Hiển thị List hoặc Details */}
              {selectedShipment ? (
                <ShipmentDetails
                  shipment={selectedShipment}
                  user={user}
                  onBack={() => setSelectedShipment(null)}
                  onUpdate={fetchShipments}
                />
              ) : (
                <>
                  {activeTab === "dashboard" && (
                    <>
                      <DashboardStats shipments={shipments} />

                      <div className="row g-4 mt-2">
                        <div className="col-lg-8">
                          <TransportChart shipments={shipments} />
                        </div>

                        <div className="col-lg-4">
                          <BlockchainStatus />
                        </div>
                      </div>
                    </>
                  )}

                  <div
                    className="glass p-4 fade-in-up mt-4 shadow-lg border border-secondary border-opacity-10 rounded-4"
                    style={{ minHeight: "420px" }}
                  >
                    <div className="d-flex justify-content-between align-items-center mb-4 flex-wrap gap-3">
                      <h5 className="mb-0 fw-bold d-flex align-items-center gap-2 text-gold">
                        <Package size={20} />
                        {t('dashboard.shipmentList')}
                      </h5>

                      <div className="d-flex gap-2">
                        <input
                          className="form-control form-control-sm bg-dark text-light border-0"
                          placeholder={t('dashboard.searchPlaceholder')}
                          style={{ width: "200px" }}
                        />

                        <button className="btn btn-sm btn-outline-light">
                          {t('dashboard.filter')}
                        </button>

                        <button
                          className="btn btn-sm btn-outline-light"
                          onClick={fetchShipments}
                        >
                          <RefreshCcw size={16} />
                        </button>
                      </div>
                    </div>

                    <div className="table-responsive">
                      <table className="table table-hover align-middle mb-0 border-0">
                        <thead>
                          <tr>
                            <th>{t('dashboard.trackingCode')}</th>
                            <th>{t('dashboard.carrier')}</th>
                            <th>{t('dashboard.route')}</th>
                            <th>{t('dashboard.value')}</th>
                            <th>{t('dashboard.status')}</th>
                            <th className="text-end">{t('dashboard.actions')}</th>
                          </tr>
                        </thead>
                        <tbody>
                          {loading ? (
                            <tr>
                              <td colSpan="6" className="text-center py-5">
                                {t('dashboard.loading')}
                              </td>
                            </tr>
                          ) : shipments.length === 0 ? (
                            <tr>
                              <td colSpan="6" className="text-center py-5">
                                {t('dashboard.empty')}
                              </td>
                            </tr>
                          ) : (
                            currentShipments.map((s) => (
                              <tr key={s.shipment_id}>
                                <td>
                                  <div className="fw-bold text-white">
                                    {s.tracking_number}
                                  </div>
                                  <div className="text-dim x-small">
                                    Date:{" "}
                                    {new Date(
                                      s.shipment_date,
                                    ).toLocaleDateString()}
                                  </div>
                                </td>
                                <td>
                                  <div className="fw-semibold text-gold">
                                    {s.logistics_name}
                                  </div>
                                </td>
                                <td>
                                  <div className="small d-flex align-items-center gap-2">
                                    <span className="text-white">
                                      {s.origin_address}
                                    </span>
                                    <ArrowRight
                                      size={12}
                                      className="text-dim"
                                    />
                                    <span className="text-white">
                                      {s.destination_address}
                                    </span>
                                  </div>
                                </td>
                                <td className="fw-bold text-gold">
                                  {user.role === "Admin"
                                    ? `$${parseFloat(s.total_value).toLocaleString()}`
                                    : "••••"}
                                </td>
                                <td>
                                  <span
                                    className={`badge rounded-pill px-3 py-2 ${s.status === "Delivered"
                                      ? "bg-success bg-opacity-25 text-success"
                                      : s.status === "In Transit"
                                        ? "bg-warning bg-opacity-25 text-warning"
                                        : "bg-danger bg-opacity-25 text-danger"
                                      }`}
                                  >
                                    {s.status}
                                  </span>
                                </td>
                                <td className="text-end">
                                  <button
                                    className="btn btn-sm btn-dark rounded-circle"
                                    onClick={() => setSelectedShipment(s)}
                                    title="Xem chi tiết"
                                  >
                                    <Search size={16} />
                                  </button>
                                </td>
                              </tr>
                            ))
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {/* Pagination Footer */}
                  <div className="d-flex justify-content-between align-items-center mt-3 small text-dim">
                    <span>
                      {t('dashboard.showing')} {indexOfFirst + 1} –{" "}
                      {Math.min(indexOfLast, shipments.length)} /{" "}
                      {shipments.length}
                    </span>

                    <div className="d-flex gap-2">
                      <button
                        className={`btn btn-sm ${currentPage === 1
                          ? "btn-outline-secondary"
                          : "btn-warning text-dark"
                          }`}
                        disabled={currentPage === 1}
                        onClick={() => setCurrentPage(currentPage - 1)}
                      >
                        {t('dashboard.prevPage')}
                      </button>

                      <button
                        className={`btn btn-sm ${indexOfLast >= shipments.length
                          ? "btn-outline-secondary"
                          : "btn-warning text-dark"
                          }`}
                        disabled={indexOfLast >= shipments.length}
                        onClick={() => setCurrentPage(currentPage + 1)}
                      >
                        {t('dashboard.nextPage')}
                      </button>
                    </div>
                  </div>
                </>
              )}
            </>
          )}

          {/* 2. Partners Tab */}
          {activeTab === "partners" && <PartnerForm />}

          {/* 3. Inventory Tab */}
          {activeTab === "inventory" && <InventoryManagement />}

          {/* 4. Audit Logs Tab */}
          {activeTab === "audit" && <AuditLogViewer />}

          {/* 5. AI Security Monitor Tab */}
          {activeTab === "ai-security" && <AISecurityMonitor />}

          {/* 6. Settings & Profile Tab */}
          {activeTab === "settings" && <ProfileSettings user={user} />}
        </main>
        <Footer />
      </div>
    </div>
  );
};

export default App;
