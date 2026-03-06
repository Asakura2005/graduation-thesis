const crypto = require('crypto');

/**
 * MÔ PHỎNG ENVELOPE ENCRYPTION (KEY WRAPPING)
 */

// 1. KEK (Key Encryption Key) - Khóa gốc, bảo vệ nghiêm ngặt (thường lưu ở KMS)
const KEK = crypto.randomBytes(32);

/**
 * Bước A: MÃ HÓA (Wrap & Encrypt)
 */
function encryptEnvelope(plainText) {
    console.log("--- QUY TRÌNH MÃ HÓA PHONG BÌ ---");

    // 1. Tạo DEK (Data Encryption Key) ngẫu nhiên cho mỗi lần mã hóa
    const DEK = crypto.randomBytes(32);
    console.log("1. Tạo DEK mới:", DEK.toString('hex').substring(0, 16) + "...");

    // 2. Mã hóa Dữ liệu bằng DEK (Sử dụng AES-GCM)
    const ivData = crypto.randomBytes(12);
    const cipherData = crypto.createCipheriv('aes-256-gcm', DEK, ivData);
    let encryptedData = cipherData.update(plainText, 'utf8', 'hex');
    encryptedData += cipherData.final('hex');
    const authTagData = cipherData.getAuthTag().toString('hex');
    console.log("2. Dữ liệu đã được mã hóa bằng DEK.");

    // 3. KEY WRAPPING: Mã hóa DEK bằng KEK
    const ivKey = crypto.randomBytes(12);
    const cipherKey = crypto.createCipheriv('aes-256-gcm', KEK, ivKey);
    let wrappedDEK = cipherKey.update(DEK, null, 'hex');
    wrappedDEK += cipherKey.final('hex');
    const authTagKey = cipherKey.getAuthTag().toString('hex');
    console.log("3. DEK đã được 'gói' (wrap) bằng KEK.");

    // Trả về "Phong bì" (Envelope)
    return {
        encryptedData,
        ivData: ivData.toString('hex'),
        authTagData,
        wrappedDEK,
        ivKey: ivKey.toString('hex'),
        authTagKey
    };
}

/**
 * Bước B: GIẢI MÃ (Unwrap & Decrypt)
 */
function decryptEnvelope(envelope) {
    console.log("\n--- QUY TRÌNH GIẢI MÃ PHONG BÌ ---");

    // 1. KEY UNWRAPPING: Giải mã DEK bằng KEK gốc
    const decipherKey = crypto.createDecipheriv('aes-256-gcm', KEK, Buffer.from(envelope.ivKey, 'hex'));
    decipherKey.setAuthTag(Buffer.from(envelope.authTagKey, 'hex'));
    let decryptedDEK = decipherKey.update(envelope.wrappedDEK, 'hex');
    decryptedDEK = Buffer.concat([decryptedDEK, decipherKey.final()]);
    console.log("1. Giải mã thành công DEK gốc:", decryptedDEK.toString('hex').substring(0, 16) + "...");

    // 2. Giải mã Dữ liệu bằng DEK vừa lấy được
    const decipherData = crypto.createDecipheriv('aes-256-gcm', decryptedDEK, Buffer.from(envelope.ivData, 'hex'));
    decipherData.setAuthTag(Buffer.from(envelope.authTagData, 'hex'));
    let decryptedText = decipherData.update(envelope.encryptedData, 'hex', 'utf8');
    decryptedText += decipherData.final('utf8');
    console.log("2. Dữ liệu cuối cùng được giải mã.");

    return decryptedText;
}

// --- CHẠY THỬ NGHIỆM ---
const secretInfo = "Thông tin giao dịch bí mật: $10,000,000";
const envelope = encryptEnvelope(secretInfo);

console.log("\n[Dữ liệu lưu DB]:", JSON.stringify({
    data: envelope.encryptedData.substring(0, 20) + "...",
    wrappedKey: envelope.wrappedDEK.substring(0, 20) + "..."
}, null, 2));

const original = decryptEnvelope(envelope);
console.log("\nKẾT QUẢ ĐỐI CHIẾU:", original);
