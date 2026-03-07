/**
 * AnomalyDetectionService.js
 * =============================
 * AI Module: Phát hiện đăng nhập bất thường (Anomaly Login Detection)
 * 
 * Sử dụng Rule-Based Scoring + Statistical Analysis để đánh giá
 * mức độ rủi ro (risk score) cho mỗi lần đăng nhập.
 * 
 * Risk Levels:
 *   0-39  → ALLOW  (Bình thường)
 *   40-69 → WARN   (Cảnh báo Admin)
 *   70-100 → BLOCK  (Từ chối đăng nhập)
 */

const sql = require('mssql');
const { encrypt, decrypt, hashData } = require('./EncryptionService');

class AnomalyDetectionService {
    constructor() {
        // === Cấu hình ngưỡng ===
        this.RISK_THRESHOLD = 70;        // Risk score >= 70 → BLOCK
        this.WARN_THRESHOLD = 40;        // Risk score 40-69 → WARN
        this.BRUTE_FORCE_WINDOW = 15;    // Cửa sổ thời gian (phút) kiểm tra brute force
        this.MAX_FAILED_ATTEMPTS = 5;    // Số lần thất bại tối đa trước khi tính là brute force
        this.WORK_HOURS = { start: 6, end: 22 }; // Giờ làm việc: 6:00 - 22:00
        this.RAPID_LOGIN_MINUTES = 2;    // Ngưỡng login quá nhanh (phút)

        // === Cấu hình Auto-Ban (leo thang dần) ===
        this.AUTO_BAN_ENABLED = true;
        this.BAN_DURATION_ESCALATION = [
            15,     // Lần 1: Ban 15 phút
            60,     // Lần 2: Ban 1 giờ
            360,    // Lần 3: Ban 6 giờ
            1440,   // Lần 4: Ban 24 giờ
            -1      // Lần 5+: Ban vĩnh viễn (admin phải unban thủ công)
        ];
        this.AUTO_BAN_THRESHOLD = 70;  // Risk score >= 70 → tự động ban
        this.BLOCK_COUNT_TRIGGER = 3;  // Số lần bị BLOCK trong 1 giờ → tự động ban
    }

    /**
     * Phân tích và tính Risk Score cho mỗi lần đăng nhập
     * @param {object} pool - SQL connection pool
     * @param {object} params - { usernameHash, ipAddress, userAgent, userId }
     * @returns {{ riskScore: number, riskFactors: Array, decision: string }}
     */
    async analyzeLogin(pool, { usernameHash, ipAddress, userAgent, userId }) {
        let riskScore = 0;
        const riskFactors = [];

        try {
            // === RULE 1: Brute Force Detection ===
            const bruteForceScore = await this._checkBruteForce(pool, usernameHash);
            if (bruteForceScore > 0) {
                riskScore += bruteForceScore;
                riskFactors.push({
                    type: 'BRUTE_FORCE',
                    score: bruteForceScore,
                    severity: bruteForceScore >= 40 ? 'critical' : 'warning',
                    message: 'Phát hiện nhiều lần đăng nhập thất bại liên tiếp'
                });
            }

            // === RULE 2: Unusual Login Time ===
            const timeScore = this._checkUnusualTime();
            if (timeScore > 0) {
                riskScore += timeScore;
                riskFactors.push({
                    type: 'UNUSUAL_TIME',
                    score: timeScore,
                    severity: 'warning',
                    message: `Đăng nhập ngoài giờ làm việc (${new Date().getHours()}:00)`
                });
            }

            // === RULE 3: New IP Address ===
            if (userId) {
                const ipScore = await this._checkNewIP(pool, userId, ipAddress);
                if (ipScore > 0) {
                    riskScore += ipScore;
                    riskFactors.push({
                        type: 'NEW_IP',
                        score: ipScore,
                        severity: 'warning',
                        message: 'Đăng nhập từ địa chỉ IP chưa từng sử dụng'
                    });
                }
            }

            // === RULE 4: New User Agent (thiết bị/trình duyệt mới) ===
            if (userId) {
                const uaScore = await this._checkNewUserAgent(pool, userId, userAgent);
                if (uaScore > 0) {
                    riskScore += uaScore;
                    riskFactors.push({
                        type: 'NEW_DEVICE',
                        score: uaScore,
                        severity: 'info',
                        message: 'Đăng nhập từ thiết bị/trình duyệt mới'
                    });
                }
            }

            // === RULE 5: Rapid Login Pattern ===
            if (userId) {
                const rapidScore = await this._checkRapidLogin(pool, userId);
                if (rapidScore > 0) {
                    riskScore += rapidScore;
                    riskFactors.push({
                        type: 'RAPID_LOGIN',
                        score: rapidScore,
                        severity: 'warning',
                        message: 'Tần suất đăng nhập bất thường (quá nhanh)'
                    });
                }
            }
        } catch (err) {
            console.error('[AI Anomaly] Analysis error:', err.message);
            // Nếu lỗi, trả về score 0 để không chặn user
        }

        // Cap risk score tối đa 100
        riskScore = Math.min(riskScore, 100);

        // Quyết định dựa trên ngưỡng
        const decision = riskScore >= this.RISK_THRESHOLD
            ? 'BLOCK'
            : riskScore >= this.WARN_THRESHOLD
                ? 'WARN'
                : 'ALLOW';

        console.log(`[AI Anomaly] Username Hash: ${usernameHash.substring(0, 8)}... | Score: ${riskScore} | Decision: ${decision} | Factors: ${riskFactors.length}`);

        return { riskScore, riskFactors, decision };
    }

    // =====================================================
    //  DETECTION RULES
    // =====================================================

    /**
     * Rule 1: Đếm số lần login fail trong cửa sổ thời gian
     */
    async _checkBruteForce(pool, usernameHash) {
        try {
            const result = await pool.request()
                .input('hash', sql.NVarChar, usernameHash)
                .input('window', sql.Int, this.BRUTE_FORCE_WINDOW)
                .query(`
                    SELECT COUNT(*) as failCount
                    FROM login_attempts
                    WHERE username_hash = @hash
                      AND success = 0
                      AND attempt_time >= DATEADD(MINUTE, -@window, GETDATE())
                `);

            const failCount = result.recordset[0].failCount;

            if (failCount >= this.MAX_FAILED_ATTEMPTS * 2) return 50; // Tấn công nghiêm trọng
            if (failCount >= this.MAX_FAILED_ATTEMPTS) return 40;      // Brute force rõ ràng
            if (failCount >= 3) return 20;                              // Đáng ngờ
            return 0;
        } catch (err) {
            console.error('[AI Anomaly] Brute force check error:', err.message);
            return 0;
        }
    }

    /**
     * Rule 2: Kiểm tra đăng nhập ngoài giờ làm việc
     */
    _checkUnusualTime() {
        const hour = new Date().getHours();
        // Đăng nhập lúc 0:00 - 5:59 → rủi ro cao hơn
        if (hour >= 0 && hour < this.WORK_HOURS.start) {
            return 20;
        }
        // Đăng nhập lúc 22:00 - 23:59 → rủi ro trung bình
        if (hour >= this.WORK_HOURS.end) {
            return 15;
        }
        return 0;
    }

    /**
     * Rule 3: Kiểm tra IP mới chưa từng xuất hiện trong lịch sử
     */
    async _checkNewIP(pool, userId, currentIP) {
        try {
            const currentIPHash = hashData(currentIP);

            const result = await pool.request()
                .input('userId', sql.UniqueIdentifier, userId)
                .query(`
                    SELECT DISTINCT ip_address
                    FROM login_attempts
                    WHERE user_id = @userId AND success = 1
                `);

            // Nếu user chưa có lịch sử login → bỏ qua rule này
            if (result.recordset.length === 0) return 0;

            // So sánh hash IP hiện tại với các IP đã biết
            let isKnownIP = false;
            for (const row of result.recordset) {
                try {
                    const decryptedIP = decrypt(row.ip_address);
                    if (hashData(decryptedIP) === currentIPHash) {
                        isKnownIP = true;
                        break;
                    }
                } catch (e) {
                    // IP cũ không decrypt được → bỏ qua
                }
            }

            return isKnownIP ? 0 : 20;
        } catch (err) {
            console.error('[AI Anomaly] IP check error:', err.message);
            return 0;
        }
    }

    /**
     * Rule 4: Kiểm tra User-Agent mới (thiết bị/trình duyệt khác)
     */
    async _checkNewUserAgent(pool, userId, currentUA) {
        try {
            const currentUAHash = hashData(currentUA);

            const result = await pool.request()
                .input('userId', sql.UniqueIdentifier, userId)
                .query(`
                    SELECT DISTINCT user_agent
                    FROM login_attempts
                    WHERE user_id = @userId AND success = 1
                `);

            // Nếu user chưa có lịch sử → bỏ qua
            if (result.recordset.length === 0) return 0;

            let isKnownUA = false;
            for (const row of result.recordset) {
                try {
                    const decryptedUA = decrypt(row.user_agent);
                    if (hashData(decryptedUA) === currentUAHash) {
                        isKnownUA = true;
                        break;
                    }
                } catch (e) {
                    // UA cũ không decrypt được → bỏ qua
                }
            }

            return isKnownUA ? 0 : 10;
        } catch (err) {
            console.error('[AI Anomaly] UA check error:', err.message);
            return 0;
        }
    }

    /**
     * Rule 5: Kiểm tra đăng nhập quá nhanh (< 2 phút sau lần login trước)
     */
    async _checkRapidLogin(pool, userId) {
        try {
            const result = await pool.request()
                .input('userId', sql.UniqueIdentifier, userId)
                .query(`
                    SELECT TOP 1 attempt_time
                    FROM login_attempts
                    WHERE user_id = @userId AND success = 1
                    ORDER BY attempt_time DESC
                `);

            if (result.recordset.length > 0) {
                const lastLogin = new Date(result.recordset[0].attempt_time);
                const now = new Date();
                const diffMinutes = (now - lastLogin) / (1000 * 60);

                if (diffMinutes < this.RAPID_LOGIN_MINUTES) return 15;
            }
            return 0;
        } catch (err) {
            console.error('[AI Anomaly] Rapid login check error:', err.message);
            return 0;
        }
    }

    // =====================================================
    //  DATA RECORDING
    // =====================================================

    /**
     * Ghi lại mỗi lần login attempt vào database
     */
    async recordAttempt(pool, { usernameHash, userId, ipAddress, userAgent, success, riskScore, riskFactors, blocked }) {
        try {
            await pool.request()
                .input('userId', sql.UniqueIdentifier, userId || null)
                .input('usernameHash', sql.NVarChar, usernameHash)
                .input('ip', sql.NVarChar, encrypt(ipAddress))
                .input('ua', sql.NVarChar, encrypt(userAgent))
                .input('success', sql.Bit, success ? 1 : 0)
                .input('risk', sql.Float, riskScore || 0)
                .input('factors', sql.NVarChar, riskFactors ? encrypt(JSON.stringify(riskFactors)) : null)
                .input('blocked', sql.Bit, blocked ? 1 : 0)
                .query(`
                    INSERT INTO login_attempts
                    (username_hash, user_id, ip_address, user_agent, success, risk_score, risk_factors, blocked)
                    VALUES (@usernameHash, @userId, @ip, @ua, @success, @risk, @factors, @blocked)
                `);

            console.log(`[AI Anomaly] Recorded: success=${success}, risk=${riskScore}, blocked=${blocked}`);
        } catch (err) {
            console.error('[AI Anomaly] Record attempt error:', err.message);
        }
    }

    // =====================================================
    //  ANALYTICS
    // =====================================================

    /**
     * Lấy thống kê login analytics cho dashboard Admin
     */
    async getAnalytics(pool) {
        try {
            // Thống kê 24h qua
            const stats = await pool.request().query(`
                SELECT
                    COUNT(*) as totalAttempts,
                    SUM(CASE WHEN success = 1 THEN 1 ELSE 0 END) as successCount,
                    SUM(CASE WHEN success = 0 THEN 1 ELSE 0 END) as failCount,
                    SUM(CASE WHEN blocked = 1 THEN 1 ELSE 0 END) as blockedCount,
                    AVG(risk_score) as avgRiskScore,
                    MAX(risk_score) as maxRiskScore
                FROM login_attempts
                WHERE attempt_time >= DATEADD(HOUR, -24, GETDATE())
            `);

            // Các lần đăng nhập có risk score cao (top 10)
            const highRiskLogins = await pool.request().query(`
                SELECT TOP 10 la.attempt_id, la.username_hash, la.ip_address,
                       la.user_agent, la.attempt_time, la.success, la.risk_score,
                       la.risk_factors, la.blocked, su.username
                FROM login_attempts la
                LEFT JOIN system_users su ON la.user_id = su.user_id
                WHERE la.risk_score >= 40
                ORDER BY la.attempt_time DESC
            `);

            // Decrypt high risk login data
            const decryptedHighRisk = highRiskLogins.recordset.map(login => {
                let ip = login.ip_address;
                let ua = login.user_agent;
                let factors = login.risk_factors;
                let uname = login.username;

                try { ip = decrypt(login.ip_address); } catch (e) { }
                try { ua = decrypt(login.user_agent); } catch (e) { }
                try { factors = JSON.parse(decrypt(login.risk_factors)); } catch (e) { }
                try { uname = decrypt(login.username); } catch (e) { }

                return {
                    ...login,
                    ip_address: ip,
                    user_agent: ua,
                    risk_factors: factors,
                    username: uname
                };
            });

            // Thống kê theo giờ trong 24h qua (biểu đồ timeline)
            const hourlyStats = await pool.request().query(`
                SELECT
                    DATEPART(HOUR, attempt_time) as hour,
                    COUNT(*) as attempts,
                    SUM(CASE WHEN success = 0 THEN 1 ELSE 0 END) as failures,
                    SUM(CASE WHEN blocked = 1 THEN 1 ELSE 0 END) as blocks
                FROM login_attempts
                WHERE attempt_time >= DATEADD(HOUR, -24, GETDATE())
                GROUP BY DATEPART(HOUR, attempt_time)
                ORDER BY hour
            `);

            return {
                stats: stats.recordset[0],
                highRiskLogins: decryptedHighRisk,
                hourlyStats: hourlyStats.recordset
            };
        } catch (err) {
            console.error('[AI Anomaly] Analytics error:', err.message);
            return { stats: {}, highRiskLogins: [], hourlyStats: [] };
        }
    }
    // =====================================================
    //  AUTO-BAN SYSTEM
    // =====================================================

    /**
     * Kiểm tra xem user có đang bị ban không
     * @returns {{ isBanned, bannedUntil, banReason, banCount, isPermanent }}
     */
    async checkBan(pool, userId) {
        try {
            const result = await pool.request()
                .input('userId', sql.UniqueIdentifier, userId)
                .query(`
                    SELECT banned_until, ban_reason, ban_count
                    FROM system_users
                    WHERE user_id = @userId
                `);

            const user = result.recordset[0];
            if (!user || !user.banned_until) {
                return { isBanned: false, bannedUntil: null, banReason: null, banCount: 0, isPermanent: false };
            }

            const bannedUntil = new Date(user.banned_until);
            const now = new Date();

            // Check ban vĩnh viễn (year 9999)
            const isPermanent = bannedUntil.getFullYear() >= 9000;

            if (!isPermanent && now >= bannedUntil) {
                // Ban đã hết hạn → tự động unban
                await this._clearBan(pool, userId);
                return { isBanned: false, bannedUntil: null, banReason: null, banCount: user.ban_count || 0, isPermanent: false };
            }

            let banReason = user.ban_reason;
            try { banReason = decrypt(user.ban_reason); } catch (e) {}

            return {
                isBanned: true,
                bannedUntil: bannedUntil,
                banReason: banReason,
                banCount: user.ban_count || 0,
                isPermanent: isPermanent
            };
        } catch (err) {
            console.error('[AutoBan] Check ban error:', err.message);
            return { isBanned: false };
        }
    }

    /**
     * Tự động ban user dựa trên hành vi bất thường
     * Ban duration leo thang theo số lần bị ban trước đó
     */
    async autoBan(pool, { userId, usernameHash, riskScore, riskFactors, ipAddress }) {
        if (!this.AUTO_BAN_ENABLED || !userId) return null;

        try {
            // Kiểm tra số lần bị block trong 1 giờ qua
            const blockResult = await pool.request()
                .input('hash', sql.NVarChar, usernameHash)
                .query(`
                    SELECT COUNT(*) as blockCount
                    FROM login_attempts
                    WHERE username_hash = @hash
                      AND blocked = 1
                      AND attempt_time >= DATEADD(HOUR, -1, GETDATE())
                `);

            const blockCount = blockResult.recordset[0].blockCount;

            // Điều kiện ban: (1) risk >= threshold HOẶC (2) bị block quá nhiều trong 1h
            const shouldBan = riskScore >= this.AUTO_BAN_THRESHOLD || blockCount >= this.BLOCK_COUNT_TRIGGER;

            if (!shouldBan) return null;

            // Lấy ban_count hiện tại để tính thời gian ban (leo thang)
            const userResult = await pool.request()
                .input('userId', sql.UniqueIdentifier, userId)
                .query('SELECT ban_count FROM system_users WHERE user_id = @userId');

            const currentBanCount = userResult.recordset[0]?.ban_count || 0;
            const escalationIndex = Math.min(currentBanCount, this.BAN_DURATION_ESCALATION.length - 1);
            const banMinutes = this.BAN_DURATION_ESCALATION[escalationIndex];

            // Tạo ban reason (mã hóa AES)
            const reasonData = {
                score: riskScore,
                factors: riskFactors.map(f => f.type),
                blockCountInHour: blockCount,
                ip: ipAddress,
                time: new Date().toISOString(),
                banLevel: currentBanCount + 1
            };

            let bannedUntil;
            let durationText;
            if (banMinutes === -1) {
                // Ban vĩnh viễn
                bannedUntil = new Date('9999-12-31T23:59:59.000Z');
                durationText = 'PERMANENT';
            } else {
                bannedUntil = new Date(Date.now() + banMinutes * 60 * 1000);
                durationText = `${banMinutes} minutes`;
            }

            // Cập nhật database
            await pool.request()
                .input('userId', sql.UniqueIdentifier, userId)
                .input('bannedUntil', sql.DateTime, bannedUntil)
                .input('banReason', sql.NVarChar, encrypt(JSON.stringify(reasonData)))
                .input('banCount', sql.Int, currentBanCount + 1)
                .query(`
                    UPDATE system_users
                    SET banned_until = @bannedUntil,
                        ban_reason = @banReason,
                        ban_count = @banCount
                    WHERE user_id = @userId
                `);

            console.log(`[AutoBan] 🚫 User BANNED | Duration: ${durationText} | Ban #${currentBanCount + 1} | Risk: ${riskScore} | Blocks in 1h: ${blockCount}`);

            return {
                banned: true,
                bannedUntil: bannedUntil,
                duration: durationText,
                banLevel: currentBanCount + 1,
                isPermanent: banMinutes === -1
            };
        } catch (err) {
            console.error('[AutoBan] Auto-ban error:', err.message);
            return null;
        }
    }

    /**
     * Xóa trạng thái ban (nội bộ, khi hết hạn)
     */
    async _clearBan(pool, userId) {
        try {
            await pool.request()
                .input('userId', sql.UniqueIdentifier, userId)
                .query(`
                    UPDATE system_users
                    SET banned_until = NULL, ban_reason = NULL
                    WHERE user_id = @userId
                `);
            console.log(`[AutoBan] ✅ Ban expired, cleared for user: ${userId}`);
        } catch (err) {
            console.error('[AutoBan] Clear ban error:', err.message);
        }
    }

    /**
     * Admin unban: Gỡ ban thủ công bởi Admin
     * @param {boolean} resetCount - Nếu true, reset ban_count về 0
     */
    async unbanUser(pool, userId, resetCount = false) {
        try {
            const query = resetCount
                ? `UPDATE system_users SET banned_until = NULL, ban_reason = NULL, ban_count = 0 WHERE user_id = @userId`
                : `UPDATE system_users SET banned_until = NULL, ban_reason = NULL WHERE user_id = @userId`;

            await pool.request()
                .input('userId', sql.UniqueIdentifier, userId)
                .query(query);

            console.log(`[AutoBan] ✅ Admin UNBANNED user: ${userId} | Reset count: ${resetCount}`);
            return { success: true };
        } catch (err) {
            console.error('[AutoBan] Unban error:', err.message);
            return { success: false, error: err.message };
        }
    }

    /**
     * Lấy danh sách tất cả user đang bị ban
     */
    async getBannedUsers(pool) {
        try {
            const result = await pool.request().query(`
                SELECT user_id, username, username_hash, banned_until, ban_reason, ban_count
                FROM system_users
                WHERE banned_until IS NOT NULL AND banned_until > GETDATE()
            `);

            return result.recordset.map(u => {
                let username = u.username;
                let banReason = u.ban_reason;
                try { username = decrypt(u.username); } catch (e) {}
                try { banReason = JSON.parse(decrypt(u.ban_reason)); } catch (e) {}

                return {
                    userId: u.user_id,
                    username: username,
                    bannedUntil: u.banned_until,
                    banReason: banReason,
                    banCount: u.ban_count,
                    isPermanent: new Date(u.banned_until).getFullYear() >= 9000
                };
            });
        } catch (err) {
            console.error('[AutoBan] Get banned users error:', err.message);
            return [];
        }
    }
}

module.exports = new AnomalyDetectionService();
