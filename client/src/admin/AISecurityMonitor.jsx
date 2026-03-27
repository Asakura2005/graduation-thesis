import React, { useState, useEffect, useCallback } from "react";
import {
  Shield,
  ShieldAlert,
  ShieldCheck,
  ShieldX,
  Brain,
  Activity,
  AlertTriangle,
  Ban,
  UserCheck,
  Clock,
  Globe,
  Monitor,
  TrendingUp,
  Eye,
  RefreshCcw,
  ChevronDown,
  ChevronUp,
  Zap,
  Lock,
  Unlock,
  Users,
  BarChart3,
  XCircle,
} from "lucide-react";
import axios from "axios";
import { useLanguage } from "../i18n/LanguageContext";

const API = "";

// =====================================================
//  SUB-COMPONENTS
// =====================================================

// Stat Card Component
const StatCard = ({ icon: Icon, label, value, color, subtext, pulse }) => (
  <div
    className="glass p-3 rounded-4 border border-secondary border-opacity-10 position-relative overflow-hidden"
    style={{
      background: `linear-gradient(135deg, rgba(${color}, 0.08) 0%, rgba(${color}, 0.02) 100%)`,
    }}
  >
    {pulse && (
      <div
        className="position-absolute"
        style={{
          top: 8,
          right: 8,
          width: 8,
          height: 8,
          borderRadius: "50%",
          background: `rgb(${color})`,
          animation: "pulse 2s infinite",
        }}
      />
    )}
    <div className="d-flex align-items-center gap-3">
      <div
        className="d-flex align-items-center justify-content-center rounded-3"
        style={{
          width: 48,
          height: 48,
          background: `rgba(${color}, 0.15)`,
        }}
      >
        <Icon size={22} style={{ color: `rgb(${color})` }} />
      </div>
      <div>
        <div className="text-dim small fw-semibold">{label}</div>
        <div className="fs-4 fw-bold text-white">{value}</div>
        {subtext && (
          <div className="text-dim" style={{ fontSize: "0.7rem" }}>
            {subtext}
          </div>
        )}
      </div>
    </div>
  </div>
);

// Risk Level Badge
const RiskBadge = ({ score, labels }) => {
  let color, label;
  if (score >= 70) {
    color = "#ff4757";
    label = labels?.critical || "CRITICAL";
  } else if (score >= 40) {
    color = "#ffa502";
    label = labels?.warning || "WARNING";
  } else if (score >= 20) {
    color = "#2ed573";
    label = labels?.low || "LOW";
  } else {
    color = "#7bed9f";
    label = labels?.safe || "SAFE";
  }

  return (
    <span
      className="badge rounded-pill px-2 py-1 fw-bold"
      style={{
        background: `${color}22`,
        color: color,
        border: `1px solid ${color}44`,
        fontSize: "0.65rem",
      }}
    >
      {score} � {label}
    </span>
  );
};

// Risk Distribution Bar
const RiskDistributionBar = ({ data }) => {
  const total = data.reduce((s, d) => s + d.count, 0) || 1;
  const colors = {
    SAFE: "#7bed9f",
    LOW: "#2ed573",
    MEDIUM: "#ffa502",
    HIGH: "#ff4757",
  };
  const order = ["SAFE", "LOW", "MEDIUM", "HIGH"];

  return (
    <div>
      <div
        className="d-flex rounded-pill overflow-hidden"
        style={{ height: 12 }}
      >
        {order.map((level) => {
          const item = data.find((d) => d.riskLevel === level);
          const pct = item ? (item.count / total) * 100 : 0;
          return (
            <div
              key={level}
              style={{
                width: `${pct}%`,
                background: colors[level],
                transition: "width 0.8s ease",
                minWidth: pct > 0 ? "4px" : "0",
              }}
            />
          );
        })}
      </div>
      <div className="d-flex justify-content-between mt-2">
        {order.map((level) => {
          const item = data.find((d) => d.riskLevel === level);
          return (
            <div key={level} className="d-flex align-items-center gap-1">
              <div
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: "50%",
                  background: colors[level],
                }}
              />
              <span
                className="text-dim"
                style={{ fontSize: "0.65rem", fontWeight: 600 }}
              >
                {level}: {item?.count || 0}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
};

// Hourly Activity Chart (Mini Bar Chart in pure CSS)
const HourlyChart = ({ data }) => {
  const maxAttempts = Math.max(...data.map((d) => d.attempts), 1);

  return (
    <div className="d-flex align-items-end gap-1" style={{ height: 100 }}>
      {Array.from({ length: 24 }, (_, h) => {
        const hourData = data.find((d) => d.hour === h);
        const attempts = hourData?.attempts || 0;
        const failures = hourData?.failures || 0;
        const blocks = hourData?.blocks || 0;
        const height = (attempts / maxAttempts) * 100;

        let color = "#2ed573";
        if (blocks > 0) color = "#ff4757";
        else if (failures > attempts / 2) color = "#ffa502";

        return (
          <div
            key={h}
            className="flex-grow-1 position-relative"
            style={{ height: "100%" }}
            title={`${h}:00 - ${attempts} attempts, ${failures} failures, ${blocks} blocks`}
          >
            <div
              className="position-absolute bottom-0 w-100 rounded-top"
              style={{
                height: `${Math.max(height, 2)}%`,
                background: `${color}88`,
                transition: "height 0.6s ease",
                cursor: "pointer",
              }}
            />
            {h % 6 === 0 && (
              <div
                className="text-dim position-absolute w-100 text-center"
                style={{ bottom: -16, fontSize: "0.55rem" }}
              >
                {h}h
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
};

// Ban Duration Selector
const BanDurationSelect = ({ value, onChange }) => (
  <select
    className="form-select form-select-sm bg-dark text-light border-secondary"
    value={value}
    onChange={(e) => onChange(parseInt(e.target.value))}
    style={{ width: 180 }}
  >
    <option value={15}>15 phút</option>
    <option value={60}>1 giờ</option>
    <option value={360}>6 giờ</option>
    <option value={1440}>24 giờ</option>
    <option value={10080}>7 ngày</option>
    <option value={-1}>Vĩnh viễn</option>
  </select>
);

// =====================================================
//  MAIN COMPONENT
// =====================================================
const AISecurityMonitor = () => {
  const { t } = useLanguage();
  const [activeSubTab, setActiveSubTab] = useState("overview");
  const [analytics, setAnalytics] = useState(null);
  const [alerts, setAlerts] = useState([]);
  const [allUsers, setAllUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [expandedAlert, setExpandedAlert] = useState(null);
  const [banDuration, setBanDuration] = useState(60);
  const [banReason, setBanReason] = useState("");
  const [showBanModal, setShowBanModal] = useState(null);
  const [actionLoading, setActionLoading] = useState(null);
  const [notification, setNotification] = useState(null);

  // Fetch data
  const fetchData = useCallback(async () => {
    try {
      setRefreshing(true);
      const token = localStorage.getItem("token");
      const headers = { Authorization: `Bearer ${token}` };

      const [analyticsRes, alertsRes, usersRes] = await Promise.all([
        axios.get(`${API}/api/ai/analytics`, { headers }),
        axios.get(`${API}/api/ai/alerts`, { headers }),
        axios.get(`${API}/api/ai/all-users`, { headers }),
      ]);

      setAnalytics(analyticsRes.data);
      setAlerts(alertsRes.data);
      setAllUsers(usersRes.data);
    } catch (err) {
      console.error("AI Security Monitor fetch error:", err);
      showNotification("error", "Không thể tải dữ liệu AI Security");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
    // Auto-refresh every 30 seconds
    const interval = setInterval(fetchData, 30000);
    return () => clearInterval(interval);
  }, [fetchData]);

  const showNotification = (type, msg) => {
    setNotification({ type, msg });
    setTimeout(() => setNotification(null), 4000);
  };

  // Actions
  const handleUnban = async (userId, username) => {
    if (
      !window.confirm(`Bạn có chắc muốn gỡ ban cho user "${username}"?`)
    )
      return;
    setActionLoading(userId);
    try {
      const token = localStorage.getItem("token");
      await axios.post(
        `${API}/api/ai/unban/${userId}`,
        { resetCount: false },
        { headers: { Authorization: `Bearer ${token}` } },
      );
      showNotification(
        "success",
        `✅ Đã gỡ ban cho ${username} thành công!`,
      );
      fetchData();
    } catch (err) {
      showNotification("error", `Lỗi gỡ ban: ${err.message}`);
    } finally {
      setActionLoading(null);
    }
  };

  const handleBan = async (userId) => {
    setActionLoading(userId);
    try {
      const token = localStorage.getItem("token");
      await axios.post(
        `${API}/api/ai/manual-ban/${userId}`,
        { duration: banDuration, reason: banReason || "Admin manual ban" },
        { headers: { Authorization: `Bearer ${token}` } },
      );
      showNotification(
        "success",
        `🛡️ Đã ban user thành công! (${banDuration === -1 ? "Vĩnh viễn" : `${banDuration} phút`})`,
      );
      setShowBanModal(null);
      setBanReason("");
      fetchData();
    } catch (err) {
      showNotification("error", `Lỗi ban user: ${err.message}`);
    } finally {
      setActionLoading(null);
    }
  };

  if (loading) {
    return (
      <div className="d-flex flex-column align-items-center justify-content-center py-5">
        <div className="spinner-border text-warning mb-3" />
        <div className="text-dim">{t('ai.loading')}</div>
      </div>
    );
  }

  const riskLabels = {
    critical: t('ai.riskCritical'),
    warning: t('ai.riskWarning'),
    low: t('ai.riskLow'),
    safe: t('ai.riskSafe'),
  };

  const stats24h = analytics?.stats || {};

  return (
    <div className="fade-in-up">
      {/* Notification */}
      {notification && (
        <div
          className={`alert ${notification.type === "success" ? "alert-success" : "alert-danger"} alert-dismissible fade show position-fixed`}
          style={{ top: 20, right: 20, zIndex: 9999, maxWidth: 400 }}
        >
          {notification.msg}
          <button
            className="btn-close"
            onClick={() => setNotification(null)}
          />
        </div>
      )}

      {/* Page Header */}
      <div className="d-flex justify-content-between align-items-center mb-4">
        <div>
          <h4 className="fw-bold text-white d-flex align-items-center gap-2 mb-1">
            <Brain size={28} className="text-warning" />
            <span>
              AI <span className="text-gold">Security Monitor</span>
            </span>
          </h4>
          <p className="text-dim mb-0 small">
            {t('ai.subtitle')}
          </p>
        </div>

        <div className="d-flex align-items-center gap-2">
          <span
            className="badge rounded-pill px-3 py-2"
            style={{
              background:
                analytics?.config?.autoBanEnabled
                  ? "rgba(46,213,115,0.15)"
                  : "rgba(255,71,87,0.15)",
              color: analytics?.config?.autoBanEnabled
                ? "#2ed573"
                : "#ff4757",
              border: `1px solid ${analytics?.config?.autoBanEnabled ? "#2ed57344" : "#ff475744"}`,
            }}
          >
            <Zap size={12} className="me-1" />
            {analytics?.config?.autoBanEnabled ? t('ai.autoBanActive') : t('ai.autoBanOff')}
          </span>

          <button
            className="btn btn-sm btn-outline-warning d-flex align-items-center gap-1"
            onClick={fetchData}
            disabled={refreshing}
          >
            <RefreshCcw
              size={14}
              className={refreshing ? "spin-animation" : ""}
            />
            {t('ai.refresh')}
          </button>
        </div>
      </div>

      {/* Sub Navigation Tabs */}
      <div className="d-flex gap-2 mb-4 flex-wrap">
        {[
          { key: "overview", icon: BarChart3, label: t('ai.overview') },
          { key: "alerts", icon: AlertTriangle, label: t('ai.alerts') },
          { key: "users", icon: Users, label: t('ai.users') },
        ].map(({ key, icon: Icon, label }) => (
          <button
            key={key}
            className={`btn d-flex align-items-center gap-2 px-3 py-2 rounded-3 border-0 transition-all ${
              activeSubTab === key
                ? "btn-warning text-dark fw-bold shadow"
                : "btn-dark text-dim"
            }`}
            onClick={() => setActiveSubTab(key)}
          >
            <Icon size={16} />
            {label}
            {key === "alerts" && alerts.length > 0 && (
              <span
                className="badge rounded-pill ms-1"
                style={{
                  background: "#ff4757",
                  color: "white",
                  fontSize: "0.6rem",
                }}
              >
                {alerts.length}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* =====================================================
           TAB 1: OVERVIEW
         ===================================================== */}
      {activeSubTab === "overview" && (
        <>
          {/* Stat Cards Row */}
          <div className="row g-3 mb-4">
            <div className="col-lg-3 col-md-6">
              <StatCard
                icon={Activity}
                label={t('ai.totalLogins')}
                value={stats24h.totalAttempts || 0}
                color="45,135,255"
                subtext={`${stats24h.successCount || 0} thành công`}
              />
            </div>
            <div className="col-lg-3 col-md-6">
              <StatCard
                icon={ShieldX}
                label={t('ai.blocked')}
                value={stats24h.blockedCount || 0}
                color="255,71,87"
                pulse={stats24h.blockedCount > 0}
                subtext={`${stats24h.failCount || 0} thất bại`}
              />
            </div>
            <div className="col-lg-3 col-md-6">
              <StatCard
                icon={Ban}
                label={t('ai.bannedUsers')}
                value={analytics?.bannedUsersCount || 0}
                color="255,165,2"
                pulse={analytics?.bannedUsersCount > 0}
                subtext={`${analytics?.bannedUsersCount || 0} tài khoản`}
              />
            </div>
            <div className="col-lg-3 col-md-6">
              <StatCard
                icon={TrendingUp}
                label={t('ai.avgRisk')}
                value={Math.round(stats24h.avgRiskScore || 0)}
                color="46,213,115"
                subtext={`Max: ${stats24h.maxRiskScore || 0}`}
              />
            </div>
          </div>

          {/* Charts Row */}
          <div className="row g-3 mb-4">
            {/* Hourly Activity */}
            <div className="col-lg-8">
              <div className="glass p-4 rounded-4 border border-secondary border-opacity-10 h-100">
                <h6 className="text-white fw-bold d-flex align-items-center gap-2 mb-3">
                  <Clock size={16} className="text-warning" />
                  {t('ai.hourlyChart')}
                </h6>
                <HourlyChart data={analytics?.hourlyStats || []} />
                <div className="d-flex gap-3 mt-3">
                  <span
                    className="d-flex align-items-center gap-1 text-dim"
                    style={{ fontSize: "0.65rem" }}
                  >
                    <div
                      style={{
                        width: 8,
                        height: 8,
                        borderRadius: "50%",
                        background: "#2ed573",
                      }}
                    />{" "}
                    Bình thường
                  </span>
                  <span
                    className="d-flex align-items-center gap-1 text-dim"
                    style={{ fontSize: "0.65rem" }}
                  >
                    <div
                      style={{
                        width: 8,
                        height: 8,
                        borderRadius: "50%",
                        background: "#ffa502",
                      }}
                    />{" "}
                    Đáng ngờ
                  </span>
                  <span
                    className="d-flex align-items-center gap-1 text-dim"
                    style={{ fontSize: "0.65rem" }}
                  >
                    <div
                      style={{
                        width: 8,
                        height: 8,
                        borderRadius: "50%",
                        background: "#ff4757",
                      }}
                    />{" "}
                    Bị chặn
                  </span>
                </div>
              </div>
            </div>

            {/* Risk Distribution */}
            <div className="col-lg-4">
              <div className="glass p-4 rounded-4 border border-secondary border-opacity-10 h-100">
                <h6 className="text-white fw-bold d-flex align-items-center gap-2 mb-3">
                  <ShieldAlert size={16} className="text-warning" />
                  {t('ai.riskDist')}
                </h6>
                <RiskDistributionBar
                  data={analytics?.riskDistribution || []}
                />

                {/* AI Config Info */}
                <div
                  className="mt-4 p-3 rounded-3"
                  style={{
                    background: "rgba(255,165,2,0.06)",
                    border: "1px solid rgba(255,165,2,0.15)",
                  }}
                >
                  <div
                    className="text-warning fw-bold mb-2"
                    style={{ fontSize: "0.7rem" }}
                  >
                    {t('ai.aiConfig')}
                  </div>
                  <div
                    className="d-flex justify-content-between text-dim mb-1"
                    style={{ fontSize: "0.65rem" }}
                  >
                    <span>{t('ai.blockThreshold')}</span>
                    <span className="text-danger fw-bold">
                      = {analytics?.config?.riskThreshold}
                    </span>
                  </div>
                  <div
                    className="d-flex justify-content-between text-dim mb-1"
                    style={{ fontSize: "0.65rem" }}
                  >
                    <span>{t('ai.warnThreshold')}</span>
                    <span className="text-warning fw-bold">
                      = {analytics?.config?.warnThreshold}
                    </span>
                  </div>
                  <div
                    className="d-flex justify-content-between text-dim"
                    style={{ fontSize: "0.65rem" }}
                  >
                    <span>{t('ai.maxFail')}</span>
                    <span className="text-white fw-bold">
                      {analytics?.config?.maxFailedAttempts}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* High Risk Logins */}
          <div className="glass p-4 rounded-4 border border-secondary border-opacity-10 mb-4">
            <h6 className="text-white fw-bold d-flex align-items-center gap-2 mb-3">
              <AlertTriangle size={16} className="text-danger" />
              {t('ai.loginAnomaly')}
              <span
                className="badge bg-warning bg-opacity-25 text-warning rounded-pill ms-2"
                style={{ fontSize: "0.65rem" }}
              >
                {t('ai.loginAnomalyBadge')}
              </span>
            </h6>

            <div className="table-responsive">
              <table className="table table-hover align-middle mb-0">
                <thead>
                  <tr>
                    <th style={{ fontSize: "0.7rem" }}>{t('ai.colTime')}</th>
                    <th style={{ fontSize: "0.7rem" }}>{t('ai.colUsername')}</th>
                    <th style={{ fontSize: "0.7rem" }}>{t('ai.colIp')}</th>
                    <th style={{ fontSize: "0.7rem" }}>{t('ai.colRisk')}</th>
                    <th style={{ fontSize: "0.7rem" }}>{t('ai.colFactors')}</th>
                    <th style={{ fontSize: "0.7rem" }}>{t('ai.status')}</th>
                  </tr>
                </thead>
                <tbody>
                  {(analytics?.highRiskLogins || []).length === 0 ? (
                    <tr>
                      <td
                        colSpan="6"
                        className="text-center py-4 text-dim"
                      >
                        <ShieldCheck size={24} className="mb-2 text-success" />
                        <div>{t('ai.noHighRisk')}</div>
                      </td>
                    </tr>
                  ) : (
                    (analytics?.highRiskLogins || []).map((login, i) => (
                      <tr key={login.attempt_id || i}>
                        <td className="text-dim small">
                          {new Date(login.attempt_time).toLocaleString(
                            "vi-VN",
                          )}
                        </td>
                        <td className="text-white fw-semibold small">
                          {login.username || login.username_hash?.substring(0, 8) + "..."}
                        </td>
                        <td>
                          <span
                            className="badge bg-dark text-dim"
                            style={{ fontSize: "0.65rem" }}
                          >
                            <Globe size={10} className="me-1" />
                            {login.ip_address}
                          </span>
                        </td>
                        <td>
                          <RiskBadge score={login.risk_score} labels={riskLabels} />
                        </td>
                        <td>
                          <div className="d-flex gap-1 flex-wrap">
                            {(Array.isArray(login.risk_factors)
                              ? login.risk_factors
                              : []
                            ).map((f, j) => (
                              <span
                                key={j}
                                className="badge rounded-pill"
                                style={{
                                  background:
                                    f.severity === "critical"
                                      ? "#ff475722"
                                      : f.severity === "warning"
                                        ? "#ffa50222"
                                        : "#2ed57322",
                                  color:
                                    f.severity === "critical"
                                      ? "#ff4757"
                                      : f.severity === "warning"
                                        ? "#ffa502"
                                        : "#2ed573",
                                  fontSize: "0.55rem",
                                  border: `1px solid ${f.severity === "critical" ? "#ff475744" : f.severity === "warning" ? "#ffa50244" : "#2ed57344"}`,
                                }}
                              >
                                {f.type}
                              </span>
                            ))}
                          </div>
                        </td>
                        <td>
                          {login.blocked ? (
                            <span className="badge bg-danger bg-opacity-25 text-danger rounded-pill" style={{ fontSize: "0.6rem" }}>
                              <Ban size={10} className="me-1" />
                              {t('ai.statusBlocked')}
                            </span>
                          ) : login.success ? (
                            <span className="badge bg-success bg-opacity-25 text-success rounded-pill" style={{ fontSize: "0.6rem" }}>
                              <ShieldCheck size={10} className="me-1" />
                              {t('ai.statusOk')}
                            </span>
                          ) : (
                            <span className="badge bg-warning bg-opacity-25 text-warning rounded-pill" style={{ fontSize: "0.6rem" }}>
                              <AlertTriangle size={10} className="me-1" />
                              {t('ai.statusFailed')}
                            </span>
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Top Blocked IPs */}
          {(analytics?.topBlockedIPs || []).length > 0 && (
            <div className="glass p-4 rounded-4 border border-secondary border-opacity-10">
              <h6 className="text-white fw-bold d-flex align-items-center gap-2 mb-3">
                <Globe size={16} className="text-danger" />
                {t('ai.topBlockedIPs')}
              </h6>
              <div className="row g-2">
                {analytics.topBlockedIPs.map((ip, i) => (
                  <div key={i} className="col-md-4">
                    <div
                      className="d-flex justify-content-between align-items-center p-2 rounded-3"
                      style={{
                        background: "rgba(255,71,87,0.06)",
                        border: "1px solid rgba(255,71,87,0.12)",
                      }}
                    >
                      <span className="text-dim small">
                        <Globe size={12} className="me-1 text-danger" />
                        {ip.ip}
                      </span>
                      <span
                        className="badge bg-danger bg-opacity-25 text-danger"
                        style={{ fontSize: "0.6rem" }}
                      >
                        {ip.blockCount} {t('ai.times')}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {/* =====================================================
           TAB 2: ALERTS
         ===================================================== */}
      {activeSubTab === "alerts" && (
        <div className="glass p-4 rounded-4 border border-secondary border-opacity-10">
          <h6 className="text-white fw-bold d-flex align-items-center gap-2 mb-3">
            <AlertTriangle size={18} className="text-danger" />
            {t('ai.alertsTitle')}
            <span
              className="badge bg-danger bg-opacity-25 text-danger ms-2"
              style={{ fontSize: "0.65rem" }}
            >
              {alerts.length} {t('ai.alertsCount')}
            </span>
          </h6>

          {alerts.length === 0 ? (
            <div className="text-center py-5">
              <ShieldCheck size={48} className="text-success mb-3" />
              <div className="text-success fw-bold">
                {t('ai.systemSafe')}
              </div>
              <div className="text-dim small">
                {t('ai.noAnomaly')}
              </div>
            </div>
          ) : (
            <div className="d-flex flex-column gap-2">
              {alerts.map((alert, i) => {
                const isExpanded = expandedAlert === i;
                const isBlocked = alert.blocked;
                const isFailed = alert.success === 0;
                const riskColor =
                  alert.risk_score >= 70
                    ? "#ff4757"
                    : alert.risk_score >= 40
                      ? "#ffa502"
                      : isFailed
                        ? "#ff6348"
                        : "#2ed573";

                return (
                  <div
                    key={alert.attempt_id || i}
                    className="rounded-3 overflow-hidden transition-all"
                    style={{
                      background: `rgba(${alert.risk_score >= 70 ? "255,71,87" : alert.risk_score >= 40 ? "255,165,2" : isFailed ? "255,99,72" : "46,213,115"}, 0.04)`,
                      border: `1px solid ${riskColor}22`,
                    }}
                  >
                    {/* Alert Header */}
                    <div
                      className="d-flex align-items-center gap-3 p-3 cursor-pointer"
                      onClick={() =>
                        setExpandedAlert(isExpanded ? null : i)
                      }
                      style={{ cursor: "pointer" }}
                    >
                      <div
                        className="d-flex align-items-center justify-content-center rounded-circle flex-shrink-0"
                        style={{
                          width: 36,
                          height: 36,
                          background: `${riskColor}22`,
                        }}
                      >
                        {isBlocked ? (
                          <Ban size={16} style={{ color: riskColor }} />
                        ) : (
                          <AlertTriangle
                            size={16}
                            style={{ color: riskColor }}
                          />
                        )}
                      </div>

                      <div className="flex-grow-1">
                        <div className="d-flex align-items-center gap-2">
                          <span className="text-white fw-semibold small">
                            {alert.username || "Unknown"}
                          </span>
                          <RiskBadge score={alert.risk_score} labels={riskLabels} />
                          {isBlocked && (
                            <span
                              className="badge bg-danger text-white rounded-pill"
                              style={{ fontSize: "0.55rem" }}
                            >
                              {t('ai.statusBlocked')}
                            </span>
                          )}
                          {!isBlocked && isFailed && (
                            <span
                              className="badge rounded-pill"
                              style={{ fontSize: "0.55rem", background: "rgba(255,99,72,0.2)", color: "#ff6348" }}
                            >
                              ĐĂNG NHẬP thất bại
                            </span>
                          )}
                        </div>
                        <div className="text-dim" style={{ fontSize: "0.65rem" }}>
                          {new Date(alert.attempt_time).toLocaleString(
                            "vi-VN",
                          )}{" "}
                          � IP: {alert.ip_address}
                        </div>
                      </div>

                      {isExpanded ? (
                        <ChevronUp size={16} className="text-dim" />
                      ) : (
                        <ChevronDown size={16} className="text-dim" />
                      )}
                    </div>

                    {/* Alert Details (Expanded) */}
                    {isExpanded && (
                      <div
                        className="px-3 pb-3 pt-0"
                        style={{
                          borderTop: `1px solid ${riskColor}11`,
                        }}
                      >
                        <div className="row g-2 mt-1">
                          <div className="col-md-4">
                            <div
                              className="p-2 rounded-2"
                              style={{ background: "rgba(255,255,255,0.03)" }}
                            >
                              <div
                                className="text-dim fw-bold mb-1"
                                style={{ fontSize: "0.6rem" }}
                              >
                                <Globe size={10} /> IP ADDRESS
                              </div>
                              <div className="text-white small">
                                {alert.ip_address}
                              </div>
                            </div>
                          </div>
                          <div className="col-md-4">
                            <div
                              className="p-2 rounded-2"
                              style={{ background: "rgba(255,255,255,0.03)" }}
                            >
                              <div
                                className="text-dim fw-bold mb-1"
                                style={{ fontSize: "0.6rem" }}
                              >
                                <Monitor size={10} /> USER AGENT
                              </div>
                              <div
                                className="text-white"
                                style={{
                                  fontSize: "0.6rem",
                                  wordBreak: "break-all",
                                }}
                              >
                                {alert.user_agent?.substring(0, 80)}...
                              </div>
                            </div>
                          </div>
                          <div className="col-md-4">
                            <div
                              className="p-2 rounded-2"
                              style={{ background: "rgba(255,255,255,0.03)" }}
                            >
                              <div
                                className="text-dim fw-bold mb-1"
                                style={{ fontSize: "0.6rem" }}
                              >
                                <Shield size={10} /> RISK FACTORS
                              </div>
                              <div className="d-flex flex-column gap-1">
                                {(Array.isArray(alert.risk_factors)
                                  ? alert.risk_factors
                                  : []
                                ).map((f, j) => (
                                  <div
                                    key={j}
                                    className="d-flex justify-content-between"
                                    style={{ fontSize: "0.6rem" }}
                                  >
                                    <span className="text-dim">
                                      {f.type}
                                    </span>
                                    <span
                                      style={{
                                        color:
                                          f.severity === "critical"
                                            ? "#ff4757"
                                            : f.severity === "warning"
                                              ? "#ffa502"
                                              : "#2ed573",
                                      }}
                                    >
                                      +{f.score}
                                    </span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* =====================================================
           TAB 3: USER MANAGEMENT
         ===================================================== */}
      {activeSubTab === "users" && (
        <div className="glass p-4 rounded-4 border border-secondary border-opacity-10">
          <h6 className="text-white fw-bold d-flex align-items-center gap-2 mb-3">
            <Users size={18} className="text-warning" />
            {t('ai.userStatusTitle')}
          </h6>

          <div className="table-responsive">
            <table className="table table-hover align-middle mb-0">
              <thead>
                <tr>
                  <th style={{ fontSize: "0.7rem" }}>{t('ai.user')}</th>
                  <th style={{ fontSize: "0.7rem" }}>{t('ai.role')}</th>
                  <th style={{ fontSize: "0.7rem" }}>Tr?ng th�i</th>
                  <th style={{ fontSize: "0.7rem" }}>{t('ai.risk7d')}</th>
                  <th style={{ fontSize: "0.7rem" }}>{t('ai.login7d')}</th>
                  <th style={{ fontSize: "0.7rem" }}>{t('ai.blocked7d')}</th>
                  <th style={{ fontSize: "0.7rem" }}>{t('ai.banCount')}</th>
                  <th style={{ fontSize: "0.7rem" }} className="text-end">
                    {t('ai.action')}
                  </th>
                </tr>
              </thead>
              <tbody>
                {allUsers.map((user) => (
                  <tr key={user.userId}>
                    <td>
                      <div className="d-flex align-items-center gap-2">
                        <div
                          className="d-flex align-items-center justify-content-center rounded-circle"
                          style={{
                            width: 32,
                            height: 32,
                            background: user.isBanned
                              ? "rgba(255,71,87,0.15)"
                              : "rgba(46,213,115,0.15)",
                          }}
                        >
                          {user.isBanned ? (
                            <Ban size={14} className="text-danger" />
                          ) : (
                            <UserCheck
                              size={14}
                              className="text-success"
                            />
                          )}
                        </div>
                        <span className="text-white fw-semibold small">
                          {user.username}
                        </span>
                      </div>
                    </td>
                    <td>
                      <span
                        className="badge rounded-pill px-2 py-1"
                        style={{
                          background:
                            user.role === "Admin"
                              ? "rgba(255,165,2,0.15)"
                              : "rgba(45,135,255,0.15)",
                          color:
                            user.role === "Admin"
                              ? "#ffa502"
                              : "#2d87ff",
                          fontSize: "0.6rem",
                        }}
                      >
                        {user.role}
                      </span>
                    </td>
                    <td>
                      {user.isBanned ? (
                        <div>
                          <span
                            className="badge bg-danger bg-opacity-25 text-danger rounded-pill mb-1"
                            style={{ fontSize: "0.6rem" }}
                          >
                            <Lock size={10} className="me-1" />
                            {user.isPermanent ? t('ai.permanentBan') : t('ai.banned')}
                          </span>
                          {!user.isPermanent && user.bannedUntil && (
                            <div
                              className="text-dim"
                              style={{ fontSize: "0.55rem" }}
                            >
                              �?n:{" "}
                              {new Date(
                                user.bannedUntil,
                              ).toLocaleString("vi-VN")}
                            </div>
                          )}
                        </div>
                      ) : (
                        <span
                          className="badge bg-success bg-opacity-25 text-success rounded-pill"
                          style={{ fontSize: "0.6rem" }}
                        >
                          <ShieldCheck size={10} className="me-1" />{t('ai.active')}</span>
                      )}
                    </td>
                    <td>
                      <RiskBadge score={user.avgRisk7d} labels={riskLabels} />
                    </td>
                    <td className="text-white small fw-semibold">
                      {user.loginAttempts7d}
                    </td>
                    <td>
                      <span
                        className={`fw-bold small ${user.blockedAttempts7d > 0 ? "text-danger" : "text-dim"}`}
                      >
                        {user.blockedAttempts7d}
                      </span>
                    </td>
                    <td>
                      <span
                        className={`fw-bold small ${user.banCount > 0 ? "text-warning" : "text-dim"}`}
                      >
                        {user.banCount}
                      </span>
                    </td>
                    <td className="text-end">
                      <div className="d-flex gap-1 justify-content-end">
                        {user.isBanned ? (
                          <button
                            className="btn btn-sm btn-outline-success d-flex align-items-center gap-1 rounded-pill px-3"
                            onClick={() =>
                              handleUnban(user.userId, user.username)
                            }
                            disabled={actionLoading === user.userId}
                            style={{ fontSize: "0.65rem" }}
                          >
                            {actionLoading === user.userId ? (
                              <span className="spinner-border spinner-border-sm" />
                            ) : (
                              <>
                                <Unlock size={12} />
                                {t('ai.unbanBtn')}
                              </>
                            )}
                          </button>
                        ) : (
                          <button
                            className="btn btn-sm btn-outline-danger d-flex align-items-center gap-1 rounded-pill px-3"
                            onClick={() =>
                              setShowBanModal(user)
                            }
                            disabled={user.role === "Admin"}
                            style={{ fontSize: "0.65rem" }}
                            title={
                              user.role === "Admin"
                                ? "Kh�ng th? ban Admin"
                                : ""
                            }
                          >
                            <Ban size={12} />{t('ai.banBtn')}</button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* =====================================================
           BAN MODAL
         ===================================================== */}
      {showBanModal && (
        <div
          className="position-fixed top-0 start-0 w-100 h-100 d-flex align-items-center justify-content-center"
          style={{ zIndex: 9999, background: "rgba(0,0,0,0.7)" }}
          onClick={() => setShowBanModal(null)}
        >
          <div
            className="glass p-4 rounded-4 shadow-lg"
            style={{
              width: 420,
              border: "1px solid rgba(255,71,87,0.3)",
              background:
                "linear-gradient(135deg, rgba(15,15,25,0.98) 0%, rgba(25,15,15,0.98) 100%)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="d-flex align-items-center gap-2 mb-3">
              <Ban size={24} className="text-danger" />
              <h5 className="mb-0 text-white fw-bold">{t('ai.banUserTitle')}</h5>
            </div>

            <div
              className="p-3 rounded-3 mb-3"
              style={{
                background: "rgba(255,71,87,0.08)",
                border: "1px solid rgba(255,71,87,0.2)",
              }}
            >
              <div className="text-dim small mb-1">{t('ai.banUserTarget')}</div>
              <div className="text-white fw-bold">
                {showBanModal.username}
              </div>
            </div>

            <div className="mb-3">
              <label className="form-label text-dim small fw-bold">
                {t('ai.banDuration')}
              </label>
              <BanDurationSelect
                value={banDuration}
                onChange={setBanDuration}
              />
            </div>

            <div className="mb-3">
              <label className="form-label text-dim small fw-bold">
                {t('ai.banReason')}
              </label>
              <textarea
                className="form-control bg-dark text-light border-secondary"
                rows={2}
                placeholder={t('ai.banReasonPl')}
                value={banReason}
                onChange={(e) => setBanReason(e.target.value)}
              />
            </div>

            <div className="d-flex gap-2">
              <button
                className="btn btn-outline-secondary flex-grow-1"
                onClick={() => setShowBanModal(null)}
              >
                H?y
              </button>
              <button
                className="btn btn-danger flex-grow-1 d-flex align-items-center justify-content-center gap-2"
                onClick={() => handleBan(showBanModal.userId)}
                disabled={actionLoading === showBanModal.userId}
              >
                {actionLoading === showBanModal.userId ? (
                  <span className="spinner-border spinner-border-sm" />
                ) : (
                  <>
                    <Ban size={16} />
                    {t('ai.banConfirm')}
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* CSS Animations */}
      <style>{`
        @keyframes pulse {
          0% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.5; transform: scale(1.5); }
          100% { opacity: 1; transform: scale(1); }
        }
        .spin-animation {
          animation: spin 1s linear infinite;
        }
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        .cursor-pointer { cursor: pointer; }
      `}</style>
    </div>
  );
};

export default AISecurityMonitor;
