require('dotenv').config();
const sql = require('mssql');

const configs = [
    { label: 'localhost (default)', server: 'localhost', port: undefined },
    { label: 'localhost port 1433', server: 'localhost', port: 1433 },
    { label: '127.0.0.1 port 1433', server: '127.0.0.1', port: 1433 },
    { label: 'localhost\\SQLEXPRESS', server: 'localhost\\SQLEXPRESS', port: undefined },
];

async function testConnection(label, server, port) {
    try {
        const config = {
            user: process.env.DB_USER,
            password: process.env.DB_PASSWORD,
            server: server,
            database: process.env.DB_NAME,
            options: {
                encrypt: false,
                trustServerCertificate: true,
                connectTimeout: 5000
            }
        };
        if (port) config.port = port;

        console.log(`\n[TEST] ${label} (user=${config.user}, db=${config.database})`);
        const pool = await sql.connect(config);
        const result = await pool.request().query('SELECT @@VERSION as version, DB_NAME() as dbname');
        console.log(`  ✅ CONNECTED! DB: ${result.recordset[0].dbname}`);
        console.log(`     Version: ${result.recordset[0].version.substring(0, 60)}...`);
        await sql.close();
    } catch (err) {
        console.log(`  ❌ FAILED: ${err.message.substring(0, 100)}`);
        try { await sql.close(); } catch(e) {}
    }
}

(async () => {
    console.log('=== Database Connection Test ===');
    console.log(`DB_SERVER=${process.env.DB_SERVER}, DB_NAME=${process.env.DB_NAME}, DB_USER=${process.env.DB_USER}`);
    for (const c of configs) {
        await testConnection(c.label, c.server, c.port);
        await new Promise(r => setTimeout(r, 500));
    }
    console.log('\n=== Done ===');
    process.exit(0);
})();
