const sql = require('mssql');
require('dotenv').config();
const fs = require('fs');

const dbConfig = {
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    server: process.env.DB_SERVER,
    database: process.env.DB_NAME,
    options: {
        encrypt: false, trustServerCertificate: true
    }
};

async function exportSql() {
    try {
        await sql.connect(dbConfig);
        console.log("Connected to database for export...");

        const tablesRes = await sql.query("SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_TYPE = 'BASE TABLE'");
        const tables = tablesRes.recordset.map(r => r.TABLE_NAME);

        let sqlDump = `-- Database Export for ${process.env.DB_NAME}\n`;
        sqlDump += `-- Generated at ${new Date().toLocaleString()}\n\n`;
        sqlDump += `USE [${process.env.DB_NAME}];\nGO\n\n`;

        for (const table of tables) {
            console.log(`Exporting table: ${table}`);
            sqlDump += `--- TABLE: ${table} ---\n`;

            // Get columns (simplified)
            const dataRes = await sql.query(`SELECT * FROM [${table}]`);
            if (dataRes.recordset.length > 0) {
                const columns = Object.keys(dataRes.recordset[0]);
                for (const row of dataRes.recordset) {
                    const values = columns.map(col => {
                        const val = row[col];
                        if (val === null) return 'NULL';
                        if (typeof val === 'string') return "N'" + val.replace(/'/g, "''") + "'";
                        if (val instanceof Date) return "'" + val.toISOString() + "'";
                        return val;
                    }).join(', ');
                    sqlDump += `INSERT INTO [${table}] (${columns.map(c => "[" + c + "]").join(', ')}) VALUES (${values});\n`;
                }
            }
            sqlDump += `GO\n\n`;
        }

        fs.writeFileSync('SCMS_Backup_Data.sql', sqlDump);
        console.log("SUCCESS: SQL Data dump created at SCMS_Backup_Data.sql");
    } catch (e) {
        console.error("Export failed:", e);
    } finally {
        await sql.close();
    }
}

exportSql();
