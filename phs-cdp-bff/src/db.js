/**
 * MySQL connection pool — dùng chung cho toàn BFF.
 * Connect vào Mautic DB, đọc/ghi cả Mautic tables (read-only)
 * và PHS metadata tables (phs_*).
 */

const mysql = require('mysql2/promise');

let pool = null;

function getPool() {
  if (pool) return pool;

  pool = mysql.createPool({
    host:               process.env.MYSQL_HOST     || 'localhost',
    port:     parseInt(process.env.MYSQL_PORT      || '3306'),
    user:               process.env.MYSQL_USER     || 'mautic',
    password:           process.env.MYSQL_PASSWORD || '',
    database:           process.env.MYSQL_DATABASE || 'mautic',
    waitForConnections: true,
    connectionLimit:    10,
    queueLimit:         0,
    timezone:           '+00:00',
  });

  pool.on('connection', () => {
    console.log('[DB] MySQL connection established');
  });

  return pool;
}

/**
 * Chạy query với auto-release connection.
 * @param {string} sql
 * @param {Array}  params
 * @returns {Promise<Array>}
 */
async function query(sql, params = []) {
  const db = getPool();
  const [rows] = await db.execute(sql, params);
  return rows;
}

/**
 * Kiểm tra kết nối DB có hoạt động không.
 * @returns {Promise<boolean>}
 */
async function healthCheck() {
  try {
    await query('SELECT 1');
    return true;
  } catch (err) {
    console.error('[DB] Health check failed:', err.message);
    return false;
  }
}

module.exports = { getPool, query, healthCheck };
