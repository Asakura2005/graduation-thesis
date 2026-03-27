import React, { useState, useEffect } from "react";
import axios from "axios";
import { UserCheck, UserX, Shield, CheckCircle2 } from "lucide-react";
import { useLanguage } from "../i18n/LanguageContext";

const AccountApproval = () => {
  const { t } = useLanguage();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const roles = ["Manager", "Staff", "Warehouse"];

  const fetchPendingUsers = async () => {
    setLoading(true);
    setError("");
    try {
      const response = await axios.get("/api/admin/users/pending");
      const initUsers = response.data.map((u) => ({ ...u, selectedRole: "Staff" }));
      setUsers(initUsers);
    } catch (err) {
      setError(err.response?.data?.error || t('admin.approve.loadError'));
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
      const response = await axios.put(`/api/admin/users/${userId}/approve`, { role });
      setSuccess(response.data.message || t('admin.approve.approveSuccess'));
      fetchPendingUsers();
    } catch (err) {
      setError(err.response?.data?.error || t('admin.approve.approveError'));
      setLoading(false);
    }
  };

  return (
    <div className="container-fluid py-4 min-vh-100">
      <div className="d-flex justify-content-between align-items-center mb-4">
        <h4 className="text-white fw-bold mb-0 d-flex align-items-center gap-2">
          <UserCheck className="text-gold" />
          {t('admin.approve.title')}
        </h4>
        <button className="btn btn-outline-gold btn-sm" onClick={fetchPendingUsers}>
          {t('admin.approve.refresh')}
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
            <p className="text-dim">{t('admin.approve.loadingUsers')}</p>
          </div>
        ) : users.length === 0 ? (
          <div className="text-center py-5 opacity-50">
            <CheckCircle2 size={64} className="text-success mb-3 opacity-50 mx-auto" />
            <h5 className="text-white">{t('admin.approve.noWaiters')}</h5>
            <p className="text-dim mb-0">{t('admin.approve.allProcessed')}</p>
          </div>
        ) : (
          <div className="table-responsive">
            <table className="table table-hover align-middle mb-0 border-0">
              <thead>
                <tr>
                  <th className="text-dim fw-semibold pb-3">{t('admin.approve.colName')}</th>
                  <th className="text-dim fw-semibold pb-3">{t('admin.approve.colContact')}</th>
                  <th className="text-dim fw-semibold pb-3 text-center">{t('admin.approve.colStatus')}</th>
                  <th className="text-dim fw-semibold pb-3">{t('admin.approve.colRole')}</th>
                  <th className="text-dim fw-semibold pb-3 text-end">{t('admin.approve.colAction')}</th>
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
                      <div className="text-dim small">{u.phone || t('admin.approve.noPhone')}</div>
                    </td>
                    <td className="py-3 text-center">
                      <span className="badge bg-warning bg-opacity-25 text-warning px-3 py-2 rounded-pill">
                        {t('admin.approve.statusWait')}
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
                            {t(`roles.${r.toLowerCase()}`)}
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
                        {t('admin.approve.btnApprove')}
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
