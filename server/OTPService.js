/**
 * OTPService.js - Quản lý OTP (One-Time Password) cho hệ thống SCMS
 * OTP 6 số, TTL 90 giây, SHA-256 hash trước khi lưu DB
 * Types: REGISTER, LOGIN_2FA, FORGOT_PASSWORD
 */
const crypto = require('crypto');
const sql = require('mssql');

const OTP_TTL_SECONDS = 90; // Tất cả OTP hết hạn sau 90 giây

/**
 * Tạo mã OTP 6 số ngẫu nhiên
 */
function generateOTP() {
    // Sử dụng crypto.randomInt để tạo số an toàn (không bias)
    return crypto.randomInt(100000, 999999).toString();
}

/**
 * Hash OTP trước khi lưu (SHA-256)
 */
function hashOTP(otp) {
    return crypto.createHash('sha256').update(otp).digest('hex');
}

/**
 * Hash email để tìm kiếm (Blind Index)
 */
function hashEmail(email) {
    return crypto.createHash('sha256').update(email.toLowerCase().trim()).digest('hex');
}

/**
 * Lưu OTP vào database
 * @param {object} pool - MSSQL connection pool
 * @param {string} email - Email người dùng (plaintext)
 * @param {string} otp - Mã OTP 6 số (plaintext)
 * @param {string} type - REGISTER | LOGIN_2FA | FORGOT_PASSWORD
 */
async function storeOTP(pool, email, otp, type) {
    const emailHash = hashEmail(email);
    const otpHash = hashOTP(otp);
    const expiresAt = new Date(Date.now() + OTP_TTL_SECONDS * 1000);

    // Invalidate tất cả OTP cũ cùng loại cho email này
    await pool.request()
        .input('eh', sql.NVarChar, emailHash)
        .input('type', sql.NVarChar, type)
        .query("UPDATE otp_tokens SET used = 1 WHERE email_hash = @eh AND type = @type AND used = 0");

    // Insert OTP mới
    await pool.request()
        .input('eh', sql.NVarChar, emailHash)
        .input('oh', sql.NVarChar, otpHash)
        .input('type', sql.NVarChar, type)
        .input('exp', sql.DateTime, expiresAt)
        .query("INSERT INTO otp_tokens (email_hash, otp_hash, type, expires_at) VALUES (@eh, @oh, @type, @exp)");

    console.log(`[OTPService] Stored ${type} OTP for email hash ${emailHash.substring(0, 10)}... (expires in ${OTP_TTL_SECONDS}s)`);
    return { expiresAt, ttl: OTP_TTL_SECONDS };
}

/**
 * Xác thực OTP
 * @param {object} pool - MSSQL connection pool
 * @param {string} email - Email (plaintext)
 * @param {string} otp - OTP người dùng nhập (plaintext)
 * @param {string} type - REGISTER | LOGIN_2FA | FORGOT_PASSWORD
 * @returns {{ valid: boolean, error?: string }}
 */
async function verifyOTP(pool, email, otp, type) {
    const emailHash = hashEmail(email);
    const otpHash = hashOTP(otp);

    const now = new Date();

    // Tìm OTP khớp, chưa dùng, chưa hết hạn
    const result = await pool.request()
        .input('eh', sql.NVarChar, emailHash)
        .input('oh', sql.NVarChar, otpHash)
        .input('type', sql.NVarChar, type)
        .input('now', sql.DateTime, now)
        .query(`
            SELECT TOP 1 * FROM otp_tokens 
            WHERE email_hash = @eh 
              AND otp_hash = @oh 
              AND type = @type 
              AND used = 0 
              AND expires_at > @now
            ORDER BY created_at DESC
        `);

    if (result.recordset.length === 0) {
        // Kiểm tra xem có OTP nhưng đã hết hạn không
        const expiredCheck = await pool.request()
            .input('eh', sql.NVarChar, emailHash)
            .input('oh', sql.NVarChar, otpHash)
            .input('type', sql.NVarChar, type)
            .input('now', sql.DateTime, now)
            .query(`
                SELECT TOP 1 * FROM otp_tokens 
                WHERE email_hash = @eh 
                  AND otp_hash = @oh 
                  AND type = @type 
                  AND used = 0 
                  AND expires_at <= @now
                ORDER BY created_at DESC
            `);

        if (expiredCheck.recordset.length > 0) {
            return { valid: false, error: 'OTP đã hết hạn. Vui lòng yêu cầu mã mới.' };
        }

        return { valid: false, error: 'Mã OTP không đúng. Vui lòng kiểm tra lại.' };
    }

    // Đánh dấu OTP đã sử dụng
    await pool.request()
        .input('id', sql.UniqueIdentifier, result.recordset[0].id)
        .query("UPDATE otp_tokens SET used = 1 WHERE id = @id");

    console.log(`[OTPService] ✅ Verified ${type} OTP for email hash ${emailHash.substring(0, 10)}...`);
    return { valid: true };
}

/**
 * Cleanup OTP hết hạn (chạy định kỳ)
 */
async function cleanupExpiredOTPs(pool) {
    try {
        const result = await pool.request()
            .query("DELETE FROM otp_tokens WHERE expires_at < DATEADD(MINUTE, -5, GETUTCDATE()) OR used = 1");
        if (result.rowsAffected[0] > 0) {
            console.log(`[OTPService] Cleaned up ${result.rowsAffected[0]} expired/used OTP records`);
        }
    } catch (err) {
        console.error('[OTPService] Cleanup error:', err.message);
    }
}

module.exports = {
    OTP_TTL_SECONDS,
    generateOTP,
    hashOTP,
    hashEmail,
    storeOTP,
    verifyOTP,
    cleanupExpiredOTPs
};
