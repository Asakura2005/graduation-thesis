import React, { useState, useEffect, useRef } from "react";
import { Bell, Check, CheckCheck, Package, Truck, X, AlertCircle } from "lucide-react";
import axios from "axios";

const NotificationPanel = ({ user }) => {
  const [notifications, setNotifications] = useState([]);
  const [showPanel, setShowPanel] = useState(false);
  const [loading, setLoading] = useState(false);
  const panelRef = useRef(null);

  const unreadCount = notifications.filter((n) => !n.is_read).length;

  const fetchNotifications = async () => {
    try {
      const res = await axios.get("/api/notifications");
      setNotifications(res.data);
    } catch (err) {
      console.error("Error fetching notifications:", err);
    }
  };

  useEffect(() => {
    fetchNotifications();
    const interval = setInterval(fetchNotifications, 15000); // Poll every 15s
    return () => clearInterval(interval);
  }, []);

  // Close panel when clicking outside
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (panelRef.current && !panelRef.current.contains(e.target)) {
        setShowPanel(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const markAsRead = async (id) => {
    try {
      await axios.put(`/api/notifications/${id}/read`);
      setNotifications((prev) =>
        prev.map((n) =>
          n.notification_id === id ? { ...n, is_read: true } : n
        )
      );
    } catch (err) {
      console.error(err);
    }
  };

  const markAllRead = async () => {
    try {
      await axios.put("/api/notifications/read-all");
      setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
    } catch (err) {
      console.error(err);
    }
  };

  const getIcon = (type) => {
    switch (type) {
      case "shipment_approval":
        return <Package size={16} className="text-warning" />;
      case "approved":
        return <Check size={16} className="text-success" />;
      case "rejected":
        return <X size={16} className="text-danger" />;
      case "exported":
        return <Truck size={16} className="text-info" />;
      case "status_update":
        return <Truck size={16} className="text-gold" />;
      default:
        return <AlertCircle size={16} className="text-dim" />;
    }
  };

  const formatTime = (dateStr) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now - date;
    const diffMin = Math.floor(diffMs / 60000);
    const diffHour = Math.floor(diffMs / 3600000);
    const diffDay = Math.floor(diffMs / 86400000);

    if (diffMin < 1) return "Vừa xong";
    if (diffMin < 60) return `${diffMin} phút trước`;
    if (diffHour < 24) return `${diffHour} giờ trước`;
    return `${diffDay} ngày trước`;
  };

  return (
    <div className="position-relative" ref={panelRef}>
      <style>{`
        @keyframes bell-ring {
          0%,100% { transform: rotate(0deg); }
          10%      { transform: rotate(14deg); }
          20%      { transform: rotate(-12deg); }
          30%      { transform: rotate(10deg); }
          40%      { transform: rotate(-8deg); }
          50%      { transform: rotate(6deg); }
          60%      { transform: rotate(-4deg); }
          70%      { transform: rotate(2deg); }
        }
        @keyframes badge-pulse {
          0%,100% { box-shadow: 0 0 0 0 rgba(239,68,68,0.5); }
          50%      { box-shadow: 0 0 0 5px rgba(239,68,68,0); }
        }
        @keyframes glow-pulse {
          0%,100% { box-shadow: 0 0 0 0 rgba(0,229,160,0.0), 0 4px 15px rgba(0,229,160,0.15); }
          50%      { box-shadow: 0 0 0 6px rgba(0,229,160,0.08), 0 4px 20px rgba(0,229,160,0.3); }
        }
        .bell-btn {
          width: 44px;
          height: 44px;
          border-radius: 14px !important;
          background: linear-gradient(135deg, rgba(0,229,160,0.12) 0%, rgba(0,180,130,0.06) 100%) !important;
          border: 1px solid rgba(0,229,160,0.2) !important;
          display: flex !important;
          align-items: center !important;
          justify-content: center !important;
          transition: all 0.3s ease !important;
          position: relative !important;
          padding: 0 !important;
        }
        .bell-btn:hover {
          background: linear-gradient(135deg, rgba(0,229,160,0.22) 0%, rgba(0,180,130,0.12) 100%) !important;
          border-color: rgba(0,229,160,0.45) !important;
          box-shadow: 0 0 18px rgba(0,229,160,0.2), 0 4px 12px rgba(0,0,0,0.3) !important;
          transform: translateY(-1px) !important;
        }
        .bell-btn .bell-icon {
          color: #00e5a0;
          filter: drop-shadow(0 0 6px rgba(0,229,160,0.5));
          transition: color 0.2s;
        }
        .bell-btn.has-unread {
          animation: glow-pulse 2.5s ease-in-out infinite;
        }
        .bell-btn.has-unread .bell-icon {
          animation: bell-ring 2.5s ease-in-out infinite;
          transform-origin: top center;
        }
        .bell-badge {
          position: absolute !important;
          top: -5px !important;
          right: -5px !important;
          min-width: 20px !important;
          height: 20px !important;
          padding: 0 5px !important;
          font-size: 0.6rem !important;
          font-weight: 700 !important;
          border-radius: 10px !important;
          background: linear-gradient(135deg, #ef4444, #dc2626) !important;
          color: #fff !important;
          display: flex !important;
          align-items: center !important;
          justify-content: center !important;
          border: 2px solid rgba(10,14,26,0.9) !important;
          animation: badge-pulse 2s ease-in-out infinite !important;
          z-index: 10 !important;
        }
      `}</style>

      <button
        className={`bell-btn${unreadCount > 0 ? " has-unread" : ""}`}
        onClick={() => setShowPanel(!showPanel)}
        title="Thông báo"
      >
        <Bell size={22} className="bell-icon" />
        {unreadCount > 0 && (
          <span className="bell-badge">
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        )}
      </button>

      {showPanel && (
        <div
          className="position-absolute glass border border-secondary border-opacity-25 rounded-3 shadow-lg"
          style={{
            top: "48px",
            right: 0,
            width: "380px",
            maxHeight: "480px",
            zIndex: 2000,
            overflow: "hidden",
          }}
        >
          {/* Header */}
          <div className="d-flex justify-content-between align-items-center p-3 border-bottom border-secondary border-opacity-10">
            <h6 className="mb-0 fw-bold text-white d-flex align-items-center gap-2">
              <Bell size={16} className="text-gold" />
              Thông báo
              {unreadCount > 0 && (
                <span className="badge bg-danger bg-opacity-25 text-danger rounded-pill">
                  {unreadCount}
                </span>
              )}
            </h6>
            {unreadCount > 0 && (
              <button
                className="btn btn-sm text-dim hover-light d-flex align-items-center gap-1 border-0"
                onClick={markAllRead}
              >
                <CheckCheck size={14} />
                <span className="x-small">Đọc hết</span>
              </button>
            )}
          </div>

          {/* Notification List */}
          <div
            className="overflow-auto custom-scrollbar"
            style={{ maxHeight: "400px" }}
          >
            {notifications.length === 0 ? (
              <div className="text-center py-5">
                <Bell size={32} className="text-dim opacity-25 mb-2" />
                <p className="text-dim small mb-0">Chưa có thông báo nào</p>
              </div>
            ) : (
              notifications.slice(0, 50).map((n) => (
                <div
                  key={n.notification_id}
                  className={`d-flex gap-3 p-3 border-bottom border-secondary border-opacity-5 transition-all ${
                    !n.is_read
                      ? "bg-gold bg-opacity-5"
                      : "hover-light opacity-75"
                  }`}
                  style={{ cursor: "pointer" }}
                  onClick={() => !n.is_read && markAsRead(n.notification_id)}
                >
                  <div
                    className="p-2 rounded-circle d-flex align-items-center justify-content-center flex-shrink-0"
                    style={{
                      width: "36px",
                      height: "36px",
                      background: "rgba(255,255,255,0.05)",
                      border: "1px solid rgba(255,255,255,0.1)",
                    }}
                  >
                    {getIcon(n.type)}
                  </div>
                  <div className="flex-grow-1 min-width-0">
                    <div className="d-flex justify-content-between align-items-start">
                      <span
                        className={`small fw-semibold ${
                          !n.is_read ? "text-white" : "text-dim"
                        }`}
                      >
                        {n.title}
                      </span>
                      {!n.is_read && (
                        <span
                          className="bg-gold rounded-circle flex-shrink-0"
                          style={{
                            width: "8px",
                            height: "8px",
                            marginTop: "6px",
                          }}
                        ></span>
                      )}
                    </div>
                    <p
                      className="text-dim x-small mb-1 text-truncate"
                      style={{ maxWidth: "280px" }}
                    >
                      {n.message}
                    </p>
                    <span className="text-dim" style={{ fontSize: "0.65rem" }}>
                      {formatTime(n.created_at)}
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default NotificationPanel;
