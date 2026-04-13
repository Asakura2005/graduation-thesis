import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { Lock, ShieldCheck, KeyRound, CheckCircle, AlertCircle, Eye, EyeOff, ShieldAlert, User } from 'lucide-react';
import { useLanguage } from '../i18n/LanguageContext';

const ChangePasswordPage = () => {
    const { t, language } = useLanguage();
    const [token] = useState(() => new URLSearchParams(window.location.search).get('token') || '');
    const [status, setStatus] = useState('loading'); // loading, valid, expired, error, success
    const [maskedUsername, setMaskedUsername] = useState('');
    const [currentPassword, setCurrentPassword] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [showPw, setShowPw] = useState({ current: false, pw: false, confirm: false });
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);

    // Latency animation
    const [latency, setLatency] = useState(14);
    useEffect(() => {
        const interval = setInterval(() => setLatency(Math.floor(Math.random() * 12) + 8), 3000);
        return () => clearInterval(interval);
    }, []);

    // Verify token on mount
    useEffect(() => {
        if (!token) {
            setStatus('error');
            return;
        }

        axios.post('/api/auth/email-change-password/verify-token', { token })
            .then(res => {
                if (res.data.valid) {
                    setMaskedUsername(res.data.maskedUsername || '***');
                    setStatus('valid');
                }
            })
            .catch(err => {
                if (err.response?.data?.expired) {
                    setStatus('expired');
                } else {
                    setStatus('error');
                }
            });
    }, [token]);

    // Password strength
    const pwStrength = (pw) => {
        if (!pw) return { level: 0, color: '', label: '' };
        let score = 0;
        if (pw.length >= 8) score++;
        if (pw.length >= 12) score++;
        if (/[A-Z]/.test(pw)) score++;
        if (/[0-9]/.test(pw)) score++;
        if (/[^A-Za-z0-9]/.test(pw)) score++;
        const labels = t('changePassword.strengthLabels');
        const map = [
            { level: 0, color: '', label: '' },
            { level: 1, color: '#ef4444', label: Array.isArray(labels) ? labels[1] : 'Very Weak' },
            { level: 2, color: '#f97316', label: Array.isArray(labels) ? labels[2] : 'Weak' },
            { level: 3, color: '#eab308', label: Array.isArray(labels) ? labels[3] : 'Fair' },
            { level: 4, color: '#22c55e', label: Array.isArray(labels) ? labels[4] : 'Strong' },
            { level: 5, color: '#00e5a0', label: Array.isArray(labels) ? labels[5] : 'Very Strong' },
        ];
        return map[score] || map[4];
    };

    const strength = pwStrength(newPassword);

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');

        if (!currentPassword) return setError(t('changePassword.errorCurrentRequired'));
        if (newPassword !== confirmPassword) return setError(t('changePassword.errorNoMatch'));

        const passwordRegex = /^(?=.*[A-Z])(?=.*[!@#$&*.,?<>^%\-_\=+~]).{8,}$/;
        if (!passwordRegex.test(newPassword)) {
            return setError(t('changePassword.errorWeak'));
        }

        setLoading(true);
        try {
            const res = await axios.post('/api/auth/email-change-password', {
                token, currentPassword, newPassword, lang: language
            });
            setStatus('success');
        } catch (err) {
            setError(err.response?.data?.error || t('changePassword.genericError'));
        } finally { setLoading(false); }
    };

    // Styles (consistent with ForgotPasswordPage)
    const s = {
        pageWrapper: {
            minHeight: '100vh',
            background: 'linear-gradient(180deg, #0a0e1a 0%, #0d1526 40%, #0f1a2e 100%)',
            display: 'flex', flexDirection: 'column', alignItems: 'center',
            justifyContent: 'center', padding: 20, position: 'relative', overflow: 'hidden'
        },
        glowTop: {
            position: 'absolute', top: -100, left: '50%', transform: 'translateX(-50%)',
            width: 600, height: 300,
            background: 'radial-gradient(ellipse, rgba(0, 229, 160, 0.08) 0%, transparent 70%)',
            pointerEvents: 'none'
        },
        card: {
            width: '100%', maxWidth: 440, padding: '36px 32px',
            background: 'rgba(13, 21, 38, 0.85)',
            border: '1px solid rgba(0, 229, 160, 0.12)',
            borderRadius: 20, backdropFilter: 'blur(20px)',
            animation: 'fadeInUp 0.5s ease'
        },
        logoIcon: {
            width: 48, height: 48, borderRadius: 14,
            background: 'linear-gradient(135deg, #f59e0b, #d97706)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            margin: '0 auto 12px', boxShadow: '0 8px 32px rgba(245, 158, 11, 0.3)'
        },
        title: { textAlign: 'center', color: '#e2e8f0', fontSize: 20, fontWeight: 700, marginBottom: 6 },
        subtitle: { textAlign: 'center', color: '#5a7a9a', fontSize: 13, marginBottom: 24 },
        inputGroup: {
            display: 'flex', alignItems: 'center', gap: 12,
            background: 'rgba(15, 23, 42, 0.8)',
            border: '1px solid rgba(255,255,255,0.08)',
            borderRadius: 12, padding: '12px 14px', marginBottom: 16,
            transition: 'all 0.2s'
        },
        inputIcon: { color: '#5a7a9a', flexShrink: 0 },
        input: {
            flex: 1, border: 'none', outline: 'none',
            background: 'transparent', color: '#e2e8f0',
            fontSize: 14, fontFamily: 'inherit'
        },
        submitBtn: {
            width: '100%', padding: '14px 0', border: 'none', borderRadius: 12,
            background: 'linear-gradient(135deg, #f59e0b 0%, #d97706 50%, #b45309 100%)',
            color: '#0a0e1a', fontWeight: 700, fontSize: 14, cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
            transition: 'all 0.3s'
        },
        errorBox: {
            background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)',
            borderRadius: 10, padding: '10px 14px', marginBottom: 16,
            fontSize: 13, color: '#f87171', display: 'flex', alignItems: 'center', gap: 8
        },
        successBox: {
            background: 'rgba(0,229,160,0.1)', border: '1px solid rgba(0,229,160,0.3)',
            borderRadius: 10, padding: '10px 14px', marginBottom: 16,
            fontSize: 13, color: '#00e5a0', display: 'flex', alignItems: 'center', gap: 8
        },
        spinner: {
            width: 20, height: 20, border: '2px solid rgba(10,14,26,0.3)',
            borderTop: '2px solid #0a0e1a', borderRadius: '50%',
            animation: 'spin 0.8s linear infinite'
        },
        eyeBtn: {
            background: 'none', border: 'none', color: '#5a7a9a',
            cursor: 'pointer', padding: 0, display: 'flex'
        },
        label: {
            display: 'block', fontSize: 12, fontWeight: 600,
            color: '#8ba4b8', marginBottom: 8, letterSpacing: 0.5
        },
        accountBadge: {
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
            background: 'rgba(245, 158, 11, 0.08)', border: '1px solid rgba(245, 158, 11, 0.2)',
            borderRadius: 10, padding: '10px 16px', marginBottom: 20,
            fontSize: 13, color: '#f59e0b'
        },
        securityNote: {
            background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.15)',
            borderRadius: 10, padding: '10px 14px', marginBottom: 20,
            fontSize: 12, color: '#f87171', display: 'flex', alignItems: 'flex-start', gap: 8, lineHeight: 1.6
        },
        sysInfo: {
            position: 'fixed', bottom: 60, left: 20,
            fontSize: 10, fontFamily: 'monospace', color: '#2a4a6a'
        }
    };

    return (
        <div style={s.pageWrapper}>
            <div style={s.glowTop} />

            <style>{`
                @keyframes spin { to { transform: rotate(360deg); } }
                @keyframes fadeInUp {
                    from { opacity: 0; transform: translateY(20px); }
                    to { opacity: 1; transform: translateY(0); }
                }
                @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.5; } }
                .cp-input:focus-within {
                    border-color: rgba(245, 158, 11, 0.4) !important;
                    box-shadow: 0 0 0 3px rgba(245, 158, 11, 0.08) !important;
                }
                .cp-submit:hover { transform: translateY(-2px); box-shadow: 0 8px 32px rgba(245, 158, 11, 0.4); }
                .cp-submit:active { transform: translateY(0); }
                .cp-submit:disabled { opacity: 0.5; cursor: not-allowed; transform: none !important; }
            `}</style>

            {/* Logo */}
            <div style={s.logoIcon}>
                <ShieldAlert size={24} color="#0a0e1a" strokeWidth={2.5} />
            </div>
            <div style={{ textAlign: 'center', color: '#5a7a9a', fontSize: 11, letterSpacing: 4, marginBottom: 20, textTransform: 'uppercase' }}>
                SECURE <span style={{ fontWeight: 800, color: '#e2e8f0' }}>CHAIN</span>
            </div>

            <div style={s.card}>
                {/* Loading state */}
                {status === 'loading' && (
                    <div style={{ textAlign: 'center', padding: 40 }}>
                        <div className="spinner-border" style={{ color: '#f59e0b', width: 36, height: 36, borderWidth: 3 }} />
                        <div style={{ color: '#5a7a9a', marginTop: 16, fontSize: 14 }}>
                            {t('changePassword.verifying')}
                        </div>
                    </div>
                )}

                {/* Token expired */}
                {status === 'expired' && (
                    <div style={{ textAlign: 'center', animation: 'fadeInUp 0.4s ease' }}>
                        <div style={{ fontSize: 40, marginBottom: 16 }}>⏰</div>
                        <div style={s.title}>{t('changePassword.expiredTitle')}</div>
                        <div style={{ ...s.subtitle, marginBottom: 24 }}>{t('changePassword.expiredSubtitle')}</div>
                        <a href="/" style={{ ...s.submitBtn, textDecoration: 'none', display: 'inline-flex', background: 'linear-gradient(135deg, #00e5a0, #00b880)', padding: '12px 32px', width: 'auto' }}>
                            {t('changePassword.backToLogin')}
                        </a>
                    </div>
                )}

                {/* Token error */}
                {status === 'error' && (
                    <div style={{ textAlign: 'center', animation: 'fadeInUp 0.4s ease' }}>
                        <div style={{ fontSize: 40, marginBottom: 16 }}>❌</div>
                        <div style={s.title}>{t('changePassword.invalidTitle')}</div>
                        <div style={{ ...s.subtitle, marginBottom: 24 }}>{t('changePassword.invalidSubtitle')}</div>
                        <a href="/" style={{ ...s.submitBtn, textDecoration: 'none', display: 'inline-flex', background: 'linear-gradient(135deg, #00e5a0, #00b880)', padding: '12px 32px', width: 'auto' }}>
                            {t('changePassword.backToLogin')}
                        </a>
                    </div>
                )}

                {/* Success */}
                {status === 'success' && (
                    <div style={{ textAlign: 'center', animation: 'fadeInUp 0.4s ease' }}>
                        <div style={{ fontSize: 40, marginBottom: 16 }}>✅</div>
                        <div style={s.title}>{t('changePassword.successTitle')}</div>
                        <div style={s.successBox}>
                            <CheckCircle size={16} style={{ flexShrink: 0 }} />
                            {t('changePassword.successMessage')}
                        </div>
                        <div style={{ color: '#5a7a9a', fontSize: 12, marginBottom: 20, lineHeight: 1.7 }}>
                            {t('changePassword.successNote')}
                        </div>
                        <a href="/" style={{ ...s.submitBtn, textDecoration: 'none', display: 'inline-flex', background: 'linear-gradient(135deg, #00e5a0, #00b880)' }}>
                            {t('changePassword.goToLogin')}
                        </a>
                    </div>
                )}

                {/* Change password form */}
                {status === 'valid' && (
                    <div style={{ animation: 'fadeInUp 0.4s ease' }}>
                        <div style={s.title}>{t('changePassword.title')}</div>
                        <div style={s.subtitle}>{t('changePassword.subtitle')}</div>

                        {/* Account badge */}
                        <div style={s.accountBadge}>
                            <User size={16} />
                            <span>{t('changePassword.account')}: <strong>{maskedUsername}</strong></span>
                        </div>

                        {/* Security note */}
                        <div style={s.securityNote}>
                            <ShieldAlert size={16} style={{ flexShrink: 0, marginTop: 2 }} />
                            <span>{t('changePassword.securityNote')}</span>
                        </div>

                        {error && <div style={s.errorBox}><AlertCircle size={16} style={{ flexShrink: 0 }} />{error}</div>}

                        <form onSubmit={handleSubmit}>
                            {/* Current Password */}
                            <label style={s.label}>{t('changePassword.currentLabel')}</label>
                            <div className="cp-input" style={s.inputGroup}>
                                <Lock size={18} style={s.inputIcon} />
                                <input
                                    type={showPw.current ? 'text' : 'password'}
                                    style={s.input}
                                    placeholder={t('changePassword.currentPlaceholder')}
                                    value={currentPassword}
                                    onChange={e => setCurrentPassword(e.target.value)}
                                    required autoFocus
                                />
                                <button type="button" style={s.eyeBtn} onClick={() => setShowPw(p => ({ ...p, current: !p.current }))}>
                                    {showPw.current ? <EyeOff size={18} /> : <Eye size={18} />}
                                </button>
                            </div>

                            {/* New Password */}
                            <label style={s.label}>{t('changePassword.newLabel')}</label>
                            <div className="cp-input" style={s.inputGroup}>
                                <KeyRound size={18} style={s.inputIcon} />
                                <input
                                    type={showPw.pw ? 'text' : 'password'}
                                    style={s.input}
                                    placeholder={t('changePassword.newPlaceholder')}
                                    value={newPassword}
                                    onChange={e => setNewPassword(e.target.value)}
                                    required
                                />
                                <button type="button" style={s.eyeBtn} onClick={() => setShowPw(p => ({ ...p, pw: !p.pw }))}>
                                    {showPw.pw ? <EyeOff size={18} /> : <Eye size={18} />}
                                </button>
                            </div>

                            {/* Strength bar */}
                            {newPassword && (
                                <div style={{ marginBottom: 16 }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                                        <div style={{ flex: 1, height: 3, background: 'rgba(255,255,255,0.06)', borderRadius: 2, overflow: 'hidden' }}>
                                            <div style={{ height: '100%', width: `${(strength.level / 5) * 100}%`, background: strength.color, borderRadius: 2, transition: 'all 0.3s' }} />
                                        </div>
                                        <span style={{ fontSize: 11, color: strength.color, fontWeight: 600 }}>{strength.label}</span>
                                    </div>
                                </div>
                            )}

                            {/* Confirm Password */}
                            <label style={s.label}>{t('changePassword.confirmLabel')}</label>
                            <div className="cp-input" style={s.inputGroup}>
                                <Lock size={18} style={s.inputIcon} />
                                <input
                                    type={showPw.confirm ? 'text' : 'password'}
                                    style={s.input}
                                    placeholder={t('changePassword.confirmPlaceholder')}
                                    value={confirmPassword}
                                    onChange={e => setConfirmPassword(e.target.value)}
                                    required
                                />
                                <button type="button" style={s.eyeBtn} onClick={() => setShowPw(p => ({ ...p, confirm: !p.confirm }))}>
                                    {showPw.confirm ? <EyeOff size={18} /> : <Eye size={18} />}
                                </button>
                            </div>

                            {confirmPassword && (
                                <div style={{ marginBottom: 16, fontSize: 12 }}>
                                    {newPassword === confirmPassword ? (
                                        <span style={{ color: '#00e5a0' }}>✓ {t('changePassword.passwordMatch')}</span>
                                    ) : (
                                        <span style={{ color: '#f87171' }}>✗ {t('changePassword.passwordNoMatch')}</span>
                                    )}
                                </div>
                            )}

                            <button type="submit" className="cp-submit" style={s.submitBtn}
                                disabled={loading || !currentPassword || !newPassword || newPassword !== confirmPassword}>
                                {loading ? <div style={s.spinner} /> : <>{t('changePassword.submitBtn')} <ShieldCheck size={18} /></>}
                            </button>
                        </form>
                    </div>
                )}

                {/* Back to login (always show for valid state) */}
                {status === 'valid' && (
                    <div style={{ textAlign: 'center', marginTop: 20 }}>
                        <a href="/" style={{ color: '#5a7a9a', fontSize: 13, textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                            ← {t('changePassword.backToLogin')}
                        </a>
                    </div>
                )}
            </div>

            {/* System info */}
            <div style={s.sysInfo}>
                <div>SYS_STATUS: <span style={{ color: '#f59e0b' }}>SECURITY_MODE</span></div>
                <div>AUTH_LEVEL: ELEVATED</div>
                <div>LATENCY: <span style={{ color: '#f59e0b', animation: 'pulse 3s infinite' }}>{latency}ms</span></div>
            </div>
        </div>
    );
};

export default ChangePasswordPage;
