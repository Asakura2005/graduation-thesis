import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import { Lock, Mail, ShieldCheck, KeyRound, CheckCircle, AlertCircle, ArrowLeft, Eye, EyeOff } from 'lucide-react';
import { useLanguage } from '../i18n/LanguageContext';

const ForgotPasswordPage = ({ onBackToLogin }) => {
    const { t, language } = useLanguage();
    const [step, setStep] = useState(1); // 1: Email, 2: OTP, 3: New Password
    const [email, setEmail] = useState('');
    const [maskedEmail, setMaskedEmail] = useState('');
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');
    const [loading, setLoading] = useState(false);

    // OTP states
    const [otpCode, setOtpCode] = useState(['', '', '', '', '', '']);
    const [otpCountdown, setOtpCountdown] = useState(0);
    const [otpResending, setOtpResending] = useState(false);
    const otpRefs = useRef([]);

    // Reset states
    const [resetToken, setResetToken] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [showPw, setShowPw] = useState({ pw: false, confirm: false });

    // Latency animation
    const [latency, setLatency] = useState(14);
    useEffect(() => {
        const interval = setInterval(() => setLatency(Math.floor(Math.random() * 12) + 8), 3000);
        return () => clearInterval(interval);
    }, []);

    // OTP Countdown
    useEffect(() => {
        if (otpCountdown <= 0) return;
        const timer = setInterval(() => {
            setOtpCountdown(prev => {
                if (prev <= 1) { clearInterval(timer); return 0; }
                return prev - 1;
            });
        }, 1000);
        return () => clearInterval(timer);
    }, [otpCountdown]);

    // Step 1: Send OTP
    const handleSendOTP = async (e) => {
        e.preventDefault();
        if (!email.trim()) return setError(t('forgotPassword.emailRequired'));
        setLoading(true); setError('');
        try {
            const res = await axios.post('/api/auth/forgot-password', { email: email.trim(), lang: language });
            if (res.data.email) setMaskedEmail(res.data.email);
            setOtpCountdown(res.data.ttl || 90);
            setOtpCode(['', '', '', '', '', '']);
            setStep(2);
            setTimeout(() => otpRefs.current[0]?.focus(), 100);
        } catch (err) {
            setError(err.response?.data?.error || t('forgotPassword.genericError'));
        } finally { setLoading(false); }
    };

    // Step 2: Verify OTP
    const handleVerifyOTP = async () => {
        const code = otpCode.join('');
        if (code.length !== 6) return setError(t('otp.enterFull6'));
        setLoading(true); setError('');
        try {
            const res = await axios.post('/api/auth/forgot-password/verify', {
                email: email.trim(), otp: code
            });
            setResetToken(res.data.resetToken);
            setStep(3);
        } catch (err) {
            setError(err.response?.data?.error || t('otp.verifyFailed'));
            setOtpCode(['', '', '', '', '', '']);
            otpRefs.current[0]?.focus();
        } finally { setLoading(false); }
    };

    // Step 3: Reset Password
    const handleResetPassword = async (e) => {
        e.preventDefault();
        if (newPassword !== confirmPassword) return setError(t('forgotPassword.passwordMismatch'));

        const passwordRegex = /^(?=.*[A-Z])(?=.*[!@#$&*.,?<>^%\-_\=+~]).{8,}$/;
        if (!passwordRegex.test(newPassword)) {
            return setError(t('forgotPassword.passwordWeak'));
        }

        setLoading(true); setError('');
        try {
            const res = await axios.post('/api/auth/forgot-password/reset', {
                resetToken, newPassword, lang: language
            });
            setSuccess(res.data.message || t('forgotPassword.resetSuccess'));
            setTimeout(() => onBackToLogin(), 3000);
        } catch (err) {
            setError(err.response?.data?.error || t('forgotPassword.resetError'));
        } finally { setLoading(false); }
    };

    // OTP handlers
    const handleOtpChange = (index, value) => {
        if (!/^\d*$/.test(value)) return;
        const newOtp = [...otpCode];
        newOtp[index] = value.slice(-1);
        setOtpCode(newOtp);
        if (value && index < 5) otpRefs.current[index + 1]?.focus();
    };

    const handleOtpKeyDown = (index, e) => {
        if (e.key === 'Backspace' && !otpCode[index] && index > 0) {
            otpRefs.current[index - 1]?.focus();
        }
    };

    const handleOtpPaste = (e) => {
        e.preventDefault();
        const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
        const newOtp = [...otpCode];
        for (let i = 0; i < pasted.length; i++) newOtp[i] = pasted[i];
        setOtpCode(newOtp);
        if (pasted.length >= 6) otpRefs.current[5]?.focus();
    };

    const handleResendOTP = async () => {
        setOtpResending(true); setError('');
        try {
            const res = await axios.post('/api/auth/otp/resend', { email: email.trim(), type: 'FORGOT_PASSWORD', lang: language });
            setOtpCountdown(res.data.ttl || 90);
            setOtpCode(['', '', '', '', '', '']);
            otpRefs.current[0]?.focus();
        } catch (err) {
            setError(err.response?.data?.error || t('otp.cannotResend'));
        } finally { setOtpResending(false); }
    };

    // Password strength
    const pwStrength = (pw) => {
        if (!pw) return { level: 0, color: '', label: '' };
        let score = 0;
        if (pw.length >= 8) score++;
        if (pw.length >= 12) score++;
        if (/[A-Z]/.test(pw)) score++;
        if (/[0-9]/.test(pw)) score++;
        if (/[^A-Za-z0-9]/.test(pw)) score++;
        const labels = t('forgotPassword.strengthLabels');
        const map = [
            { level: 0, color: '', label: '' },
            { level: 1, color: '#ef4444', label: Array.isArray(labels) ? labels[1] : 'Rất yếu' },
            { level: 2, color: '#f97316', label: Array.isArray(labels) ? labels[2] : 'Yếu' },
            { level: 3, color: '#eab308', label: Array.isArray(labels) ? labels[3] : 'Trung bình' },
            { level: 4, color: '#22c55e', label: Array.isArray(labels) ? labels[4] : 'Mạnh' },
            { level: 5, color: '#00e5a0', label: Array.isArray(labels) ? labels[5] : 'Rất mạnh' },
        ];
        return map[score] || map[4];
    };

    const strength = pwStrength(newPassword);

    // Styles
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
            width: '100%', maxWidth: 420, padding: '36px 32px',
            background: 'rgba(13, 21, 38, 0.85)',
            border: '1px solid rgba(0, 229, 160, 0.12)',
            borderRadius: 20, backdropFilter: 'blur(20px)',
            animation: 'fadeInUp 0.5s ease'
        },
        logoIcon: {
            width: 48, height: 48, borderRadius: 14,
            background: 'linear-gradient(135deg, #00e5a0, #00b880)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            margin: '0 auto 12px', boxShadow: '0 8px 32px rgba(0, 229, 160, 0.3)'
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
            background: 'linear-gradient(135deg, #00e5a0 0%, #00d4aa 50%, #00c49a 100%)',
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
        stepIndicator: {
            display: 'flex', justifyContent: 'center', gap: 8, marginBottom: 24
        },
        stepDot: (active, done) => ({
            width: 8, height: 8, borderRadius: '50%',
            background: done ? '#00e5a0' : active ? 'rgba(0,229,160,0.5)' : 'rgba(255,255,255,0.1)',
            transition: 'all 0.3s'
        }),
        eyeBtn: {
            background: 'none', border: 'none', color: '#5a7a9a',
            cursor: 'pointer', padding: 0, display: 'flex'
        },
        label: {
            display: 'block', fontSize: 12, fontWeight: 600,
            color: '#8ba4b8', marginBottom: 8, letterSpacing: 0.5
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
                .fp-input:focus-within {
                    border-color: rgba(0, 229, 160, 0.4) !important;
                    box-shadow: 0 0 0 3px rgba(0, 229, 160, 0.08) !important;
                }
                .fp-submit:hover { transform: translateY(-2px); box-shadow: 0 8px 32px rgba(0, 229, 160, 0.4); }
                .fp-submit:active { transform: translateY(0); }
                .fp-submit:disabled { opacity: 0.5; cursor: not-allowed; transform: none !important; }
            `}</style>

            {/* Logo */}
            <div style={s.logoIcon}>
                <KeyRound size={24} color="#0a0e1a" strokeWidth={2.5} />
            </div>
            <div style={{ textAlign: 'center', color: '#5a7a9a', fontSize: 11, letterSpacing: 4, marginBottom: 20, textTransform: 'uppercase' }}>
                SECURE <span style={{ fontWeight: 800, color: '#e2e8f0' }}>CHAIN</span>
            </div>

            <div style={s.card}>
                {/* Step Indicator */}
                <div style={s.stepIndicator}>
                    <div style={s.stepDot(step === 1, step > 1)} />
                    <div style={{ width: 20, height: 2, background: step > 1 ? '#00e5a0' : 'rgba(255,255,255,0.08)', alignSelf: 'center', borderRadius: 1 }} />
                    <div style={s.stepDot(step === 2, step > 2)} />
                    <div style={{ width: 20, height: 2, background: step > 2 ? '#00e5a0' : 'rgba(255,255,255,0.08)', alignSelf: 'center', borderRadius: 1 }} />
                    <div style={s.stepDot(step === 3, false)} />
                </div>

                {error && <div style={s.errorBox}><AlertCircle size={16} style={{ flexShrink: 0 }} />{error}</div>}
                {success && <div style={s.successBox}><CheckCircle size={16} style={{ flexShrink: 0 }} />{success}</div>}

                {/* Step 1: Email Input */}
                {step === 1 && (
                    <div style={{ animation: 'fadeInUp 0.4s ease' }}>
                        <div style={s.title}>{t('forgotPassword.title')}</div>
                        <div style={s.subtitle}>{t('forgotPassword.subtitle')}</div>

                        <form onSubmit={handleSendOTP}>
                            <label style={s.label}>{t('forgotPassword.emailLabel')}</label>
                            <div className="fp-input" style={s.inputGroup}>
                                <Mail size={18} style={s.inputIcon} />
                                <input
                                    type="email"
                                    style={s.input}
                                    placeholder="your@email.com"
                                    value={email}
                                    onChange={e => setEmail(e.target.value)}
                                    required autoFocus
                                />
                            </div>

                            <button type="submit" className="fp-submit" style={s.submitBtn} disabled={loading || !email.trim()}>
                                {loading ? <div style={s.spinner} /> : <>{t('forgotPassword.sendOtp')} <Mail size={18} /></>}
                            </button>
                        </form>
                    </div>
                )}

                {/* Step 2: OTP Verification */}
                {step === 2 && (
                    <div style={{ animation: 'fadeInUp 0.4s ease' }}>
                        <div style={{ textAlign: 'center', marginBottom: 20 }}>
                            <div style={{ fontSize: 28, marginBottom: 12 }}>🔐</div>
                            <div style={s.title}>{t('forgotPassword.otpTitle')}</div>
                            <div style={s.subtitle}>
                                {t('forgotPassword.otpSentTo')} <span style={{ color: '#00e5a0', fontWeight: 600 }}>{maskedEmail}</span>
                            </div>
                        </div>

                        {/* OTP Boxes */}
                        <div style={{ display: 'flex', gap: 8, justifyContent: 'center', marginBottom: 16 }}>
                            {otpCode.map((digit, i) => (
                                <input
                                    key={i}
                                    ref={el => otpRefs.current[i] = el}
                                    type="text" inputMode="numeric" maxLength={1}
                                    value={digit}
                                    onChange={e => handleOtpChange(i, e.target.value)}
                                    onKeyDown={e => handleOtpKeyDown(i, e)}
                                    onPaste={i === 0 ? handleOtpPaste : undefined}
                                    style={{
                                        width: 48, height: 56, textAlign: 'center',
                                        fontSize: 22, fontWeight: 700, fontFamily: 'monospace',
                                        background: digit ? 'rgba(0,229,160,0.08)' : 'rgba(15,23,42,0.8)',
                                        border: `2px solid ${digit ? 'rgba(0,229,160,0.4)' : 'rgba(255,255,255,0.1)'}`,
                                        borderRadius: 12, color: '#00e5a0', outline: 'none',
                                        transition: 'all 0.2s ease'
                                    }}
                                    onFocus={e => { e.target.style.borderColor = 'rgba(0,229,160,0.6)'; e.target.style.boxShadow = '0 0 0 3px rgba(0,229,160,0.1)'; }}
                                    onBlur={e => { e.target.style.borderColor = digit ? 'rgba(0,229,160,0.4)' : 'rgba(255,255,255,0.1)'; e.target.style.boxShadow = 'none'; }}
                                />
                            ))}
                        </div>

                        {/* Countdown */}
                        <div style={{ textAlign: 'center', marginBottom: 20 }}>
                            {otpCountdown > 0 ? (
                                <span style={{ color: '#5a7a9a', fontSize: 13 }}>
                                    {t('otp.validity')}{' '}
                                    <span style={{ color: otpCountdown <= 15 ? '#ef4444' : '#00e5a0', fontWeight: 700, fontFamily: 'monospace', fontSize: 15 }}>
                                        {Math.floor(otpCountdown / 60).toString().padStart(2, '0')}:{(otpCountdown % 60).toString().padStart(2, '0')}
                                    </span>
                                </span>
                            ) : (
                                <span style={{ color: '#ef4444', fontSize: 13, fontWeight: 600 }}>{t('otp.codeExpired')}</span>
                            )}
                        </div>

                        <button
                            onClick={handleVerifyOTP}
                            className="fp-submit" style={s.submitBtn}
                            disabled={loading || otpCode.join('').length !== 6}
                        >
                            {loading ? <div style={s.spinner} /> : <>{t('otp.verify')} <ShieldCheck size={18} /></>}
                        </button>

                        {/* Resend */}
                        <div style={{ textAlign: 'center', marginTop: 14 }}>
                            {otpCountdown <= 0 ? (
                                <button onClick={handleResendOTP} disabled={otpResending}
                                    style={{ background: 'none', border: 'none', color: '#00e5a0', cursor: 'pointer', fontSize: 13, fontWeight: 600, textDecoration: 'underline', opacity: otpResending ? 0.5 : 1 }}>
                                    {otpResending ? t('otp.resending') : t('otp.resendOtp')}
                                </button>
                            ) : (
                                <span style={{ color: '#3a5a7a', fontSize: 12 }}>{t('otp.resendWhenExpired')}</span>
                            )}
                        </div>
                    </div>
                )}

                {/* Step 3: New Password */}
                {step === 3 && (
                    <div style={{ animation: 'fadeInUp 0.4s ease' }}>
                        <div style={{ textAlign: 'center', marginBottom: 20 }}>
                            <div style={{ fontSize: 28, marginBottom: 12 }}>🔑</div>
                            <div style={s.title}>{t('forgotPassword.newPasswordTitle')}</div>
                            <div style={s.subtitle}>{t('forgotPassword.newPasswordSubtitle')}</div>
                        </div>

                        <form onSubmit={handleResetPassword}>
                            <label style={s.label}>{t('forgotPassword.newPasswordLabel')}</label>
                            <div className="fp-input" style={s.inputGroup}>
                                <Lock size={18} style={s.inputIcon} />
                                <input
                                    type={showPw.pw ? 'text' : 'password'}
                                    style={s.input}
                                    placeholder={t('forgotPassword.newPasswordPlaceholder')}
                                    value={newPassword}
                                    onChange={e => setNewPassword(e.target.value)}
                                    required autoFocus
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

                            <label style={s.label}>{t('forgotPassword.confirmPasswordLabel')}</label>
                            <div className="fp-input" style={s.inputGroup}>
                                <Lock size={18} style={s.inputIcon} />
                                <input
                                    type={showPw.confirm ? 'text' : 'password'}
                                    style={s.input}
                                    placeholder={t('forgotPassword.confirmPasswordPlaceholder')}
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
                                        <span style={{ color: '#00e5a0' }}>{t('forgotPassword.passwordMatch')}</span>
                                    ) : (
                                        <span style={{ color: '#f87171' }}>{t('forgotPassword.passwordNoMatch')}</span>
                                    )}
                                </div>
                            )}

                            <button type="submit" className="fp-submit" style={s.submitBtn}
                                disabled={loading || !newPassword || newPassword !== confirmPassword}>
                                {loading ? <div style={s.spinner} /> : <>{t('forgotPassword.resetBtn')} <ShieldCheck size={18} /></>}
                            </button>
                        </form>
                    </div>
                )}

                {/* Back to login */}
                <div style={{ textAlign: 'center', marginTop: 20 }}>
                    <button
                        onClick={onBackToLogin}
                        style={{ background: 'none', border: 'none', color: '#5a7a9a', cursor: 'pointer', fontSize: 13, display: 'flex', alignItems: 'center', gap: 6, margin: '0 auto' }}
                    >
                        <ArrowLeft size={16} /> {t('forgotPassword.backToLogin')}
                    </button>
                </div>
            </div>

            {/* System info */}
            <div style={s.sysInfo}>
                <div>SYS_STATUS: <span style={{ color: '#00e5a0' }}>OPTIMAL</span></div>
                <div>RECOVERY_MODE: ACTIVE</div>
                <div>LATENCY: <span style={{ color: '#00e5a0', animation: 'pulse 3s infinite' }}>{latency}ms</span></div>
            </div>
        </div>
    );
};

export default ForgotPasswordPage;
