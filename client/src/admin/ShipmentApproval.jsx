import React, { useState, useEffect } from "react";
import axios from "axios";
import {
  Package,
  CheckCircle,
  XCircle,
  Truck,
  Clock,
  ArrowRight,
  Search,
  RefreshCcw,
  ShieldCheck,
  AlertTriangle,
} from "lucide-react";

const ShipmentApproval = ({ user, onUpdate }) => {
  const [shipments, setShipments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("all"); // all, pending, approved, rejected
  const [rejectReason, setRejectReason] = useState("");
  const [showRejectModal, setShowRejectModal] = useState(null);
  const [actionLoading, setActionLoading] = useState(null);

  const isWarehouse = user?.role === "Warehouse";

  const fetchShipments = async () => {
    setLoading(true);
    try {
      const res = await axios.get("http://localhost:5001/api/shipments");
      setShipments(res.data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchShipments();
  }, []);

  const handleApprove = async (shipmentId) => {
    setActionLoading(shipmentId);
    try {
      await axios.put(
        `http://localhost:5001/api/shipments/${shipmentId}/approve`,
        { action: "approve" }
      );
      alert("✅ Đã duyệt vận đơn thành công!");
      fetchShipments();
      if (onUpdate) onUpdate();
    } catch (err) {
      alert("Lỗi: " + (err.response?.data?.error || err.message));
    } finally {
      setActionLoading(null);
    }
  };

  const handleReject = async (shipmentId) => {
    setActionLoading(shipmentId);
    try {
      await axios.put(
        `http://localhost:5001/api/shipments/${shipmentId}/approve`,
        { action: "reject", reason: rejectReason }
      );
      alert("❌ Đã từ chối vận đơn.");
      setShowRejectModal(null);
      setRejectReason("");
      fetchShipments();
      if (onUpdate) onUpdate();
    } catch (err) {
      alert("Lỗi: " + (err.response?.data?.error || err.message));
    } finally {
      setActionLoading(null);
    }
  };

  const handleExport = async (shipmentId) => {
    if (
      !confirm(
        "Xác nhận xuất kho? Trạng thái sẽ chuyển thành 'In Transit'."
      )
    )
      return;
    setActionLoading(shipmentId);
    try {
      await axios.put(
        `http://localhost:5001/api/shipments/${shipmentId}/export`
      );
      alert("🚛 Đã xuất kho thành công! Trạng thái: In Transit");
      fetchShipments();
      if (onUpdate) onUpdate();
    } catch (err) {
      alert("Lỗi: " + (err.response?.data?.error || err.message));
    } finally {
      setActionLoading(null);
    }
  };

  // Mask waybill ID for warehouse role
  const maskTrackingNumber = (tracking) => {
    if (!tracking || tracking.length < 6) return "••••••";
    return tracking.slice(0, 4) + "••••" + tracking.slice(-3);
  };

  const filteredShipments = shipments.filter((s) => {
    if (filter === "pending") return s.status === "Pending Approval";
    if (filter === "approved") return s.status === "Approved";
    if (filter === "rejected") return s.status === "Rejected";
    return true;
  });

  const statusBadge = (status) => {
    const map = {
      "Pending Approval": "bg-warning bg-opacity-25 text-warning",
      Approved: "bg-success bg-opacity-25 text-success",
      Rejected: "bg-danger bg-opacity-25 text-danger",
      "In Transit": "bg-info bg-opacity-25 text-info",
      Delivered: "bg-success bg-opacity-25 text-success",
    };
    return map[status] || "bg-secondary bg-opacity-25 text-secondary";
  };

  const pendingCount = shipments.filter(
    (s) => s.status === "Pending Approval"
  ).length;
  const approvedCount = shipments.filter(
    (s) => s.status === "Approved"
  ).length;
  const inTransitCount = shipments.filter(
    (s) => s.status === "In Transit"
  ).length;

  return (
    <div className="fade-in-up">
      {/* KPI Cards */}
      <div className="row g-3 mb-4">
        <div className="col-md-4">
          <div className="glass p-4 d-flex align-items-center gap-3">
            <div
              className="p-3 rounded-circle"
              style={{
                background: "rgba(255, 178, 74, 0.15)",
                border: "1px solid rgba(255, 178, 74, 0.3)",
              }}
            >
              <Clock size={24} style={{ color: "#ffb24a" }} />
            </div>
            <div>
              <p className="text-dim small mb-1 text-uppercase fw-semibold">
                Chờ duyệt
              </p>
              <h3 className="mb-0 fw-bold text-warning">{pendingCount}</h3>
            </div>
          </div>
        </div>
        <div className="col-md-4">
          <div className="glass p-4 d-flex align-items-center gap-3">
            <div
              className="p-3 rounded-circle"
              style={{
                background: "rgba(61, 222, 134, 0.15)",
                border: "1px solid rgba(61, 222, 134, 0.3)",
              }}
            >
              <CheckCircle size={24} style={{ color: "#3dde86" }} />
            </div>
            <div>
              <p className="text-dim small mb-1 text-uppercase fw-semibold">
                Đã duyệt
              </p>
              <h3 className="mb-0 fw-bold text-success">{approvedCount}</h3>
            </div>
          </div>
        </div>
        <div className="col-md-4">
          <div className="glass p-4 d-flex align-items-center gap-3">
            <div
              className="p-3 rounded-circle"
              style={{
                background: "rgba(59, 130, 246, 0.15)",
                border: "1px solid rgba(59, 130, 246, 0.3)",
              }}
            >
              <Truck size={24} style={{ color: "#3b82f6" }} />
            </div>
            <div>
              <p className="text-dim small mb-1 text-uppercase fw-semibold">
                Đang vận chuyển
              </p>
              <h3 className="mb-0 fw-bold text-info">{inTransitCount}</h3>
            </div>
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="glass p-4 shadow-lg border border-secondary border-opacity-10 rounded-4">
        <div className="d-flex justify-content-between align-items-center mb-4 flex-wrap gap-3">
          <h5 className="mb-0 fw-bold d-flex align-items-center gap-2 text-gold">
            <ShieldCheck size={20} />
            Quản lý duyệt vận đơn
          </h5>
          <div className="d-flex gap-2">
            {["all", "pending", "approved", "rejected"].map((f) => (
              <button
                key={f}
                className={`btn btn-sm ${
                  filter === f
                    ? "btn-gold text-dark"
                    : "btn-outline-secondary text-white"
                }`}
                onClick={() => setFilter(f)}
              >
                {f === "all"
                  ? "Tất cả"
                  : f === "pending"
                  ? "Chờ duyệt"
                  : f === "approved"
                  ? "Đã duyệt"
                  : "Từ chối"}
              </button>
            ))}
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
                <th>Mã vận đơn</th>
                <th>Lộ trình</th>
                <th>Sản phẩm</th>
                <th>Số lượng</th>
                <th>Trạng thái</th>
                <th className="text-end">Hành động</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan="6" className="text-center py-5 text-dim">
                    <div className="spinner-border spinner-border-sm text-gold"></div>{" "}
                    Đang tải...
                  </td>
                </tr>
              ) : filteredShipments.length === 0 ? (
                <tr>
                  <td colSpan="6" className="text-center py-5 text-dim">
                    Không có vận đơn nào
                  </td>
                </tr>
              ) : (
                filteredShipments.map((s) => (
                  <tr key={s.shipment_id}>
                    <td>
                      <div className="fw-bold text-white font-monospace">
                        {isWarehouse
                          ? maskTrackingNumber(s.tracking_number)
                          : s.tracking_number}
                      </div>
                      <div className="text-dim x-small">
                        {new Date(s.shipment_date).toLocaleDateString("vi-VN")}
                      </div>
                    </td>
                    <td>
                      <div className="small d-flex align-items-center gap-2">
                        <span className="text-white">{s.origin_address}</span>
                        <ArrowRight size={12} className="text-dim" />
                        <span className="text-white">
                          {s.destination_address}
                        </span>
                      </div>
                    </td>
                    <td>
                      <span className="text-white small">
                        {s.logistics_name}
                      </span>
                    </td>
                    <td>
                      {/* Warehouse can't see price - only item info */}
                      {isWarehouse ? (
                        <span className="text-dim">••••</span>
                      ) : (
                        <span className="fw-bold text-gold">
                          ${parseFloat(s.total_value).toLocaleString()}
                        </span>
                      )}
                    </td>
                    <td>
                      <span
                        className={`badge rounded-pill px-3 py-2 ${statusBadge(
                          s.status
                        )}`}
                      >
                        {s.status}
                      </span>
                    </td>
                    <td className="text-end">
                      <div className="d-flex gap-1 justify-content-end">
                        {s.status === "Pending Approval" && (
                          <>
                            <button
                              className="btn btn-sm btn-success d-flex align-items-center gap-1"
                              onClick={() => handleApprove(s.shipment_id)}
                              disabled={actionLoading === s.shipment_id}
                            >
                              <CheckCircle size={14} /> Duyệt
                            </button>
                            <button
                              className="btn btn-sm btn-outline-danger d-flex align-items-center gap-1"
                              onClick={() =>
                                setShowRejectModal(s.shipment_id)
                              }
                              disabled={actionLoading === s.shipment_id}
                            >
                              <XCircle size={14} /> Từ chối
                            </button>
                          </>
                        )}
                        {s.status === "Approved" && (
                          <button
                            className="btn btn-sm btn-info text-dark d-flex align-items-center gap-1"
                            onClick={() => handleExport(s.shipment_id)}
                            disabled={actionLoading === s.shipment_id}
                          >
                            <Truck size={14} /> Xuất kho
                          </button>
                        )}
                        {s.status === "In Transit" && (
                          <span className="badge bg-info bg-opacity-10 text-info px-3 py-2">
                            <Truck size={12} /> Đang vận chuyển
                          </span>
                        )}
                        {s.status === "Delivered" && (
                          <span className="badge bg-success bg-opacity-10 text-success px-3 py-2">
                            <CheckCircle size={12} /> Hoàn tất
                          </span>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Reject Modal */}
      {showRejectModal && (
        <div
          className="position-fixed top-0 start-0 w-100 h-100 d-flex align-items-center justify-content-center fade-in"
          style={{ zIndex: 1050, backgroundColor: "rgba(0,0,0,0.7)" }}
        >
          <div
            className="glass border border-secondary border-opacity-25 rounded-3 shadow-lg p-4"
            style={{ width: "450px" }}
          >
            <h5 className="text-white fw-bold mb-3 d-flex align-items-center gap-2">
              <AlertTriangle size={20} className="text-danger" />
              Từ chối vận đơn
            </h5>
            <div className="mb-3">
              <label className="form-label text-dim small">
                Lý do từ chối (tùy chọn)
              </label>
              <textarea
                className="form-control bg-dark text-white border-secondary"
                rows="3"
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                placeholder="Nhập lý do từ chối..."
              />
            </div>
            <div className="d-flex gap-2 justify-content-end">
              <button
                className="btn btn-outline-secondary text-white"
                onClick={() => {
                  setShowRejectModal(null);
                  setRejectReason("");
                }}
              >
                Hủy
              </button>
              <button
                className="btn btn-danger"
                onClick={() => handleReject(showRejectModal)}
                disabled={actionLoading}
              >
                Xác nhận từ chối
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ShipmentApproval;
