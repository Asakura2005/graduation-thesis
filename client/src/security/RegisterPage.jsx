import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useLanguage } from '../i18n/LanguageContext';
import axios from 'axios';
import { UserPlus, User, Lock, Mail, Phone, ShieldCheck, Eye, EyeOff, CheckCircle, AlertCircle, KeyRound } from 'lucide-react';

const RegisterPage = ({ onBackToLogin }) => {
    const { t, language } = useLanguage();
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

    // OTP Verification states
    const [otpStep, setOtpStep] = useState(false); // true = show OTP input screen
    const [otpCode, setOtpCode] = useState(['', '', '', '', '', '']);
    const [otpCountdown, setOtpCountdown] = useState(0);
    const [maskedEmail, setMaskedEmail] = useState('');
    const [realEmail, setRealEmail] = useState(''); // email thực để gửi verify-otp
    const [otpResending, setOtpResending] = useState(false);
    const otpRefs = useRef([]);

    // reCAPTCHA states
    const [captchaToken, setCaptchaToken] = useState('');
    const [captchaEnabled, setCaptchaEnabled] = useState(true);
    const recaptchaRef = useRef(null);
    const recaptchaWidgetId = useRef(null);

    // System status animation
    const [latency, setLatency] = useState(14);
    useEffect(() => {
        // Lấy trạng thái captcha từ server
        const fetchSettings = async () => {
            try {
                const res = await axios.get('/api/settings/captcha');
                setCaptchaEnabled(res.data.captchaEnabled);
            } catch (err) { /* giữ mặc định là true */ }
        };
        fetchSettings();

        const interval = setInterval(() => {
            setLatency(Math.floor(Math.random() * 12) + 8);
        }, 3000);
        return () => clearInterval(interval);
    }, []);

    // Render reCAPTCHA widget khi captcha được bật
    useEffect(() => {
        if (!captchaEnabled) return;

        // Remove old scripts
        const scriptId = 'recaptcha-script';
        let script = document.getElementById(scriptId);
        if (script) script.remove();

        // Clear DOM and global state to force clean render
        if (recaptchaRef.current) recaptchaRef.current.innerHTML = '';
        window.grecaptcha = undefined;
        window.___grecaptcha_cfg = undefined;
        recaptchaWidgetId.current = null;

        // Load new script
        script = document.createElement('script');
        script.id = scriptId;
        script.src = `https://www.google.com/recaptcha/api.js?render=explicit&hl=${language}`;
        script.async = true;
        script.defer = true;
        document.head.appendChild(script);

        const renderCaptcha = () => {
            if (window.grecaptcha && window.grecaptcha.render && recaptchaRef.current && recaptchaWidgetId.current === null) {
                try {
                    recaptchaWidgetId.current = window.grecaptcha.render(recaptchaRef.current, {
                        sitekey: '6Lcu1ZUsAAAAAOnPdO-IbcS8mRC6R7nGIRuKEDOo',
                        callback: (token) => setCaptchaToken(token),
                        'expired-callback': () => setCaptchaToken(''),
                        theme: 'dark',
                    });
                } catch (e) { /* ignore */ }
            }
        };
        const interval = setInterval(() => {
            if (window.grecaptcha && window.grecaptcha.render) {
                renderCaptcha();
                clearInterval(interval);
            }
        }, 500);
        return () => clearInterval(interval);
    }, [captchaEnabled, language]);

    const resetCaptcha = useCallback(() => {
        setCaptchaToken('');
        if (window.grecaptcha && recaptchaWidgetId.current !== null) {
            try { window.grecaptcha.reset(recaptchaWidgetId.current); } catch (e) { }
        }
    }, []);

    const pwRules = [
        { label: t('password.rule1'), test: pw => pw.length >= 8 },
        { label: t('password.rule2'), test: pw => /[A-Z]/.test(pw) },
        { label: t('password.rule3'), test: pw => /[0-9]/.test(pw) },
        { label: t('password.rule4'), test: pw => /[^A-Za-z0-9]/.test(pw) },
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
        const labels = t('password.strengthLabels');
        const map = [
            { level: 0, label: '', color: '' },
            { level: 1, label: Array.isArray(labels) ? labels[1] : 'Rất yếu', color: '#ef4444' },
            { level: 2, label: Array.isArray(labels) ? labels[2] : 'Yếu', color: '#f97316' },
            { level: 3, label: Array.isArray(labels) ? labels[3] : 'Trung bình', color: '#eab308' },
            { level: 4, label: Array.isArray(labels) ? labels[4] : 'Mạnh', color: '#22c55e' },
            { level: 5, label: Array.isArray(labels) ? labels[5] : 'Rất mạnh', color: '#00e5a0' },
        ];
        return map[score] || map[4];
    };

    const strength = pwStrength(formData.password);

    const handleRegister = async (e) => {
        e.preventDefault();
        setError('');
        setSuccess('');

        if (formData.password !== formData.confirmPassword) {
            return setError(t('register.errorNoMatch'));
        }

        if (!pwValid(formData.password)) {
            return setError(t('register.errorWeak'));
        }

        if (captchaEnabled && !captchaToken) {
            return setError(t('register.captchaRequired'));
        }

        setLoading(true);
        try {
            const res = await axios.post('/api/auth/register', {
                ...formData,
                captchaToken,
                lang: language
            });

            if (res.data.requiresOTP) {
                // Chuyển sang bước nhập OTP
                setMaskedEmail(res.data.email);
                setRealEmail(formData.email); // Lưu email thực để gửi verify
                setOtpCountdown(res.data.ttl || 90);
                setOtpStep(true);
                setOtpCode(['', '', '', '', '', '']);
                setTimeout(() => otpRefs.current[0]?.focus(), 100);
            } else {
                setSuccess(res.data.message || t('register.successMessage'));
                setTimeout(() => onBackToLogin(), 2000);
            }
        } catch (err) {
            setError(err.response?.data?.error || t('register.errorMessage'));
            resetCaptcha();
        } finally {
            setLoading(false);
        }
    };

    // OTP Countdown timer
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

    // OTP Input handler (auto-focus next)
    const handleOtpChange = (index, value) => {
        if (!/^\d*$/.test(value)) return; // Only digits
        const newOtp = [...otpCode];
        newOtp[index] = value.slice(-1); // Only last digit
        setOtpCode(newOtp);

        // Auto-focus next input
        if (value && index < 5) {
            otpRefs.current[index + 1]?.focus();
        }
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
        for (let i = 0; i < pasted.length; i++) {
            newOtp[i] = pasted[i];
        }
        setOtpCode(newOtp);
        if (pasted.length >= 6) otpRefs.current[5]?.focus();
    };

    // Verify OTP
    const handleVerifyOTP = async () => {
        const code = otpCode.join('');
        if (code.length !== 6) return setError(t('otp.enterFull6'));

        setLoading(true);
        setError('');
        try {
            const res = await axios.post('/api/auth/register/verify-otp', {
                email: realEmail,
                otp: code
            });
            setSuccess(res.data.message || t('otp.registerSuccess'));
            setTimeout(() => onBackToLogin(), 2500);
        } catch (err) {
            setError(err.response?.data?.error || t('otp.verifyFailed'));
            setOtpCode(['', '', '', '', '', '']);
            otpRefs.current[0]?.focus();
        } finally {
            setLoading(false);
        }
    };

    // Resend OTP
    const handleResendOTP = async () => {
        setOtpResending(true);
        setError('');
        try {
            const res = await axios.post('/api/auth/otp/resend', {
                email: realEmail,
                type: 'REGISTER',
                lang: language
            });
            setOtpCountdown(res.data.ttl || 90);
            setOtpCode(['', '', '', '', '', '']);
            setSuccess(t('otp.newOtpSent'));
            setTimeout(() => setSuccess(''), 3000);
            otpRefs.current[0]?.focus();
        } catch (err) {
            setError(err.response?.data?.error || t('otp.cannotResend'));
        } finally {
            setOtpResending(false);
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
            boxSizing: 'border-box',
            width: '100%',
            overflow: 'hidden',
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
            minWidth: 0,
        },
        twoColItem: {
            minWidth: 0,
            overflow: 'hidden',
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
                <div style={s.formTitle}>{t('register.title')}</div>
                <div style={s.formSubtitle}>
                    {t('register.subtitle')}
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

                {/* === OTP VERIFICATION STEP === */}
                {otpStep ? (
                    <div style={{ animation: 'fadeInUp 0.4s ease' }}>
                        <div style={{ textAlign: 'center', marginBottom: 24 }}>
                            <div style={{
                                width: 64, height: 64, borderRadius: 16,
                                background: 'linear-gradient(135deg, rgba(0,229,160,0.2), rgba(0,229,160,0.05))',
                                border: '2px solid rgba(0,229,160,0.3)',
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                margin: '0 auto 16px', fontSize: 28
                            }}>📧</div>
                            <div style={{ color: '#e2e8f0', fontWeight: 700, fontSize: 16, marginBottom: 6 }}>
                                {t('otp.verifyTitle')}
                            </div>
                            <div style={{ color: '#5a7a9a', fontSize: 13, lineHeight: 1.6 }}>
                                {t('otp.codeSentTo')}<br />
                                <span style={{ color: '#00e5a0', fontWeight: 600 }}>{maskedEmail}</span>
                            </div>
                        </div>

                        {/* OTP Input Boxes */}
                        <div style={{ display: 'flex', gap: 8, justifyContent: 'center', marginBottom: 20 }}>
                            {otpCode.map((digit, i) => (
                                <input
                                    key={i}
                                    ref={el => otpRefs.current[i] = el}
                                    type="text"
                                    inputMode="numeric"
                                    maxLength={1}
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
                                        transition: 'all 0.2s ease',
                                        caretColor: '#00e5a0'
                                    }}
                                    onFocus={e => { e.target.style.borderColor = 'rgba(0,229,160,0.6)'; e.target.style.boxShadow = '0 0 0 3px rgba(0,229,160,0.1)'; }}
                                    onBlur={e => { e.target.style.borderColor = digit ? 'rgba(0,229,160,0.4)' : 'rgba(255,255,255,0.1)'; e.target.style.boxShadow = 'none'; }}
                                />
                            ))}
                        </div>

                        {/* Countdown Timer */}
                        <div style={{ textAlign: 'center', marginBottom: 20 }}>
                            {otpCountdown > 0 ? (
                                <div style={{ color: '#5a7a9a', fontSize: 13 }}>
                                    {t('otp.codeValidFor')}{' '}
                                    <span style={{
                                        color: otpCountdown <= 15 ? '#ef4444' : '#00e5a0',
                                        fontWeight: 700, fontFamily: 'monospace', fontSize: 15
                                    }}>
                                        {Math.floor(otpCountdown / 60).toString().padStart(2, '0')}:{(otpCountdown % 60).toString().padStart(2, '0')}
                                    </span>
                                </div>
                            ) : (
                                <div style={{ color: '#ef4444', fontSize: 13, fontWeight: 600 }}>
                                    {t('otp.codeExpired')}
                                </div>
                            )}
                        </div>

                        {/* Verify Button */}
                        <button
                            onClick={handleVerifyOTP}
                            disabled={loading || otpCode.join('').length !== 6}
                            className="reg-submit"
                            style={{
                                ...s.submitBtn,
                                opacity: (loading || otpCode.join('').length !== 6) ? 0.5 : 1,
                                cursor: (loading || otpCode.join('').length !== 6) ? 'not-allowed' : 'pointer'
                            }}
                        >
                            {loading ? <div style={s.spinner} /> : <>{t('otp.verifyAndRegister')} <ShieldCheck size={18} /></>}
                        </button>

                        {/* Resend */}
                        <div style={{ textAlign: 'center', marginTop: 16 }}>
                            {otpCountdown <= 0 ? (
                                <button
                                    onClick={handleResendOTP}
                                    disabled={otpResending}
                                    style={{
                                        background: 'none', border: 'none',
                                        color: '#00e5a0', cursor: 'pointer',
                                        fontSize: 13, fontWeight: 600,
                                        textDecoration: 'underline',
                                        opacity: otpResending ? 0.5 : 1
                                    }}
                                >
                                    {otpResending ? t('otp.resending') : t('otp.resendOtp')}
                                </button>
                            ) : (
                                <span style={{ color: '#3a5a7a', fontSize: 12 }}>
                                    {t('otp.resendWait')}
                                </span>
                            )}
                        </div>

                        {/* Back to form */}
                        <div style={{ textAlign: 'center', marginTop: 12 }}>
                            <button
                                onClick={() => { setOtpStep(false); setError(''); setSuccess(''); }}
                                style={{ background: 'none', border: 'none', color: '#5a7a9a', cursor: 'pointer', fontSize: 12 }}
                            >
                                {t('otp.backToForm')}
                            </button>
                        </div>
                    </div>
                ) : (
                    <form onSubmit={handleRegister}>
                        {/* Full Name */}
                        <label style={s.label}>{t('register.fullname')}</label>
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
                            <div style={s.twoColItem}>
                                <label style={s.label}>{t('register.email')}</label>
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
                            <div style={s.twoColItem}>
                                <label style={s.label}>{t('register.phone')}</label>
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
                        <label style={s.label}>{t('register.username')}</label>
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
                        <label style={s.label}>{t('register.password')}</label>
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
                                    <span style={s.strengthLabel}>{t('register.strength')}</span>
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
                                <div style={s.rulesTitle}>{t('register.reqTitle')}</div>
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
                        <label style={s.label}>{t('register.confirmTitle')}</label>
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
                                        <span style={{ color: '#00e5a0' }}>{t('register.match')}</span>
                                    </>
                                ) : (
                                    <>
                                        <AlertCircle size={13} style={{ color: '#f87171' }} />
                                        <span style={{ color: '#f87171' }}>{t('register.noMatch')}</span>
                                    </>
                                )}
                            </div>
                        )}

                        {/* reCAPTCHA Widget */}
                        {captchaEnabled && (
                            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '16px', marginTop: '4px' }}>
                                <div key={language} ref={recaptchaRef}></div>
                            </div>
                        )}

                        {/* Submit */}
                        <button
                            type="submit"
                            className="reg-submit"
                            style={s.submitBtn}
                            disabled={loading || (captchaEnabled && !captchaToken)}
                        >
                            {loading ? (
                                <div style={s.spinner} />
                            ) : (
                                <>
                                    {t('register.submit')}
                                    <ShieldCheck size={18} />
                                </>
                            )}
                        </button>
                    </form>
                )}

                {/* Back to login */}
                <div style={s.backLink}>
                    {t('register.hasAccount')}
                    <span className="reg-back-link" style={s.backAnchor} onClick={onBackToLogin}>
                        {t('register.loginNow')}
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

            <div style={s.copyright}>
                <div style={s.copyrightText}>
                    {t('login.copyright')}
                </div>
                <div style={{ ...s.copyrightText, fontSize: '10px', marginTop: '2px' }}>
                    {t('login.aiMonitor')}
                </div>
            </div>
        </div>
    );
};

export default RegisterPage;
