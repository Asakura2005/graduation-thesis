const sql = require('mssql');
require('dotenv').config();

const config = {
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    server: process.env.DB_SERVER,
    database: process.env.DB_NAME,
    options: {
        instanceName: process.env.DB_INSTANCE,
        encrypt: true,
        trustServerCertificate: true
    }
};

async function run() {
    try {
        const pool = await sql.connect(config);
        await pool.request().query("ALTER TABLE warehouses ALTER COLUMN name NVARCHAR(MAX)");
        await pool.request().query("ALTER TABLE warehouses ALTER COLUMN location NVARCHAR(MAX)");
        await pool.request().query("ALTER TABLE warehouses ALTER COLUMN type NVARCHAR(MAX)");

        await pool.request().query(`
            DECLARE @ConstraintName nvarchar(200)
            SELECT @ConstraintName = name 
            FROM sys.default_constraints
            WHERE parent_object_id = object_id('warehouses')
            AND parent_column_id = columnproperty(object_id('warehouses'), 'total_shelves', 'ColumnId')

            IF @ConstraintName IS NOT NULL
            BEGIN
                EXEC('ALTER TABLE warehouses DROP CONSTRAINT ' + @ConstraintName)
            END
            ALTER TABLE warehouses ALTER COLUMN total_shelves NVARCHAR(MAX);
        `);
        console.log("Updated warehouses columns successfully");
        pool.close();
    } catch (e) { console.error(e); }
}
run();
