import React, { useState } from 'react';
import axios from 'axios';
import { UserPlus, User, Lock, Mail, ShieldCheck } from 'lucide-react';

const RegisterPage = ({ onBackToLogin }) => {
    const [formData, setFormData] = useState({
        username: '',
        password: '',
        fullName: '',
        email: '',
        phone: ''
    });
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');

    const handleRegister = async (e) => {
        e.preventDefault();
        setError('');
        setSuccess('');
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
                                type="password"
                                className="form-control bg-transparent border-gold border-start-0 text-white"
                                placeholder="••••••••"
                                value={formData.password}
                                onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                                required
                            />
                        </div>
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
