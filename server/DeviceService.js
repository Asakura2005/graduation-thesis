/**
 * DeviceService.js - Quản lý thiết bị & phiên đăng nhập (Facebook-style)
 * Device Fingerprinting, Trusted Devices, Session Revocation, IP Geolocation
 */
const crypto = require('crypto');
const sql = require('mssql');
const UAParser = require('ua-parser-js');
const { encrypt, decrypt, hashData } = require('./EncryptionService');

/**
 * Tạo device fingerprint từ thông tin request
 * - Sử dụng IP + User-Agent + Accept-Language
 * - Hash thành 1 chuỗi cố định (SHA-256)
 */
function generateDeviceFingerprint(req) {
    const ip = resolveIP(req);
    const ua = req.headers['user-agent'] || 'unknown';
    const lang = req.headers['accept-language'] || 'unknown';

    // Kết hợp các yếu tố tạo fingerprint duy nhất
    const raw = `${ip}|${ua}|${lang}`;
    return crypto.createHash('sha256').update(raw).digest('hex');
}

/**
 * Parse User-Agent → Thông tin trình duyệt + hệ điều hành
 */
function getDeviceInfo(req) {
    const parser = new UAParser(req.headers['user-agent'] || '');
    const browser = parser.getBrowser();
    const os = parser.getOS();
    const device = parser.getDevice();

    return {
        browser: `${browser.name || 'Unknown'} ${browser.version || ''}`.trim(),
        os: `${os.name || 'Unknown'} ${os.version || ''}`.trim(),
        device: device.type || 'Desktop',
        userAgent: req.headers['user-agent'] || 'unknown'
    };
}

/**
 * Resolve IP Address (IPv6 → IPv4, loopback → LAN)
 */
function resolveIP(req) {
    let ip = req.headers['x-forwarded-for'] || req.headers['x-real-ip'] || req.socket?.remoteAddress || 'unknown';
    if (ip.includes(',')) ip = ip.split(',')[0].trim();
    if (ip.startsWith('::ffff:')) ip = ip.substring(7);
    if (ip === '::1' || ip === '127.0.0.1') {
        const os = require('os');
        const interfaces = os.networkInterfaces();
        for (const name of Object.keys(interfaces)) {
            for (const iface of interfaces[name]) {
                if (iface.family === 'IPv4' && !iface.internal) return iface.address;
            }
        }
    }
    return ip;
}

/**
 * Lấy vị trí ước tính từ IP (sử dụng ip-api.com - miễn phí)
 */
async function getIPLocation(ip) {
    // Skip private/local IPs
    if (!ip || ip === 'unknown' || ip.startsWith('192.168.') || ip.startsWith('10.') || ip.startsWith('172.') || ip === '127.0.0.1') {
        return 'Mạng nội bộ (Local Network)';
    }

    try {
        const http = require('http');
        const data = await new Promise((resolve, reject) => {
            const req = http.get(`http://ip-api.com/json/${ip}?fields=status,country,regionName,city,isp&lang=en`, (res) => {
                let body = '';
                res.on('data', chunk => body += chunk);
                res.on('end', () => resolve(JSON.parse(body)));
            });
            req.on('error', reject);
            req.setTimeout(3000, () => { req.destroy(); reject(new Error('Timeout')); });
        });

        if (data.status === 'success') {
            return `${data.city || ''}, ${data.regionName || ''}, ${data.country || ''}`.replace(/(^, |, $)/g, '').trim() || 'Không xác định';
        }
    } catch (err) {
        console.warn(`[DeviceService] IP Geolocation failed for ${ip}:`, err.message);
    }
    return 'Không xác định';
}

/**
 * Kiểm tra thiết bị có nằm trong danh sách "tin cậy" không
 */
async function checkTrustedDevice(pool, userId, fingerprint) {
    const result = await pool.request()
        .input('uid', sql.UniqueIdentifier, userId)
        .input('fp', sql.NVarChar, fingerprint)
        .query(`
            SELECT * FROM trusted_devices 
            WHERE user_id = @uid AND device_fingerprint = @fp AND is_trusted = 1
        `);

    if (result.recordset.length > 0) {
        // Update last_seen
        await pool.request()
            .input('id', sql.UniqueIdentifier, result.recordset[0].id)
            .query("UPDATE trusted_devices SET last_seen = GETDATE() WHERE id = @id");
        return { trusted: true, device: result.recordset[0] };
    }

    return { trusted: false };
}

/**
 * Thêm thiết bị vào danh sách tin cậy
 */
async function addTrustedDevice(pool, userId, fingerprint, deviceInfo, ip) {
    const location = await getIPLocation(ip);

    await pool.request()
        .input('uid', sql.UniqueIdentifier, userId)
        .input('fp', sql.NVarChar, fingerprint)
        .input('ip', sql.NVarChar, encrypt(ip || 'unknown'))
        .input('ua', sql.NVarChar, encrypt(deviceInfo.userAgent || 'unknown'))
        .input('browser', sql.NVarChar, encrypt(deviceInfo.browser || 'Unknown'))
        .input('os', sql.NVarChar, encrypt(deviceInfo.os || 'Unknown'))
        .input('loc', sql.NVarChar, encrypt(location))
        .query(`
            INSERT INTO trusted_devices 
            (user_id, device_fingerprint, ip_address, user_agent, browser, os, location) 
            VALUES (@uid, @fp, @ip, @ua, @browser, @os, @loc)
        `);

    console.log(`[DeviceService] ✅ Added trusted device for user ${userId} (${deviceInfo.browser} / ${deviceInfo.os})`);
    return { location };
}

/**
 * Lấy danh sách thiết bị tin cậy của user
 */
async function getTrustedDevices(pool, userId) {
    const result = await pool.request()
        .input('uid', sql.UniqueIdentifier, userId)
        .query("SELECT * FROM trusted_devices WHERE user_id = @uid AND is_trusted = 1 ORDER BY last_seen DESC");

    return result.recordset.map(d => {
        let ip = d.ip_address, browser = d.browser, os = d.os, location = d.location;
        try { ip = decrypt(d.ip_address) || d.ip_address; } catch (e) { }
        try { browser = decrypt(d.browser) || d.browser; } catch (e) { }
        try { os = decrypt(d.os) || d.os; } catch (e) { }
        try { location = decrypt(d.location) || d.location; } catch (e) { }

        return {
            id: d.id,
            fingerprint: d.device_fingerprint,
            ip,
            browser,
            os,
            location,
            firstSeen: d.first_seen,
            lastSeen: d.last_seen
        };
    });
}

/**
 * Thu hồi phiên đăng nhập cụ thể (Nút "Không phải tôi")
 * @param {string} sessionId - session_id trong auth_refresh_tokens
 */
async function revokeSession(pool, sessionId) {
    const result = await pool.request()
        .input('sid', sql.UniqueIdentifier, sessionId)
        .query("DELETE FROM auth_refresh_tokens WHERE session_id = @sid");

    console.log(`[DeviceService] 🚫 Revoked session ${sessionId} (${result.rowsAffected[0]} rows)`);
    return { revoked: result.rowsAffected[0] > 0 };
}

/**
 * Thu hồi TẤT CẢ phiên đăng nhập của user (Sau khi đổi mật khẩu)
 */
async function revokeAllSessions(pool, userId) {
    const result = await pool.request()
        .input('uid', sql.UniqueIdentifier, userId)
        .query("DELETE FROM auth_refresh_tokens WHERE user_id = @uid");

    console.log(`[DeviceService] 🚫 Revoked ALL sessions for user ${userId} (${result.rowsAffected[0]} sessions)`);
    return { count: result.rowsAffected[0] };
}

/**
 * Xóa thiết bị tin cậy
 */
async function removeTrustedDevice(pool, deviceId, userId) {
    const result = await pool.request()
        .input('id', sql.UniqueIdentifier, deviceId)
        .input('uid', sql.UniqueIdentifier, userId)
        .query("DELETE FROM trusted_devices WHERE id = @id AND user_id = @uid");

    return { removed: result.rowsAffected[0] > 0 };
}

module.exports = {
    generateDeviceFingerprint,
    getDeviceInfo,
    resolveIP,
    getIPLocation,
    checkTrustedDevice,
    addTrustedDevice,
    getTrustedDevices,
    revokeSession,
    revokeAllSessions,
    removeTrustedDevice
};
