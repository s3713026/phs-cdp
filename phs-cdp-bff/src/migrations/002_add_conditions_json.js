// Migration 002: Add conditions_json column to phs_meta_audiences
// Run from phs-cdp-bff folder: node src/migrations/002_add_conditions_json.js

const mysql = require('mysql2/promise');
require('dotenv').config();

async function run() {
  const db = await mysql.createConnection({
    host:     process.env.MYSQL_HOST     || '127.0.0.1',
    port:     parseInt(process.env.MYSQL_PORT) || 3306,
    user:     process.env.MYSQL_USER     || 'root',
    password: process.env.MYSQL_PASSWORD || 'password',
    database: process.env.MYSQL_DATABASE || 'mautic',
  });

  try {
    const [cols] = await db.query(`
      SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME   = 'phs_meta_audiences'
        AND COLUMN_NAME  = 'conditions_json'
    `);

    if (cols.length > 0) {
      console.log('[002] conditions_json column already exists — skipping.');
    } else {
      await db.query(`
        ALTER TABLE phs_meta_audiences
          ADD COLUMN conditions_json VARCHAR(5000) DEFAULT '[]'
      `);
      console.log('[002] conditions_json column added successfully.');
    }
  } catch (err) {
    console.error('[002] Migration failed:', err.message);
    process.exit(1);
  } finally {
    await db.end();
    console.log('[002] Done.');
  }
}

run();
