import React, { useState, useEffect } from 'react';
import {
    User, Mail, Phone, Shield, Lock, Save, Eye, EyeOff,
    CheckCircle, AlertCircle, Settings, Key, RefreshCcw, Smartphone, QrCode, Copy
} from 'lucide-react';
import axios from 'axios';
import { QRCodeSVG } from 'qrcode.react';

const ProfileSettings = ({ user }) => {
    const [activeSection, setActiveSection] = useState('profile');
    const [profile, setProfile] = useState({ full_name: '', email: '', phone: '', username: '', role: '' });
    const [profileLoading, setProfileLoading] = useState(true);
    const [profileSaving, setProfileSaving] = useState(false);

    const [pwForm, setPwForm] = useState({ currentPassword: '', newPassword: '', confirmPassword: '' });
    const [showPw, setShowPw] = useState({ current: false, newPw: false, confirm: false });
    const [pwSaving, setPwSaving] = useState(false);

    // 2FA states
    const [twoFaSetup, setTwoFaSetup] = useState(null);
    const [twoFaCode, setTwoFaCode] = useState('');
    const [disablePassword, setDisablePassword] = useState('');
    const [twoFaLoading, setTwoFaLoading] = useState(false);

    const [toast, setToast] = useState(null);

    const showToast = (type, msg) => {
        setToast({ type, msg });
        setTimeout(() => setToast(null), 3500);
    };

    useEffect(() => {
        const fetchProfile = async () => {
            try {
                const res = await axios.get('http://localhost:5001/api/auth/me/profile', {
                    headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
                });
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
            }, { headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } });
            showToast('success', '✅ Cập nhật hồ sơ thành công!');
        } catch (e) {
            showToast('error', e.response?.data?.error || 'Lỗi khi cập nhật hồ sơ');
        } finally { setProfileSaving(false); }
    };

    // ---- Password rules ----
    const pwRules = [
        { label: 'Ít nhất 8 ký tự', test: pw => pw.length >= 8 },
        { label: 'Có ít nhất 1 chữ hoa (A-Z)', test: pw => /[A-Z]/.test(pw) },
        { label: 'Có ít nhất 1 chữ số (0-9)', test: pw => /[0-9]/.test(pw) },
        { label: 'Có ít nhất 1 ký tự đặc biệt (!@#$...)', test: pw => /[^A-Za-z0-9]/.test(pw) },
    ];
    const pwValid = (pw) => pwRules.every(r => r.test(pw));

    const handlePasswordChange = async (e) => {
        e.preventDefault();
        if (!pwValid(pwForm.newPassword)) return showToast('error', 'Mật khẩu mới chưa đáp ứng yêu cầu bảo mật');
        if (pwForm.newPassword !== pwForm.confirmPassword) return showToast('error', 'Mật khẩu xác nhận không khớp');
        setPwSaving(true);
        try {
            await axios.put('http://localhost:5001/api/auth/me/password', {
                currentPassword: pwForm.currentPassword,
                newPassword: pwForm.newPassword
            }, { headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } });
            showToast('success', '✅ Đổi mật khẩu thành công!');
            setPwForm({ currentPassword: '', newPassword: '', confirmPassword: '' });
        } catch (e) {
            showToast('error', e.response?.data?.error || 'Lỗi đổi mật khẩu');
        } finally { setPwSaving(false); }
    };

    // 2FA Functions
    const handleGenerate2FA = async () => {
        setTwoFaLoading(true);
        try {
            const res = await axios.get('http://localhost:5001/api/auth/2fa/generate', {
                headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
            });
            setTwoFaSetup(res.data);
            setTwoFaCode('');
        } catch (e) {
            showToast('error', 'Lỗi tạo mã QR 2FA');
        } finally { setTwoFaLoading(false); }
    };

    const handleVerify2FA = async () => {
        if (!twoFaCode || twoFaCode.length < 6) return;
        setTwoFaLoading(true);
        try {
            await axios.post('http://localhost:5001/api/auth/2fa/verify-setup', {
                token: twoFaCode,
                secret: twoFaSetup.secret
            }, { headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } });

            showToast('success', '✅ Kích hoạt 2FA thành công!');
            setProfile(p => ({ ...p, is2FAEnabled: true }));
            setTwoFaSetup(null);
            setTwoFaCode('');
        } catch (e) {
            showToast('error', e.response?.data?.error || 'Mã xác thực không đúng');
        } finally { setTwoFaLoading(false); }
    };

    const handleDisable2FA = async () => {
        if (!disablePassword) return showToast('error', 'Vui lòng nhập mật khẩu xác nhận');
        setTwoFaLoading(true);
        try {
            await axios.post('http://localhost:5001/api/auth/2fa/disable', {
                password: disablePassword
            }, { headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } });

            showToast('success', 'Đã tắt bảo mật 2 lớp');
            setProfile(p => ({ ...p, is2FAEnabled: false }));
            setDisablePassword('');
        } catch (e) {
            showToast('error', e.response?.data?.error || 'Mật khẩu sai');
        } finally { setTwoFaLoading(false); }
    };

    const getRoleBadge = (role) => {
        const map = {
            Admin: { bg: 'rgba(212,175,55,0.2)', border: 'rgba(212,175,55,0.6)', color: '#D4AF37', label: '👑 Admin' },
            Staff: { bg: 'rgba(59,130,246,0.15)', border: 'rgba(59,130,246,0.5)', color: '#93c5fd', label: '👤 Staff' },
            Warehouse: { bg: 'rgba(16,185,129,0.15)', border: 'rgba(16,185,129,0.5)', color: '#6ee7b7', label: '🏭 Warehouse' }
        };
        const cfg = map[role] || { bg: 'rgba(150,150,150,0.15)', border: 'rgba(150,150,150,0.4)', color: '#aaa', label: role };
        return (
            <span style={{ background: cfg.bg, border: `1px solid ${cfg.border}`, color: cfg.color, padding: '4px 12px', borderRadius: 20, fontSize: 12, fontWeight: 600 }}>
                {cfg.label}
            </span>
        );
    };

    const sections = [
        { id: 'profile', Icon: User, label: 'Hồ sơ cá nhân' },
        { id: 'password', Icon: Key, label: 'Đổi mật khẩu' },
        { id: 'twofa', Icon: Smartphone, label: 'Xác thực 2 lớp' },
        { id: 'security', Icon: Shield, label: 'Bảo mật & Phiên' },
    ];

    const pwStrength = (pw) => {
        if (!pw) return { level: 0, label: '', color: '' };
        let score = 0;
        if (pw.length >= 8) score++;
        if (pw.length >= 12) score++;
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
    const cardStyle = { background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' };

    return (
        <div className="glass p-4 fade-in-up h-100 d-flex flex-column" style={{ minHeight: '80vh' }}>
            {/* Toast */}
            {toast && (
                <div className="position-fixed top-0 end-0 m-4 px-4 py-3 rounded-3 shadow-lg d-flex align-items-center gap-2 fade-in"
                    style={{
                        zIndex: 9999,
                        background: toast.type === 'success' ? 'rgba(16,185,129,0.15)' : 'rgba(239,68,68,0.15)',
                        border: `1px solid ${toast.type === 'success' ? 'rgba(16,185,129,0.4)' : 'rgba(239,68,68,0.4)'}`,
                        backdropFilter: 'blur(10px)',
                        color: toast.type === 'success' ? '#10b981' : '#ef4444'
                    }}>
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
                    <div className="p-4 rounded-3 text-center mb-3" style={cardStyle}>
                        <div className="mx-auto mb-3 d-flex align-items-center justify-content-center rounded-circle"
                            style={{ width: 80, height: 80, background: 'rgba(212,175,55,0.2)', border: '2px solid rgba(212,175,55,0.5)' }}>
                            <User size={36} className="text-gold" />
                        </div>
                        <div className="fw-bold text-white">{profile.username || user?.username}</div>
                        <div className="mt-2">{getRoleBadge(profile.role || user?.role)}</div>
                        <div className="text-dim x-small mt-2">{profile.email}</div>
                    </div>

                    <div className="d-flex flex-column gap-1">
                        {sections.map(({ id, Icon, label }) => (
                            <button key={id}
                                className={`btn text-start d-flex align-items-center gap-2 py-2 px-3 border-0 rounded-3 ${activeSection === id ? 'btn-gold text-black' : 'text-dim hover-light'}`}
                                onClick={() => setActiveSection(id)}>
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
                        <div className="p-4 rounded-3" style={cardStyle}>
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
                                                <span className="input-group-text bg-black border-secondary border-opacity-25"><User size={16} className="text-dim" /></span>
                                                <input type="text" className="form-control bg-black border-secondary border-opacity-25 text-white"
                                                    placeholder="Nhập họ và tên đầy đủ" value={profile.full_name}
                                                    onChange={e => setProfile(p => ({ ...p, full_name: e.target.value }))} required />
                                            </div>
                                        </div>
                                        <div className="col-md-7">
                                            <label className="text-dim x-small text-uppercase mb-1">Email *</label>
                                            <div className="input-group">
                                                <span className="input-group-text bg-black border-secondary border-opacity-25"><Mail size={16} className="text-dim" /></span>
                                                <input type="email" className="form-control bg-black border-secondary border-opacity-25 text-white"
                                                    placeholder="email@securechain.com" value={profile.email}
                                                    onChange={e => setProfile(p => ({ ...p, email: e.target.value }))} required />
                                            </div>
                                        </div>
                                        <div className="col-md-5">
                                            <label className="text-dim x-small text-uppercase mb-1">Số điện thoại</label>
                                            <div className="input-group">
                                                <span className="input-group-text bg-black border-secondary border-opacity-25"><Phone size={16} className="text-dim" /></span>
                                                <input type="tel" className="form-control bg-black border-secondary border-opacity-25 text-white"
                                                    placeholder="0xxx xxx xxx" value={profile.phone}
                                                    onChange={e => setProfile(p => ({ ...p, phone: e.target.value }))} />
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
                        <div className="p-4 rounded-3" style={cardStyle}>
                            <h6 className="text-gold fw-bold mb-4 d-flex align-items-center gap-2">
                                <Key size={16} /> Đổi mật khẩu
                            </h6>
                            <form onSubmit={handlePasswordChange}>
                                <div className="d-flex flex-column gap-3" style={{ maxWidth: 500 }}>
                                    {/* Current */}
                                    <div>
                                        <label className="text-dim x-small text-uppercase mb-1">Mật khẩu hiện tại *</label>
                                        <div className="input-group">
                                            <span className="input-group-text bg-black border-secondary border-opacity-25"><Lock size={16} className="text-dim" /></span>
                                            <input type={showPw.current ? 'text' : 'password'}
                                                className="form-control bg-black border-secondary border-opacity-25 text-white"
                                                placeholder="Nhập mật khẩu hiện tại" value={pwForm.currentPassword}
                                                onChange={e => setPwForm(p => ({ ...p, currentPassword: e.target.value }))} required />
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
                                            <span className="input-group-text bg-black border-secondary border-opacity-25"><Lock size={16} className="text-dim" /></span>
                                            <input type={showPw.newPw ? 'text' : 'password'}
                                                className="form-control bg-black border-secondary border-opacity-25 text-white"
                                                placeholder="Nhập mật khẩu mới"
                                                value={pwForm.newPassword}
                                                onChange={e => setPwForm(p => ({ ...p, newPassword: e.target.value }))} required />
                                            <button type="button" className="input-group-text bg-black border-secondary border-opacity-25 text-dim"
                                                onClick={() => setShowPw(s => ({ ...s, newPw: !s.newPw }))}>
                                                {showPw.newPw ? <EyeOff size={16} /> : <Eye size={16} />}
                                            </button>
                                        </div>

                                        {/* Strength */}
                                        {pwForm.newPassword && (
                                            <div className="mt-2">
                                                <div className="d-flex justify-content-between mb-1">
                                                    <span className="x-small text-dim">Độ mạnh</span>
                                                    <span className="x-small fw-bold" style={{ color: strength.color }}>{strength.label}</span>
                                                </div>
                                                <div className="rounded-pill overflow-hidden" style={{ height: 4, background: 'rgba(255,255,255,0.1)' }}>
                                                    <div style={{ width: `${(strength.level / 5) * 100}%`, height: '100%', background: strength.color, transition: 'all 0.3s' }} />
                                                </div>
                                            </div>
                                        )}

                                        {/* Password rules checklist */}
                                        {pwForm.newPassword && (
                                            <div className="mt-3 p-3 rounded-3" style={{ background: 'rgba(0,0,0,0.3)' }}>
                                                <div className="x-small text-dim mb-2 fw-bold">YÊU CẦU MẬT KHẨU</div>
                                                {pwRules.map(rule => {
                                                    const pass = rule.test(pwForm.newPassword);
                                                    return (
                                                        <div key={rule.label} className="d-flex align-items-center gap-2 mb-1">
                                                            {pass
                                                                ? <CheckCircle size={13} style={{ color: '#10b981', flexShrink: 0 }} />
                                                                : <AlertCircle size={13} style={{ color: '#6b7280', flexShrink: 0 }} />}
                                                            <span className="x-small" style={{ color: pass ? '#10b981' : '#6b7280' }}>{rule.label}</span>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        )}
                                    </div>

                                    {/* Confirm */}
                                    <div>
                                        <label className="text-dim x-small text-uppercase mb-1">Xác nhận mật khẩu mới *</label>
                                        <div className="input-group">
                                            <span className="input-group-text bg-black border-secondary border-opacity-25"><Lock size={16} className="text-dim" /></span>
                                            <input type={showPw.confirm ? 'text' : 'password'}
                                                className="form-control bg-black border-secondary border-opacity-25 text-white"
                                                placeholder="Nhập lại mật khẩu mới" value={pwForm.confirmPassword}
                                                onChange={e => setPwForm(p => ({ ...p, confirmPassword: e.target.value }))} required />
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
                                        {pwForm.confirmPassword && pwForm.newPassword === pwForm.confirmPassword && pwForm.confirmPassword && (
                                            <div className="x-small mt-1 d-flex align-items-center gap-1" style={{ color: '#10b981' }}>
                                                <CheckCircle size={12} /> Mật khẩu khớp
                                            </div>
                                        )}
                                    </div>

                                    <button type="submit" className="btn btn-gold d-flex align-items-center gap-2 align-self-start"
                                        disabled={pwSaving || !pwValid(pwForm.newPassword)}>
                                        {pwSaving ? <span className="spinner-border spinner-border-sm" /> : <Key size={16} />}
                                        {pwSaving ? 'Đang xử lý...' : 'Đổi mật khẩu'}
                                    </button>
                                </div>
                            </form>
                        </div>
                    )}

                    {/* --- 2FA Section --- */}
                    {activeSection === 'twofa' && (
                        <div className="d-flex flex-column gap-3">
                            {/* Status banner */}
                            <div className="p-4 rounded-3 d-flex align-items-center gap-3"
                                style={{
                                    background: profile.is2FAEnabled ? 'rgba(16,185,129,0.08)' : 'rgba(234,179,8,0.08)',
                                    border: `1px solid ${profile.is2FAEnabled ? 'rgba(16,185,129,0.25)' : 'rgba(234,179,8,0.25)'}`
                                }}>
                                <div className="p-2 rounded-3" style={{ background: profile.is2FAEnabled ? 'rgba(16,185,129,0.15)' : 'rgba(234,179,8,0.15)' }}>
                                    <Smartphone size={24} style={{ color: profile.is2FAEnabled ? '#10b981' : '#eab308' }} />
                                </div>
                                <div>
                                    <div className="fw-bold text-white">Xác thực 2 lớp (2FA)</div>
                                    <small className="text-dim">Tăng cường bảo mật bằng cách xác minh danh tính qua ứng dụng di động</small>
                                </div>
                                <span className={`ms-auto badge`} style={{
                                    background: profile.is2FAEnabled ? 'rgba(16,185,129,0.2)' : 'rgba(234,179,8,0.2)',
                                    color: profile.is2FAEnabled ? '#10b981' : '#eab308',
                                    border: `1px solid ${profile.is2FAEnabled ? 'rgba(16,185,129,0.4)' : 'rgba(234,179,8,0.4)'}`,
                                    padding: '6px 12px', borderRadius: 20
                                }}>
                                    {profile.is2FAEnabled ? 'Đang hoạt động' : 'Chưa kích hoạt'}
                                </span>
                            </div>

                            {/* Google Authenticator Card */}
                            <div className="p-4 rounded-3" style={cardStyle}>
                                <div className="d-flex align-items-center gap-3 mb-4">
                                    <div className="p-2 rounded-3" style={{ background: 'rgba(255,255,255,0.08)', width: 48, height: 48, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                        <span style={{ fontSize: 24 }}>🔐</span>
                                    </div>
                                    <div className="flex-grow-1">
                                        <div className="fw-bold text-white">Google Authenticator</div>
                                        <small className="text-dim">Tạo mã OTP mỗi 30 giây trên điện thoại của bạn</small>
                                    </div>
                                    {!profile.is2FAEnabled && !twoFaSetup && (
                                        <button className="btn btn-gold btn-sm d-flex align-items-center gap-2" onClick={handleGenerate2FA} disabled={twoFaLoading}>
                                            {twoFaLoading ? <span className="spinner-border spinner-border-sm" /> : <Shield size={14} />} Thiết lập ngay
                                        </button>
                                    )}
                                </div>

                                {profile.is2FAEnabled && (
                                    <div className="d-flex flex-column gap-3 p-3 rounded-3" style={{ background: 'rgba(239,68,68,0.05)', border: '1px solid rgba(239,68,68,0.2)' }}>
                                        <div className="text-danger fw-bold d-flex align-items-center gap-2">
                                            <AlertCircle size={16} /> Tắt tính năng bảo vệ
                                        </div>
                                        <div>
                                            <label className="text-dim x-small text-uppercase mb-1">Nhập mật khẩu của bạn để xác nhận</label>
                                            <div className="input-group" style={{ maxWidth: 300 }}>
                                                <span className="input-group-text bg-black border-danger border-opacity-25"><Lock size={16} className="text-dim" /></span>
                                                <input type="password" placeholder="Nhập mật khẩu" value={disablePassword} onChange={e => setDisablePassword(e.target.value)} className="form-control bg-black border-danger border-opacity-25 text-white" />
                                            </div>
                                        </div>
                                        <button className="btn btn-outline-danger align-self-start btn-sm" disabled={twoFaLoading || !disablePassword} onClick={handleDisable2FA}>
                                            {twoFaLoading ? 'Đang xử lý...' : 'Hủy xác thực 2 lớp'}
                                        </button>
                                    </div>
                                )}

                                {!profile.is2FAEnabled && twoFaSetup && (
                                    <>
                                        {/* Steps */}
                                        <div className="d-flex flex-column gap-3 mb-4">
                                            {[
                                                { step: '1', title: 'Tải ứng dụng', desc: 'Tải Google Authenticator từ App Store hoặc Google Play', icon: '📱' },
                                                { step: '2', title: 'Quét mã QR', desc: 'Mở ứng dụng và quét mã QR bên dưới để liên kết tài khoản', icon: '📷' },
                                                { step: '3', title: 'Nhập mã xác nhận', desc: 'Nhập mã 6 chữ số từ ứng dụng để hoàn tất kích hoạt', icon: '✅' },
                                            ].map(({ step, title, desc, icon }) => (
                                                <div key={step} className="d-flex align-items-start gap-3 p-3 rounded-3"
                                                    style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
                                                    <div className="d-flex align-items-center justify-content-center rounded-circle fw-bold"
                                                        style={{ width: 32, height: 32, background: 'rgba(212,175,55,0.2)', color: '#D4AF37', fontSize: 13, flexShrink: 0 }}>
                                                        {step}
                                                    </div>
                                                    <div>
                                                        <div className="fw-semibold text-white small">{icon} {title}</div>
                                                        <div className="text-dim x-small mt-1">{desc}</div>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>

                                        <div className="d-flex gap-4 align-items-start flex-wrap">
                                            {/* QR Code Container */}
                                            <div className="text-center">
                                                <div className="d-flex align-items-center justify-content-center bg-white rounded-3 p-2 mb-2"
                                                    style={{ width: 140, height: 140, display: 'inline-flex' }}>
                                                    <QRCodeSVG value={twoFaSetup.qrUrl} size={124} level="M" />
                                                </div>
                                                <div className="x-small text-dim">Quét bằng Google Authenticator</div>
                                            </div>

                                            <div className="flex-grow-1" style={{ minWidth: 200 }}>
                                                <div className="mb-3">
                                                    <label className="text-dim x-small text-uppercase mb-1">Hoặc nhập mã gốc (Secret Key)</label>
                                                    <div className="d-flex align-items-center gap-2 p-2 rounded-3"
                                                        style={{ background: 'rgba(0,0,0,0.4)', border: '1px solid rgba(255,255,255,0.1)', fontFamily: 'monospace' }}>
                                                        <span className="text-gold fw-bold text-center ms-2">{twoFaSetup.secret}</span>
                                                        <button className="btn btn-link text-dim ms-auto p-0" title="Sao chép"
                                                            onClick={(e) => {
                                                                navigator.clipboard.writeText(twoFaSetup.secret);
                                                                const el = e.currentTarget; el.style.color = '#10b981'; setTimeout(() => el.style.color = '', 1000);
                                                            }}>
                                                            <Copy size={16} />
                                                        </button>
                                                    </div>
                                                </div>

                                                <div className="mb-3">
                                                    <label className="text-dim x-small text-uppercase mb-1">Nhập mã xác nhận (6 chữ số)</label>
                                                    <div className="input-group">
                                                        <span className="input-group-text bg-black border-secondary border-opacity-25">
                                                            <Smartphone size={16} className="text-dim" />
                                                        </span>
                                                        <input type="text" maxLength={6} className="form-control bg-black border-secondary border-opacity-25 text-white fs-5 fw-bold tracking-widest text-center"
                                                            placeholder="000000" style={{ letterSpacing: 8 }}
                                                            value={twoFaCode} onChange={e => setTwoFaCode(e.target.value.replace(/\D/g, ''))} />
                                                    </div>
                                                </div>

                                                <button className="btn btn-gold w-100 d-flex align-items-center justify-content-center gap-2"
                                                    disabled={twoFaLoading || twoFaCode.length < 6} onClick={handleVerify2FA}>
                                                    {twoFaLoading ? <span className="spinner-border spinner-border-sm" /> : <Shield size={16} />}
                                                    Xác nhận & Kích hoạt 2FA
                                                </button>
                                            </div>
                                        </div>
                                    </>
                                )}
                            </div>
                        </div>
                    )}

                    {/* --- Security Section --- */}
                    {activeSection === 'security' && (
                        <div className="d-flex flex-column gap-3">
                            <div className="p-4 rounded-3" style={cardStyle}>
                                <h6 className="text-gold fw-bold mb-3 d-flex align-items-center gap-2">
                                    <Shield size={16} /> Trạng thái bảo mật
                                </h6>
                                <div className="d-flex flex-column gap-2">
                                    {[
                                        { label: 'Mã hóa dữ liệu', value: 'AES-256-GCM (Envelope Encryption)' },
                                        { label: 'Bảo vệ mật khẩu', value: 'Argon2id (Memory-Hard Hash)' },
                                        { label: 'Xác thực phiên', value: 'JSON Web Token (JWT)' },
                                        { label: 'Hashing mù (Blind Index)', value: 'SHA-256 HMAC' },
                                        { label: 'Xác thực 2 lớp (2FA)', value: profile.is2FAEnabled ? 'Đã kích hoạt' : 'Chưa kích hoạt', highlight: !profile.is2FAEnabled },
                                        { label: 'Truyền tải', value: 'HTTPS / TLS 1.3' },
                                        { label: 'TLS Session Resumption', value: 'Kích hoạt' },
                                        { label: 'Chính sách mật khẩu', value: 'Min 8 ký tự + Chữ hoa + Ký tự đặc biệt' },
                                    ].map(({ label, value, highlight }) => (
                                        <div key={label} className="d-flex align-items-center justify-content-between py-2 border-bottom border-light border-opacity-5">
                                            <span className="text-dim small">{label}</span>
                                            <div className="d-flex align-items-center gap-2">
                                                <span className={`fw-semibold x-small ${highlight ? 'text-warning' : 'text-white'}`}>{value}</span>
                                                {highlight ? <AlertCircle size={14} className="text-warning" /> : <CheckCircle size={14} className="text-success" />}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            <div className="p-4 rounded-3" style={cardStyle}>
                                <h6 className="text-gold fw-bold mb-3 d-flex align-items-center gap-2">
                                    <RefreshCcw size={16} /> Phiên đăng nhập hiện tại
                                </h6>
                                <div className="d-flex flex-column gap-1">
                                    {[
                                        { label: 'Tài khoản', value: profile.username },
                                        { label: 'Vai trò', value: getRoleBadge(profile.role) },
                                        { label: 'Đăng nhập lúc', value: new Date().toLocaleString('vi-VN') },
                                    ].map(({ label, value }) => (
                                        <div key={label} className="d-flex justify-content-between align-items-center py-2 border-bottom border-light border-opacity-5">
                                            <span className="text-dim small">{label}</span>
                                            {typeof value === 'string' ? <span className="text-white small fw-semibold">{value}</span> : value}
                                        </div>
                                    ))}
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
