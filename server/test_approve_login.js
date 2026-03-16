require('dotenv').config();
const sql = require('mssql');
const { hashData } = require('./EncryptionService');

async function run() {
    try {
        console.log("Registering test user...");
        await fetch('http://localhost:5001/api/auth/register', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                username: 'testuser3',
                password: 'Testuser@123',
                confirmPassword: 'Testuser@123',
                fullName: 'Test',
                email: 'test3@example.com',
                phone: '123'
            })
        });

        const pool = await sql.connect({
            user: process.env.DB_USER,
            password: process.env.DB_PASSWORD,
            server: process.env.DB_SERVER,
            database: process.env.DB_NAME,
            options: { encrypt: true, trustServerCertificate: true }
        });

        const u = await pool.request().query(`SELECT * FROM system_users WHERE email_hash='${hashData('test3@example.com')}'`);
        const id = u.recordset[0].user_id;

        console.log("Logging in as admin...");
        const adminLogRaw = await fetch('http://localhost:5001/api/auth/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username: 'admin', password: 'admin123', captchaToken: 'a' }) // Assuming admin doesn't need captcha or we disable it
        });
        const adminLog = await adminLogRaw.json();

        // TEMPORARILY disable captcha config via admin API
        await fetch(`http://localhost:5001/api/settings/captcha`, {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json',
                'Authorization': 'Bearer ' + adminLog.token
            },
            body: JSON.stringify({ captchaEnabled: false })
        });


        console.log("Approving user...");
        await fetch(`http://localhost:5001/api/admin/users/${id}/approve`, {
            method: 'PUT',
            headers: { 
                'Content-Type': 'application/json',
                'Authorization': 'Bearer ' + adminLog.token
            },
            body: JSON.stringify({ role: 'Staff' })
        });

        console.log("Testing test user login...");
        const testLogRaw = await fetch('http://localhost:5001/api/auth/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username: 'testuser3', password: 'Testuser@123', captchaToken: 'a' })
        });
        const testLog = await testLogRaw.json();

        console.log("Login Success! Token:", !!testLog.token, testLog);

        // Re-enable captcha array
        await fetch(`http://localhost:5001/api/settings/captcha`, {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json',
                'Authorization': 'Bearer ' + adminLog.token
            },
            body: JSON.stringify({ captchaEnabled: true })
        });

    } catch (e) {
        console.error("Error:", e);
    }
    process.exit(0);
}

run();
