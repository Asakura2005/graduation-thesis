const sql = require('mssql');
require('dotenv').config();

const dbConfig = {
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    server: process.env.DB_SERVER,
    database: 'master',
    options: {
        encrypt: false, trustServerCertificate: true
    }
};

async function getPath() {
    try {
        await sql.connect(dbConfig);
        const res = await sql.query(`
            DECLARE @BackupDirectory NVARCHAR(4000);
            EXEC master.dbo.xp_instance_regread 
                N'HKEY_LOCAL_MACHINE', 
                N'Software\\Microsoft\\MSSQLServer\\MSSQLServer', 
                N'BackupDirectory', 
                @BackupDirectory OUTPUT;
            SELECT @BackupDirectory AS BackupDir;
        `);
        console.log(JSON.stringify(res.recordset));
    } catch (e) {
        console.error(e);
    } finally {
        await sql.close();
    }
}
getPath();
