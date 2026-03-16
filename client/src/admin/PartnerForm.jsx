import React, { useState, useEffect } from "react";
import { useLanguage } from "../i18n/LanguageContext";
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
  Phone,
  AlertCircle,
  CheckCircle,
} from "lucide-react";

const COUNTRY_CODES = [
  { code: '+84', label: 'VN +84' },
  { code: '+1', label: 'US +1' },
  { code: '+44', label: 'UK +44' },
  { code: '+81', label: 'JP +81' },
  { code: '+82', label: 'KR +82' },
  { code: '+86', label: 'CN +86' },
  { code: '+65', label: 'SG +65' },
  { code: '+66', label: 'TH +66' },
  { code: '+61', label: 'AU +61' },
  { code: '+49', label: 'DE +49' },
  { code: '+33', label: 'FR +33' },
];

const PartnerForm = ({ onClose }) => { 
  const { t } = useLanguage();
  // State cho Form
  const [formData, setFormData] = useState({
    name: "",
    contact: "",
    phone: "",
    email: "",
    type: "Supplier",
  });
  const [countryCode, setCountryCode] = useState('+84');
  const [editingId, setEditingId] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [fieldErrors, setFieldErrors] = useState({ phone: '', email: '' });

  // Validation functions
  const validatePhone = (phone) => {
    if (!phone) return ''; // optional field
    const digitsOnly = /^\d{7,12}$/;
    if (!digitsOnly.test(phone)) {
      return 'SĐT không hợp lệ';
    }
    return '';
  };

  const validateEmail = (email) => {
    if (!email) return 'Email là bắt buộc';
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
    if (!emailRegex.test(email)) {
      return 'Email không hợp lệ';
    }
    return '';
  };

  // State cho List
  const [partners, setPartners] = useState([]);
  const [loadingList, setLoadingList] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [toast, setToast] = useState(null); // { type: 'success'|'error', message: '' }

  const showToast = (type, message) => {
    setToast({ type, message });
    setTimeout(() => setToast(null), 3000);
  };

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

    // Validate before submit
    const phoneErr = validatePhone(formData.phone);
    const emailErr = validateEmail(formData.email);
    setFieldErrors({ phone: phoneErr, email: emailErr });
    if (phoneErr || emailErr) return;

    setLoading(true);
    setError("");

    // Combine country code + phone
    const submitData = {
      ...formData,
      phone: formData.phone ? `${countryCode}${formData.phone}` : '',
    };

    try {
      if (editingId) {
        // UPDATE Logic
        await axios.put(
          `http://localhost:5001/api/partners/${editingId}`,
          submitData,
        );
      } else {
        // CREATE Logic
        await axios.post("http://localhost:5001/api/partners", submitData);
      }

      // Reset form và reload list
      const msg = editingId ? 'Cập nhật đối tác thành công!' : 'Thêm đối tác thành công!';
      handleCancelEdit();
      fetchPartners();
      showToast('success', msg);
    } catch (err) {
      setError(err.response?.data?.error || "Không thể lưu đối tác");
      showToast('error', err.response?.data?.error || 'Không thể lưu đối tác');
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
      showToast('success', 'Xóa đối tác thành công!');
    } catch (err) {
      showToast('error', err.response?.data?.error || 'Lỗi khi xóa đối tác');
    }
  };

  const handleEdit = (partner) => {
    setEditingId(partner.partner_id);

    // Parse country code from stored phone
    let phone = partner.contact_phone || '';
    let detectedCode = '+84';
    if (phone.startsWith('+')) {
      const matched = COUNTRY_CODES.find(c => phone.startsWith(c.code));
      if (matched) {
        detectedCode = matched.code;
        phone = phone.slice(matched.code.length);
      }
    }
    setCountryCode(detectedCode);

    setFormData({
      name: partner.partner_name,
      contact: partner.contact_person,
      phone: phone,
      email: partner.email,
      type: partner.type,
    });
    setError("");
    setFieldErrors({ phone: '', email: '' });
  };

  const handleCancelEdit = () => {
    setEditingId(null);
    setCountryCode('+84');
    setFormData({
      name: "",
      contact: "",
      phone: "",
      email: "",
      type: "Supplier",
    });
    setError("");
    setFieldErrors({ phone: '', email: '' });
  };

  const filteredPartners = partners.filter(
    (p) =>
      p.partner_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      p.contact_person.toLowerCase().includes(searchTerm.toLowerCase()),
  );

  return (
    <div className="h-100 d-flex gap-4 fade-in-up position-relative">
      {/* Toast notification */}
      {toast && (
        <div
          className="position-fixed d-flex align-items-center gap-2 px-3 py-2 rounded-3 shadow-lg border"
          style={{
            top: '80px',
            right: '30px',
            zIndex: 9999,
            animation: 'fadeInUp 0.3s ease',
            backgroundColor: 'rgba(15, 23, 42, 0.95)',
            backdropFilter: 'blur(10px)',
            borderColor: toast.type === 'success' ? 'rgba(34, 197, 94, 0.3)' : 'rgba(239, 68, 68, 0.3)',
            color: toast.type === 'success' ? '#4ade80' : '#f87171',
            fontSize: '0.85rem',
          }}
        >
          {toast.type === 'success' ? <CheckCircle size={16} /> : <AlertCircle size={16} />}
          <span className="fw-semibold">{toast.message}</span>
          <button
            className="btn btn-sm p-0 ms-2"
            onClick={() => setToast(null)}
            style={{ lineHeight: 1, color: 'inherit', opacity: 0.8 }}
          >
            <X size={14} />
          </button>
        </div>
      )}
      {/* Cột Trái: Danh sách (Chiếm 7 phần) */}
      <div
        className="glass p-4 shadow-lg border border-secondary border-opacity-10 rounded-4"
        style={{ flex: 7 }}
      >
        <div className="d-flex justify-content-between align-items-center mb-4">
          <h5 className="mb-0 fw-bold d-flex align-items-center gap-2 text-gold">
            <Users size={20} />{t('partners.listTitle')}</h5>
          <div className="input-group w-auto">
            <span className="input-group-text bg-transparent border-end-0 border-secondary">
              <Search size={16} />
            </span>
            <input
              type="text"
              className="form-control border-start-0 border-secondary bg-transparent text-white"
              placeholder={t('partners.searchPlaceholder')}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
        </div>

        <div className="table-responsive flex-grow-1 custom-scrollbar">
          <table className="table table-hover align-middle mb-0 border-0">
            <thead>
              <tr>
                <th>{t('partners.companyName')}</th>
                <th>{t('partners.contactPerson')}</th>
                <th>{t('partners.contact')}</th>
                <th>{t('partners.type')}</th>
                <th className="text-end">{t('partners.action')}</th>
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
                    {t('partners.emptyList')}
                  </td>
                </tr>
              ) : (
                filteredPartners.map((p) => (
                  <tr
                    key={p.partner_id}
                    style={{
                      backgroundColor: editingId === p.partner_id ? "rgba(255, 255, 255, 0.08)" : "transparent",
                      transition: "background-color 0.2s ease"
                    }}
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
                        className={`badge ${p.type === "Supplier"
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
            {editingId ? t('partners.update') : t('partners.addNew')}
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
              <div className="d-flex gap-1">
                <select
                  className="form-select bg-transparent text-white border-secondary"
                  style={{ width: '110px', flex: '0 0 110px', fontSize: '0.8rem' }}
                  value={countryCode}
                  onChange={(e) => setCountryCode(e.target.value)}
                >
                  {COUNTRY_CODES.map(c => (
                    <option key={c.code} value={c.code} className="bg-dark text-white">
                      {c.label}
                    </option>
                  ))}
                </select>
                <input
                  type="tel"
                  className={`form-control bg-transparent text-white ${fieldErrors.phone ? 'border-danger' : ''}`}
                  placeholder="901234567"
                  value={formData.phone}
                  onChange={(e) => {
                    const val = e.target.value.replace(/\D/g, '');
                    setFormData({ ...formData, phone: val });
                    if (fieldErrors.phone) setFieldErrors(prev => ({ ...prev, phone: validatePhone(val) }));
                  }}
                  onBlur={() => setFieldErrors(prev => ({ ...prev, phone: validatePhone(formData.phone) }))}
                />
              </div>
              {fieldErrors.phone && (
                <div className="d-flex align-items-center gap-1 mt-1">
                  <AlertCircle size={12} className="text-danger" />
                  <span className="text-danger" style={{ fontSize: '0.7rem' }}>{fieldErrors.phone}</span>
                </div>
              )}
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
              className={`form-control bg-transparent text-white ${fieldErrors.email ? 'border-danger' : ''}`}
              placeholder="example@gmail.com"
              value={formData.email}
              onChange={(e) => {
                const val = e.target.value;
                setFormData({ ...formData, email: val });
                if (fieldErrors.email) setFieldErrors(prev => ({ ...prev, email: validateEmail(val) }));
              }}
              onBlur={() => setFieldErrors(prev => ({ ...prev, email: validateEmail(formData.email) }))}
              required
            />
            {fieldErrors.email && (
              <div className="d-flex align-items-center gap-1 mt-1">
                <AlertCircle size={12} className="text-danger" />
                <span className="text-danger" style={{ fontSize: '0.7rem' }}>{fieldErrors.email}</span>
              </div>
            )}
          </div>

          <div className="mt-auto">
            <button
              type="submit"
              className={`btn w-100 d-flex align-items-center justify-content-center gap-2 fw-semibold shadow-sm ${editingId ? "btn-primary" : "btn-gold"
                }`}
              disabled={loading}
            >
              {loading ? (
                <span className="spinner-border spinner-border-sm"></span>
              ) : (
                <>
                  <Save size={18} />
                  <span>
                    {editingId ? t('partners.updateInfo') : t('partners.savePartner')}
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
