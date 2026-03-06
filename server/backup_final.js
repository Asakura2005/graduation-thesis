const sql = require('mssql');
require('dotenv').config();

const dbConfig = {
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    server: process.env.DB_SERVER,
    database: 'master',
    options: {
        encrypt: false,
        trustServerCertificate: true
    }
};

async function backup() {
    try {
        await sql.connect(dbConfig);
        const backupFile = 'SCMS_Final.bak';
        console.log(`Backing up to: ${backupFile}`);

        await sql.query(`BACKUP DATABASE [SCMS] TO DISK = '${backupFile}' WITH FORMAT, INIT`);

        console.log("SUCCESS: Backup created.");

        // Let's find where it actually went
        const res = await sql.query(`SELECT physical_device_name FROM msdb.dbo.backupmediafamily WHERE media_set_id = (SELECT MAX(media_set_id) FROM msdb.dbo.backupset WHERE database_name = 'SCMS')`);
        console.log("File path in server:", res.recordset[0].physical_device_name);
    } catch (err) {
        console.error("Backup failed:", err.message);
    } finally {
        await sql.close();
    }
}

backup();
