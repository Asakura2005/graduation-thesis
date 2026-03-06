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

module.exports = { encrypt, decrypt, hashData };
