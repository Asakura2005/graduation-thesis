const sql = require('mssql');
require('dotenv').config();

const dbConfig = {
    user: process.env.DB_USER || 'meuu41',
    password: process.env.DB_PASSWORD || 'Meuu411@',
    server: process.env.DB_SERVER || 'localhost',
    database: 'master', // Connect to master to handle the backup
    options: {
        encrypt: false,
        trustServerCertificate: true
    }
};

async function backup() {
    try {
        await sql.connect(dbConfig);

        // Target the temporary folder we just created with full permissions
        const backupPath = 'C:\\SQLTemp\\SCMS.bak';
        console.log(`Attempting backup to: ${backupPath}`);

        // Execute BACKUP command
        await sql.query(`BACKUP DATABASE [SCMS] TO DISK = '${backupPath}' WITH FORMAT, INIT, NAME = 'SCMS-Full-Backup'`);

        console.log(`\n=========================================`);
        console.log(`SUCCESS: Backup created successfully!`);
        console.log(`Location: ${backupPath}`);
        console.log(`=========================================\n`);
    } catch (err) {
        console.error("Backup failed:", err.message);
    } finally {
        await sql.close();
    }
}

backup();
