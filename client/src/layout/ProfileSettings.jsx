import React, { useState, useEffect } from 'react';
import {
    User, Mail, Phone, Shield, Lock, Save, Eye, EyeOff,
    CheckCircle, AlertCircle, Settings, Key, RefreshCcw
} from 'lucide-react';
import axios from 'axios';

const ProfileSettings = ({ user }) => {
    const [activeSection, setActiveSection] = useState('profile');
    const [profile, setProfile] = useState({ full_name: '', email: '', phone: '', username: '', role: '' });
    const [profileLoading, setProfileLoading] = useState(true);
    const [profileSaving, setProfileSaving] = useState(false);

    const [pwForm, setPwForm] = useState({ currentPassword: '', newPassword: '', confirmPassword: '' });
    const [showPw, setShowPw] = useState({ current: false, newPw: false, confirm: false });
    const [pwSaving, setPwSaving] = useState(false);

    const [toast, setToast] = useState(null); // { type: 'success'|'error', msg: string }

    const showToast = (type, msg) => {
        setToast({ type, msg });
        setTimeout(() => setToast(null), 3500);
    };

    useEffect(() => {
        const fetchProfile = async () => {
            try {
                const res = await axios.get('http://localhost:5001/api/auth/me/profile');
                setProfile(res.data);
            } catch (e) {
                showToast('error', 'Không thể tải hồ sơ: ' + (e.response?.data?.error || e.message));
            } finally {
                setProfileLoading(false);
            }
        };
        fetchProfile();
    }, []);

    const handleProfileSave = async (e) => {
        e.preventDefault();
        if (!profile.full_name || !profile.email) return showToast('error', 'Họ tên và Email là bắt buộc');
        setProfileSaving(true);
        try {
            await axios.put('http://localhost:5001/api/auth/me/profile', {
                fullName: profile.full_name,
                email: profile.email,
                phone: profile.phone
            });
            showToast('success', '✅ Cập nhật hồ sơ thành công!');
        } catch (e) {
            showToast('error', e.response?.data?.error || 'Lỗi khi cập nhật hồ sơ');
        } finally { setProfileSaving(false); }
    };

    const handlePasswordChange = async (e) => {
        e.preventDefault();
        if (pwForm.newPassword !== pwForm.confirmPassword) return showToast('error', 'Mật khẩu xác nhận không khớp');
        if (pwForm.newPassword.length < 6) return showToast('error', 'Mật khẩu mới phải có ít nhất 6 ký tự');
        setPwSaving(true);
        try {
            await axios.put('http://localhost:5001/api/auth/me/password', {
                currentPassword: pwForm.currentPassword,
                newPassword: pwForm.newPassword
            });
            showToast('success', '✅ Đổi mật khẩu thành công!');
            setPwForm({ currentPassword: '', newPassword: '', confirmPassword: '' });
        } catch (e) {
            showToast('error', e.response?.data?.error || 'Lỗi đổi mật khẩu');
        } finally { setPwSaving(false); }
    };

    const getRoleBadge = (role) => {
        const map = {
            Admin: { cls: 'bg-danger bg-opacity-20 text-danger border-danger', label: '👑 Admin' },
            Staff: { cls: 'bg-primary bg-opacity-20 text-primary border-primary', label: '👤 Staff' },
            Warehouse: { cls: 'bg-success bg-opacity-20 text-success border-success', label: '🏭 Warehouse' }
        };
        const cfg = map[role] || { cls: 'bg-secondary bg-opacity-20 text-secondary border-secondary', label: role };
        return <span className={`badge border px-3 py-2 fw-semibold ${cfg.cls}`}>{cfg.label}</span>;
    };

    const sections = [
        { id: 'profile', Icon: User, label: 'Hồ sơ cá nhân' },
        { id: 'password', Icon: Key, label: 'Đổi mật khẩu' },
        { id: 'security', Icon: Shield, label: 'Bảo mật & Phiên' },
    ];

    const pwStrength = (pw) => {
        if (!pw) return { level: 0, label: '', color: '' };
        let score = 0;
        if (pw.length >= 6) score++;
        if (pw.length >= 10) score++;
        if (/[A-Z]/.test(pw)) score++;
        if (/[0-9]/.test(pw)) score++;
        if (/[^A-Za-z0-9]/.test(pw)) score++;
        const map = [
            { level: 0, label: '', color: '' },
            { level: 1, label: 'Rất yếu', color: '#ef4444' },
            { level: 2, label: 'Yếu', color: '#f97316' },
            { level: 3, label: 'Trung bình', color: '#eab308' },
            { level: 4, label: 'Mạnh', color: '#22c55e' },
            { level: 5, label: 'Rất mạnh', color: '#10b981' },
        ];
        return map[score] || map[4];
    };

    const strength = pwStrength(pwForm.newPassword);

    return (
        <div className="glass p-4 fade-in-up h-100 d-flex flex-column" style={{ minHeight: '80vh' }}>
            {/* Toast */}
            {toast && (
                <div
                    className={`position-fixed top-0 end-0 m-4 px-4 py-3 rounded-3 shadow-lg d-flex align-items-center gap-2 fade-in`}
                    style={{
                        zIndex: 9999,
                        background: toast.type === 'success' ? 'rgba(16,185,129,0.15)' : 'rgba(239,68,68,0.15)',
                        border: `1px solid ${toast.type === 'success' ? 'rgba(16,185,129,0.4)' : 'rgba(239,68,68,0.4)'}`,
                        backdropFilter: 'blur(10px)',
                        color: toast.type === 'success' ? '#10b981' : '#ef4444'
                    }}
                >
                    {toast.type === 'success' ? <CheckCircle size={18} /> : <AlertCircle size={18} />}
                    <span className="fw-semibold">{toast.msg}</span>
                </div>
            )}

            {/* Header */}
            <div className="d-flex align-items-center gap-3 mb-4 pb-4 border-bottom border-light border-opacity-10">
                <div className="p-2 rounded-3" style={{ background: 'rgba(212,175,55,0.15)' }}>
                    <Settings size={24} className="text-gold" />
                </div>
                <div>
                    <h5 className="mb-0 fw-bold text-gold">Cài đặt & Hồ sơ</h5>
                    <small className="text-dim">Quản lý thông tin tài khoản và bảo mật</small>
                </div>
            </div>

            <div className="row g-4 flex-grow-1">
                {/* Left Nav */}
                <div className="col-md-3">
                    {/* Avatar Card */}
                    <div className="p-4 rounded-3 text-center mb-3"
                        style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}>
                        <div className="mx-auto mb-3 d-flex align-items-center justify-content-center rounded-circle"
                            style={{ width: 80, height: 80, background: 'rgba(212,175,55,0.2)', border: '2px solid rgba(212,175,55,0.5)' }}>
                            <User size={36} className="text-gold" />
                        </div>
                        <div className="fw-bold text-white">{profile.username || user?.username}</div>
                        <div className="mt-2">{getRoleBadge(profile.role || user?.role)}</div>
                        <div className="text-dim x-small mt-2">{profile.email}</div>
                    </div>

                    {/* Nav */}
                    <div className="d-flex flex-column gap-1">
                        {sections.map(({ id, Icon, label }) => (
                            <button
                                key={id}
                                className={`btn text-start d-flex align-items-center gap-2 py-2 px-3 border-0 rounded-3 ${activeSection === id ? 'btn-gold text-black' : 'text-dim hover-light'}`}
                                onClick={() => setActiveSection(id)}
                            >
                                <Icon size={16} />
                                <span className="fw-semibold small">{label}</span>
                            </button>
                        ))}
                    </div>
                </div>

                {/* Right Content */}
                <div className="col-md-9">
                    {/* --- Profile Section --- */}
                    {activeSection === 'profile' && (
                        <div className="p-4 rounded-3" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}>
                            <h6 className="text-gold fw-bold mb-4 d-flex align-items-center gap-2">
                                <User size={16} /> Thông tin cá nhân
                            </h6>

                            {profileLoading ? (
                                <div className="text-center py-5">
                                    <div className="spinner-border text-gold" />
                                    <div className="text-dim mt-2">Đang tải...</div>
                                </div>
                            ) : (
                                <form onSubmit={handleProfileSave}>
                                    <div className="row g-3">
                                        <div className="col-md-6">
                                            <label className="text-dim x-small text-uppercase mb-1">Tên đăng nhập</label>
                                            <div className="d-flex align-items-center gap-2 p-2 rounded-3"
                                                style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)' }}>
                                                <User size={16} className="text-dim" />
                                                <span className="text-white fw-semibold">{profile.username}</span>
                                                <span className="badge bg-secondary bg-opacity-25 text-dim ms-auto x-small">Không thể thay đổi</span>
                                            </div>
                                        </div>

                                        <div className="col-md-6">
                                            <label className="text-dim x-small text-uppercase mb-1">Vai trò</label>
                                            <div className="d-flex align-items-center gap-2 p-2 rounded-3"
                                                style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)' }}>
                                                <Shield size={16} className="text-dim" />
                                                <span>{getRoleBadge(profile.role)}</span>
                                            </div>
                                        </div>

                                        <div className="col-12">
                                            <label className="text-dim x-small text-uppercase mb-1">Họ và tên *</label>
                                            <div className="input-group">
                                                <span className="input-group-text bg-black border-secondary border-opacity-25">
                                                    <User size={16} className="text-dim" />
                                                </span>
                                                <input
                                                    type="text"
                                                    className="form-control bg-black border-secondary border-opacity-25 text-white"
                                                    placeholder="Nhập họ và tên đầy đủ"
                                                    value={profile.full_name}
                                                    onChange={e => setProfile(p => ({ ...p, full_name: e.target.value }))}
                                                    required
                                                />
                                            </div>
                                        </div>

                                        <div className="col-md-7">
                                            <label className="text-dim x-small text-uppercase mb-1">Email *</label>
                                            <div className="input-group">
                                                <span className="input-group-text bg-black border-secondary border-opacity-25">
                                                    <Mail size={16} className="text-dim" />
                                                </span>
                                                <input
                                                    type="email"
                                                    className="form-control bg-black border-secondary border-opacity-25 text-white"
                                                    placeholder="email@securechain.com"
                                                    value={profile.email}
                                                    onChange={e => setProfile(p => ({ ...p, email: e.target.value }))}
                                                    required
                                                />
                                            </div>
                                        </div>

                                        <div className="col-md-5">
                                            <label className="text-dim x-small text-uppercase mb-1">Số điện thoại</label>
                                            <div className="input-group">
                                                <span className="input-group-text bg-black border-secondary border-opacity-25">
                                                    <Phone size={16} className="text-dim" />
                                                </span>
                                                <input
                                                    type="tel"
                                                    className="form-control bg-black border-secondary border-opacity-25 text-white"
                                                    placeholder="0xxx xxx xxx"
                                                    value={profile.phone}
                                                    onChange={e => setProfile(p => ({ ...p, phone: e.target.value }))}
                                                />
                                            </div>
                                        </div>

                                        <div className="col-12 d-flex justify-content-end pt-2">
                                            <button type="submit" className="btn btn-gold d-flex align-items-center gap-2" disabled={profileSaving}>
                                                {profileSaving ? <span className="spinner-border spinner-border-sm" /> : <Save size={16} />}
                                                {profileSaving ? 'Đang lưu...' : 'Lưu thay đổi'}
                                            </button>
                                        </div>
                                    </div>
                                </form>
                            )}
                        </div>
                    )}

                    {/* --- Password Section --- */}
                    {activeSection === 'password' && (
                        <div className="p-4 rounded-3" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}>
                            <h6 className="text-gold fw-bold mb-4 d-flex align-items-center gap-2">
                                <Key size={16} /> Đổi mật khẩu
                            </h6>

                            <form onSubmit={handlePasswordChange}>
                                <div className="d-flex flex-column gap-3" style={{ maxWidth: 480 }}>
                                    {/* Current */}
                                    <div>
                                        <label className="text-dim x-small text-uppercase mb-1">Mật khẩu hiện tại *</label>
                                        <div className="input-group">
                                            <span className="input-group-text bg-black border-secondary border-opacity-25">
                                                <Lock size={16} className="text-dim" />
                                            </span>
                                            <input
                                                type={showPw.current ? 'text' : 'password'}
                                                className="form-control bg-black border-secondary border-opacity-25 text-white"
                                                placeholder="Nhập mật khẩu hiện tại"
                                                value={pwForm.currentPassword}
                                                onChange={e => setPwForm(p => ({ ...p, currentPassword: e.target.value }))}
                                                required
                                            />
                                            <button type="button" className="input-group-text bg-black border-secondary border-opacity-25 text-dim"
                                                onClick={() => setShowPw(s => ({ ...s, current: !s.current }))}>
                                                {showPw.current ? <EyeOff size={16} /> : <Eye size={16} />}
                                            </button>
                                        </div>
                                    </div>

                                    {/* New */}
                                    <div>
                                        <label className="text-dim x-small text-uppercase mb-1">Mật khẩu mới *</label>
                                        <div className="input-group">
                                            <span className="input-group-text bg-black border-secondary border-opacity-25">
                                                <Lock size={16} className="text-dim" />
                                            </span>
                                            <input
                                                type={showPw.newPw ? 'text' : 'password'}
                                                className="form-control bg-black border-secondary border-opacity-25 text-white"
                                                placeholder="Tối thiểu 6 ký tự"
                                                value={pwForm.newPassword}
                                                onChange={e => setPwForm(p => ({ ...p, newPassword: e.target.value }))}
                                                required
                                            />
                                            <button type="button" className="input-group-text bg-black border-secondary border-opacity-25 text-dim"
                                                onClick={() => setShowPw(s => ({ ...s, newPw: !s.newPw }))}>
                                                {showPw.newPw ? <EyeOff size={16} /> : <Eye size={16} />}
                                            </button>
                                        </div>
                                        {/* Strength bar */}
                                        {pwForm.newPassword && (
                                            <div className="mt-2">
                                                <div className="d-flex justify-content-between mb-1">
                                                    <span className="x-small text-dim">Độ mạnh mật khẩu</span>
                                                    <span className="x-small fw-bold" style={{ color: strength.color }}>{strength.label}</span>
                                                </div>
                                                <div className="rounded-pill overflow-hidden" style={{ height: 4, background: 'rgba(255,255,255,0.1)' }}>
                                                    <div style={{ width: `${(strength.level / 5) * 100}%`, height: '100%', background: strength.color, transition: 'all 0.3s' }} />
                                                </div>
                                            </div>
                                        )}
                                    </div>

                                    {/* Confirm */}
                                    <div>
                                        <label className="text-dim x-small text-uppercase mb-1">Xác nhận mật khẩu mới *</label>
                                        <div className="input-group">
                                            <span className="input-group-text bg-black border-secondary border-opacity-25">
                                                <Lock size={16} className="text-dim" />
                                            </span>
                                            <input
                                                type={showPw.confirm ? 'text' : 'password'}
                                                className="form-control bg-black border-secondary border-opacity-25 text-white"
                                                placeholder="Nhập lại mật khẩu mới"
                                                value={pwForm.confirmPassword}
                                                onChange={e => setPwForm(p => ({ ...p, confirmPassword: e.target.value }))}
                                                required
                                            />
                                            <button type="button" className="input-group-text bg-black border-secondary border-opacity-25 text-dim"
                                                onClick={() => setShowPw(s => ({ ...s, confirm: !s.confirm }))}>
                                                {showPw.confirm ? <EyeOff size={16} /> : <Eye size={16} />}
                                            </button>
                                        </div>
                                        {pwForm.confirmPassword && pwForm.newPassword !== pwForm.confirmPassword && (
                                            <div className="text-danger x-small mt-1 d-flex align-items-center gap-1">
                                                <AlertCircle size={12} /> Mật khẩu không khớp
                                            </div>
                                        )}
                                    </div>

                                    <button type="submit" className="btn btn-gold d-flex align-items-center gap-2 align-self-start" disabled={pwSaving}>
                                        {pwSaving ? <span className="spinner-border spinner-border-sm" /> : <Key size={16} />}
                                        {pwSaving ? 'Đang xử lý...' : 'Đổi mật khẩu'}
                                    </button>
                                </div>
                            </form>
                        </div>
                    )}

                    {/* --- Security Section --- */}
                    {activeSection === 'security' && (
                        <div className="d-flex flex-column gap-3">
                            {/* Encryption Status */}
                            <div className="p-4 rounded-3" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}>
                                <h6 className="text-gold fw-bold mb-3 d-flex align-items-center gap-2">
                                    <Shield size={16} /> Trạng thái bảo mật
                                </h6>
                                <div className="d-flex flex-column gap-2">
                                    {[
                                        { label: 'Mã hóa dữ liệu', value: 'AES-256-GCM (Envelope Encryption)', ok: true },
                                        { label: 'Bảo vệ mật khẩu', value: 'Argon2id (Memory-Hard)', ok: true },
                                        { label: 'Xác thực phiên', value: 'JSON Web Token (JWT)', ok: true },
                                        { label: 'Hashing mù (Blind Index)', value: 'SHA-256 HMAC', ok: true },
                                        { label: 'Truyền tải', value: 'HTTPS / TLS 1.3', ok: true },
                                    ].map(({ label, value, ok }) => (
                                        <div key={label} className="d-flex align-items-center justify-content-between py-2 border-bottom border-light border-opacity-5">
                                            <span className="text-dim small">{label}</span>
                                            <div className="d-flex align-items-center gap-2">
                                                <span className="text-white fw-semibold x-small">{value}</span>
                                                <CheckCircle size={14} className="text-success" />
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            {/* Session Info */}
                            <div className="p-4 rounded-3" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}>
                                <h6 className="text-gold fw-bold mb-3 d-flex align-items-center gap-2">
                                    <RefreshCcw size={16} /> Phiên đăng nhập hiện tại
                                </h6>
                                <div className="d-flex flex-column gap-2">
                                    <div className="d-flex justify-content-between py-2 border-bottom border-light border-opacity-5">
                                        <span className="text-dim small">Tài khoản</span>
                                        <span className="text-white fw-bold">{profile.username}</span>
                                    </div>
                                    <div className="d-flex justify-content-between py-2 border-bottom border-light border-opacity-5">
                                        <span className="text-dim small">Vai trò</span>
                                        <span>{getRoleBadge(profile.role)}</span>
                                    </div>
                                    <div className="d-flex justify-content-between py-2">
                                        <span className="text-dim small">Đăng nhập lúc</span>
                                        <span className="text-white small">{new Date().toLocaleString('vi-VN')}</span>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default ProfileSettings;
