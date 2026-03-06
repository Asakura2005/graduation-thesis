import React, { useState } from 'react';
import axios from 'axios';
import { UserPlus, User, Lock, Mail, ShieldCheck, Eye, EyeOff, CheckCircle, AlertCircle } from 'lucide-react';


const RegisterPage = ({ onBackToLogin }) => {
    const [formData, setFormData] = useState({
        username: '',
        password: '',
        confirmPassword: '',
        fullName: '',
        email: '',
        phone: ''
    });
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');
    const [showPw, setShowPw] = useState({ password: false, confirm: false });

    const pwRules = [
        { label: 'Ít nhất 8 ký tự', test: pw => pw.length >= 8 },
        { label: 'Có ít nhất 1 chữ hoa (A-Z)', test: pw => /[A-Z]/.test(pw) },
        { label: 'Có ít nhất 1 chữ số (0-9)', test: pw => /[0-9]/.test(pw) },
        { label: 'Có ít nhất 1 ký tự đặc biệt (!@#$...)', test: pw => /[^A-Za-z0-9]/.test(pw) },
    ];
    const pwValid = (pw) => pwRules.every(r => r.test(pw));

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

    const strength = pwStrength(formData.password);

    const handleRegister = async (e) => {
        e.preventDefault();
        setError('');
        setSuccess('');

        if (formData.password !== formData.confirmPassword) {
            return setError('Mật khẩu nhập lại không khớp!');
        }

        if (!pwValid(formData.password)) {
            return setError('Mật khẩu phải chứa ít nhất 8 ký tự, 1 chữ hoa, 1 chữ số và 1 ký tự đặc biệt');
        }

        try {
            const res = await axios.post('http://localhost:5001/api/auth/register', formData);
            setSuccess(res.data.message);
            setTimeout(() => {
                onBackToLogin();
            }, 2000);
        } catch (err) {
            setError(err.response?.data?.error || 'Đăng ký thất bại');
        }
    };

    return (
        <div className="login-container d-flex align-items-center justify-content-center">
            <div className="glass-card p-5" style={{ maxWidth: '450px', width: '100%' }}>
                <div className="text-center mb-4">
                    <div className="login-icon mb-3">
                        <UserPlus size={40} className="text-gold" />
                    </div>
                    <h2 className="text-gold mb-1">Tạo Tài Khoản</h2>
                    <p className="text-light-muted">Tham gia hệ thống Chuỗi cung ứng Bảo mật</p>
                </div>

                {error && <div className="alert alert-danger py-2">{error}</div>}
                {success && <div className="alert alert-success py-2">{success}</div>}

                <form onSubmit={handleRegister}>
                    <div className="mb-3">
                        <label className="text-gold mb-1 small">Họ và Tên</label>
                        <div className="input-group">
                            <span className="input-group-text bg-transparent border-gold border-end-0">
                                <ShieldCheck size={18} className="text-gold" />
                            </span>
                            <input
                                type="text"
                                className="form-control bg-transparent border-gold border-start-0 text-white"
                                placeholder="Nguyen Van A"
                                value={formData.fullName}
                                onChange={(e) => setFormData({ ...formData, fullName: e.target.value })}
                                required
                            />
                        </div>
                    </div>

                    <div className="mb-3">
                        <label className="text-gold mb-1 small">Email</label>
                        <div className="input-group">
                            <span className="input-group-text bg-transparent border-gold border-end-0">
                                <Mail size={18} className="text-gold" />
                            </span>
                            <input
                                type="email"
                                className="form-control bg-transparent border-gold border-start-0 text-white"
                                placeholder="admin@example.com"
                                value={formData.email}
                                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                                required
                            />
                        </div>
                    </div>

                    <div className="mb-3">
                        <label className="text-gold mb-1 small">Số điện thoại</label>
                        <div className="input-group">
                            <span className="input-group-text bg-transparent border-gold border-end-0">
                                <ShieldCheck size={18} className="text-gold" />
                            </span>
                            <input
                                type="tel"
                                className="form-control bg-transparent border-gold border-start-0 text-white"
                                placeholder="0912345678"
                                value={formData.phone}
                                onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                            />
                        </div>
                    </div>

                    <div className="mb-3">
                        <label className="text-gold mb-1 small">Tên đăng nhập</label>
                        <div className="input-group">
                            <span className="input-group-text bg-transparent border-gold border-end-0">
                                <User size={18} className="text-gold" />
                            </span>
                            <input
                                type="text"
                                className="form-control bg-transparent border-gold border-start-0 text-white"
                                placeholder="username"
                                value={formData.username}
                                onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                                required
                            />
                        </div>
                    </div>

                    <div className="mb-4">
                        <label className="text-gold mb-1 small">Mật khẩu</label>
                        <div className="input-group">
                            <span className="input-group-text bg-transparent border-gold border-end-0">
                                <Lock size={18} className="text-gold" />
                            </span>
                            <input
                                type={showPw.password ? 'text' : 'password'}
                                className="form-control bg-transparent border-gold border-start-0 text-white"
                                placeholder="••••••••"
                                value={formData.password}
                                onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                                required
                            />
                            <button type="button" className="input-group-text bg-transparent border-gold text-gold" style={{ borderLeft: 'none' }}
                                onClick={() => setShowPw(s => ({ ...s, password: !s.password }))}>
                                {showPw.password ? <EyeOff size={16} /> : <Eye size={16} />}
                            </button>
                        </div>

                        {/* Strength */}
                        {formData.password && (
                            <div className="mt-2 text-start">
                                <div className="d-flex justify-content-between mb-1">
                                    <span className="x-small text-light-muted">Độ mạnh</span>
                                    <span className="x-small fw-bold" style={{ color: strength.color }}>{strength.label}</span>
                                </div>
                                <div className="rounded-pill overflow-hidden" style={{ height: 4, background: 'rgba(255,255,255,0.1)' }}>
                                    <div style={{ width: `${(strength.level / 5) * 100}%`, height: '100%', background: strength.color, transition: 'all 0.3s' }} />
                                </div>
                            </div>
                        )}

                        {/* Password rules checklist */}
                        {formData.password && (
                            <div className="mt-3 p-3 text-start rounded-3" style={{ background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.05)' }}>
                                <div className="x-small text-light-muted mb-2 fw-bold text-uppercase">YÊU CẦU MẬT KHẨU</div>
                                {pwRules.map(rule => {
                                    const pass = rule.test(formData.password);
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

                    <div className="mb-4">
                        <label className="text-gold mb-1 small">Nhập lại mật khẩu</label>
                        <div className="input-group">
                            <span className="input-group-text bg-transparent border-gold border-end-0">
                                <Lock size={18} className="text-gold" />
                            </span>
                            <input
                                type={showPw.confirm ? 'text' : 'password'}
                                className="form-control bg-transparent border-gold border-start-0 text-white"
                                placeholder="••••••••"
                                value={formData.confirmPassword}
                                onChange={(e) => setFormData({ ...formData, confirmPassword: e.target.value })}
                                required
                            />
                            <button type="button" className="input-group-text bg-transparent border-gold text-gold" style={{ borderLeft: 'none' }}
                                onClick={() => setShowPw(s => ({ ...s, confirm: !s.confirm }))}>
                                {showPw.confirm ? <EyeOff size={16} /> : <Eye size={16} />}
                            </button>
                        </div>
                        {formData.confirmPassword && formData.password !== formData.confirmPassword && (
                            <div className="text-danger text-start x-small mt-2 d-flex align-items-center gap-1">
                                <AlertCircle size={12} /> Mật khẩu không khớp
                            </div>
                        )}
                        {formData.confirmPassword && formData.password === formData.confirmPassword && (
                            <div className="x-small mt-2 text-start d-flex align-items-center gap-1" style={{ color: '#10b981' }}>
                                <CheckCircle size={12} /> Mật khẩu khớp
                            </div>
                        )}
                    </div>


                    <button type="submit" className="glow-button w-100 mb-3 py-2">ĐĂNG KÝ NGAY</button>
                    <button
                        type="button"
                        className="btn btn-link w-100 text-light-muted text-decoration-none small"
                        onClick={onBackToLogin}
                    >
                        Đã có tài khoản? Đăng nhập
                    </button>
                </form>
            </div>
        </div>
    );
};

export default RegisterPage;
