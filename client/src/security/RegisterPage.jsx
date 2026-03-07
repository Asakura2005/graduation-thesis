import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { UserPlus, User, Lock, Mail, Phone, ShieldCheck, Eye, EyeOff, CheckCircle, AlertCircle, KeyRound } from 'lucide-react';

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
    const [loading, setLoading] = useState(false);

    // System status animation
    const [latency, setLatency] = useState(14);
    useEffect(() => {
        const interval = setInterval(() => {
            setLatency(Math.floor(Math.random() * 12) + 8);
        }, 3000);
        return () => clearInterval(interval);
    }, []);

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
            { level: 5, label: 'Rất mạnh', color: '#00e5a0' },
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

        setLoading(true);
        try {
            const res = await axios.post('http://localhost:5001/api/auth/register', formData);
            setSuccess(res.data.message || 'Đăng ký thành công! Đang chuyển về trang đăng nhập...');
            setTimeout(() => {
                onBackToLogin();
            }, 2000);
        } catch (err) {
            setError(err.response?.data?.error || 'Đăng ký thất bại');
        } finally {
            setLoading(false);
        }
    };

    const s = {
        pageWrapper: {
            minHeight: '100vh',
            background: 'linear-gradient(180deg, #0a0e1a 0%, #0d1526 40%, #0f1a2e 100%)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '40px 20px',
            position: 'relative',
            overflow: 'hidden',
            fontFamily: "'Inter', sans-serif",
        },
        gridOverlay: {
            position: 'absolute',
            top: 0, left: 0, right: 0, bottom: 0,
            backgroundImage: `
                linear-gradient(rgba(0, 229, 160, 0.03) 1px, transparent 1px),
                linear-gradient(90deg, rgba(0, 229, 160, 0.03) 1px, transparent 1px)
            `,
            backgroundSize: '60px 60px',
            pointerEvents: 'none',
        },
        glowTop: {
            position: 'absolute',
            top: '-200px',
            left: '50%',
            transform: 'translateX(-50%)',
            width: '600px',
            height: '400px',
            background: 'radial-gradient(ellipse, rgba(0, 229, 160, 0.08) 0%, transparent 70%)',
            pointerEvents: 'none',
        },
        logoIcon: {
            width: '64px',
            height: '64px',
            borderRadius: '16px',
            background: 'linear-gradient(135deg, #00e5a0 0%, #00b880 100%)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            margin: '0 auto 20px',
            boxShadow: '0 8px 32px rgba(0, 229, 160, 0.3)',
        },
        title: {
            fontSize: '28px',
            fontWeight: 800,
            color: '#00e5a0',
            letterSpacing: '3px',
            textAlign: 'center',
            marginBottom: '4px',
        },
        subtitle: {
            fontSize: '11px',
            color: '#4a6a8a',
            letterSpacing: '4px',
            textAlign: 'center',
            textTransform: 'uppercase',
            marginBottom: '32px',
        },
        formCard: {
            width: '100%',
            maxWidth: '520px',
            background: 'rgba(13, 21, 38, 0.85)',
            border: '1px solid rgba(0, 229, 160, 0.12)',
            borderRadius: '16px',
            padding: '36px 40px',
            position: 'relative',
            backdropFilter: 'blur(20px)',
            zIndex: 1,
        },
        formTitle: {
            fontSize: '22px',
            fontWeight: 700,
            color: '#e2e8f0',
            marginBottom: '6px',
        },
        formSubtitle: {
            fontSize: '13px',
            color: '#5a7a9a',
            marginBottom: '24px',
        },
        label: {
            fontSize: '11px',
            fontWeight: 700,
            color: '#00e5a0',
            letterSpacing: '2px',
            textTransform: 'uppercase',
            marginBottom: '8px',
            display: 'block',
        },
        inputGroup: {
            display: 'flex',
            alignItems: 'center',
            background: 'rgba(15, 23, 42, 0.8)',
            border: '1px solid rgba(255, 255, 255, 0.08)',
            borderRadius: '12px',
            padding: '0 16px',
            height: '48px',
            marginBottom: '16px',
            transition: 'border-color 0.3s, box-shadow 0.3s',
        },
        inputIcon: {
            color: '#4a6a8a',
            flexShrink: 0,
            marginRight: '12px',
        },
        input: {
            background: 'transparent',
            border: 'none',
            outline: 'none',
            color: '#e2e8f0',
            fontSize: '14px',
            flex: 1,
            height: '100%',
            fontFamily: "'Inter', sans-serif",
        },
        eyeBtn: {
            background: 'none',
            border: 'none',
            color: '#4a6a8a',
            cursor: 'pointer',
            padding: '4px',
            display: 'flex',
            alignItems: 'center',
            transition: 'color 0.2s',
        },
        submitBtn: {
            width: '100%',
            height: '52px',
            background: 'linear-gradient(135deg, #00e5a0 0%, #00d4aa 50%, #00c49a 100%)',
            border: 'none',
            borderRadius: '12px',
            color: '#0a0e1a',
            fontSize: '14px',
            fontWeight: 700,
            letterSpacing: '3px',
            textTransform: 'uppercase',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '10px',
            transition: 'all 0.3s ease',
            boxShadow: '0 4px 20px rgba(0, 229, 160, 0.3)',
            marginTop: '8px',
        },
        errorBox: {
            background: 'rgba(239, 68, 68, 0.1)',
            border: '1px solid rgba(239, 68, 68, 0.3)',
            borderRadius: '10px',
            padding: '12px 16px',
            marginBottom: '16px',
            fontSize: '13px',
            color: '#f87171',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
        },
        successBox: {
            background: 'rgba(0, 229, 160, 0.1)',
            border: '1px solid rgba(0, 229, 160, 0.3)',
            borderRadius: '10px',
            padding: '12px 16px',
            marginBottom: '16px',
            fontSize: '13px',
            color: '#00e5a0',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
        },
        backLink: {
            textAlign: 'center',
            marginTop: '16px',
            fontSize: '13px',
            color: '#5a7a9a',
        },
        backAnchor: {
            color: '#00e5a0',
            cursor: 'pointer',
            textDecoration: 'none',
            fontWeight: 600,
            marginLeft: '4px',
        },
        strengthRow: {
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: '6px',
        },
        strengthLabel: {
            fontSize: '10px',
            color: '#5a7a9a',
            letterSpacing: '1px',
            textTransform: 'uppercase',
        },
        strengthValue: {
            fontSize: '10px',
            fontWeight: 700,
            letterSpacing: '1px',
        },
        strengthBar: {
            height: '3px',
            borderRadius: '4px',
            background: 'rgba(255, 255, 255, 0.06)',
            overflow: 'hidden',
            marginBottom: '12px',
        },
        strengthFill: {
            height: '100%',
            transition: 'all 0.4s ease',
            borderRadius: '4px',
        },
        rulesBox: {
            background: 'rgba(0, 0, 0, 0.25)',
            border: '1px solid rgba(255, 255, 255, 0.05)',
            borderRadius: '10px',
            padding: '12px 16px',
            marginBottom: '16px',
        },
        rulesTitle: {
            fontSize: '10px',
            fontWeight: 700,
            color: '#4a6a8a',
            letterSpacing: '2px',
            textTransform: 'uppercase',
            marginBottom: '8px',
        },
        ruleItem: {
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            marginBottom: '4px',
            fontSize: '12px',
        },
        matchStatus: {
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            fontSize: '11px',
            marginTop: '-8px',
            marginBottom: '12px',
        },
        footerBadges: {
            display: 'flex',
            justifyContent: 'center',
            gap: '32px',
            marginTop: '28px',
            zIndex: 1,
        },
        footerBadge: {
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            fontSize: '11px',
            color: '#3a5a7a',
            letterSpacing: '2px',
            textTransform: 'uppercase',
        },
        footerBadgeIcon: {
            color: '#00e5a0',
            opacity: 0.6,
        },
        sysInfo: {
            position: 'absolute',
            bottom: '20px',
            left: '24px',
            zIndex: 1,
        },
        sysLine: {
            fontSize: '10px',
            fontFamily: "'Courier New', monospace",
            color: '#2a4a6a',
            letterSpacing: '1px',
            lineHeight: '1.8',
        },
        copyright: {
            textAlign: 'center',
            marginTop: '14px',
            zIndex: 1,
        },
        copyrightText: {
            fontSize: '11px',
            color: '#2a4a6a',
        },
        spinner: {
            width: '20px',
            height: '20px',
            border: '2px solid rgba(10, 14, 26, 0.3)',
            borderTop: '2px solid #0a0e1a',
            borderRadius: '50%',
            animation: 'spin 0.8s linear infinite',
        },
        twoColRow: {
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: '12px',
        },
    };

    return (
        <div style={s.pageWrapper}>
            <div style={s.gridOverlay} />
            <div style={s.glowTop} />

            <style>{`
                @keyframes spin { to { transform: rotate(360deg); } }
                @keyframes fadeInUp {
                    from { opacity: 0; transform: translateY(20px); }
                    to { opacity: 1; transform: translateY(0); }
                }
                @keyframes pulse {
                    0%, 100% { opacity: 1; }
                    50% { opacity: 0.5; }
                }
                .reg-input-group:focus-within {
                    border-color: rgba(0, 229, 160, 0.4) !important;
                    box-shadow: 0 0 0 3px rgba(0, 229, 160, 0.08) !important;
                }
                .reg-submit:hover {
                    transform: translateY(-2px) !important;
                    box-shadow: 0 8px 32px rgba(0, 229, 160, 0.4) !important;
                }
                .reg-submit:active { transform: translateY(0) !important; }
                .reg-submit:disabled { opacity: 0.6; cursor: not-allowed; transform: none !important; }
                .reg-eye-btn:hover { color: #00e5a0 !important; }
                .reg-back-link:hover { text-decoration: underline !important; }
            `}</style>

            {/* Logo */}
            <div style={s.logoIcon}>
                <UserPlus size={28} color="#0a0e1a" strokeWidth={2.5} />
            </div>
            <div style={s.title}>
                SECURE <span style={{ fontWeight: 800 }}>CHAIN</span>
            </div>
            <div style={s.subtitle}>advanced cyber infrastructure</div>

            {/* Form Card */}
            <div style={{ ...s.formCard, animation: 'fadeInUp 0.5s ease' }}>
                <div style={s.formTitle}>Tạo tài khoản mới</div>
                <div style={s.formSubtitle}>
                    Đăng ký để truy cập hệ thống quản lý chuỗi cung ứng bảo mật.
                </div>

                {error && (
                    <div style={s.errorBox}>
                        <AlertCircle size={16} style={{ flexShrink: 0 }} />
                        {error}
                    </div>
                )}
                {success && (
                    <div style={s.successBox}>
                        <CheckCircle size={16} style={{ flexShrink: 0 }} />
                        {success}
                    </div>
                )}

                <form onSubmit={handleRegister}>
                    {/* Full Name */}
                    <label style={s.label}>Họ và tên</label>
                    <div className="reg-input-group" style={s.inputGroup}>
                        <User size={18} style={s.inputIcon} />
                        <input
                            type="text"
                            style={s.input}
                            placeholder="Nguyen Van A"
                            value={formData.fullName}
                            onChange={(e) => setFormData({ ...formData, fullName: e.target.value })}
                            required
                        />
                    </div>

                    {/* Email & Phone - 2 columns */}
                    <div style={s.twoColRow}>
                        <div>
                            <label style={s.label}>Email</label>
                            <div className="reg-input-group" style={s.inputGroup}>
                                <Mail size={18} style={s.inputIcon} />
                                <input
                                    type="email"
                                    style={s.input}
                                    placeholder="admin@example.com"
                                    value={formData.email}
                                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                                    required
                                />
                            </div>
                        </div>
                        <div>
                            <label style={s.label}>Số điện thoại</label>
                            <div className="reg-input-group" style={s.inputGroup}>
                                <Phone size={18} style={s.inputIcon} />
                                <input
                                    type="tel"
                                    style={s.input}
                                    placeholder="0912345678"
                                    value={formData.phone}
                                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                                />
                            </div>
                        </div>
                    </div>

                    {/* Username */}
                    <label style={s.label}>Tên đăng nhập</label>
                    <div className="reg-input-group" style={s.inputGroup}>
                        <ShieldCheck size={18} style={s.inputIcon} />
                        <input
                            type="text"
                            style={s.input}
                            placeholder="Username or Admin ID"
                            value={formData.username}
                            onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                            required
                        />
                    </div>

                    {/* Password */}
                    <label style={s.label}>Mật mã truy cập</label>
                    <div className="reg-input-group" style={s.inputGroup}>
                        <KeyRound size={18} style={s.inputIcon} />
                        <input
                            type={showPw.password ? 'text' : 'password'}
                            style={s.input}
                            placeholder="••••••••••••"
                            value={formData.password}
                            onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                            required
                        />
                        <button
                            type="button"
                            className="reg-eye-btn"
                            style={s.eyeBtn}
                            onClick={() => setShowPw(p => ({ ...p, password: !p.password }))}
                            tabIndex={-1}
                        >
                            {showPw.password ? <EyeOff size={18} /> : <Eye size={18} />}
                        </button>
                    </div>

                    {/* Password Strength Bar */}
                    {formData.password && (
                        <>
                            <div style={s.strengthRow}>
                                <span style={s.strengthLabel}>Độ mạnh mật khẩu</span>
                                <span style={{ ...s.strengthValue, color: strength.color }}>{strength.label}</span>
                            </div>
                            <div style={s.strengthBar}>
                                <div style={{ ...s.strengthFill, width: `${(strength.level / 5) * 100}%`, background: strength.color }} />
                            </div>
                        </>
                    )}

                    {/* Password rules checklist */}
                    {formData.password && (
                        <div style={s.rulesBox}>
                            <div style={s.rulesTitle}>Yêu cầu mật khẩu</div>
                            {pwRules.map(rule => {
                                const pass = rule.test(formData.password);
                                return (
                                    <div key={rule.label} style={s.ruleItem}>
                                        {pass
                                            ? <CheckCircle size={13} style={{ color: '#00e5a0', flexShrink: 0 }} />
                                            : <AlertCircle size={13} style={{ color: '#4a5568', flexShrink: 0 }} />}
                                        <span style={{ color: pass ? '#00e5a0' : '#4a5568' }}>{rule.label}</span>
                                    </div>
                                );
                            })}
                        </div>
                    )}

                    {/* Confirm Password */}
                    <label style={s.label}>Xác nhận mật mã</label>
                    <div className="reg-input-group" style={s.inputGroup}>
                        <Lock size={18} style={s.inputIcon} />
                        <input
                            type={showPw.confirm ? 'text' : 'password'}
                            style={s.input}
                            placeholder="••••••••••••"
                            value={formData.confirmPassword}
                            onChange={(e) => setFormData({ ...formData, confirmPassword: e.target.value })}
                            required
                        />
                        <button
                            type="button"
                            className="reg-eye-btn"
                            style={s.eyeBtn}
                            onClick={() => setShowPw(p => ({ ...p, confirm: !p.confirm }))}
                            tabIndex={-1}
                        >
                            {showPw.confirm ? <EyeOff size={18} /> : <Eye size={18} />}
                        </button>
                    </div>

                    {/* Password match status */}
                    {formData.confirmPassword && (
                        <div style={s.matchStatus}>
                            {formData.password === formData.confirmPassword ? (
                                <>
                                    <CheckCircle size={13} style={{ color: '#00e5a0' }} />
                                    <span style={{ color: '#00e5a0' }}>Mật khẩu khớp</span>
                                </>
                            ) : (
                                <>
                                    <AlertCircle size={13} style={{ color: '#f87171' }} />
                                    <span style={{ color: '#f87171' }}>Mật khẩu không khớp</span>
                                </>
                            )}
                        </div>
                    )}

                    {/* Submit */}
                    <button
                        type="submit"
                        className="reg-submit"
                        style={s.submitBtn}
                        disabled={loading}
                    >
                        {loading ? (
                            <div style={s.spinner} />
                        ) : (
                            <>
                                ĐĂNG KÝ TÀI KHOẢN
                                <ShieldCheck size={18} />
                            </>
                        )}
                    </button>
                </form>

                {/* Back to login */}
                <div style={s.backLink}>
                    Đã có tài khoản?
                    <span className="reg-back-link" style={s.backAnchor} onClick={onBackToLogin}>
                        Đăng nhập ngay
                    </span>
                </div>
            </div>

            {/* Footer badges */}
            <div style={s.footerBadges}>
                <div style={s.footerBadge}>
                    <Lock size={12} style={s.footerBadgeIcon} />
                    AES-256-GCM
                </div>
                <div style={s.footerBadge}>
                    <ShieldCheck size={12} style={s.footerBadgeIcon} />
                    TLS Resumption
                </div>
            </div>

            {/* System status */}
            <div style={s.sysInfo}>
                <div style={s.sysLine}>SYS_STATUS: <span style={{ color: '#00e5a0' }}>OPTIMAL</span></div>
                <div style={s.sysLine}>NODE_ID: SC-VN-042</div>
                <div style={s.sysLine}>LATENCY: <span style={{ color: '#00e5a0', animation: 'pulse 3s infinite' }}>{latency}ms</span></div>
            </div>

            {/* Copyright */}
            <div style={s.copyright}>
                <div style={s.copyrightText}>
                    © 2026 Secure Chain Tech. Đã đăng ký bản quyền.
                </div>
                <div style={{ ...s.copyrightText, fontSize: '10px', marginTop: '2px' }}>
                    Hệ thống được giám sát liên tục bởi AI Security Protocols.
                </div>
            </div>
        </div>
    );
};

export default RegisterPage;
