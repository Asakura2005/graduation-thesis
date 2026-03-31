import React, { useState, useEffect } from "react";
import { useLanguage } from "../i18n/LanguageContext";
import axios from "axios";
import { Activity, User, Clock, Search, Terminal, Package } from "lucide-react";

const AuditLogViewer = () => {
  const { t } = useLanguage();
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [filterCategory, setFilterCategory] = useState("ALL");

  const CATEGORIES = [
    { id: "ALL", label: t('audit.filterAll'), icon: Activity },
    { id: "AUTH", label: t('audit.filterAuth'), icon: User },
    { id: "SHIPMENT", label: t('audit.filterShipment'), icon: Clock },
    { id: "WAREHOUSE", label: t('audit.filterWarehouse'), icon: Package },
    { id: "PARTNER", label: t('audit.filterPartner'), icon: Terminal },
  ];

  useEffect(() => {
    const fetchLogs = async () => {
      try {
        const response = await axios.get(
          "/api/audit-logs",
        );
        if (Array.isArray(response.data)) {
          setLogs(response.data);
        } else {
          console.error("API returned non-array:", response.data);
          setLogs([]);
        }
      } catch (err) {
        console.error("Lỗi lấy nhật ký:", err);
        setLogs([]);
      } finally {
        setLoading(false);
      }
    };
    fetchLogs();
  }, []);

  const formatDate = (dateString) => {
    try {
      if (!dateString) return "N/A";
      return new Date(dateString).toLocaleString("vi-VN");
    } catch (e) {
      return "Invalid Date";
    }
  };

  const filteredLogs = logs.filter((log) => {
    const term = searchTerm.toLowerCase();
    const timeStr = formatDate(log.timestamp).toLowerCase();

    let categoryMatch = true;
    if (filterCategory === "AUTH")
      categoryMatch =
        log.action.includes("LOGIN") || log.action.includes("REGISTER");
    else if (filterCategory === "SHIPMENT")
      categoryMatch =
        log.action.includes("SHIPMENT") || log.action.includes("STATUS");
    else if (filterCategory === "WAREHOUSE")
      categoryMatch =
        log.action.includes("STOCK") ||
        log.action.includes("WAREHOUSE") ||
        log.action.includes("ITEM");
    else if (filterCategory === "PARTNER")
      categoryMatch = log.action.includes("PARTNER");

    const searchMatch =
      (log.username || "").toLowerCase().includes(term) ||
      (log.action || "").toLowerCase().includes(term) ||
      JSON.stringify(log.details || {})
        .toLowerCase()
        .includes(term) ||
      timeStr.includes(term);

    return categoryMatch && searchMatch;
  });

  const getActionBadge = (action) => {
    let colorClass = "bg-primary text-white";
    if (action.includes("FAILED") || action.includes("DELETE"))
      colorClass = "bg-danger text-white";
    else if (action.includes("REGISTER") || action.includes("CREATE"))
      colorClass = "bg-success text-white";
    else if (action.includes("LOGIN") && !action.includes("FAILED") && !action.includes("BLOCKED")) colorClass = "bg-info text-dark";
    else if (action.includes("BLOCKED_BY_AI")) colorClass = "bg-dark text-danger border border-danger border-opacity-25";

    return (
      <span className={`badge ${colorClass} bg-opacity-75 px-2 py-1`}>
        {action}
      </span>
    );
  };

  return (
    <div className="glass p-4 fade-in-up h-100 d-flex flex-column">
      <div className="d-flex justify-content-between align-items-center mb-4">
        <h5 className="mb-0 fw-bold d-flex align-items-center gap-2 text-gold">
          <Activity size={20} />{t('audit.title')}</h5>
        <div className="input-group w-auto">
          <span className="input-group-text bg-transparent border-end-0 border-secondary">
            <Search size={16} />
          </span>
          <input
            type="text"
            className="form-control border-start-0 border-secondary bg-transparent text-white"
            placeholder={t('audit.search')}
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
      </div>

      <div className="d-flex gap-2 mb-4 overflow-x-auto pb-2" style={{ minHeight: '55px' }}>
        {CATEGORIES.map((cat) => {
          const Icon = cat.icon;
          const isActive = filterCategory === cat.id;
          return (
            <button
              key={cat.id}
              onClick={() => setFilterCategory(cat.id)}
              className={`btn btn-audit-filter gap-2 transition-all 
                                ${isActive ? "btn-gold shadow" : "btn-outline-light border-opacity-25 text-dim"}`}
            >
              <Icon size={14} />
              {cat.label}
            </button>
          );
        })}
      </div>

      <div
        className="table-responsive flex-grow-1 custom-scrollbar"
        style={{ maxHeight: "calc(100vh - 250px)", overflowY: "auto" }}
      >
        <table
          className="table table-hover align-middle mb-0"
          style={{ borderCollapse: "separate", borderSpacing: 0 }}
        >
          <thead
            style={{
              position: "sticky",
              top: 0,
              zIndex: 10,
              backgroundColor: "#1E293B",
            }}
          >
            <tr>
              <th className="py-3 ps-3">{t('audit.time')}</th>
              <th className="py-3">{t('audit.user')}</th>
              <th className="py-3">{t('audit.action')}</th>
              <th className="py-3 pe-3" style={{ width: "40%" }}>{t('audit.details')}</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan="4" className="text-center py-5">
                  Loading audit trail data...
                </td>
              </tr>
            ) : filteredLogs.length === 0 ? (
              <tr>
                <td colSpan="4" className="text-center py-5">
                  {t('audit.emptyList')}
                </td>
              </tr>
            ) : (
              filteredLogs.map((log) => (
                <tr key={log.log_id} className="audit-row">
                  <td className="text-nowrap text-dim small ps-3">
                    <Clock size={14} className="me-2 text-primary" />
                    {formatDate(log.timestamp)}
                  </td>
                  <td>
                    <div className="d-flex align-items-center gap-2">
                      <div className="bg-secondary bg-opacity-10 p-1 rounded">
                        <User size={14} className="text-secondary" />
                      </div>
                      <span className="fw-semibold text-white small">
                        {log.username || "System"}
                      </span>
                    </div>
                  </td>
                  {/* ===== ACTION COLUMN (THÊM ICON ACTION) ===== */}
                  <td>
                    <div className="d-flex align-items-center gap-2">
                      {/* icon theo loại action */}
                      <span style={{ fontSize: "14px" }}>
                        {log.action?.includes("SHIPMENT")
                          ? "📦"
                          : log.action?.includes("LOGIN")
                            ? "🔐"
                            : log.action?.includes("REGISTER")
                              ? "👤"
                              : log.action?.includes("PARTNER")
                                ? "🤝"
                                : log.action?.includes("WAREHOUSE")
                                  ? "🏬"
                                  : "⚙️"}
                      </span>

                      {getActionBadge(log.action)}
                    </div>
                  </td>
                  <td className="pe-3">
                    {typeof log.details === "object" && log.details !== null ? (
                      <div className="d-flex flex-column gap-1 my-1">
                        {/* UPDATE_SHIPMENT with changes array */}
                        {log.action === 'UPDATE_SHIPMENT' && log.details.changes && log.details.changes.length > 0 ? (
                          log.details.changes.map((change, ci) => (
                            <div key={ci} className="d-flex align-items-center gap-2 bg-black bg-opacity-25 px-2 py-1 rounded small border border-warning border-opacity-15">
                              <span className="text-warning" style={{ fontSize: "0.75rem", minWidth: '90px' }}>
                                {change.field}:
                              </span>
                              <span className="text-danger text-decoration-line-through" style={{ fontSize: "0.8rem" }}>
                                {change.from || '(trống)'}
                              </span>
                              <span className="text-dim">→</span>
                              <span className="text-success fw-bold" style={{ fontSize: "0.8rem" }}>
                                {change.to || '(trống)'}
                              </span>
                            </div>
                          ))

                        ) : log.action === 'UPDATE_SHIPMENT' ? (
                          /* Old UPDATE_SHIPMENT without changes array */
                          <div className="d-flex flex-column gap-1">
                            {log.details.originAddress && (
                              <div className="d-flex align-items-center gap-2 bg-black bg-opacity-25 px-2 py-1 rounded small border border-warning border-opacity-15">
                                <span className="text-warning" style={{ fontSize: "0.75rem", minWidth: '90px' }}>Điểm đi:</span>
                                <span className="text-white fw-bold" style={{ fontSize: "0.8rem" }}>{log.details.originAddress}</span>
                              </div>
                            )}
                            {log.details.destinationAddress && (
                              <div className="d-flex align-items-center gap-2 bg-black bg-opacity-25 px-2 py-1 rounded small border border-warning border-opacity-15">
                                <span className="text-warning" style={{ fontSize: "0.75rem", minWidth: '90px' }}>Điểm đến:</span>
                                <span className="text-white fw-bold" style={{ fontSize: "0.8rem" }}>{log.details.destinationAddress}</span>
                              </div>
                            )}
                          </div>

                        ) : log.action === 'CREATE_SHIPMENT' ? (
                          <div className="d-flex flex-wrap gap-1">
                            {log.details.trackingNumber && (
                              <div className="d-flex align-items-center bg-black bg-opacity-25 px-2 py-1 rounded small border border-success border-opacity-15">
                                <span className="text-success" style={{ fontSize: "0.75rem", minWidth: '90px' }}>Tracking Number:</span>
                                <span className="text-white fw-bold" style={{ fontSize: "0.8rem" }}>{log.details.trackingNumber}</span>
                              </div>
                            )}
                            {log.details.itemCount != null && (
                              <div className="d-flex align-items-center bg-black bg-opacity-25 px-2 py-1 rounded small border border-secondary border-opacity-15">
                                <span className="text-dim" style={{ fontSize: "0.75rem" }}>Products:&nbsp;</span>
                                <span className="text-white fw-bold" style={{ fontSize: "0.8rem" }}>{log.details.itemCount}</span>
                              </div>
                            )}
                          </div>

                        ) : log.action === 'UPDATE_SHIPMENT_STATUS' ? (
                          <div className="d-flex align-items-center gap-2 bg-black bg-opacity-25 px-2 py-1 rounded small border border-info border-opacity-15">
                            <span className="text-info" style={{ fontSize: "0.75rem" }}>New Status:</span>
                            <span className="text-white fw-bold" style={{ fontSize: "0.8rem" }}>{log.details.status}</span>
                          </div>

                        ) : log.action === 'DELETE_SHIPMENT' ? (
                          <div className="d-flex align-items-center gap-2 bg-black bg-opacity-25 px-2 py-1 rounded small border border-danger border-opacity-15">
                            <span className="text-danger" style={{ fontSize: "0.75rem" }}>Delete Shipment:</span>
                            <span className="text-white fw-bold" style={{ fontSize: "0.8rem" }}>{log.details.trackingNumber || ''}</span>
                          </div>

                        ) : (log.action === 'USER_LOGIN' || log.action === 'USER_LOGIN_2FA' || log.action === 'LOGIN_BLOCKED_BY_AI') ? (
                          <div className="d-flex flex-column gap-2">
                            <div className="d-flex flex-wrap gap-1">
                              {log.details.username && (
                                <div className="d-flex align-items-center bg-black bg-opacity-25 px-2 py-1 rounded small border border-info border-opacity-15">
                                  <span className="text-info" style={{ fontSize: "0.75rem" }}>Account:&nbsp;</span>
                                  <span className="text-white fw-bold" style={{ fontSize: "0.8rem" }}>{log.details.username}</span>
                                </div>
                              )}
                              {log.details.riskScore != null && (
                                <div className={`d-flex align-items-center bg-black bg-opacity-25 px-2 py-1 rounded small border ${log.details.riskScore > 50 ? 'border-danger' : log.details.riskScore > 20 ? 'border-warning' : 'border-success'} border-opacity-15`}>
                                  <span className="text-dim" style={{ fontSize: "0.75rem" }}>Risk:&nbsp;</span>
                                  <span className={`fw-bold ${log.details.riskScore > 50 ? 'text-danger' : log.details.riskScore > 20 ? 'text-warning' : 'text-success'}`} style={{ fontSize: "0.8rem" }}>
                                    {log.details.riskScore}
                                  </span>
                                </div>
                              )}
                              {log.details.aiDecision && (
                                <div className={`d-flex align-items-center bg-black bg-opacity-25 px-2 py-1 rounded small border ${log.details.aiDecision === 'BLOCK' ? 'border-danger' : log.details.aiDecision === 'WARN' ? 'border-warning' : 'border-success'} border-opacity-15`}>
                                  <span className={`fw-bold ${log.details.aiDecision === 'BLOCK' ? 'text-danger' : log.details.aiDecision === 'WARN' ? 'text-warning' : 'text-success'}`} style={{ fontSize: "0.8rem" }}>
                                    {log.details.aiDecision === 'ALLOW' ? '✓ Allow' : log.details.aiDecision === 'WARN' ? '⚠ Warn' : '✕ Block'}
                                  </span>
                                </div>
                              )}
                            </div>

                            {/* Render Factors beautifully if they exist */}
                            {log.details.factors && Array.isArray(log.details.factors) && log.details.factors.length > 0 && (
                              <div className="d-flex flex-wrap gap-1 mt-1">
                                {log.details.factors.map((f, fi) => {
                                  if (f === 'AI_MEMORY_STATE') return null; // Hide internal state

                                  const factorColors = {
                                    'UNSUPERVISED_OUTLIER': { bg: 'rgba(255, 71, 87, 0.15)', text: '#ff4757', icon: '🧠', label: 'AI Outlier' },
                                    'UNSUPERVISED_ANOMALY': { bg: 'rgba(255, 165, 2, 0.15)', text: '#ffa502', icon: '📊', label: 'Anomaly' },
                                    'BRUTE_FORCE': { bg: 'rgba(255, 71, 87, 0.2)', text: '#ff4757', icon: '🛡️', label: 'Brute Force' },
                                    'UNUSUAL_TIME': { bg: 'rgba(255, 165, 2, 0.15)', text: '#ffa502', icon: '⏰', label: 'Unusual Time' },
                                    'RAPID_LOGIN': { bg: 'rgba(255, 165, 2, 0.15)', text: '#ffa502', icon: '⚡', label: 'Rapid Login' },
                                    'NEW_IP': { bg: 'rgba(45, 135, 255, 0.15)', text: '#2d87ff', icon: '🌐', label: 'New IP' },
                                    'NEW_DEVICE': { bg: 'rgba(45, 135, 255, 0.15)', text: '#2d87ff', icon: '📱', label: 'New Device' },
                                  };

                                  const style = factorColors[f] || { bg: 'rgba(255,255,255,0.1)', text: '#aaa', icon: '❓', label: f };

                                  return (
                                    <span key={fi} className="badge d-flex align-items-center gap-1" style={{
                                      background: style.bg,
                                      color: style.text,
                                      fontSize: '0.65rem',
                                      border: `1px solid ${style.text}33`,
                                      padding: '2px 8px'
                                    }}>
                                      <span>{style.icon}</span>
                                      <span>{style.label}</span>
                                    </span>
                                  );
                                })}
                              </div>
                            )}
                          </div>

                        ) : log.action === 'UPDATE_PARTNER' && log.details.changes && log.details.changes.length > 0 ? (
                          <div className="d-flex flex-column gap-1">
                            {log.details.partnerName && (
                              <div className="d-flex align-items-center bg-black bg-opacity-25 px-2 py-1 rounded small border border-secondary border-opacity-15">
                                <span className="text-dim" style={{ fontSize: "0.75rem" }}>Partner:&nbsp;</span>
                                <span className="text-white fw-bold" style={{ fontSize: "0.8rem" }}>{log.details.partnerName}</span>
                              </div>
                            )}
                            {log.details.changes.map((change, ci) => (
                              <div key={ci} className="d-flex align-items-center gap-2 bg-black bg-opacity-25 px-2 py-1 rounded small border border-warning border-opacity-15">
                                <span className="text-warning" style={{ fontSize: "0.75rem", minWidth: '100px' }}>
                                  {change.field}:
                                </span>
                                <span className="text-danger text-decoration-line-through" style={{ fontSize: "0.8rem" }}>
                                  {change.from || '(trống)'}
                                </span>
                                <span className="text-dim">→</span>
                                <span className="text-success fw-bold" style={{ fontSize: "0.8rem" }}>
                                  {change.to || '(trống)'}
                                </span>
                              </div>
                            ))}
                          </div>

                        ) : log.action === 'CREATE_PARTNER' ? (
                          <div className="d-flex flex-wrap gap-1">
                            {log.details.name && (
                              <div className="d-flex align-items-center bg-black bg-opacity-25 px-2 py-1 rounded small border border-success border-opacity-15">
                                <span className="text-success" style={{ fontSize: "0.75rem" }}>Name:&nbsp;</span>
                                <span className="text-white fw-bold" style={{ fontSize: "0.8rem" }}>{log.details.name}</span>
                              </div>
                            )}
                            {log.details.type && (
                              <div className="d-flex align-items-center bg-black bg-opacity-25 px-2 py-1 rounded small border border-secondary border-opacity-15">
                                <span className="text-dim" style={{ fontSize: "0.75rem" }}>Type:&nbsp;</span>
                                <span className="text-white fw-bold" style={{ fontSize: "0.8rem" }}>{log.details.type}</span>
                              </div>
                            )}
                          </div>

                        ) : log.action === 'DELETE_PARTNER' ? (
                          <div className="d-flex align-items-center gap-2 bg-black bg-opacity-25 px-2 py-1 rounded small border border-danger border-opacity-15">
                            <span className="text-danger" style={{ fontSize: "0.75rem" }}>Delete Partner</span>
                          </div>

                        ) : (
                          /* Generic fallback for all other actions */
                          <div className="d-flex flex-wrap gap-1">
                            {Object.entries(log.details)
                              .filter(([key]) => !['timestamp', 'changes', 'itemsChanged', 'shipmentId', 'partnerId', 'partnerName'].includes(key))
                              .map(([key, value]) => (
                                <div key={key} className="d-flex align-items-center bg-black bg-opacity-25 px-2 py-1 rounded small border border-secondary border-opacity-15">
                                  <span className="text-dim" style={{ fontSize: "0.75rem" }}>
                                    {key.replace(/([A-Z])/g, ' $1').replace(/_/g, ' ').trim()}:&nbsp;
                                  </span>
                                  <span className="text-white fw-medium" style={{ fontSize: "0.8rem" }}>
                                    {typeof value === "object" ? JSON.stringify(value) : String(value)}
                                  </span>
                                </div>
                              ))}
                          </div>
                        )}

                        {/* Timestamp - hiển thị cho tất cả */}
                        {log.details.timestamp && (
                          <div className="d-flex align-items-center gap-1 bg-black bg-opacity-25 px-2 py-1 rounded small border border-primary border-opacity-10 mt-1">
                            <Clock size={10} className="text-primary" />
                            <span className="text-primary" style={{ fontSize: "0.7rem" }}>
                              {new Date(log.details.timestamp).toLocaleString('vi-VN')}
                            </span>
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="d-flex align-items-center gap-2 text-dim small bg-black bg-opacity-20 p-2 rounded">
                        <Terminal size={14} className="text-dim shrink-0" />
                        <span className="text-break">
                          {String(log.details || "Không có chi tiết")}
                        </span>
                      </div>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default AuditLogViewer;
