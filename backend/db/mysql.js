// backend/db/mysql.js
// MySQL connection using mysql2 with promise support

const mysql = require('mysql2/promise');

let pool;

const connectDB = async () => {
    pool = mysql.createPool({
        host:     process.env.DB_HOST     || 'localhost',
        port:     process.env.DB_PORT     || 3306,
        user:     process.env.DB_USER     || 'root',
        password: process.env.DB_PASSWORD || '',
        database: process.env.DB_NAME     || 'swiftcare',
        waitForConnections: true,
        connectionLimit: 10,
    });

    // Test connection
    const conn = await pool.getConnection();
    console.log(`MySQL Connected: ${process.env.DB_HOST || 'localhost'}`);
    conn.release();

    return pool;
};

const getPool = () => {
    if (!pool) throw new Error('DB not initialised. Call connectDB() first.');
    return pool;
};

module.exports = { connectDB, getPool };
