import React, { useState, useEffect } from "react";
import axios from "axios";
import { UserCheck, UserX, Shield, CheckCircle2 } from "lucide-react";

const AccountApproval = () => {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const roles = ["Manager", "Staff", "Warehouse"];

  const fetchPendingUsers = async () => {
    setLoading(true);
    setError("");
    try {
      const response = await axios.get("http://localhost:5001/api/admin/users/pending");
      // Add a local selectedRole state for UI
      const initUsers = response.data.map((u) => ({ ...u, selectedRole: "Staff" }));
      setUsers(initUsers);
    } catch (err) {
      setError(err.response?.data?.error || "Lỗi khi tải danh sách chờ duyệt");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPendingUsers();
  }, []);

  const handleRoleChange = (userId, role) => {
    setUsers((prev) =>
      prev.map((u) => (u.user_id === userId ? { ...u, selectedRole: role } : u))
    );
  };

  const handleApprove = async (userId, role) => {
    setLoading(true);
    setError("");
    setSuccess("");
    try {
      const response = await axios.put(`http://localhost:5001/api/admin/users/${userId}/approve`, { role });
      setSuccess(response.data.message || "Tài khoản đã được duyệt thành công!");
      fetchPendingUsers();
    } catch (err) {
      setError(err.response?.data?.error || "Lỗi khi phê duyệt tài khoản");
      setLoading(false);
    }
  };

  return (
    <div className="container-fluid py-4 min-vh-100">
      <div className="d-flex justify-content-between align-items-center mb-4">
        <h4 className="text-white fw-bold mb-0 d-flex align-items-center gap-2">
          <UserCheck className="text-gold" />
          Phê duyệt tài khoản
        </h4>
        <button className="btn btn-outline-gold btn-sm" onClick={fetchPendingUsers}>
          Làm mới
        </button>
      </div>

      {error && (
        <div className="alert alert-danger bg-danger bg-opacity-10 border-danger text-danger py-2 px-3 small">
          {error}
        </div>
      )}
      {success && (
        <div className="alert alert-success bg-success bg-opacity-10 border-success text-success py-2 px-3 small">
          {success}
        </div>
      )}

      <div className="glass p-4 rounded-4 shadow-lg border border-secondary border-opacity-10 mt-4">
        {loading ? (
          <div className="text-center py-5">
            <div className="spinner-border text-gold mb-3"></div>
            <p className="text-dim">Đang tải danh sách chờ duyệt...</p>
          </div>
        ) : users.length === 0 ? (
          <div className="text-center py-5 opacity-50">
            <CheckCircle2 size={64} className="text-success mb-3 opacity-50 mx-auto" />
            <h5 className="text-white">Không có tài khoản nào chờ duyệt</h5>
            <p className="text-dim mb-0">Tất cả nhân viên đăng ký mới đã được xử lý.</p>
          </div>
        ) : (
          <div className="table-responsive">
            <table className="table table-hover align-middle mb-0 border-0">
              <thead>
                <tr>
                  <th className="text-dim fw-semibold pb-3">HỌ TÊN / USERNAME</th>
                  <th className="text-dim fw-semibold pb-3">LIÊN HỆ</th>
                  <th className="text-dim fw-semibold pb-3 text-center">TRẠNG THÁI</th>
                  <th className="text-dim fw-semibold pb-3">CẤP QUYỀN</th>
                  <th className="text-dim fw-semibold pb-3 text-end">HÀNH ĐỘNG</th>
                </tr>
              </thead>
              <tbody className="border-top-0">
                {users.map((u) => (
                  <tr key={u.user_id}>
                    <td className="py-3">
                      <div className="fw-bold text-white mb-1 d-flex align-items-center gap-2">
                        {u.full_name}
                      </div>
                      <div className="text-dim small font-monospace">@{u.username}</div>
                    </td>
                    <td className="py-3">
                      <div className="text-white small mb-1">{u.email}</div>
                      <div className="text-dim small">{u.phone || "Không có SĐT"}</div>
                    </td>
                    <td className="py-3 text-center">
                      <span className="badge bg-warning bg-opacity-25 text-warning px-3 py-2 rounded-pill">
                        Chờ duyệt
                      </span>
                    </td>
                    <td className="py-3" style={{ width: "200px" }}>
                      <select
                        className="form-select form-select-sm bg-dark text-white border-secondary border-opacity-25 shadow-none"
                        value={u.selectedRole}
                        onChange={(e) => handleRoleChange(u.user_id, e.target.value)}
                      >
                        {roles.map((r) => (
                          <option key={r} value={r}>
                            {r}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="py-3 text-end">
                      <button
                        className="btn btn-sm btn-gold d-flex align-items-center gap-2 ms-auto"
                        onClick={() => handleApprove(u.user_id, u.selectedRole)}
                      >
                        <Shield size={16} />
                        Duyệt & Cấp quyền
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

export default AccountApproval;
