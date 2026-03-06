import React, { useState } from 'react';
import { Lock, User, ShieldCheck } from 'lucide-react';
import axios from 'axios';

const LoginPage = ({ onLoginSuccess, onGoToRegister }) => {
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);

    // 2FA states
    const [requires2FA, setRequires2FA] = useState(false);
    const [tempToken, setTempToken] = useState('');
    const [otp, setOtp] = useState('');


    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');
        setLoading(true);

        try {
            const response = await axios.post('http://localhost:5001/api/auth/login', {
                username,
                password
            });

            if (response.data.requires2FA) {
                setRequires2FA(true);
                setTempToken(response.data.tempToken);
            } else {
                localStorage.setItem('token', response.data.token);
                onLoginSuccess(response.data);
            }
        } catch (err) {
            setError(err.response?.data?.error || 'Đã xảy ra lỗi khi đăng nhập');
        } finally {
            setLoading(false);
        }
    };

    const handleVerify2FA = async (e) => {
        e.preventDefault();
        setError('');
        setLoading(true);

        try {
            const response = await axios.post('http://localhost:5001/api/auth/verify-2fa', {
                tempToken,
                token: otp
            });

            localStorage.setItem('token', response.data.token);
            onLoginSuccess(response.data);
        } catch (err) {
            setError(err.response?.data?.error || 'Mã xác thực không hợp lệ');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="container-fluid d-flex align-items-center justify-content-center min-vh-100 p-3">
            <div className="glass p-5 w-100" style={{ maxWidth: '450px' }}>
                <div className="text-center mb-5">
                    <div className="d-inline-flex p-3 rounded-circle mb-3" style={{ background: 'rgba(197, 160, 89, 0.1)', border: '1px solid var(--primary)' }}>
                        <ShieldCheck size={48} className="text-gold" />
                    </div>
                    <h2 className="text-gold fw-bold mb-1">SECURE CHAIN</h2>
                    <p className="text-dim small text-uppercase tracking-wider">Hệ thống quản lý chuỗi cung ứng mã hóa</p>
                </div>

                {error && (
                    <div className="alert alert-danger glass border-danger text-danger py-2 px-3 mb-4 small">
                        {error}
                    </div>
                )}

                {requires2FA ? (
                    <form onSubmit={handleVerify2FA}>
                        <div className="text-center mb-4">
                            <h5 className="text-white fw-bold">Xác minh 2 lớp</h5>
                            <p className="text-dim small">Nhập mã 6 chữ số từ ứng dụng Google Authenticator của bạn.</p>
                        </div>
                        <div className="mb-4">
                            <div className="input-group glass">
                                <span className="input-group-text bg-transparent border-0 text-dim">
                                    <ShieldCheck size={18} />
                                </span>
                                <input
                                    type="text"
                                    maxLength="6"
                                    className="form-control bg-transparent border-0 text-white shadow-none text-center fw-bold fs-4 tracking-widest"
                                    placeholder="000 000"
                                    value={otp}
                                    onChange={(e) => setOtp(e.target.value.replace(/\D/g, ''))}
                                    required
                                    autoFocus
                                />
                            </div>
                        </div>
                        <button
                            type="submit"
                            className="btn btn-gold w-100 py-3 rounded-3 d-flex align-items-center justify-content-center gap-2"
                            disabled={loading || otp.length < 6}
                        >
                            {loading ? (
                                <div className="spinner-border spinner-border-sm" role="status"></div>
                            ) : (
                                <>Xác nhận</>
                            )}
                        </button>
                        <button
                            type="button"
                            className="btn btn-link w-100 text-dim mt-3 text-decoration-none small"
                            onClick={() => { setRequires2FA(false); setOtp(''); setPassword(''); }}
                        >
                            Quay lại đăng nhập
                        </button>
                    </form>
                ) : (
                    <form onSubmit={handleSubmit}>
                        <div className="mb-4">
                            <label className="form-label text-dim small">Tên đăng nhập</label>
                            <div className="input-group glass">
                                <span className="input-group-text bg-transparent border-0 text-dim">
                                    <User size={18} />
                                </span>
                                <input
                                    type="text"
                                    className="form-control bg-transparent border-0 text-white shadow-none"
                                    placeholder="Nhập username"
                                    value={username}
                                    onChange={(e) => setUsername(e.target.value)}
                                    required
                                />
                            </div>
                        </div>

                        <div className="mb-5">
                            <label className="form-label text-dim small">Mật khẩu</label>
                            <div className="input-group glass">
                                <span className="input-group-text bg-transparent border-0 text-dim">
                                    <Lock size={18} />
                                </span>
                                <input
                                    type="password"
                                    className="form-control bg-transparent border-0 text-white shadow-none"
                                    placeholder="Nhập password"
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    required
                                />
                            </div>
                        </div>

                        <button
                            type="submit"
                            className="btn btn-gold w-100 py-3 rounded-3 d-flex align-items-center justify-content-center gap-2"
                            disabled={loading}
                        >
                            {loading ? (
                                <div className="spinner-border spinner-border-sm" role="status"></div>
                            ) : (
                                <>
                                    <Lock size={18} />
                                    <span>ĐĂNG NHẬP HỆ THỐNG</span>
                                </>
                            )}
                        </button>

                        <button
                            type="button"
                            className="btn btn-link w-100 text-dim mt-3 text-decoration-none small"
                            onClick={onGoToRegister}
                        >
                            Chưa có tài khoản? Đăng ký ngay
                        </button>
                    </form>
                )}

                <div className="mt-5 text-center small text-dim d-flex flex-column gap-2">
                    <span>Mã hóa mặc định: <span className="text-gold fw-bold">AES-256-GCM</span></span>
                    <span className="x-small text-secondary" style={{ maxWidth: '350px', margin: '0 auto', lineHeight: '1.4' }}>
                        - <strong className="text-dim">TLS Session Resumption</strong>: Cơ chế này cho phép tái sử dụng các phiên kết nối đã được xác thực trước đó mà không cần thực hiện lại toàn bộ quá trình TLS handshake.
                    </span>
                </div>
            </div>
        </div>
    );
};

export default LoginPage;
