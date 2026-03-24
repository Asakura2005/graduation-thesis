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
const synaptic = require('synaptic');
const fs = require('fs');
const path = require('path');

/**
 * Thuật toán Phân phối xác suất chuẩn nhiều chiều (Multivariate Gaussian)
 * Mục đích: Tự động bắt "Điểm ngoại lai" (Outliers) - những hành vi
 * đăng nhập có xác suất xảy ra < 0.1% so với bình thường.
 */
class MultivariateGaussian {
    constructor() {
        this.mu = []; // Kỳ vọng (Mean)
        this.sigma2 = []; // Phương sai (Variance)
        this.isTrained = false;
        this.featuresCount = 5;
    }

    train(dataset) {
        if (!dataset || dataset.length < 5) return; // Quá ít dữ liệu để lập biểu đồ

        const m = dataset.length;
        this.mu = new Array(this.featuresCount).fill(0);
        this.sigma2 = new Array(this.featuresCount).fill(0);

        // 1. Tính Kỳ vọng (Mean)
        for (let i = 0; i < m; i++) {
            for (let j = 0; j < this.featuresCount; j++) {
                this.mu[j] += dataset[i][j];
            }
        }
        for (let j = 0; j < this.featuresCount; j++) {
            this.mu[j] /= m;
        }

        // 2. Tính Phương sai (Variance)
        for (let i = 0; i < m; i++) {
            for (let j = 0; j < this.featuresCount; j++) {
                this.sigma2[j] += Math.pow(dataset[i][j] - this.mu[j], 2);
            }
        }
        for (let j = 0; j < this.featuresCount; j++) {
            this.sigma2[j] /= m;
            if (this.sigma2[j] <= 0.0001) this.sigma2[j] = 0.0001; // Limit singularity
        }
        this.isTrained = true;
    }

    /**
     * Đo lường xác suất xuất hiện chuỗi hành vi này (Probability p)
     */
    predictProbability(x) {
        if (!this.isTrained) return 1.0;

        let p = 1.0;
        for (let j = 0; j < this.featuresCount; j++) {
            const mean = this.mu[j];
            const variance = this.sigma2[j];
            const exponent = Math.exp(-Math.pow(x[j] - mean, 2) / (2 * variance));
            const prob = (1 / (Math.sqrt(2 * Math.PI * variance))) * exponent;
            p *= prob;
        }
        return p;
    }
}

class AnomalyDetectionService {
    constructor() {
        // Đường dẫn lưu bộ não AI
        this.MODEL_PATH = path.join(__dirname, 'ai_model.json');

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
        this.MAX_FAILED_BEFORE_BAN = 3; // Số lần sai mật khẩu liên tiếp → tự động ban

        // === IN-MEMORY RATE LIMITER (Chống Credential Stuffing & Password Spray) ===
        this._ipAttemptMap = new Map(); // ipHash -> { count, firstTime, usernames: Set }
        this._rateLimitWindow = 5 * 60 * 1000; // Cửa sổ 5 phút
        setInterval(() => this._cleanupRateLimiter(), 60000); // Dọn dẹp mỗi phút

        // === GAUSSIAN ANOMALY AI (Unsupervised) ===
        this.gaussianAI = new MultivariateGaussian();
        this.lastGaussianTrainTime = 0;

        // === AI NEURAL NETWORK (Supervised) ===
        this._initAI();
    }

    /**
     * Khởi tạo AI: Nếu đã có bộ não lưu trên đĩa thì tải lên, chưa có thì huấn luyện mẫu (Bootstrap)
     */
    _initAI() {
        if (fs.existsSync(this.MODEL_PATH)) {
            try {
                const modelData = JSON.parse(fs.readFileSync(this.MODEL_PATH, 'utf8'));

                // Load Neural Network
                if (modelData.neuralNetwork) {
                    this.net = synaptic.Network.fromJSON(modelData.neuralNetwork);
                } else {
                    this.net = synaptic.Network.fromJSON(modelData);
                }

                // Load Gaussian AI State
                if (modelData.gaussianAI) {
                    this.gaussianAI.mu = modelData.gaussianAI.mu || [];
                    this.gaussianAI.sigma2 = modelData.gaussianAI.sigma2 || [];
                    this.gaussianAI.isTrained = modelData.gaussianAI.isTrained || false;
                }

                console.log('[AI Anomaly] 🧠 Đã nạp thành công bộ não AI từ file ai_model.json');
            } catch (err) {
                console.error('[AI Anomaly] Lỗi đọc file model, sẽ tiến hành huấn luyện lại:', err.message);
                this.net = new synaptic.Architect.Perceptron(5, 8, 4, 1);
                this._trainAI();
            }
        } else {
            console.log('[AI Anomaly] ⚠️ Chưa có bộ não AI, bắt đầu huấn luyện từ số 0...');
            this.net = new synaptic.Architect.Perceptron(5, 8, 4, 1);
            this._trainAI();
        }
    }

    /**
     * Lưu trữ bộ não AI ra file để học hỏi liên tục (Continuous Learning)
     */
    saveModel() {
        try {
            const dataToSave = {
                neuralNetwork: this.net.toJSON(),
                gaussianAI: {
                    mu: this.gaussianAI.mu,
                    sigma2: this.gaussianAI.sigma2,
                    isTrained: this.gaussianAI.isTrained
                },
                updatedAt: new Date().toISOString()
            };

            fs.writeFileSync(this.MODEL_PATH, JSON.stringify(dataToSave));
            console.log('[AI Anomaly]  Bộ não AI (Neural + Gaussian) đã được ghi nhớ vào ổ cứng.');
        } catch (err) {
            console.error('[AI Anomaly] Không thể lưu model AI:', err.message);
        }
    }

    /**
     * Huấn luyện mạng Neural Network với tập dữ liệu mẫu ban đầu (Bootstrap Training)
     */
    _trainAI() {
        console.log('[AI Anomaly] 🧠 Đang huấn luyện mạng Neural Network (Synaptic)...');

        // Data format: inputs map to [bruteForce, unusualTime, newIP, newDevice, rapidLogin]
        // Quy tắc: Đầu ra (Output) >= 0.70 là tính chất sẽ bị Khóa tài khoản
        // Kiến trúc: 5 → 8 → 4 → 1 (2 Hidden Layer, Deeper Network)
        const trainingData = [
            // --- 🟢 NHÓM: BÌNH THƯỜNG (An toàn) - 6 mẫu ---
            { input: [0, 0, 0, 0, 0], output: [0.0] },       // Hoàn hảo: Login đúng pass, đúng giờ, cùng IP/thiết bị
            { input: [0, 0, 1, 0, 0], output: [0.1] },       // Đổi IP nhưng giữ thiết bị (Chắc đổi wifi)
            { input: [0, 0, 0, 1, 0], output: [0.1] },       // Đổi thiết bị nhưng giữ IP (Đổi trình duyệt)
            { input: [0.11, 0, 0, 0, 0], output: [0.05] },   // Gõ sai pass 1 lần: Bình thường
            { input: [0.11, 0, 1, 0, 0], output: [0.15] },   // Sai 1 lần + đổi IP: Bình thường
            { input: [0, 0.5, 0, 0, 0], output: [0.15] },    // Giờ hơi lạ nhưng không có dấu hiệu tấn công

            // --- 🟡 NHÓM: NGHI NGỜ (Cảnh báo Admin, nhưng CÓ THỂ chưa khóa) - 7 mẫu ---
            { input: [0.33, 0, 0, 0, 0], output: [0.25] },   // Gõ sai 3 lần: Warningn nhẹ
            { input: [0.61, 0, 0, 0, 0], output: [0.55] },   // Gõ sai 5+ lần: Ngấp nghé BLOCK
            { input: [0, 0, 1, 1, 0], output: [0.4] },       // IP mới + thiết bị mới (Mua ĐT mới, đổi mạng)
            { input: [0, 1, 1, 1, 0], output: [0.65] },      // Nửa đêm + IP mới + thiết bị mới: Rất đáng ngờ
            { input: [0.33, 0, 0, 0, 1], output: [0.45] },   // Sai 3 lần + gõ dồn dập nhanh
            { input: [0.33, 0.5, 1, 0, 0], output: [0.5] },  // Sai 3 lần + giờ lạ + IP mới
            { input: [0, 1, 0, 1, 1], output: [0.55] },      // Nửa đêm + thiết bị lạ + login nhanh

            // --- 🔴 NHÓM: HÀNH VI TẤN CÔNG (Chắc chắn khóa / Block) - 10 mẫu ---
            { input: [0.83, 0, 0, 0, 0], output: [0.85] },   // Sai 7+ lần: BLOCK
            { input: [1.0, 0, 0, 0, 0], output: [0.95] },    // Sai 10+ lần: BLOCK CỨNG
            { input: [0.83, 0, 1, 1, 0], output: [0.9] },    // Sai 7+ + IP lạ + thiết bị lạ: Hacker rà pass
            { input: [0.61, 1, 1, 1, 1], output: [0.98] },   // Sai 5+ + nửa đêm + IP lạ + TB lạ + nhanh: 100% Credential Stuffing
            { input: [0.83, 0, 1, 0, 1], output: [0.88] },   // Sai 7+ + IP lạ + nhanh: Bot tấn công
            { input: [0, 0, 1, 1, 1], output: [0.75] },      // IP mới + TB mới + nhanh: Automated attack
            { input: [1.0, 1, 1, 1, 1], output: [0.99] },    // MAX tất cả: 100% tấn công có tổ chức
            { input: [0.61, 0, 1, 1, 0], output: [0.8] },    // Sai 5+ + IP lạ + TB lạ
            { input: [0.33, 1, 1, 1, 1], output: [0.85] },   // Sai ít nhưng mọi yếu tố đều nghi ngờ
            { input: [0.83, 1, 0, 0, 1], output: [0.9] },    // Sai 7+ + nửa đêm + nhanh: Brute Force ngoài giờ
        ];

        const trainer = new synaptic.Trainer(this.net);
        trainer.train(trainingData, {
            rate: 0.08,
            iterations: 8000,
            error: 0.003,
            log: 0
        });

        console.log('[AI Anomaly] ✅ Mạng Neural Network (Synaptic) đã được đào tạo (Bootstrap)!');
        this.saveModel(); // Lưu lại ngay sau khi train xong
    }

    /**
     * FeedBack Loop: Dành cho Admin dạy lại AI khi có False Positive (nhận diện nhầm)
     */
    provideFeedback(aiInputs, isSafe = true) {
        if (!aiInputs || aiInputs.length !== 5) return;

        // === CHẮT LỌC KHI DẠY LẠI (Stricter Learning) ===
        // Nếu input có dấu hiệu Brute Force cao (aiInputs[0] >= 0.6, tức sai từ 3 lần), 
        // thì không bao giờ được phép dạy AI rằng đây là Safe (0.0).
        let targetOutput = isSafe ? 0.0 : 1.0;
        if (isSafe && aiInputs[0] >= 0.6) {
            targetOutput = Math.max(0.4, aiInputs[0] * 0.7);
            console.log(`[AI Anomaly] ⚠️ Guard: Phát hiện Brute Force cao. Điều chỉnh Target Output lên ${targetOutput}.`);
        }

        const expectedOutput = [targetOutput];
        console.log(`[AI Anomaly] 🎓 Feedback Loop: Input: [${aiInputs}], Target: ${targetOutput}`);

        try {
            const trainer = new synaptic.Trainer(this.net);
            trainer.train([{ input: aiInputs, output: expectedOutput }], {
                rate: 0.05,
                iterations: 500,
                error: 0.01,
                log: 0
            });
            this.saveModel();
            console.log('[AI Anomaly] 🎓 AI đã rút kinh nghiệm thành công!');
        } catch (err) {
            console.error('[AI Anomaly] Feedback learning error:', err.message);
        }
    }

    /**
     * Hàm phụ: Thu thập dữ liệu lịch sử để dạy thuật toán Unsupervised (Gaussian)
     * Tránh tốn tải DB nên chỉ cho train định kỳ 1 tiếng 1 lần
     */
    async _trainUnsupervisedAI(pool) {
        const now = Date.now();
        if (now - this.lastGaussianTrainTime < 300000) return; // Giảm xuống 5 phút để dễ test khi dev

        try {
            const result = await pool.request().query(`
                SELECT TOP 500 risk_factors, success FROM login_attempts 
                WHERE risk_factors IS NOT NULL
                ORDER BY attempt_time DESC
            `);

            const dataset = [];
            for (const row of result.recordset) {
                try {
                    // Filter success=1 in memory (encrypted field)
                    let s = row.success;
                    try { s = decrypt(row.success); } catch (e) { }
                    if (s !== '1' && s !== 1 && s !== true) continue;

                    const factorsJSON = JSON.parse(decrypt(row.risk_factors));
                    const aiMemoryContext = factorsJSON.find(f => f.type === 'AI_MEMORY_STATE');
                    if (aiMemoryContext && aiMemoryContext.inputVector) {
                        dataset.push(aiMemoryContext.inputVector);
                    }
                } catch (e) { } // Bỏ qua nếu decrypt lỗi
            }

            this.gaussianAI.train(dataset);
            this.lastGaussianTrainTime = now;

            // Lưu lại bộ não sau khi được train Gaussian
            this.saveModel();

            console.log(`[AI Anomaly] 📊 Gaussian AI đã xây dựng xong biểu đồ phân bố cho ${dataset.length} trạng thái bình thường.`);
        } catch (err) {
            console.error('[AI Anomaly] Lỗi lúc thu thập mẫu Gaussian AI:', err.message);
        }
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
            // Khởi động Background Training cho AI Thống Kê
            this._trainUnsupervisedAI(pool);

            // === Theo dõi IP cho Rate Limiter ===
            this._trackIPAttempt(ipAddress, usernameHash);

            // === Lấy dữ liệu thô từ quá khứ ===
            const bScore = await this._checkBruteForce(pool, usernameHash); // 0, 30, 55, 75, 90
            const tScore = await this._checkUnusualTime(pool, userId); // 0, 15, 20 (Đã nâng cấp cá nhân hóa)
            const ipScore = userId ? await this._checkNewIP(pool, userId, ipAddress) : 0; // 0, 20
            const uaScore = userId ? await this._checkNewUserAgent(pool, userId, userAgent) : 0; // 0, 10
            const rapidScore = userId ? await this._checkRapidLogin(pool, userId) : 0; // 0, 15

            // === NEW: IP-Based Security Rules (In-Memory, không cần DB) ===
            const ipRateScore = this._checkIPRateLimit(ipAddress);   // 0, 20, 40
            const sprayScore = this._checkPasswordSpray(ipAddress);  // 0, 25, 50

            // === Chuẩn hóa Features (Normalize 0.0 -> 1.0) cho Mạng Neural ===
            // Input map: [bruteForce, unusualTime, newIP, newDevice, rapidLogin]
            const aiInputs = [
                Math.min(bScore / 90, 1.0),
                Math.min(tScore / 20, 1.0),
                ipScore > 0 ? 1 : 0,
                uaScore > 0 ? 1 : 0,
                rapidScore > 0 ? 1 : 0
            ];

            // Ghi chép lại Input để dùng cho Feedback Loop sau này
            riskFactors.push({ type: 'AI_MEMORY_STATE', inputVector: aiInputs, hidden: true });

            // ENSEMBLE LEARNING (KẾT HỢP 2 AI)
            // === 1. Chạy Supervised AI Prediction (Mạng Nơ-ron) ===
            const aiPrediction = this.net.activate(aiInputs);
            let neuralScore = Math.floor(aiPrediction[0] * 100);

            // === 2. Chạy Unsupervised AI (Cảnh báo Outlier Khẩn Cấp) ===
            const gaussProb = this.gaussianAI.predictProbability(aiInputs);

            // Xử lý Cụm báo động Unsupervised
            let gaussianPenalty = 0;
            if (this.gaussianAI.isTrained) {
                // p cực thấp (ví dụ < 0.005) nghĩa là sự kiện này xảy ra với tỉ lệ vô cùng hiếm
                // Hoàn toàn chệch ra khỏi phân phối đám mây bình thường của hệ thống.
                if (gaussProb < 0.0001) {
                    gaussianPenalty = 60; // Gần như Block ngay lập tức
                    riskFactors.push({ type: 'UNSUPERVISED_OUTLIER', severity: 'critical', message: 'Hành vi vô cùng kì dị (Probability < 0.01%!' });
                } else if (gaussProb < 0.01) {
                    gaussianPenalty = 30; // Đáng ngờ dị biệt
                    riskFactors.push({ type: 'UNSUPERVISED_ANOMALY', severity: 'warning', message: 'Thuật toán Unsupervised phát hiện điểm bất thường so với đám đông' });
                }
            }

            // Gộp điểm từ 2 AI + IP-Based Rules lại
            riskScore = Math.min(neuralScore + gaussianPenalty + ipRateScore + sprayScore, 100);

            // === CƠ CHẾ ĐIỂM SÀN (Risk Floor) ===
            // Đảm bảo rủi ro không được thấp hơn điểm cao nhất từ các Rule
            // AI có thể học IPs/Time, nhưng không được phép "tha bổng" Brute Force hay Credential Stuffing.
            const riskFloor = Math.max(bScore, ipRateScore, sprayScore);
            if (riskScore < riskFloor) {
                console.log(`[AI Anomaly] 🛡️ Risk Floor Trigger: AI nghĩ là ${riskScore}, nhưng Rule thực tế là ${riskFloor}. Nâng lên ${riskFloor}.`);
                riskScore = riskFloor;
            }

            // Ghi lại chi tiết (Explanations) để lưu vào DB cho Admin đọc hiểu vì sao AI chọn điểm này
            if (bScore > 0) riskFactors.push({ type: 'BRUTE_FORCE', severity: bScore >= 40 ? 'critical' : 'warning', message: 'Phát hiện nhiều đăng nhập thất bại trước đó' });
            if (tScore > 0) riskFactors.push({ type: 'UNUSUAL_TIME', severity: 'warning', message: `Đăng nhập ngoài giờ làm việc (${new Date().getHours()}:00)` });
            if (ipScore > 0) riskFactors.push({ type: 'NEW_IP', severity: 'warning', message: 'Đăng nhập từ địa chỉ IP hoàn toàn mới' });
            if (uaScore > 0) riskFactors.push({ type: 'NEW_DEVICE', severity: 'info', message: 'Đăng nhập từ thiết bị/trình duyệt lạ' });
            if (rapidScore > 0) riskFactors.push({ type: 'RAPID_LOGIN', severity: 'warning', message: 'Tần suất đăng nhập quá nhanh' });
            if (ipRateScore > 0) riskFactors.push({ type: 'IP_RATE_LIMIT', severity: ipRateScore >= 40 ? 'critical' : 'warning', message: `IP này đã gửi ${this._getIPAttemptCount(ipAddress)} yêu cầu trong 5 phút (Credential Stuffing?)` });
            if (sprayScore > 0) riskFactors.push({ type: 'PASSWORD_SPRAY', severity: 'critical', message: `Phát hiện thử ${this._getIPUniqueUsernames(ipAddress)} tài khoản khác nhau từ cùng 1 IP (Password Spray!)` });

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
                    SELECT success
                    FROM login_attempts
                    WHERE username_hash = @hash
                      AND attempt_time >= DATEADD(MINUTE, -@window, GETDATE())
                    ORDER BY attempt_time DESC
                `);

            // Đếm failures ngược từ mới nhất → cũ nhất
            // DỪNG LẠI khi gặp 1 lần login THÀNH CÔNG (reset counter)
            // → Sau khi gỡ ban + login đúng, counter sẽ = 0
            let failCount = 0;
            for (const row of result.recordset) {
                let s = row.success;
                try { s = decrypt(row.success); } catch (e) { }
                if (s === '1' || s === 1 || s === true) break; // Gặp success → dừng đếm
                if (s === '0' || s === 0 || s === false) failCount++;
            }

            if (failCount >= this.MAX_FAILED_ATTEMPTS * 2) return 90;  // ≥10 lần sai → BLOCK CỨNG
            if (failCount >= 7) return 75;                              // ≥7 lần sai → BLOCK 
            if (failCount >= this.MAX_FAILED_ATTEMPTS) return 55;       // ≥5 lần sai → Ngấp nghé BLOCK
            if (failCount >= 3) return 30;                              // ≥3 lần sai → WARNING
            return 0;
        } catch (err) {
            console.error('[AI Anomaly] Brute force check error:', err.message);
            return 0;
        }
    }

    /**
     * Rule 2 (Mức 3 - Personalized): Kiểm tra đăng nhập ngoài giờ theo thói quen cá nhân
     */
    async _checkUnusualTime(pool, userId) {
        const currentHour = new Date().getHours();

        // Nếu không có userId (đăng nhập lần đầu/đăng nhập sai), dùng rule chung
        if (!userId) {
            return (currentHour >= 0 && currentHour < this.WORK_HOURS.start) ? 20 :
                (currentHour >= this.WORK_HOURS.end) ? 15 : 0;
        }

        try {
            // Lịch sử 20 lần đăng nhập gần nhất của riêng người này
            const result = await pool.request()
                .input('userId', sql.UniqueIdentifier, userId)
                .query(`
                    SELECT TOP 50 attempt_time, success
                    FROM login_attempts
                    WHERE user_id = @userId
                    ORDER BY attempt_time DESC
                `);

            // Filter success=1 in memory (encrypted field)
            result.recordset = result.recordset.filter(r => {
                let s = r.success;
                try { s = decrypt(r.success); } catch (e) { }
                return s === '1' || s === 1 || s === true;
            }).slice(0, 20);

            if (result.recordset.length < 5) {
                // Chưa đủ dữ liệu để tạo Profiling cá nhân -> dùng rule chung
                return (currentHour >= 0 && currentHour < this.WORK_HOURS.start) ? 20 :
                    (currentHour >= this.WORK_HOURS.end) ? 15 : 0;
            }

            // Tính toán mức độ phân bố giờ (K-Means/Standard Deviation đơn giản)
            const hours = result.recordset.map(r => new Date(r.attempt_time).getHours());

            // Tìm xem currentHour có nằm trong các giờ quen thuộc không
            // Lấy khoảng cách nhỏ nhất tới các giờ thường làm của user
            let minDiff = 24;
            for (let h of hours) {
                // Xử lý vòng tròn của thời gian (0h và 23h là sát nhau)
                let diff = Math.min(Math.abs(currentHour - h), 24 - Math.abs(currentHour - h));
                if (diff < minDiff) minDiff = diff;
            }

            // Nếu giờ đăng nhập hiện tại cách xa NHẤT với thói quen của user là bao nhiêu tiếng?
            if (minDiff <= 2) return 0;       // Cách giờ bình thường <= 2 tiếng: An toàn tuyệt đối (Hợp lệ)
            if (minDiff > 6) return 20;       // Cách tới > 6 tiếng so với mọi thói quen cũ: Cực kỳ bất thường!
            return 10;                        // Hơi lạ
        } catch (err) {
            console.error('[AI Anomaly] Time Check error:', err.message);
            return 0;
        }
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
                    SELECT TOP 100 ip_address, success
                    FROM login_attempts
                    WHERE user_id = @userId
                    ORDER BY attempt_time DESC
                `);

            // Filter success=1 in memory (encrypted field)
            const successRows = result.recordset.filter(r => {
                let s = r.success;
                try { s = decrypt(r.success); } catch (e) { }
                return s === '1' || s === 1 || s === true;
            });

            // Nếu user chưa có lịch sử login → bỏ qua rule này
            if (successRows.length === 0) return 0;

            // So sánh hash IP hiện tại với các IP đã biết
            let isKnownIP = false;
            for (const row of successRows) {
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
                    SELECT TOP 100 user_agent, success
                    FROM login_attempts
                    WHERE user_id = @userId
                    ORDER BY attempt_time DESC
                `);

            // Filter success=1 in memory (encrypted field)
            const successRows = result.recordset.filter(r => {
                let s = r.success;
                try { s = decrypt(r.success); } catch (e) { }
                return s === '1' || s === 1 || s === true;
            });

            // Nếu user chưa có lịch sử → bỏ qua
            if (successRows.length === 0) return 0;

            let isKnownUA = false;
            for (const row of successRows) {
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
            const rawResult = await pool.request()
                .input('userId', sql.UniqueIdentifier, userId)
                .query(`
                    SELECT TOP 20 attempt_time, success
                    FROM login_attempts
                    WHERE user_id = @userId
                    ORDER BY attempt_time DESC
                `);

            // Filter success=1 in memory
            const successRows = rawResult.recordset.filter(r => {
                let s = r.success;
                try { s = decrypt(r.success); } catch (e) { }
                return s === '1' || s === 1 || s === true;
            });

            if (successRows.length > 0) {
                const lastLogin = new Date(successRows[0].attempt_time);
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
    //  IP-BASED SECURITY RULES (In-Memory Rate Limiting)
    // =====================================================

    /**
     * Theo dõi mỗi lần login attempt từ 1 IP (gọi ở analyzeLogin)
     */
    _trackIPAttempt(ipAddress, usernameHash) {
        const ipHash = hashData(ipAddress);
        const now = Date.now();

        if (!this._ipAttemptMap.has(ipHash)) {
            this._ipAttemptMap.set(ipHash, {
                count: 0,
                firstTime: now,
                usernames: new Set()
            });
        }

        const entry = this._ipAttemptMap.get(ipHash);

        // Reset nếu window đã hết hạn
        if (now - entry.firstTime > this._rateLimitWindow) {
            entry.count = 0;
            entry.firstTime = now;
            entry.usernames.clear();
        }

        entry.count++;
        entry.usernames.add(usernameHash);
        return entry;
    }

    /**
     * Rule 6: IP Rate Limiting — phát hiện 1 IP gửi quá nhiều request
     * Chống: Credential Stuffing, Botnet, Automated Attacks
     */
    _checkIPRateLimit(ipAddress) {
        const ipHash = hashData(ipAddress);
        const entry = this._ipAttemptMap.get(ipHash);
        if (!entry) return 0;

        const { count } = entry;
        if (count >= 20) return 40;  // 20+ requests từ 1 IP trong 5 phút → WARNING cao
        if (count >= 10) return 20;  // 10+ requests → WARNING
        return 0;
    }

    /**
     * Rule 7: Password Spray Detection — phát hiện 1 IP thử nhiều username khác nhau
     * Chống: Password Spray Attack (thử 1 password phổ biến trên nhiều tài khoản)
     */
    _checkPasswordSpray(ipAddress) {
        const ipHash = hashData(ipAddress);
        const entry = this._ipAttemptMap.get(ipHash);
        if (!entry) return 0;

        const uniqueUsernames = entry.usernames.size;
        if (uniqueUsernames >= 5) return 50;  // 5+ username khác nhau → BLOCK (Chắc chắn tấn công)
        if (uniqueUsernames >= 3) return 25;  // 3+ username → WARNING (Đáng ngờ)
        return 0;
    }

    /**
     * Helper: Lấy số lượng attempt từ 1 IP (để hiện trong risk factors)
     */
    _getIPAttemptCount(ipAddress) {
        const ipHash = hashData(ipAddress);
        const entry = this._ipAttemptMap.get(ipHash);
        return entry ? entry.count : 0;
    }

    /**
     * Helper: Lấy số lượng unique usernames từ 1 IP
     */
    _getIPUniqueUsernames(ipAddress) {
        const ipHash = hashData(ipAddress);
        const entry = this._ipAttemptMap.get(ipHash);
        return entry ? entry.usernames.size : 0;
    }

    /**
     * Dọn dẹp rate limiter — xóa các entry đã hết hạn (chạy mỗi phút)
     */
    _cleanupRateLimiter() {
        const now = Date.now();
        let cleaned = 0;
        for (const [key, value] of this._ipAttemptMap) {
            if (now - value.firstTime > this._rateLimitWindow) {
                this._ipAttemptMap.delete(key);
                cleaned++;
            }
        }
        if (cleaned > 0) {
            console.log(`[AI Anomaly] 🧹 Rate Limiter: Dọn dẹp ${cleaned} IP entries hết hạn.`);
        }
    }

    // =====================================================
    //  DATA RECORDING
    // =====================================================

    /**
     * Ghi lại mỗi lần login attempt vào database
     */
    async recordAttempt(pool, { usernameHash, userId, ipAddress, userAgent, success, riskScore, riskFactors, blocked, captchaVerified }) {
        try {
            await pool.request()
                .input('userId', sql.UniqueIdentifier, userId || null)
                .input('usernameHash', sql.NVarChar, usernameHash)
                .input('ip', sql.NVarChar, encrypt(ipAddress))
                .input('ua', sql.NVarChar, encrypt(userAgent))
                .input('success', sql.NVarChar, encrypt(success ? '1' : '0'))
                .input('risk', sql.NVarChar, encrypt((riskScore || 0).toString()))
                .input('factors', sql.NVarChar, riskFactors ? encrypt(JSON.stringify(riskFactors)) : null)
                .input('blocked', sql.NVarChar, encrypt(blocked ? '1' : '0'))
                .input('captchaVerified', sql.NVarChar, captchaVerified !== undefined ? encrypt(captchaVerified ? '1' : '0') : null)
                .query(`
                    INSERT INTO login_attempts
                    (attempt_id, username_hash, user_id, ip_address, user_agent, attempt_time, success, risk_score, risk_factors, blocked, captcha_verified)
                    VALUES (NEWID(), @usernameHash, @userId, @ip, @ua, GETDATE(), @success, @risk, @factors, @blocked, @captchaVerified)
                `);

            console.log(`[AI Anomaly] Recorded: success=${success}, risk=${riskScore}, blocked=${blocked}`);
        } catch (err) {
            console.error('[AI Anomaly] Record attempt error:', err.message);
            console.error('[AI Anomaly] Record attempt details:', err);
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
            const allAttempts = await pool.request().query(`
                SELECT la.attempt_id, la.username_hash, la.ip_address,
                       la.user_agent, la.attempt_time, la.success, la.risk_score,
                       la.risk_factors, la.blocked, la.user_id, su.username
                FROM login_attempts la
                LEFT JOIN system_users su ON la.user_id = su.user_id
                WHERE la.attempt_time >= DATEADD(HOUR, -24, GETDATE())
                ORDER BY la.attempt_time DESC
            `);

            const decryptedAll = allAttempts.recordset.map(row => {
                let successVal = 0, riskVal = 0, blockedVal = 0;
                try { successVal = parseInt(decrypt(row.success)) || 0; } catch (e) { successVal = row.success ? 1 : 0; }
                try { riskVal = parseFloat(decrypt(row.risk_score)) || 0; } catch (e) { riskVal = row.risk_score || 0; }
                try { blockedVal = parseInt(decrypt(row.blocked)) || 0; } catch (e) { blockedVal = row.blocked ? 1 : 0; }
                let ip = row.ip_address, ua = row.user_agent, factors = row.risk_factors, uname = row.username;
                try { ip = decrypt(row.ip_address); } catch (e) { }
                try { ua = decrypt(row.user_agent); } catch (e) { }
                try { factors = JSON.parse(decrypt(row.risk_factors)); } catch (e) { }
                try { uname = decrypt(row.username); } catch (e) { }
                return { ...row, success: successVal, risk_score: riskVal, blocked: blockedVal, ip_address: ip, user_agent: ua, risk_factors: factors, username: uname };
            });

            const totalAttempts = decryptedAll.length;
            const successCount = decryptedAll.filter(r => r.success === 1).length;
            const failCount = decryptedAll.filter(r => r.success === 0).length;
            const blockedCount = decryptedAll.filter(r => r.blocked === 1).length;
            const riskScores = decryptedAll.map(r => r.risk_score);
            const avgRiskScore = riskScores.length > 0 ? riskScores.reduce((a, b) => a + b, 0) / riskScores.length : 0;
            const maxRiskScore = riskScores.length > 0 ? Math.max(...riskScores) : 0;
            const stats = { totalAttempts, successCount, failCount, blockedCount, avgRiskScore, maxRiskScore };

            const decryptedHighRisk = decryptedAll.filter(r => r.risk_score >= 40 || r.success === 0).slice(0, 20);

            const hourlyMap = {};
            decryptedAll.forEach(r => {
                const hour = new Date(r.attempt_time).getHours();
                if (!hourlyMap[hour]) hourlyMap[hour] = { hour, attempts: 0, failures: 0, blocks: 0 };
                hourlyMap[hour].attempts++;
                if (r.success === 0) hourlyMap[hour].failures++;
                if (r.blocked === 1) hourlyMap[hour].blocks++;
            });
            const hourlyStats = Object.values(hourlyMap).sort((a, b) => a.hour - b.hour);

            return { stats, highRiskLogins: decryptedHighRisk, hourlyStats };
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

            let bannedUntilStr = user.banned_until;
            try { bannedUntilStr = decrypt(user.banned_until); } catch (e) { }
            const bannedUntil = new Date(bannedUntilStr);
            const now = new Date();

            let banCount = 0;
            try { banCount = parseInt(decrypt(user.ban_count)) || 0; } catch (e) { banCount = parseInt(user.ban_count) || 0; }

            // Check ban vĩnh viễn (Sử dụng ngưỡng >= 2900 để khớp với 2999 ở hàm autoBan)
            const isPermanent = bannedUntil.getFullYear() >= 2900;

            if (!isPermanent && now >= bannedUntil) {
                await this._clearBan(pool, userId);
                return { isBanned: false, bannedUntil: null, banReason: null, banCount: banCount, isPermanent: false };
            }

            let banReason = user.ban_reason;
            try { banReason = decrypt(user.ban_reason); } catch (e) { }

            return {
                isBanned: true,
                bannedUntil: bannedUntil,
                banReason: banReason,
                banCount: banCount,
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
            // Kiểm tra số lần bị block trong 1 giờ qua (decrypt in-memory)
            const blockResult = await pool.request()
                .input('hash', sql.NVarChar, usernameHash)
                .query(`
                    SELECT blocked
                    FROM login_attempts
                    WHERE username_hash = @hash
                      AND attempt_time >= DATEADD(HOUR, -1, GETDATE())
                `);

            let blockCount = 0;
            for (const row of blockResult.recordset) {
                let b = row.blocked;
                try { b = decrypt(row.blocked); } catch (e) { }
                if (b === '1' || b === 1 || b === true) blockCount++;
            }

            console.log(`[AutoBan] DEBUG: riskScore=${riskScore}, threshold=${this.AUTO_BAN_THRESHOLD}, blockCount=${blockCount}, trigger=${this.BLOCK_COUNT_TRIGGER}`);
            const shouldBan = riskScore >= this.AUTO_BAN_THRESHOLD || blockCount >= this.BLOCK_COUNT_TRIGGER;
            console.log(`[AutoBan] DEBUG: shouldBan=${shouldBan} (risk>=${this.AUTO_BAN_THRESHOLD}? ${riskScore >= this.AUTO_BAN_THRESHOLD} | blocks>=${this.BLOCK_COUNT_TRIGGER}? ${blockCount >= this.BLOCK_COUNT_TRIGGER})`);
            if (!shouldBan) return null;

            const userResult = await pool.request()
                .input('userId', sql.UniqueIdentifier, userId)
                .query('SELECT ban_count FROM system_users WHERE user_id = @userId');

            let currentBanCount = 0;
            try { currentBanCount = parseInt(decrypt(userResult.recordset[0]?.ban_count)) || 0; } catch (e) { currentBanCount = parseInt(userResult.recordset[0]?.ban_count) || 0; }
            const escalationIndex = Math.min(currentBanCount, this.BAN_DURATION_ESCALATION.length - 1);
            const banMinutes = this.BAN_DURATION_ESCALATION[escalationIndex];

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
                bannedUntil = new Date('2999-12-31T00:00:00.000Z');
                durationText = 'PERMANENT';
            } else {
                bannedUntil = new Date(Date.now() + banMinutes * 60 * 1000);
                durationText = `${banMinutes} minutes`;
            }

            // Cập nhật database (mã hoá banned_until và ban_count)
            await pool.request()
                .input('userId', sql.UniqueIdentifier, userId)
                .input('bannedUntil', sql.NVarChar, encrypt(bannedUntil.toISOString()))
                .input('banReason', sql.NVarChar, encrypt(JSON.stringify(reasonData)))
                .input('banCount', sql.NVarChar, encrypt((currentBanCount + 1).toString()))
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
     * Tự động ban user khi sai mật khẩu >= MAX_FAILED_BEFORE_BAN lần liên tiếp
     * Hoạt động ĐỘC LẬP với AI risk score — chỉ dựa trên số lần sai password
     * @returns {{ banned, bannedUntil, duration, banLevel, isPermanent } | null}
     */
    async autobanOnFailedPasswords(pool, { userId, usernameHash, ipAddress }) {
        if (!this.AUTO_BAN_ENABLED || !userId) return null;

        try {
            // Đếm số lần login fail liên tiếp (CHỈ reset khi đăng nhập ĐÚNG)
            const result = await pool.request()
                .input('hash', sql.NVarChar, usernameHash)
                .query(`
                    SELECT success
                    FROM login_attempts
                    WHERE username_hash = @hash
                    ORDER BY attempt_time DESC
                `);

            let consecutiveFailCount = 0;
            for (const row of result.recordset) {
                let s = row.success;
                try { s = decrypt(row.success); } catch (e) { }
                if (s === '1' || s === 1 || s === true) break; // Gặp success → dừng đếm
                if (s === '0' || s === 0 || s === false) consecutiveFailCount++;
            }

            console.log(`[AutoBan] Password fail count for user: ${consecutiveFailCount}/${this.MAX_FAILED_BEFORE_BAN}`);

            if (consecutiveFailCount < this.MAX_FAILED_BEFORE_BAN) return null;

            // Đã đạt ngưỡng → Ban cố định 15 phút
            console.log(`[AutoBan] 🚫 User đã sai mật khẩu ${consecutiveFailCount} lần liên tiếp → Khoá tài khoản 15 phút!`);

            const banMinutes = 15;
            const bannedUntil = new Date(Date.now() + banMinutes * 60 * 1000);

            const reasonData = {
                type: 'EXCESSIVE_FAILED_PASSWORDS',
                failCount: consecutiveFailCount,
                threshold: this.MAX_FAILED_BEFORE_BAN,
                ip: ipAddress,
                time: new Date().toISOString(),
                message: `Sai mật khẩu ${consecutiveFailCount} lần liên tiếp → Khoá 15 phút`
            };

            await pool.request()
                .input('userId', sql.UniqueIdentifier, userId)
                .input('bannedUntil', sql.NVarChar, encrypt(bannedUntil.toISOString()))
                .input('banReason', sql.NVarChar, encrypt(JSON.stringify(reasonData)))
                .query(`
                    UPDATE system_users
                    SET banned_until = @bannedUntil,
                        ban_reason = @banReason
                    WHERE user_id = @userId
                `);

            console.log(`[AutoBan] 🚫 User BANNED 15 phút | Until: ${bannedUntil.toISOString()}`);

            return {
                banned: true,
                bannedUntil: bannedUntil,
                duration: '15 phút',
                banLevel: 1,
                isPermanent: false
            };
        } catch (err) {
            console.error('[AutoBan] autobanOnFailedPasswords error:', err.message);
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
     * Admin unban: Gỡ ban thủ công bởi Admin và Gửi Feedback lại cho AI học (Continuous Learning)
     * @param {boolean} resetCount - Nếu true, reset ban_count về 0
     * @param {boolean} isFalsePositive - [Tùy chọn] Chỉ set true khi Admin XÁC NHẬN đây là AI nhận diện nhầm
     *                                    Mặc định false để tránh AI bị "dạy sai" khi gỡ ban cho nhân viên quên pass
     */
    async unbanUser(pool, userId, resetCount = false, isFalsePositive = false) {
        try {
            // 1. Lấy thông tin tài khoản bị ban (username_hash và reason)
            const userRes = await pool.request()
                .input('userId', sql.UniqueIdentifier, userId)
                .query("SELECT username_hash, ban_reason FROM system_users WHERE user_id = @userId");
            const hash = userRes.recordset[0]?.username_hash;
            const encryptedBanReason = userRes.recordset[0]?.ban_reason;

            // 2. [CƠ CHẾ MỚI] Dạy lại AI (Feedback Loop) nếu đây là mở khóa do AI bắt nhầm người
            if (isFalsePositive && hash) {
                // Truy xuất lại attempt bị khóa gần nhất của người này
                // Tìm blocked attempt gần nhất (decrypt in-memory)
                const allRecentAttempts = await pool.request()
                    .input('hash', sql.NVarChar, hash)
                    .query(`
                        SELECT TOP 20 risk_factors, blocked
                        FROM login_attempts
                        WHERE username_hash = @hash
                        ORDER BY attempt_time DESC
                    `);

                const blockedAttempt = allRecentAttempts.recordset.find(r => {
                    let b = r.blocked;
                    try { b = decrypt(r.blocked); } catch (e) { }
                    return b === '1' || b === 1;
                });

                if (blockedAttempt && blockedAttempt.risk_factors) {
                    try {
                        const factorsJSON = JSON.parse(decrypt(blockedAttempt.risk_factors));
                        const aiMemoryContext = factorsJSON.find(f => f.type === 'AI_MEMORY_STATE');
                        if (aiMemoryContext && aiMemoryContext.inputVector) {
                            this.provideFeedback(aiMemoryContext.inputVector, true);
                        }
                    } catch (e) {
                        console.error('[AI Anomaly] Không thể trích xuất dataset cũ để dạy AI:', e.message);
                    }
                }
            }

            // 3. Mở khóa tài khoản
            const encZero = encrypt('0');
            const query = resetCount
                ? `UPDATE system_users SET banned_until = NULL, ban_reason = NULL, ban_count = '${encZero}' WHERE user_id = @userId`
                : `UPDATE system_users SET banned_until = NULL, ban_reason = NULL WHERE user_id = @userId`;

            await pool.request()
                .input('userId', sql.UniqueIdentifier, userId)
                .query(query);

            // 4. Giữ nguyên lịch sử login (không xóa) để Admin có thể xem audit trail
            // AI brute-force check chỉ dùng window 15 phút + dừng lại khi gặp success nên data cũ không ảnh hưởng

            // 5. Clear IP Rate Limiter cho user này (tránh bị cảnh báo ngay sau unban)
            if (hash) {
                this._ipAttemptMap.delete(hash);
            }

            console.log(`[AutoBan] ✅ Admin UNBANNED user: ${userId} | Tích hợp Feedback AI: ${isFalsePositive}`);
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
                WHERE banned_until IS NOT NULL
            `);

            const bannedUsers = [];
            for (const u of result.recordset) {
                let bannedUntilStr = u.banned_until;
                try { bannedUntilStr = decrypt(u.banned_until); } catch (e) { }
                const bannedUntil = new Date(bannedUntilStr);
                if (bannedUntil <= new Date()) continue;

                let username = u.username;
                let banReason = u.ban_reason;
                let banCount = 0;
                try { username = decrypt(u.username); } catch (e) { }
                try { banReason = JSON.parse(decrypt(u.ban_reason)); } catch (e) { }
                try { banCount = parseInt(decrypt(u.ban_count)) || 0; } catch (e) { banCount = parseInt(u.ban_count) || 0; }

                bannedUsers.push({
                    userId: u.user_id,
                    username: username,
                    bannedUntil: bannedUntil,
                    banReason: banReason,
                    banCount: banCount,
                    isPermanent: bannedUntil.getFullYear() >= 2900
                });
            }
            return bannedUsers;
        } catch (err) {
            console.error('[AutoBan] Get banned users error:', err.message);
            return [];
        }
    }
}

module.exports = new AnomalyDetectionService();
