/**
 * CDP Profile Store — PostgreSQL Connection Pool
 * Connects to cdp-postgres (separate from RudderStack postgres)
 */
const { Pool } = require('pg');

let pool;

function getPool() {
  if (!pool) {
    pool = new Pool({
      host:     process.env.CDP_DB_HOST     || 'localhost',
      port:     parseInt(process.env.CDP_DB_PORT || '5432'),
      database: process.env.CDP_DB_NAME     || 'phs_cdp',
      user:     process.env.CDP_DB_USER     || 'cdp_user',
      password: process.env.CDP_DB_PASSWORD,
      max: 10,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 5000,
    });

    pool.on('error', (err) => {
      console.error('[CDP-DB] Unexpected pool error:', err.message);
    });

    pool.on('connect', () => {
      if (process.env.NODE_ENV !== 'production') {
        console.log('[CDP-DB] New client connected to cdp-postgres');
      }
    });
  }
  return pool;
}

/**
 * Run a query with automatic connection management
 * @param {string} text  - SQL query
 * @param {Array}  params - Query parameters
 */
async function query(text, params) {
  const p = getPool();
  try {
    const result = await p.query(text, params);
    return result;
  } catch (err) {
    // Mask PII in error logs
    console.error('[CDP-DB] Query error:', err.message, '| Query:', text.substring(0, 80));
    throw err;
  }
}

/**
 * Get a dedicated client for transactions
 */
async function getClient() {
  return getPool().connect();
}

/**
 * Test database connectivity
 */
async function ping() {
  try {
    const result = await query('SELECT 1 AS ok');
    return result.rows[0].ok === 1;
  } catch {
    return false;
  }
}

module.exports = { query, getClient, ping, getPool };
