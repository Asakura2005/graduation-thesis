import React, { useState, useEffect } from "react";
import axios from "axios";
import { Activity, User, Clock, Search, Terminal, Package } from "lucide-react";

const AuditLogViewer = () => {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [filterCategory, setFilterCategory] = useState("ALL");

  const CATEGORIES = [
    { id: "ALL", label: "Tất cả", icon: Activity },
    { id: "AUTH", label: "Xác thực", icon: User },
    { id: "SHIPMENT", label: "Vận đơn", icon: Clock },
    { id: "WAREHOUSE", label: "Lịch sử Kho", icon: Package },
    { id: "PARTNER", label: "Đối tác", icon: Terminal },
  ];

  useEffect(() => {
    const fetchLogs = async () => {
      try {
        const response = await axios.get(
          "http://localhost:5001/api/audit-logs",
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
    else if (action.includes("LOGIN")) colorClass = "bg-info text-dark";

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
          <Activity size={20} />
          NHẬT KÝ HOẠT ĐỘNG
        </h5>
        <div className="input-group w-auto">
          <span className="input-group-text bg-transparent border-end-0 border-secondary">
            <Search size={16} />
          </span>
          <input
            type="text"
            className="form-control border-start-0 border-secondary bg-transparent text-white"
            placeholder="Tìm kiếm nhật ký..."
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
              <th className="py-3 ps-3">THỜI GIAN</th>
              <th className="py-3">NGƯỜI DÙNG</th>
              <th className="py-3">HÀNH ĐỘNG</th>
              <th className="py-3 pe-3" style={{ width: "40%" }}>
                CHI TIẾT
              </th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan="4" className="text-center py-5">
                  Đang tải dữ liệu audit trail...
                </td>
              </tr>
            ) : filteredLogs.length === 0 ? (
              <tr>
                <td colSpan="4" className="text-center py-5">
                  Không tìm thấy nhật ký phù hợp.
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
                      <div className="d-flex flex-wrap gap-2 my-1">
                        {Object.entries(log.details).map(([key, value]) => (
                          <div
                            key={key}
                            className={`d-flex align-items-center bg-black bg-opacity-25 px-2 py-1 rounded small border ${key === 'timestamp' ? 'border-primary' : 'border-secondary'} border-opacity-25 shadow-sm`}
                          >
                            <span
                              className={`${key === 'timestamp' ? 'text-primary' : 'text-dim'} me-1`}
                              style={{ fontSize: "0.8rem" }}
                            >
                              {key === 'timestamp' && <Clock size={10} className="me-1" />}
                              {key}:
                            </span>
                            <span
                              className="text-white fw-medium font-monospace"
                              style={{ fontSize: "0.85rem" }}
                            >
                              {key === 'timestamp'
                                ? new Date(value).toLocaleString('vi-VN')
                                : (typeof value === "object" ? JSON.stringify(value) : String(value))}
                            </span>
                          </div>
                        ))}
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
