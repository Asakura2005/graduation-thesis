import React, { useState, useEffect } from "react";
import axios from "axios";
import {
  Users,
  User,
  Mail,
  ShieldCheck,
  Tag,
  Search,
  Plus,
  Save,
  Edit,
  Trash2,
  X,
} from "lucide-react";

const PartnerForm = ({ onClose }) => {
  // State cho Form
  const [formData, setFormData] = useState({
    name: "",
    contact: "",
    phone: "",
    email: "",
    type: "Supplier",
  });
  const [editingId, setEditingId] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // State cho List
  const [partners, setPartners] = useState([]);
  const [loadingList, setLoadingList] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");

  const fetchPartners = async () => {
    setLoadingList(true);
    try {
      const response = await axios.get("http://localhost:5001/api/partners");
      setPartners(response.data);
    } catch (err) {
      console.error("Lỗi lấy danh sách đối tác:", err);
    } finally {
      setLoadingList(false);
    }
  };

  useEffect(() => {
    fetchPartners();
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      if (editingId) {
        // UPDATE Logic
        await axios.put(
          `http://localhost:5001/api/partners/${editingId}`,
          formData,
        );
      } else {
        // CREATE Logic
        await axios.post("http://localhost:5001/api/partners", formData);
      }

      // Reset form và reload list
      handleCancelEdit();
      fetchPartners();
    } catch (err) {
      setError(err.response?.data?.error || "Không thể lưu đối tác");
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id) => {
    if (!confirm("Bạn có chắc muốn xóa đối tác này không?")) return;
    try {
      await axios.delete(`http://localhost:5001/api/partners/${id}`);
      fetchPartners();
      if (editingId === id) handleCancelEdit();
    } catch (err) {
      alert(err.response?.data?.error || "Lỗi khi xóa đối tác");
    }
  };

  const handleEdit = (partner) => {
    setEditingId(partner.partner_id);
    setFormData({
      name: partner.partner_name,
      contact: partner.contact_person,
      phone: partner.contact_phone || "",
      email: partner.email,
      type: partner.type,
    });
    setError("");
  };

  const handleCancelEdit = () => {
    setEditingId(null);
    setFormData({
      name: "",
      contact: "",
      phone: "",
      email: "",
      type: "Supplier",
    });
    setError("");
  };

  const filteredPartners = partners.filter(
    (p) =>
      p.partner_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      p.contact_person.toLowerCase().includes(searchTerm.toLowerCase()),
  );

  return (
    <div className="h-100 d-flex gap-4 fade-in-up">
      {/* Cột Trái: Danh sách (Chiếm 7 phần) */}
      <div
        className="glass p-4 shadow-lg border border-secondary border-opacity-10 rounded-4"
        style={{ flex: 7 }}
      >
        <div className="d-flex justify-content-between align-items-center mb-4">
          <h5 className="mb-0 fw-bold d-flex align-items-center gap-2 text-gold">
            <Users size={20} />
            DANH SÁCH ĐỐI TÁC
          </h5>
          <div className="input-group w-auto">
            <span className="input-group-text bg-transparent border-end-0 border-secondary">
              <Search size={16} />
            </span>
            <input
              type="text"
              className="form-control border-start-0 border-secondary bg-transparent text-white"
              placeholder="Tìm kiếm đối tác..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
        </div>

        <div className="table-responsive flex-grow-1 custom-scrollbar">
          <table className="table table-hover align-middle mb-0 border-0">
            <thead>
              <tr>
                <th>Tên Công Ty</th>
                <th>Người Liên Hệ</th>
                <th>Liên Lạc</th>
                <th>Loại</th>
                <th className="text-end">Hành động</th>
              </tr>
            </thead>
            <tbody>
              {loadingList ? (
                <tr>
                  <td colSpan="5" className="text-center py-5">
                    Đang tải dữ liệu...
                  </td>
                </tr>
              ) : filteredPartners.length === 0 ? (
                <tr>
                  <td colSpan="5" className="text-center py-5">
                    Chưa có đối tác nào phù hợp.
                  </td>
                </tr>
              ) : (
                filteredPartners.map((p) => (
                  <tr
                    key={p.partner_id}
                    className={
                      editingId === p.partner_id ? "bg-white bg-opacity-5" : ""
                    }
                  >
                    <td>
                      <div className="fw-bold">{p.partner_name}</div>
                      <div className="text-dim x-small">ID: {p.partner_id}</div>
                    </td>
                    <td>
                      <div className="fw-semibold text-white">
                        {p.contact_person}
                      </div>
                      <div className="text-dim x-small">{p.contact_phone}</div>
                    </td>
                    <td className="text-dim small">{p.email}</td>
                    <td>
                      <span
                        className={`badge ${
                          p.type === "Supplier"
                            ? "bg-warning bg-opacity-25 text-warning"
                            : "bg-info bg-opacity-25 text-info"
                        }`}
                      >
                        {p.type}
                      </span>
                    </td>
                    <td className="text-end">
                      <div className="d-flex justify-content-end gap-2">
                        <button
                          className="btn btn-sm btn-dark rounded-circle"
                          onClick={() => handleEdit(p)}
                          title="Sửa"
                        >
                          <Edit size={14} />
                        </button>

                        <button
                          className="btn btn-sm btn-danger rounded-circle"
                          onClick={() => handleDelete(p.partner_id)}
                          title="Xóa"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Cột Phải: Form Thêm/Sửa (Chiếm 3 phần) */}
      <div className="glass p-4 h-100 d-flex flex-column" style={{ flex: 3 }}>
        <div className="d-flex justify-content-between align-items-center mb-4">
          <h5 className="mb-0 fw-bold text-gold d-flex align-items-center gap-2">
            {editingId ? <Edit size={20} /> : <Plus size={20} />}
            {editingId ? "CẬP NHẬT" : "THÊM MỚI"}
          </h5>
          {editingId && (
            <button
              className="btn btn-sm btn-link text-dim text-decoration-none d-flex align-items-center gap-1"
              onClick={handleCancelEdit}
            >
              <X size={16} /> Hủy
            </button>
          )}
        </div>

        <form
          onSubmit={handleSubmit}
          className="d-flex flex-column gap-3 flex-grow-1"
        >
          {error && (
            <div className="alert alert-danger py-2 small">{error}</div>
          )}

          <div>
            <label className="form-label text-dim x-small text-uppercase fw-bold">
              Tên công ty
            </label>
            <input
              type="text"
              className="form-control bg-transparent text-white"
              placeholder="Nhập tên..."
              value={formData.name}
              onChange={(e) =>
                setFormData({ ...formData, name: e.target.value })
              }
              required
            />
          </div>

          <div>
            <label className="form-label text-dim x-small text-uppercase fw-bold">
              Người liên hệ
            </label>
            <input
              type="text"
              className="form-control bg-transparent text-white"
              placeholder="Họ tên..."
              value={formData.contact}
              onChange={(e) =>
                setFormData({ ...formData, contact: e.target.value })
              }
              required
            />
          </div>

          <div className="row g-2">
            <div className="col-6">
              <label className="form-label text-dim x-small text-uppercase fw-bold">
                Số điện thoại
              </label>
              <input
                type="tel"
                className="form-control bg-transparent text-white"
                placeholder="09xxxx"
                value={formData.phone}
                onChange={(e) =>
                  setFormData({ ...formData, phone: e.target.value })
                }
              />
            </div>
            <div className="col-6">
              <label className="form-label text-dim x-small text-uppercase fw-bold">
                Loại
              </label>
              <select
                className="form-select bg-transparent text-white"
                value={formData.type}
                onChange={(e) =>
                  setFormData({ ...formData, type: e.target.value })
                }
              >
                <option value="Supplier" className="text-white bg-dark">
                  Supplier
                </option>
                <option value="Logistics" className="text-white bg-dark">
                  Logistics
                </option>
                <option value="Warehouse" className="text-white bg-dark">
                  Warehouse
                </option>
              </select>
            </div>
          </div>

          <div>
            <label className="form-label text-dim x-small text-uppercase fw-bold">
              Email
            </label>
            <input
              type="email"
              className="form-control bg-transparent text-white"
              placeholder="email@..."
              value={formData.email}
              onChange={(e) =>
                setFormData({ ...formData, email: e.target.value })
              }
              required
            />
          </div>

          <div className="mt-auto">
            <button
              type="submit"
              className={`btn w-100 d-flex align-items-center justify-content-center gap-2 fw-semibold shadow-sm ${
                editingId ? "btn-primary" : "btn-gold"
              }`}
              disabled={loading}
            >
              {loading ? (
                <span className="spinner-border spinner-border-sm"></span>
              ) : (
                <>
                  <Save size={18} />
                  <span>
                    {editingId ? "CẬP NHẬT THÔNG TIN" : "LƯU ĐỐI TÁC"}
                  </span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default PartnerForm;
