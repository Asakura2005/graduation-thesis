/**
 * EmailService.js - Dịch vụ gửi email cho hệ thống SCMS
 * Hỗ trợ: OTP, Device Alert, Password Reset Confirmation
 * Hỗ trợ đa ngôn ngữ (vi / en)
 */
const nodemailer = require('nodemailer');
require('dotenv').config();

// Tạo transporter (Gmail SMTP)
const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'smtp.gmail.com',
    port: parseInt(process.env.SMTP_PORT) || 587,
    secure: false, // true for 465, false for other ports (STARTTLS)
    auth: {
        user: process.env.SMTP_EMAIL,
        pass: process.env.SMTP_PASSWORD
    }
});

// Verify connection khi khởi động
transporter.verify()
    .then(() => console.log('[EmailService] ✅ SMTP Connection verified'))
    .catch(err => console.warn('[EmailService] ⚠️ SMTP Connection failed:', err.message, '- Emails will not be sent.'));

// ========================
// Email i18n translations
// ========================
const emailTranslations = {
    vi: {
        otp: {
            REGISTER: {
                subject: '🔐 SecureChain - Mã xác thực đăng ký tài khoản',
                heading: 'Xác Thực Tài Khoản',
                description: 'Bạn đang đăng ký tài khoản trên hệ thống <strong>SecureChain SCMS</strong>. Vui lòng nhập mã OTP bên dưới để hoàn tất đăng ký.',
                icon: '📧'
            },
            LOGIN_2FA: {
                subject: '🔑 SecureChain - Mã xác thực đăng nhập',
                heading: 'Xác Thực Đăng Nhập',
                description: 'Bạn đang thực hiện đăng nhập vào hệ thống <strong>SecureChain SCMS</strong>. Nhập mã OTP bên dưới để hoàn tất xác thực 2 lớp.',
                icon: '🔑'
            },
            FORGOT_PASSWORD: {
                subject: '🔓 SecureChain - Mã xác thực đặt lại mật khẩu',
                heading: 'Đặt Lại Mật Khẩu',
                description: 'Bạn đã yêu cầu đặt lại mật khẩu cho tài khoản <strong>SecureChain SCMS</strong>. Nhập mã OTP bên dưới để xác nhận.',
                icon: '🔓'
            },
            greeting: 'Xin chào',
            codeLabel: 'MÃ XÁC THỰC CỦA BẠN',
            warning: 'Mã này chỉ có hiệu lực trong <strong>90 giây</strong>. Không chia sẻ mã này với bất kỳ ai.',
            ignoreNote: 'Nếu bạn không thực hiện yêu cầu này, vui lòng bỏ qua email này.',
            expireNote: 'Mã OTP sẽ tự động hết hạn và không ai có thể sử dụng nó.',
            footer: '© 2026 SecureChain SCMS • AES-256-GCM Encrypted'
        },
        deviceAlert: {
            subject: (location, ip) => `🚨 Cảnh báo: Đăng nhập từ thiết bị mới - ${location || ip || 'Unknown'}`,
            headerTitle: 'CẢNH BÁO BẢO MẬT',
            heading: 'Phát hiện đăng nhập từ thiết bị lạ',
            greeting: (username) => `Xin chào <strong style="color:#e2e8f0">${username}</strong>, chúng tôi phát hiện tài khoản của bạn vừa đăng nhập từ một thiết bị hoặc vị trí không quen thuộc.`,
            deviceInfoTitle: 'CHI TIẾT THIẾT BỊ',
            ipLabel: '📍 Địa chỉ IP',
            locationLabel: '🌍 Vị trí',
            browserLabel: '🌐 Trình duyệt',
            osLabel: '💻 Hệ điều hành',
            timeLabel: '🕐 Thời gian',
            unknown: 'Không xác định',
            actionPrompt: 'Nếu đây không phải bạn, hãy hành động ngay:',
            notMeBtn: '❌ KHÔNG PHẢI TÔI',
            changePwBtn: '🔑 ĐỔI MẬT KHẨU',
            notMeNote: '<strong>⚡ "Không phải tôi"</strong>: Sẽ đăng xuất ngay lập tức thiết bị lạ.',
            changePwNote: '<strong>🔑 "Đổi mật khẩu"</strong>: Sẽ đăng xuất TẤT CẢ thiết bị sau khi đổi xong.',
            footer: '© 2026 SecureChain SCMS • Bảo mật là ưu tiên hàng đầu'
        },
        passwordChanged: {
            subject: '✅ SecureChain - Mật khẩu đã được thay đổi',
            heading: 'Mật khẩu đã được thay đổi',
            greeting: (username) => `Xin chào <strong style="color:#e2e8f0">${username}</strong>,`,
            body: (time) => `Mật khẩu của bạn đã được thay đổi thành công vào lúc <strong style="color:#e2e8f0">${time}</strong>.<br><br>Tất cả các phiên đăng nhập khác đã được đăng xuất để bảo mật tài khoản.`,
            warning: '⚠️ Nếu bạn không thực hiện thay đổi này, vui lòng liên hệ Admin ngay lập tức.',
            footer: '© 2026 SecureChain SCMS • AES-256-GCM Encrypted'
        }
    },
    en: {
        otp: {
            REGISTER: {
                subject: '🔐 SecureChain - Account Registration Verification Code',
                heading: 'Account Verification',
                description: 'You are registering an account on the <strong>SecureChain SCMS</strong> system. Please enter the OTP code below to complete registration.',
                icon: '📧'
            },
            LOGIN_2FA: {
                subject: '🔑 SecureChain - Login Verification Code',
                heading: 'Login Verification',
                description: 'You are logging into the <strong>SecureChain SCMS</strong> system. Enter the OTP code below to complete two-factor authentication.',
                icon: '🔑'
            },
            FORGOT_PASSWORD: {
                subject: '🔓 SecureChain - Password Reset Verification Code',
                heading: 'Password Reset',
                description: 'You have requested a password reset for your <strong>SecureChain SCMS</strong> account. Enter the OTP code below to confirm.',
                icon: '🔓'
            },
            greeting: 'Hello',
            codeLabel: 'YOUR VERIFICATION CODE',
            warning: 'This code is valid for <strong>90 seconds</strong> only. Do not share this code with anyone.',
            ignoreNote: 'If you did not make this request, please ignore this email.',
            expireNote: 'The OTP code will automatically expire and cannot be used by anyone.',
            footer: '© 2026 SecureChain SCMS • AES-256-GCM Encrypted'
        },
        deviceAlert: {
            subject: (location, ip) => `🚨 Alert: Login from a new device - ${location || ip || 'Unknown'}`,
            headerTitle: 'SECURITY ALERT',
            heading: 'Login detected from an unfamiliar device',
            greeting: (username) => `Hello <strong style="color:#e2e8f0">${username}</strong>, we detected your account was logged into from an unfamiliar device or location.`,
            deviceInfoTitle: 'DEVICE DETAILS',
            ipLabel: '📍 IP Address',
            locationLabel: '🌍 Location',
            browserLabel: '🌐 Browser',
            osLabel: '💻 Operating System',
            timeLabel: '🕐 Time',
            unknown: 'Unknown',
            actionPrompt: 'If this was not you, take action immediately:',
            notMeBtn: "❌ THIS WASN'T ME",
            changePwBtn: '🔑 CHANGE PASSWORD',
            notMeNote: '<strong>⚡ "This wasn\'t me"</strong>: Will immediately log out the unfamiliar device.',
            changePwNote: '<strong>🔑 "Change password"</strong>: Will log out ALL devices after password change.',
            footer: '© 2026 SecureChain SCMS • Security is our top priority'
        },
        passwordChanged: {
            subject: '✅ SecureChain - Password Changed Successfully',
            heading: 'Password Has Been Changed',
            greeting: (username) => `Hello <strong style="color:#e2e8f0">${username}</strong>,`,
            body: (time) => `Your password was successfully changed at <strong style="color:#e2e8f0">${time}</strong>.<br><br>All other sessions have been logged out to secure your account.`,
            warning: '⚠️ If you did not make this change, please contact Admin immediately.',
            footer: '© 2026 SecureChain SCMS • AES-256-GCM Encrypted'
        }
    }
};

/**
 * Lấy translations theo ngôn ngữ (fallback: vi)
 */
function getEmailLang(lang) {
    return emailTranslations[lang] || emailTranslations.vi;
}

/**
 * Gửi OTP qua email
 * @param {string} toEmail - Email người nhận
 * @param {string} otp - Mã OTP 6 số
 * @param {string} type - REGISTER | LOGIN_2FA | FORGOT_PASSWORD
 * @param {string} username - Tên người dùng (để hiển thị)
 * @param {string} lang - Ngôn ngữ (vi | en)
 */
async function sendOTPEmail(toEmail, otp, type = 'REGISTER', username = '', lang = 'vi') {
    const t = getEmailLang(lang);
    const config = t.otp[type] || t.otp.REGISTER;

    const html = `
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
    </head>
    <body style="margin:0; padding:0; background-color:#0a0e1a; font-family: 'Segoe UI', Arial, sans-serif;">
        <div style="max-width:520px; margin:0 auto; padding:40px 20px;">
            <!-- Header -->
            <div style="text-align:center; margin-bottom:32px;">
                <div style="display:inline-block; width:56px; height:56px; border-radius:14px; background:linear-gradient(135deg,#00e5a0,#00b880); text-align:center; line-height:56px; font-size:26px;">
                    ${config.icon}
                </div>
                <div style="margin-top:16px; font-size:22px; font-weight:800; color:#00e5a0; letter-spacing:3px;">
                    SECURE <span style="font-weight:800">CHAIN</span>
                </div>
                <div style="font-size:10px; color:#4a6a8a; letter-spacing:4px; text-transform:uppercase; margin-top:4px;">
                    ADVANCED CYBER INFRASTRUCTURE
                </div>
            </div>

            <!-- Card -->
            <div style="background:rgba(13,21,38,0.95); border:1px solid rgba(0,229,160,0.15); border-radius:16px; padding:36px 32px;">
                <div style="font-size:20px; font-weight:700; color:#e2e8f0; margin-bottom:8px;">
                    ${config.heading}
                </div>
                ${username ? `<div style="font-size:13px; color:#5a7a9a; margin-bottom:16px;">${t.otp.greeting} <strong style="color:#e2e8f0">${username}</strong>,</div>` : ''}
                <div style="font-size:13px; color:#5a7a9a; line-height:1.7; margin-bottom:28px;">
                    ${config.description}
                </div>

                <!-- OTP Code -->
                <div style="text-align:center; margin-bottom:24px;">
                    <div style="font-size:10px; color:#4a6a8a; letter-spacing:3px; text-transform:uppercase; margin-bottom:12px;">
                        ${t.otp.codeLabel}
                    </div>
                    <div style="display:inline-block; background:rgba(0,229,160,0.08); border:2px solid rgba(0,229,160,0.25); border-radius:12px; padding:16px 40px;">
                        <span style="font-size:36px; font-weight:800; letter-spacing:12px; color:#00e5a0; font-family:monospace;">
                            ${otp}
                        </span>
                    </div>
                </div>

                <!-- Warning -->
                <div style="background:rgba(245,158,11,0.08); border:1px solid rgba(245,158,11,0.2); border-radius:10px; padding:12px 16px; margin-bottom:20px;">
                    <div style="font-size:12px; color:#fbbf24; display:flex; align-items:center; gap:6px;">
                        ⚠️ ${t.otp.warning}
                    </div>
                </div>

                <!-- Info -->
                <div style="font-size:11px; color:#3a5a7a; line-height:1.8; border-top:1px solid rgba(255,255,255,0.05); padding-top:16px;">
                    ${t.otp.ignoreNote}<br>
                    ${t.otp.expireNote}
                </div>
            </div>

            <!-- Footer -->
            <div style="text-align:center; margin-top:24px;">
                <div style="font-size:10px; color:#2a4a6a;">
                    ${t.otp.footer}
                </div>
            </div>
        </div>
    </body>
    </html>`;

    try {
        const info = await transporter.sendMail({
            from: `"SecureChain SCMS 🔐" <${process.env.SMTP_EMAIL}>`,
            to: toEmail,
            subject: config.subject,
            html: html
        });
        console.log(`[EmailService] ✅ OTP email sent to ${toEmail} (${type}) - MessageID: ${info.messageId}`);
        return { success: true, messageId: info.messageId };
    } catch (err) {
        console.error(`[EmailService] ❌ Failed to send OTP email to ${toEmail}:`, err.message);
        return { success: false, error: err.message };
    }
}

/**
 * Gửi email cảnh báo thiết bị lạ (Facebook Style)
 * @param {string} lang - Ngôn ngữ (vi | en)
 */
async function sendDeviceAlertEmail(toEmail, username, deviceInfo, revokeUrl, changePasswordUrl, lang = 'vi') {
    const t = getEmailLang(lang);
    const d = t.deviceAlert;
    const { ip, browser, os, location, time } = deviceInfo;
    const locale = lang === 'en' ? 'en-US' : 'vi-VN';

    const html = `
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
    </head>
    <body style="margin:0; padding:0; background-color:#0a0e1a; font-family: 'Segoe UI', Arial, sans-serif;">
        <div style="max-width:520px; margin:0 auto; padding:40px 20px;">
            <!-- Header -->
            <div style="text-align:center; margin-bottom:32px;">
                <div style="display:inline-block; width:56px; height:56px; border-radius:14px; background:linear-gradient(135deg,#ef4444,#dc2626); text-align:center; line-height:56px; font-size:26px;">
                    🚨
                </div>
                <div style="margin-top:16px; font-size:22px; font-weight:800; color:#ef4444; letter-spacing:3px;">
                    ${d.headerTitle}
                </div>
            </div>

            <!-- Card -->
            <div style="background:rgba(13,21,38,0.95); border:1px solid rgba(239,68,68,0.2); border-radius:16px; padding:36px 32px;">
                <div style="font-size:18px; font-weight:700; color:#e2e8f0; margin-bottom:8px;">
                    ${d.heading}
                </div>
                <div style="font-size:13px; color:#5a7a9a; line-height:1.7; margin-bottom:24px;">
                    ${d.greeting(username)}
                </div>

                <!-- Device Info -->
                <div style="background:rgba(255,255,255,0.03); border:1px solid rgba(255,255,255,0.08); border-radius:12px; padding:20px; margin-bottom:24px;">
                    <div style="font-size:10px; color:#4a6a8a; letter-spacing:3px; text-transform:uppercase; margin-bottom:14px; font-weight:700;">
                        ${d.deviceInfoTitle}
                    </div>
                    <table style="width:100%; font-size:13px; color:#e2e8f0;">
                        <tr style="border-bottom:1px solid rgba(255,255,255,0.05);">
                            <td style="padding:8px 0; color:#5a7a9a; width:110px;">${d.ipLabel}</td>
                            <td style="padding:8px 0; font-weight:600;">${ip || d.unknown}</td>
                        </tr>
                        <tr style="border-bottom:1px solid rgba(255,255,255,0.05);">
                            <td style="padding:8px 0; color:#5a7a9a;">${d.locationLabel}</td>
                            <td style="padding:8px 0; font-weight:600;">${location || d.unknown}</td>
                        </tr>
                        <tr style="border-bottom:1px solid rgba(255,255,255,0.05);">
                            <td style="padding:8px 0; color:#5a7a9a;">${d.browserLabel}</td>
                            <td style="padding:8px 0; font-weight:600;">${browser || d.unknown}</td>
                        </tr>
                        <tr style="border-bottom:1px solid rgba(255,255,255,0.05);">
                            <td style="padding:8px 0; color:#5a7a9a;">${d.osLabel}</td>
                            <td style="padding:8px 0; font-weight:600;">${os || d.unknown}</td>
                        </tr>
                        <tr>
                            <td style="padding:8px 0; color:#5a7a9a;">${d.timeLabel}</td>
                            <td style="padding:8px 0; font-weight:600;">${time || new Date().toLocaleString(locale)}</td>
                        </tr>
                    </table>
                </div>

                <!-- Action Buttons -->
                <div style="text-align:center; margin-bottom:20px;">
                    <div style="font-size:12px; color:#5a7a9a; margin-bottom:16px;">
                        ${d.actionPrompt}
                    </div>
                    <table width="100%" cellpadding="0" cellspacing="0" border="0">
                        <tr>
                            <td width="50%" style="padding-right:6px;" align="center">
                                <a href="${revokeUrl}" style="display:block; padding:14px 0; background:linear-gradient(135deg,#ef4444,#dc2626); color:#fff; text-decoration:none; border-radius:10px; font-weight:700; font-size:13px; letter-spacing:1px; text-align:center;">
                                    ${d.notMeBtn}
                                </a>
                            </td>
                            <td width="50%" style="padding-left:6px;" align="center">
                                <a href="${changePasswordUrl}" style="display:block; padding:14px 0; background:linear-gradient(135deg,#f59e0b,#d97706); color:#0a0e1a; text-decoration:none; border-radius:10px; font-weight:700; font-size:13px; letter-spacing:1px; text-align:center;">
                                    ${d.changePwBtn}
                                </a>
                            </td>
                        </tr>
                    </table>
                </div>

                <!-- Info -->
                <div style="background:rgba(239,68,68,0.06); border:1px solid rgba(239,68,68,0.15); border-radius:10px; padding:12px 16px;">
                    <div style="font-size:11px; color:#f87171; line-height:1.8;">
                        ${d.notMeNote}<br>
                        ${d.changePwNote}
                    </div>
                </div>
            </div>

            <!-- Footer -->
            <div style="text-align:center; margin-top:24px;">
                <div style="font-size:10px; color:#2a4a6a;">
                    ${d.footer}
                </div>
            </div>
        </div>
    </body>
    </html>`;

    try {
        const info = await transporter.sendMail({
            from: `"SecureChain Security 🚨" <${process.env.SMTP_EMAIL}>`,
            to: toEmail,
            subject: d.subject(location, ip),
            html: html
        });
        console.log(`[EmailService] ✅ Device alert sent to ${toEmail} - MessageID: ${info.messageId}`);
        return { success: true, messageId: info.messageId };
    } catch (err) {
        console.error(`[EmailService] ❌ Failed to send device alert to ${toEmail}:`, err.message);
        return { success: false, error: err.message };
    }
}

/**
 * Gửi email xác nhận đổi mật khẩu thành công
 * @param {string} lang - Ngôn ngữ (vi | en)
 */
async function sendPasswordChangedEmail(toEmail, username, lang = 'vi') {
    const t = getEmailLang(lang);
    const p = t.passwordChanged;
    const locale = lang === 'en' ? 'en-US' : 'vi-VN';
    const timeStr = new Date().toLocaleString(locale);

    const html = `
    <!DOCTYPE html>
    <html>
    <head><meta charset="UTF-8"></head>
    <body style="margin:0; padding:0; background-color:#0a0e1a; font-family: 'Segoe UI', Arial, sans-serif;">
        <div style="max-width:520px; margin:0 auto; padding:40px 20px;">
            <div style="text-align:center; margin-bottom:32px;">
                <div style="display:inline-block; width:56px; height:56px; border-radius:14px; background:linear-gradient(135deg,#00e5a0,#00b880); text-align:center; line-height:56px; font-size:26px;">✅</div>
                <div style="margin-top:16px; font-size:22px; font-weight:800; color:#00e5a0; letter-spacing:3px;">SECURE CHAIN</div>
            </div>
            <div style="background:rgba(13,21,38,0.95); border:1px solid rgba(0,229,160,0.15); border-radius:16px; padding:36px 32px;">
                <div style="font-size:20px; font-weight:700; color:#e2e8f0; margin-bottom:12px;">${p.heading}</div>
                <div style="font-size:13px; color:#5a7a9a; line-height:1.7; margin-bottom:20px;">
                    ${p.greeting(username)}<br><br>
                    ${p.body(timeStr)}
                </div>
                <div style="background:rgba(245,158,11,0.08); border:1px solid rgba(245,158,11,0.2); border-radius:10px; padding:12px 16px;">
                    <div style="font-size:12px; color:#fbbf24;">
                        ${p.warning}
                    </div>
                </div>
            </div>
            <div style="text-align:center; margin-top:24px; font-size:10px; color:#2a4a6a;">
                ${p.footer}
            </div>
        </div>
    </body>
    </html>`;

    try {
        await transporter.sendMail({
            from: `"SecureChain SCMS 🔐" <${process.env.SMTP_EMAIL}>`,
            to: toEmail,
            subject: p.subject,
            html: html
        });
        return { success: true };
    } catch (err) {
        console.error(`[EmailService] ❌ Password changed email failed:`, err.message);
        return { success: false, error: err.message };
    }
}

module.exports = { sendOTPEmail, sendDeviceAlertEmail, sendPasswordChangedEmail };
