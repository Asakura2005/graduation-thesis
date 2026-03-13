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
      const res = await axios.get("http://localhost:5001/api/notifications");
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
      await axios.put(`http://localhost:5001/api/notifications/${id}/read`);
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
      await axios.put("http://localhost:5001/api/notifications/read-all");
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
      <button
        className="btn btn-link text-dim p-2 hover-light rounded-circle position-relative"
        onClick={() => setShowPanel(!showPanel)}
      >
        <Bell size={20} />
        {unreadCount > 0 && (
          <span
            className="position-absolute badge rounded-pill bg-danger shadow"
            style={{
              top: "2px",
              right: "2px",
              fontSize: "0.6rem",
              minWidth: "18px",
              padding: "3px 5px",
            }}
          >
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
