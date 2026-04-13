const crypto = require('crypto');
require('dotenv').config();

const ALGORITHM = 'aes-256-gcm';
// Khóa chính (KEK) từ môi trường - 32 bytes
const KEK = process.env.AES_SECRET_KEY ? Buffer.from(process.env.AES_SECRET_KEY, 'hex') : crypto.randomBytes(32);
const IV_LENGTH = 12;

/**
 * Mã hóa dữ liệu theo mô hình Envelope (KEK gói DEK)
 */
function encrypt(text) {
    if (!text) return null;

    // 1. Sinh DEK (Data Encryption Key) ngẫu nhiên
    const DEK = crypto.randomBytes(32);

    // 2. Mã hóa dữ liệu bằng DEK
    const ivData = crypto.randomBytes(IV_LENGTH);
    const cipherData = crypto.createCipheriv(ALGORITHM, DEK, ivData);
    let encryptedData = cipherData.update(text, 'utf8', 'hex');
    encryptedData += cipherData.final('hex');
    const authTagData = cipherData.getAuthTag().toString('hex');

    // 3. Wrap DEK bằng KEK (Key Wrapping)
    const ivKey = crypto.randomBytes(IV_LENGTH);
    const cipherKey = crypto.createCipheriv(ALGORITHM, KEK, ivKey);
    let wrappedDEK = cipherKey.update(DEK, null, 'hex');
    wrappedDEK += cipherKey.final('hex');
    const authTagKey = cipherKey.getAuthTag().toString('hex');

    // Ghép tất cả thành một "Phong bì" (Envelope) để lưu vào DB
    return `${ivData.toString('hex')}:${authTagData}:${encryptedData}:${ivKey.toString('hex')}:${authTagKey}:${wrappedDEK}`;
}

/**
 * Giải mã dữ liệu theo mô hình Envelope
 */
function decrypt(envelope) {
    if (!envelope || typeof envelope !== 'string') return null;

    try {
        const parts = envelope.split(':');
        if (parts.length < 6) {
            // Hỗ trợ tương thích ngược nếu có dữ liệu cũ theo định dạng 3 phần
            return decryptLegacy(envelope);
        }

        const [ivDataHex, authTagDataHex, encryptedText, ivKeyHex, authTagKeyHex, wrappedDEKHex] = parts;

        // 1. Unwrap DEK bằng KEK
        const decipherKey = crypto.createDecipheriv(ALGORITHM, KEK, Buffer.from(ivKeyHex, 'hex'));
        decipherKey.setAuthTag(Buffer.from(authTagKeyHex, 'hex'));
        let DEK = decipherKey.update(wrappedDEKHex, 'hex');
        DEK = Buffer.concat([DEK, decipherKey.final()]);

        // 2. Giải mã dữ liệu bằng DEK đã unwrap
        const decipherData = crypto.createDecipheriv(ALGORITHM, DEK, Buffer.from(ivDataHex, 'hex'));
        decipherData.setAuthTag(Buffer.from(authTagDataHex, 'hex'));
        let decrypted = decipherData.update(encryptedText, 'hex', 'utf8');
        decrypted += decipherData.final('utf8');

        return decrypted;
    } catch (error) {
        console.error('Envelope Decryption failed:', error.message);
        return null;
    }
}

// Hàm hỗ trợ giải mã dữ liệu cũ (không có envelope) để tránh lỗi hệ thống
function decryptLegacy(encryptedData) {
    try {
        const [ivHex, authTagHex, encryptedText] = encryptedData.split(':');
        const decipher = crypto.createDecipheriv(ALGORITHM, KEK, Buffer.from(ivHex, 'hex'));
        decipher.setAuthTag(Buffer.from(authTagHex, 'hex'));
        let decrypted = decipher.update(encryptedText, 'hex', 'utf8');
        decrypted += decipher.final('utf8');
        return decrypted;
    } catch { return null; }
}

function hashData(text) {
    return crypto.createHash('sha256').update(text).digest('hex');
}

// --- Integrity-aware decryption helpers ---
// Hằng số đánh dấu dữ liệu bị can thiệp (tampered)
const TAMPERED_DATA = '⚠ Dữ liệu bị can thiệp';

/**
 * Giải mã an toàn: nếu decrypt thất bại (dữ liệu bị sửa trực tiếp trong DB),
 * trả về thông báo lỗi thân thiện thay vì chuỗi mã hóa thô.
 * @param {string} envelope - Dữ liệu mã hóa từ DB
 * @param {string} [fallbackLabel] - Nhãn lỗi tùy chỉnh (mặc định: TAMPERED_DATA) 
 * @returns {string|null} - Dữ liệu gốc hoặc thông báo lỗi
 */
function safeDecrypt(envelope, fallbackLabel) {
    if (!envelope || typeof envelope !== 'string') return null;
    const result = decrypt(envelope);
    if (result !== null) return result;
    // Nếu chuỗi có dạng hex:hex:hex (envelope format) nhưng decrypt trả null → dữ liệu bị tampered
    if (envelope.includes(':')) {
        return fallbackLabel || TAMPERED_DATA;
    }
    // Dữ liệu plaintext (chưa được encrypt) → trả nguyên
    return envelope;
}

/**
 * Giải mã số nguyên an toàn: trả về 0 nếu dữ liệu bị can thiệp
 */
function safeDecryptInt(envelope, defaultVal = 0) {
    if (!envelope) return defaultVal;
    const result = decrypt(envelope);
    if (result !== null) {
        const num = parseInt(result);
        return isNaN(num) ? defaultVal : num;
    }
    // Dữ liệu bị tampered → trả giá trị mặc định
    if (typeof envelope === 'string' && envelope.includes(':')) return -1; // -1 = tampered marker
    return parseInt(envelope) || defaultVal;
}

/**
 * Giải mã số thực an toàn: trả về 0 nếu dữ liệu bị can thiệp
 */
function safeDecryptFloat(envelope, defaultVal = 0) {
    if (!envelope) return defaultVal;
    const result = decrypt(envelope);
    if (result !== null) {
        const num = parseFloat(result);
        return isNaN(num) ? defaultVal : num;
    }
    if (typeof envelope === 'string' && envelope.includes(':')) return -1;
    return parseFloat(envelope) || defaultVal;
}

module.exports = { encrypt, decrypt, hashData, safeDecrypt, safeDecryptInt, safeDecryptFloat, TAMPERED_DATA };
