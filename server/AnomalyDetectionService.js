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

        // === AI NEURAL NETWORK (Supervised) ===
        this._initAI();

        // === GAUSSIAN ANOMALY AI (Unsupervised) ===
        this.gaussianAI = new MultivariateGaussian();
        this.lastGaussianTrainTime = 0;
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
                this.net = new synaptic.Architect.Perceptron(5, 6, 1);
                this._trainAI();
            }
        } else {
            console.log('[AI Anomaly] ⚠️ Chưa có bộ não AI, bắt đầu huấn luyện từ số 0...');
            this.net = new synaptic.Architect.Perceptron(5, 6, 1);
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
            console.log('[AI Anomaly] 💾 Bộ não AI (Neural + Gaussian) đã được ghi nhớ vào ổ cứng.');
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
        const trainingData = [
            // --- 🟢 NHÓM: BÌNH THƯỜNG (An toàn) ---
            { input: [0, 0, 0, 0, 0], output: [0.0] }, // Hoàn hảo
            { input: [0, 0, 1, 0, 0], output: [0.1] }, // Đổi IP nhưng giữ thiết bị (Chắc đổi wifi)
            { input: [0.2, 0, 0, 0, 0], output: [0.1] },// Gõ sai pass 1 lần: Bình thường
            { input: [0.6, 0, 0, 0, 0], output: [0.45] },// Gõ sai 3 lần: Cảnh báo (WARN)
            { input: [0.8, 0, 0, 0, 0], output: [0.85] },// Gõ sai 5 lần: KHÓA NGAY (BLOCK)
            { input: [1.0, 0, 0, 0, 0], output: [0.95] },// Gõ sai > 10 lần: KHÓA CỨNG

            // --- 🟡 NHÓM: NGHI NGỜ (Cảnh báo Admin, nhưng CÓ THỂ chưa khóa) ---
            { input: [0, 0, 1, 1, 0], output: [0.4] }, // Mua điện thoại mới và lắp 4G mới (Hoặc có thể là người khác)
            { input: [0, 1, 1, 1, 0], output: [0.65] }, // Nửa đêm, dùng IP mới, thiết bị mới (Rất đáng ngờ, ngấp nghé khóa)
            { input: [0.4, 0, 0, 0, 1], output: [0.45] },// Gõ sai 2 lần mà đăng nhập liên tục cực nhanh dồn dập

            // --- 🔴 NHÓM: HÀNH VI TẤN CÔNG (Chắc chắn khóa / Block) ---
            { input: [1.0, 0, 0, 0, 0], output: [0.95] }, // Brute force CỰC KỲ NHIỀU (Sai > 10 lần) (Chặn cứng)
            { input: [0.8, 0, 1, 1, 0], output: [0.85] }, // Sai 4-5 lần + IP LẠ + THIẾT BỊ LẠ (Chắc chắn là Hacker đang rà pass)
            { input: [0.6, 1, 1, 1, 1], output: [0.98] }, // Sai 3 lần + Nửa đêm + IP Lạ + Thiết bị Lạ + Gõ nhanh (100% Hacker Credentials Stuffing)
            { input: [0.8, 0, 1, 0, 1], output: [0.88] }, // Đổi IP xong Brute Force nhanh máy chủ
            { input: [0, 0, 1, 1, 1], output: [0.75] }    // Dùng thiết bị mới toanh IP lạ, đăng nhập liên tục nhanh chóng mặt
        ];

        const trainer = new synaptic.Trainer(this.net);
        trainer.train(trainingData, {
            rate: 0.1,
            iterations: 5000,
            error: 0.005,
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
                SELECT TOP 300 risk_factors FROM login_attempts 
                WHERE success = 1 AND risk_factors IS NOT NULL
                ORDER BY attempt_time DESC
            `);

            const dataset = [];
            for (const row of result.recordset) {
                try {
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

            // === Lấy dữ liệu thô từ quá khứ ===
            const bScore = await this._checkBruteForce(pool, usernameHash); // 0, 20, 40, 50
            const tScore = await this._checkUnusualTime(pool, userId); // 0, 15, 20 (Đã nâng cấp cá nhân hóa)
            const ipScore = userId ? await this._checkNewIP(pool, userId, ipAddress) : 0; // 0, 20
            const uaScore = userId ? await this._checkNewUserAgent(pool, userId, userAgent) : 0; // 0, 10
            const rapidScore = userId ? await this._checkRapidLogin(pool, userId) : 0; // 0, 15

            // === Chuẩn hóa Features (Normalize 0.0 -> 1.0) cho Mạng Neural ===
            // Input map: [bruteForce, unusualTime, newIP, newDevice, rapidLogin]
            const aiInputs = [
                Math.min(bScore / 50, 1.0),
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

            // Gộp điểm từ 2 AI lại
            riskScore = Math.min(neuralScore + gaussianPenalty, 100);

            // === CƠ CHẾ ĐIỂM SÀN (Risk Floor) ===
            // Đảm bảo rủi ro không được thấp hơn điểm Brute Force thực tế
            // AI có thể học IPs/Time, nhưng không được phép "tha bổng" Brute Force.
            if (riskScore < bScore) {
                console.log(`[AI Anomaly] 🛡️ Risk Floor Trigger: AI nghĩ là ${riskScore}, nhưng Brute Force thực tế là ${bScore}. Nâng lên ${bScore}.`);
                riskScore = bScore;
            }

            // Ghi lại chi tiết (Explanations) để lưu vào DB cho Admin đọc hiểu vì sao AI chọn điểm này
            if (bScore > 0) riskFactors.push({ type: 'BRUTE_FORCE', severity: bScore >= 40 ? 'critical' : 'warning', message: 'Phát hiện nhiều đăng nhập thất bại trước đó' });
            if (tScore > 0) riskFactors.push({ type: 'UNUSUAL_TIME', severity: 'warning', message: `Đăng nhập ngoài giờ làm việc (${new Date().getHours()}:00)` });
            if (ipScore > 0) riskFactors.push({ type: 'NEW_IP', severity: 'warning', message: 'Đăng nhập từ địa chỉ IP hoàn toàn mới' });
            if (uaScore > 0) riskFactors.push({ type: 'NEW_DEVICE', severity: 'info', message: 'Đăng nhập từ thiết bị/trình duyệt lạ' });
            if (rapidScore > 0) riskFactors.push({ type: 'RAPID_LOGIN', severity: 'warning', message: 'Tần suất đăng nhập quá nhanh' });

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
                    SELECT TOP 20 attempt_time
                    FROM login_attempts
                    WHERE user_id = @userId AND success = 1
                    ORDER BY attempt_time DESC
                `);

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
                    SELECT DISTINCT TOP 100 ip_address
                    FROM login_attempts
                    WHERE user_id = @userId AND success = 1
                    ORDER BY attempt_time DESC
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
                    SELECT DISTINCT TOP 100 user_agent
                    FROM login_attempts
                    WHERE user_id = @userId AND success = 1
                    ORDER BY attempt_time DESC
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

            // Check ban vĩnh viễn (Sử dụng ngưỡng >= 2900 để khớp với 2999 ở hàm autoBan)
            const isPermanent = bannedUntil.getFullYear() >= 2900;

            if (!isPermanent && now >= bannedUntil) {
                // Ban đã hết hạn → tự động unban
                await this._clearBan(pool, userId);
                return { isBanned: false, bannedUntil: null, banReason: null, banCount: user.ban_count || 0, isPermanent: false };
            }

            let banReason = user.ban_reason;
            try { banReason = decrypt(user.ban_reason); } catch (e) { }

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
                // Ban vĩnh viễn (Sử dụng năm 2999 để tránh lỗi Out Of Range timezone của SQL Server)
                bannedUntil = new Date('2999-12-31T00:00:00.000Z');
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
     * Admin unban: Gỡ ban thủ công bởi Admin và Gửi Feedback lại cho AI học (Continuous Learning)
     * @param {boolean} resetCount - Nếu true, reset ban_count về 0
     * @param {boolean} isFalsePositive - [Tùy chọn] Báo cáo đây là AI nhận diện nhầm, cần dạy lại AI
     */
    async unbanUser(pool, userId, resetCount = false, isFalsePositive = true) {
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
                const lastAttemptResult = await pool.request()
                    .input('hash', sql.NVarChar, hash)
                    .query(`
                        SELECT TOP 1 risk_factors
                        FROM login_attempts
                        WHERE username_hash = @hash AND blocked = 1
                        ORDER BY attempt_time DESC
                    `);

                if (lastAttemptResult.recordset.length > 0 && lastAttemptResult.recordset[0].risk_factors) {
                    try {
                        const factorsJSON = JSON.parse(decrypt(lastAttemptResult.recordset[0].risk_factors));
                        // Tìm yếu tố chứa trạng thái memory của AI lúc đưa ra quyết định
                        const aiMemoryContext = factorsJSON.find(f => f.type === 'AI_MEMORY_STATE');

                        if (aiMemoryContext && aiMemoryContext.inputVector) {
                            // Gọi hàm dạy lại: Báo với não bộ rằng input này phải ra Output 0 (Safe)
                            this.provideFeedback(aiMemoryContext.inputVector, true);
                        }
                    } catch (e) {
                        console.error('[AI Anomaly] Không thể trích xuất dataset cũ để dạy AI:', e.message);
                    }
                }
            }

            // 3. Mở khóa tài khoản
            const query = resetCount
                ? `UPDATE system_users SET banned_until = NULL, ban_reason = NULL, ban_count = 0 WHERE user_id = @userId`
                : `UPDATE system_users SET banned_until = NULL, ban_reason = NULL WHERE user_id = @userId`;

            await pool.request()
                .input('userId', sql.UniqueIdentifier, userId)
                .query(query);

            // 4. Xóa bộ nhớ ngắn hạn của các Rule (xóa lịch sử login fail)
            if (hash) {
                await pool.request()
                    .input('hash', sql.NVarChar, hash)
                    .query(`DELETE FROM login_attempts WHERE username_hash = @hash AND success = 0`);
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
                WHERE banned_until IS NOT NULL AND banned_until > GETDATE()
            `);

            return result.recordset.map(u => {
                let username = u.username;
                let banReason = u.ban_reason;
                try { username = decrypt(u.username); } catch (e) { }
                try { banReason = JSON.parse(decrypt(u.ban_reason)); } catch (e) { }

                return {
                    userId: u.user_id,
                    username: username,
                    bannedUntil: u.banned_until,
                    banReason: banReason,
                    banCount: u.ban_count,
                    isPermanent: new Date(u.banned_until).getFullYear() >= 2900
                };
            });
        } catch (err) {
            console.error('[AutoBan] Get banned users error:', err.message);
            return [];
        }
    }
}

module.exports = new AnomalyDetectionService();
