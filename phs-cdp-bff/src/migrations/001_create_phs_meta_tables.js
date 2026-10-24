/**
 * Migration 001 — Tạo các bảng PHS metadata trong Mautic DB.
 * Convention: phs_meta_* cho metadata, phs_* cho business objects, phs_sys_* cho system.
 * Chạy: node src/migrations/001_phs_metadata.js
 */

require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });
const { query, healthCheck } = require('../db');

async function up() {
  console.log('[Migration 001] Connecting to MySQL...');
  const ok = await healthCheck();
  if (!ok) {
    console.error('[Migration 001] Cannot connect to DB. Check .env MySQL settings.');
    process.exit(1);
  }

  console.log('[Migration 001] Running...');

  // Bảng metadata cho Audiences (map với lead_lists của Mautic)
  await query(`
    CREATE TABLE IF NOT EXISTS phs_meta_audiences (
      mautic_segment_id  INT          NOT NULL,
      description        TEXT,
      tags               VARCHAR(1000) DEFAULT '[]',
      owner              VARCHAR(100) DEFAULT 'system',
      notes              TEXT,
      created_by         VARCHAR(100) DEFAULT 'system',
      updated_at         DATETIME     DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (mautic_segment_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
  console.log('  ✓ phs_meta_audiences');

  // Bảng metadata cho Campaigns (map với campaigns của Mautic)
  await query(`
    CREATE TABLE IF NOT EXISTS phs_meta_campaigns (
      mautic_campaign_id INT          NOT NULL,
      description        TEXT,
      tags               VARCHAR(1000) DEFAULT '[]',
      owner              VARCHAR(100) DEFAULT 'system',
      goal               VARCHAR(255),
      notes              TEXT,
      created_by         VARCHAR(100) DEFAULT 'system',
      updated_at         DATETIME     DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (mautic_campaign_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
  console.log('  ✓ phs_meta_campaigns');

  // Bảng audit log của PHS (track mọi action từ UI)
  await query(`
    CREATE TABLE IF NOT EXISTS phs_sys_audit_log (
      id          INT          NOT NULL AUTO_INCREMENT,
      actor       VARCHAR(100) NOT NULL,
      action      VARCHAR(100) NOT NULL,
      entity_type VARCHAR(50),
      entity_id   VARCHAR(100),
      detail      TEXT,
      ip          VARCHAR(45),
      created_at  DATETIME     DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      INDEX idx_actor      (actor),
      INDEX idx_entity     (entity_type, entity_id),
      INDEX idx_created_at (created_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
  console.log('  ✓ phs_sys_audit_log');

  console.log('[Migration 001] Done ✅');
  process.exit(0);
}

up().catch(err => {
  console.error('[Migration 001] Failed:', err.message);
  process.exit(1);
});
