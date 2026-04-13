import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Lock, User, ShieldCheck, Eye, EyeOff, KeyRound } from 'lucide-react';
import axios from 'axios';
import { useLanguage } from '../i18n/LanguageContext';

const LoginPage = ({ onLoginSuccess, onGoToRegister, onForgotPassword }) => {
    const { t, language } = useLanguage();
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);
    const [showPassword, setShowPassword] = useState(false);
    const [rememberSession, setRememberSession] = useState(false);
    const [securityWarnings, setSecurityWarnings] = useState([]);
    const [captchaToken, setCaptchaToken] = useState('');
    const [captchaEnabled, setCaptchaEnabled] = useState(true);
    const recaptchaRef = useRef(null);
    const recaptchaWidgetId = useRef(null);

    // 2FA states (Dual Mode: Google Authenticator + Email OTP)
    const [requires2FA, setRequires2FA] = useState(false);
    const [tempToken, setTempToken] = useState('');
    const [otp, setOtp] = useState('');
    const [authMethod, setAuthMethod] = useState('email'); // 'email' | 'authenticator'
    const [has2FAApp, setHas2FAApp] = useState(false);
    const [maskedEmail, setMaskedEmail] = useState('');
    const [isNewDevice, setIsNewDevice] = useState(false);
    const [deviceInfo, setDeviceInfo] = useState(null);

    // OTP box states
    const [otpCode, setOtpCode] = useState(['', '', '', '', '', '']);
    const [otpCountdown, setOtpCountdown] = useState(0);
    const [otpResending, setOtpResending] = useState(false);
    const otpRefs = useRef([]);

    // Forgot Password
    const [showForgotPassword, setShowForgotPassword] = useState(false);

    // System status animation
    const [latency, setLatency] = useState(14);
    useEffect(() => {
        const fetchSettings = async () => {
            try {
                const res = await axios.get('/api/settings/captcha');
                setCaptchaEnabled(res.data.captchaEnabled);
            } catch (err) {
                console.error("Failed to load settings:", err);
            }
        };
        fetchSettings();

        const interval = setInterval(() => {
            setLatency(Math.floor(Math.random() * 12) + 8);
        }, 3000);
        return () => clearInterval(interval);
    }, []);

    // Render reCAPTCHA widget when grecaptcha is loaded
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
                } catch (e) {
                    // ignore render error
                }
            }
        };

        const interval = setInterval(() => {
            if (window.grecaptcha && window.grecaptcha.render) {
                renderCaptcha();
                clearInterval(interval);
            }
        }, 500);

        return () => {
            clearInterval(interval);
        };
    }, [requires2FA, captchaEnabled, language]);

    const resetCaptcha = useCallback(() => {
        setCaptchaToken('');
        if (window.grecaptcha && recaptchaWidgetId.current !== null) {
            try { window.grecaptcha.reset(recaptchaWidgetId.current); } catch(e) {}
        }
    }, []);

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');
        setSecurityWarnings([]);
        setLoading(true);

        try {
            if (captchaEnabled && !captchaToken) {
                setError(t('login.captchaRequired'));
                setLoading(false);
                return;
            }

            const response = await axios.post('/api/auth/login', {
                username,
                password,
                captchaToken,
                rememberSession,
                lang: language
            });

            // Kiểm tra cảnh báo AI trước khi cho phép đăng nhập
            if (response.data.warnings && response.data.warnings.length > 0) {
                setSecurityWarnings(response.data.warnings);
            }

            if (response.data.requires2FA) {
                setRequires2FA(true);
                setTempToken(response.data.tempToken);
                setHas2FAApp(response.data.has2FAApp || false);
                setMaskedEmail(response.data.maskedEmail || '');
                setIsNewDevice(response.data.isNewDevice || false);
                setDeviceInfo(response.data.deviceInfo || null);
                setOtpCountdown(90);
                setOtpCode(['', '', '', '', '', '']);
                // Default method: nếu có GG Auth → dùng authenticator, không thì email
                setAuthMethod(response.data.has2FAApp ? 'authenticator' : 'email');
                setTimeout(() => otpRefs.current[0]?.focus(), 200);
            } else {
                if (rememberSession) {
                    localStorage.setItem('token', response.data.token);
                } else {
                    sessionStorage.setItem('token', response.data.token);
                    localStorage.removeItem('token');
                }
                onLoginSuccess(response.data);
            }
        } catch (err) {
            // Xử lý trường hợp bị AI block
            if (err.response?.status === 403 && err.response?.data?.blocked) {
                setError(`🛡️ ${err.response.data.error} (Risk Score: ${err.response.data.riskScore})`);
            } else if (err.response?.status === 403 && err.response?.data?.banned) {
                // Xử lý trường hợp bị AI tự động ban (sai mật khẩu 7 lần)
                setError(`🚫 ${err.response.data.error}`);
            } else {
                setError(err.response?.data?.error || t('login.error'));
            }
            resetCaptcha();
        } finally {
            setLoading(false);
        }
    };

    const handleVerify2FA = async (e) => {
        e.preventDefault();
        setError('');
        setLoading(true);

        const code = otpCode.join('');
        if (!code || code.length < 6) {
            setError(t('otp.enterFull6'));
            setLoading(false);
            return;
        }

        try {
            const response = await axios.post('/api/auth/verify-2fa', {
                tempToken,
                token: code,
                method: authMethod,
                lang: language
            });

            if (rememberSession) {
                localStorage.setItem('token', response.data.token);
            } else {
                sessionStorage.setItem('token', response.data.token);
                localStorage.removeItem('token');
            }
            onLoginSuccess(response.data);
        } catch (err) {
            const errMsg = err.response?.data?.error || t('login.invalidCode');
            const statusCode = err.response?.status;
            const isExpired = err.response?.data?.expired;
            
            if (isExpired) {
                // tempToken hết hạn → quay về login sau 3s
                setError(t('login.sessionExpired'));
                setTimeout(() => {
                    setRequires2FA(false);
                    setOtp('');
                    setOtpCode(['', '', '', '', '', '']);
                    setError('');
                }, 3000);
            } else if (statusCode === 401) {
                // Sai mã OTP → giữ nguyên màn hình, chỉ hiện lỗi
                setError('❌ ' + errMsg + ' ' + t('login.otpWrongRetry'));
                if (authMethod === 'email') {
                    setOtpCode(['', '', '', '', '', '']);
                    setTimeout(() => otpRefs.current[0]?.focus(), 100);
                } else {
                    setOtp('');
                }
            } else {
                setError(errMsg);
            }
        } finally {
            setLoading(false);
        }
    };

    // OTP Countdown for 2FA
    useEffect(() => {
        if (!requires2FA || otpCountdown <= 0) return;
        const timer = setInterval(() => {
            setOtpCountdown(prev => {
                if (prev <= 1) { clearInterval(timer); return 0; }
                return prev - 1;
            });
        }, 1000);
        return () => clearInterval(timer);
    }, [requires2FA, otpCountdown]);

    // OTP Input handlers for email method
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

    const handleResendLoginOTP = async () => {
        if (!tempToken) return;
        setOtpResending(true);
        setError('');
        try {
            const res = await axios.post('/api/auth/otp/resend', {
                tempToken: tempToken,
                type: 'LOGIN_2FA',
                lang: language
            });
            setOtpCountdown(res.data.ttl || 90);
            setOtpCode(['', '', '', '', '', '']);
            otpRefs.current[0]?.focus();
        } catch (err) {
            if (err.response?.data?.expired) {
                setError(t('login.sessionExpiredShort'));
                setTimeout(() => { setRequires2FA(false); setError(''); }, 3000);
            } else {
                setError(err.response?.data?.error || t('login.cannotResendOtp'));
            }
        } finally {
            setOtpResending(false);
        }
    };

    // Gửi OTP khi chuyển sang Email method
    const handleSwitchToEmail = async () => {
        setAuthMethod('email');
        setError('');
        setOtpCode(['', '', '', '', '', '']);

        // Gửi OTP email ngay
        try {
            const res = await axios.post('/api/auth/otp/resend', {
                tempToken: tempToken,
                type: 'LOGIN_2FA',
                lang: language
            });
            setOtpCountdown(res.data.ttl || 90);
            setTimeout(() => otpRefs.current[0]?.focus(), 200);
        } catch (err) {
            if (err.response?.data?.expired) {
                setError(t('login.sessionExpiredShort'));
                setTimeout(() => { setRequires2FA(false); setError(''); }, 3000);
            } else {
                setError(err.response?.data?.error || t('login.cannotSendEmailOtp'));
            }
        }
    };


    // Inline styles
    const styles = {
        pageWrapper: {
            minHeight: '100vh',
            background: 'linear-gradient(180deg, #0a0e1a 0%, #0d1526 40%, #0f1a2e 100%)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '20px',
            position: 'relative',
            overflow: 'hidden',
            fontFamily: "'Inter', sans-serif",
        },
        // Subtle grid overlay
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
        // Glow effects
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
            padding: '40px',
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
            marginBottom: '28px',
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
        labelRow: {
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: '8px',
        },
        forgotLink: {
            fontSize: '11px',
            color: '#4a6a8a',
            letterSpacing: '1px',
            textTransform: 'uppercase',
            cursor: 'pointer',
            textDecoration: 'none',
            transition: 'color 0.2s',
        },
        inputGroup: {
            display: 'flex',
            alignItems: 'center',
            background: 'rgba(15, 23, 42, 0.8)',
            border: '1px solid rgba(255, 255, 255, 0.08)',
            borderRadius: '12px',
            padding: '0 16px',
            height: '52px',
            marginBottom: '20px',
            transition: 'border-color 0.3s, box-shadow 0.3s',
        },
        inputGroupFocused: {
            borderColor: 'rgba(0, 229, 160, 0.4)',
            boxShadow: '0 0 0 3px rgba(0, 229, 160, 0.08)',
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
        checkboxRow: {
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            marginBottom: '24px',
        },
        checkbox: {
            width: '16px',
            height: '16px',
            accentColor: '#00e5a0',
            cursor: 'pointer',
        },
        checkboxLabel: {
            fontSize: '13px',
            color: '#6a8aaa',
            cursor: 'pointer',
            userSelect: 'none',
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
        },
        submitBtnHover: {
            transform: 'translateY(-2px)',
            boxShadow: '0 8px 32px rgba(0, 229, 160, 0.4)',
        },
        registerLink: {
            textAlign: 'center',
            marginTop: '20px',
            fontSize: '13px',
            color: '#5a7a9a',
        },
        registerAnchor: {
            color: '#00e5a0',
            cursor: 'pointer',
            textDecoration: 'none',
            fontWeight: 600,
            marginLeft: '4px',
        },
        // Footer
        footerBadges: {
            display: 'flex',
            justifyContent: 'center',
            gap: '32px',
            marginTop: '32px',
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
            marginTop: '16px',
            zIndex: 1,
        },
        copyrightText: {
            fontSize: '11px',
            color: '#2a4a6a',
        },
        // Error
        errorBox: {
            background: 'rgba(239, 68, 68, 0.1)',
            border: '1px solid rgba(239, 68, 68, 0.3)',
            borderRadius: '10px',
            padding: '12px 16px',
            marginBottom: '20px',
            fontSize: '13px',
            color: '#f87171',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
        },
        // 2FA
        otpTitle: {
            fontSize: '18px',
            fontWeight: 700,
            color: '#e2e8f0',
            marginBottom: '4px',
            textAlign: 'center',
        },
        otpSubtitle: {
            fontSize: '13px',
            color: '#5a7a9a',
            marginBottom: '24px',
            textAlign: 'center',
        },
        otpBadge: {
            display: 'inline-flex',
            alignItems: 'center',
            gap: '6px',
            background: 'rgba(0, 229, 160, 0.1)',
            border: '1px solid rgba(0, 229, 160, 0.2)',
            borderRadius: '8px',
            padding: '8px 16px',
            marginBottom: '20px',
            fontSize: '12px',
            color: '#00e5a0',
            fontWeight: 600,
        },
        otpInput: {
            background: 'transparent',
            border: 'none',
            outline: 'none',
            color: '#e2e8f0',
            fontSize: '28px',
            fontWeight: 700,
            letterSpacing: '12px',
            textAlign: 'center',
            flex: 1,
            height: '100%',
            fontFamily: "'Inter', monospace",
        },
        backLink: {
            textAlign: 'center',
            marginTop: '16px',
            fontSize: '13px',
            color: '#4a6a8a',
            cursor: 'pointer',
            transition: 'color 0.2s',
            background: 'none',
            border: 'none',
            width: '100%',
        },
        spinner: {
            width: '20px',
            height: '20px',
            border: '2px solid rgba(10, 14, 26, 0.3)',
            borderTop: '2px solid #0a0e1a',
            borderRadius: '50%',
            animation: 'spin 0.8s linear infinite',
        },
    };

    return (
        <div style={styles.pageWrapper}>
            {/* Background effects */}
            <div style={styles.gridOverlay} />
            <div style={styles.glowTop} />

            {/* Spinner animation keyframes */}
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
                .login-input-group:focus-within {
                    border-color: rgba(0, 229, 160, 0.4) !important;
                    box-shadow: 0 0 0 3px rgba(0, 229, 160, 0.08) !important;
                }
                .login-submit:hover {
                    transform: translateY(-2px) !important;
                    box-shadow: 0 8px 32px rgba(0, 229, 160, 0.4) !important;
                }
                .login-submit:active {
                    transform: translateY(0) !important;
                }
                .login-submit:disabled {
                    opacity: 0.6;
                    cursor: not-allowed;
                    transform: none !important;
                }
                .eye-btn:hover { color: #00e5a0 !important; }
                .forgot-link:hover { color: #00e5a0 !important; }
                .register-link:hover { text-decoration: underline !important; }
                .back-link:hover { color: #00e5a0 !important; }
            `}</style>

            {/* Logo */}
            <div style={styles.logoIcon}>
                <Lock size={28} color="#0a0e1a" strokeWidth={2.5} />
            </div>
            <div style={styles.title}>
                {t('login.systemTitle').split(' ')[0]} <span style={{ fontWeight: 800 }}>{t('login.systemTitle').split(' ')[1] || 'CHAIN'}</span>
            </div>
            <div style={styles.subtitle}>{t('login.systemSubtitle')}</div>

            {/* Form Card */}
            <div style={{ ...styles.formCard, animation: 'fadeInUp 0.5s ease' }}>
                {!requires2FA ? (
                    <>
                        <div style={styles.formTitle}>{t('login.title')}</div>
                        <div style={styles.formSubtitle}>
                            {t('login.subtitle')}
                        </div>

                        {error && (
                            <div style={styles.errorBox}>
                                <ShieldCheck size={16} />
                                {error}
                            </div>
                        )}

                        {/* AI Security Warnings */}
                        {securityWarnings.length > 0 && (
                            <div style={{
                                background: 'rgba(245, 158, 11, 0.1)',
                                border: '1px solid rgba(245, 158, 11, 0.3)',
                                borderRadius: '10px',
                                padding: '12px 16px',
                                marginBottom: '20px',
                                fontSize: '12px',
                                color: '#fbbf24',
                            }}>
                                <div style={{ fontWeight: 700, marginBottom: '6px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                    <ShieldCheck size={14} /> {t('login.aiAlert')}
                                </div>
                                {securityWarnings.map((w, i) => (
                                    <div key={i} style={{ marginLeft: '20px', lineHeight: '1.6' }}>
                                        • {w.message}
                                    </div>
                                ))}
                            </div>
                        )}

                        <form onSubmit={handleSubmit}>
                            {/* Username */}
                            <label style={styles.label}>{t('login.username')}</label>
                            <div className="login-input-group" style={styles.inputGroup}>
                                <User size={18} style={styles.inputIcon} />
                                <input
                                    type="text"
                                    style={styles.input}
                                    placeholder={t('login.usernamePlaceholder')}
                                    value={username}
                                    onChange={(e) => setUsername(e.target.value)}
                                    required
                                />
                            </div>

                            {/* Password */}
                            <div style={styles.labelRow}>
                                <label style={{ ...styles.label, marginBottom: 0 }}>{t('login.password')}</label>
                                <span className="forgot-link" style={{ ...styles.forgotLink, cursor: 'pointer' }} onClick={onForgotPassword}>{t('login.forgotPassword')}</span>
                            </div>
                            <div className="login-input-group" style={styles.inputGroup}>
                                <KeyRound size={18} style={styles.inputIcon} />
                                <input
                                    type={showPassword ? 'text' : 'password'}
                                    style={styles.input}
                                    placeholder={t('login.passwordPlaceholder')}
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    required
                                />
                                <button
                                    type="button"
                                    className="eye-btn"
                                    style={styles.eyeBtn}
                                    onClick={() => setShowPassword(!showPassword)}
                                    tabIndex={-1}
                                >
                                    {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                                </button>
                            </div>

                            {/* Remember session */}
                            <div style={styles.checkboxRow}>
                                <input
                                    type="checkbox"
                                    id="rememberSession"
                                    style={styles.checkbox}
                                    checked={rememberSession}
                                    onChange={(e) => setRememberSession(e.target.checked)}
                                />
                                <label htmlFor="rememberSession" style={styles.checkboxLabel}>
                                    {t('login.rememberSession')}
                                </label>
                            </div>

                            {/* reCAPTCHA */}
                            {captchaEnabled && (
                                <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '20px' }}>
                                    <div key={language} ref={recaptchaRef}></div>
                                </div>
                            )}

                            {/* Submit */}
                            <button
                                type="submit"
                                className="login-submit"
                                style={styles.submitBtn}
                                disabled={loading}
                            >
                                {loading ? (
                                    <div style={styles.spinner} />
                                ) : (
                                    <>
                                        {t('login.submit')}
                                        <ShieldCheck size={18} />
                                    </>
                                )}
                            </button>
                        </form>

                        {/* Register link */}
                        <div style={styles.registerLink}>
                            {t('login.noAccount')}
                            <span className="register-link" style={styles.registerAnchor} onClick={onGoToRegister}>
                                {t('login.register')}
                            </span>
                        </div>
                    </>
                ) : (
                    <>
                        {/* 2FA Verification - Dual Mode */}
                        <div style={{ textAlign: 'center', marginBottom: '8px' }}>
                            <div style={styles.otpBadge}>
                                <ShieldCheck size={14} />
                                {t('login.otpBadge')}
                            </div>
                        </div>




                        {/* Method Toggle (chỉ hiện khi có GG Auth) */}
                        {has2FAApp && (
                            <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
                                <button
                                    type="button"
                                    onClick={() => setAuthMethod('authenticator')}
                                    style={{
                                        flex: 1, padding: '10px 8px', borderRadius: 10, border: 'none',
                                        background: authMethod === 'authenticator' ? 'rgba(0,229,160,0.15)' : 'rgba(255,255,255,0.04)',
                                        color: authMethod === 'authenticator' ? '#00e5a0' : '#5a7a9a',
                                        fontSize: 12, fontWeight: 600, cursor: 'pointer',
                                        outline: authMethod === 'authenticator' ? '2px solid rgba(0,229,160,0.3)' : '1px solid rgba(255,255,255,0.08)',
                                        transition: 'all 0.2s ease'
                                    }}
                                >
                                    🔐 Google Authenticator
                                </button>
                                <button
                                    type="button"
                                    onClick={handleSwitchToEmail}
                                    style={{
                                        flex: 1, padding: '10px 8px', borderRadius: 10, border: 'none',
                                        background: authMethod === 'email' ? 'rgba(0,229,160,0.15)' : 'rgba(255,255,255,0.04)',
                                        color: authMethod === 'email' ? '#00e5a0' : '#5a7a9a',
                                        fontSize: 12, fontWeight: 600, cursor: 'pointer',
                                        outline: authMethod === 'email' ? '2px solid rgba(0,229,160,0.3)' : '1px solid rgba(255,255,255,0.08)',
                                        transition: 'all 0.2s ease'
                                    }}
                                >
                                    📧 Email OTP
                                </button>
                            </div>
                        )}

                        <div style={styles.otpTitle}>
                            {authMethod === 'authenticator' ? t('login.otpTitle') : t('login.emailAuthTitle')}
                        </div>
                        <div style={styles.otpSubtitle}>
                            {authMethod === 'authenticator'
                                ? t('login.otpSubtitle')
                                : <>{t('login.emailOtpSentTo')} <span style={{ color: '#00e5a0', fontWeight: 600 }}>{maskedEmail}</span></>
                            }
                        </div>

                        {error && (
                            <div style={styles.errorBox}>
                                <ShieldCheck size={16} />
                                {error}
                            </div>
                        )}

                        <form onSubmit={handleVerify2FA}>
                            {authMethod === 'authenticator' ? (
                                /* Google Authenticator - 6 separate input boxes */
                                <>
                                    <label style={styles.label}>{t('login.otpLabel')}</label>
                                    <div style={{ display: 'flex', gap: 8, justifyContent: 'center', marginBottom: 24 }}>
                                        {otpCode.map((digit, i) => (
                                            <input
                                                key={`ga-${i}`}
                                                ref={el => otpRefs.current[i] = el}
                                                type="text"
                                                inputMode="numeric"
                                                maxLength={1}
                                                value={digit}
                                                onChange={e => handleOtpChange(i, e.target.value)}
                                                onKeyDown={e => handleOtpKeyDown(i, e)}
                                                onPaste={i === 0 ? handleOtpPaste : undefined}
                                                autoFocus={i === 0}
                                                style={{
                                                    width: '100%', maxWidth: 48, height: 52, textAlign: 'center',
                                                    fontSize: 22, fontWeight: 700, fontFamily: 'monospace',
                                                    background: digit ? 'rgba(0,229,160,0.08)' : 'rgba(15,23,42,0.8)',
                                                    border: `2px solid ${digit ? 'rgba(0,229,160,0.4)' : 'rgba(255,255,255,0.1)'}`,
                                                    borderRadius: 10, color: '#00e5a0', outline: 'none',
                                                    transition: 'all 0.2s ease'
                                                }}
                                                onFocus={e => { e.target.style.borderColor = 'rgba(0,229,160,0.6)'; e.target.style.boxShadow = '0 0 0 3px rgba(0,229,160,0.1)'; }}
                                                onBlur={e => { e.target.style.borderColor = digit ? 'rgba(0,229,160,0.4)' : 'rgba(255,255,255,0.1)'; e.target.style.boxShadow = 'none'; }}
                                            />
                                        ))}
                                    </div>
                                </>
                            ) : (
                                /* Email OTP - 6 separate input boxes */
                                <>
                                    <div style={{ display: 'flex', gap: 8, justifyContent: 'center', marginBottom: 16 }}>
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
                                                    width: 44, height: 52, textAlign: 'center',
                                                    fontSize: 20, fontWeight: 700, fontFamily: 'monospace',
                                                    background: digit ? 'rgba(0,229,160,0.08)' : 'rgba(15,23,42,0.8)',
                                                    border: `2px solid ${digit ? 'rgba(0,229,160,0.4)' : 'rgba(255,255,255,0.1)'}`,
                                                    borderRadius: 10, color: '#00e5a0', outline: 'none',
                                                    transition: 'all 0.2s ease'
                                                }}
                                                onFocus={e => { e.target.style.borderColor = 'rgba(0,229,160,0.6)'; e.target.style.boxShadow = '0 0 0 3px rgba(0,229,160,0.1)'; }}
                                                onBlur={e => { e.target.style.borderColor = digit ? 'rgba(0,229,160,0.4)' : 'rgba(255,255,255,0.1)'; e.target.style.boxShadow = 'none'; }}
                                            />
                                        ))}
                                    </div>

                                    {/* Countdown */}
                                    <div style={{ textAlign: 'center', marginBottom: 16 }}>
                                        {otpCountdown > 0 ? (
                                            <span style={{ color: '#5a7a9a', fontSize: 12 }}>
                                                {t('otp.validity')} <span style={{ color: otpCountdown <= 15 ? '#ef4444' : '#00e5a0', fontWeight: 700, fontFamily: 'monospace' }}>
                                                    {Math.floor(otpCountdown / 60).toString().padStart(2, '0')}:{(otpCountdown % 60).toString().padStart(2, '0')}
                                                </span>
                                            </span>
                                        ) : (
                                            <span style={{ color: '#ef4444', fontSize: 12, fontWeight: 600 }}>{t('otp.codeExpired')}</span>
                                        )}
                                    </div>
                                </>
                            )}

                            <button
                                type="submit"
                                className="login-submit"
                                style={styles.submitBtn}
                                disabled={loading || otpCode.join('').length < 6}
                            >
                                {loading ? (
                                    <div style={styles.spinner} />
                                ) : (
                                    <>
                                        {t('login.otpSubmit')}
                                        <ShieldCheck size={18} />
                                    </>
                                )}
                            </button>
                        </form>

                        {/* Resend OTP (chỉ cho email method) */}
                        {authMethod === 'email' && otpCountdown <= 0 && (
                            <div style={{ textAlign: 'center', marginTop: 12 }}>
                                <button
                                    onClick={handleResendLoginOTP}
                                    disabled={otpResending}
                                    style={{
                                        background: 'none', border: 'none', color: '#00e5a0',
                                        cursor: 'pointer', fontSize: 12, fontWeight: 600,
                                        textDecoration: 'underline', opacity: otpResending ? 0.5 : 1
                                    }}
                                >
                                    {otpResending ? t('otp.resending') : t('otp.resendOtp')}
                                </button>
                            </div>
                        )}

                        {/* Nút chuyển sang phương thức khác (khi không có GG Auth) */}
                        {!has2FAApp && (
                            <div style={{ textAlign: 'center', marginTop: 8, fontSize: 11, color: '#3a5a7a' }}>
                                {t('login.emailOtpNote')}
                            </div>
                        )}

                        <button
                            type="button"
                            className="back-link"
                            style={styles.backLink}
                            onClick={() => { setRequires2FA(false); setOtp(''); setOtpCode(['','','','','','']); setPassword(''); setError(''); }}
                        >
                            {t('login.otpBack')}
                        </button>
                    </>
                )}
            </div>

            {/* Footer badges */}
            <div style={styles.footerBadges}>
                <div style={styles.footerBadge}>
                    <Lock size={12} style={styles.footerBadgeIcon} />
                    AES-256-GCM
                </div>
                <div style={styles.footerBadge}>
                    <ShieldCheck size={12} style={styles.footerBadgeIcon} />
                    TLS Resumption
                </div>
            </div>

            {/* System status */}
            <div style={styles.sysInfo}>
                <div style={styles.sysLine}>SYS_STATUS: <span style={{ color: '#00e5a0' }}>OPTIMAL</span></div>
                <div style={styles.sysLine}>NODE_ID: SC-VN-042</div>
                <div style={styles.sysLine}>LATENCY: <span style={{ color: '#00e5a0', animation: 'pulse 3s infinite' }}>{latency}ms</span></div>
            </div>

            {/* Copyright */}
            <div style={styles.copyright}>
                <div style={styles.copyrightText}>
                    {t('login.copyright')}
                </div>
                <div style={{ ...styles.copyrightText, fontSize: '10px', marginTop: '2px' }}>
                    {t('login.aiMonitor')}
                </div>
            </div>
        </div>
    );
};

export default LoginPage;
