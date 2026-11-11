/**
 * Admin — Identity Hierarchy Config API
 *
 * Endpoints:
 *   GET    /api/admin/identity-config          — list all identifier tiers
 *   PUT    /api/admin/identity-config/:type     — update one identifier config
 *   POST   /api/admin/identity-config/reload    — flush in-memory cache
 *
 * Access: Technical Admin only (requireRole('admin'))
 * All writes are audit-logged.
 */
const router = require('express').Router();
const db     = require('../db/pool');
const { requireRole } = require('../middleware/rbac');
const { invalidateConfigCache } = require('../services/IdentityResolutionService');


// ─── Helpers ──────────────────────────────────────────────────────────────────

function auditLog(req, action, before, after) {
  console.log({
    audit:     true,
    who:       req.user?.email || req.headers['x-phs-user'] || 'unknown',
    action,
    entity:    'cdp_identity_config',
    before,
    after,
    ip:        req.ip,
    requestId: req.requestId,
    at:        new Date().toISOString(),
  });
}

// ─── GET /api/admin/identity-config ──────────────────────────────────────────
router.get('/', requireRole('admin'), async (req, res) => {
  try {
    const { rows } = await db.query(`
      SELECT
        id, identifier_type, display_name,
        tier, priority, merge_strategy,
        is_active, description,
        created_at, updated_at
      FROM cdp_identity_config
      ORDER BY tier ASC, priority ASC
    `);

    const tiers = {
      1: { label: 'Tier 1 — Strong Identifiers', description: 'Permanent merge keys. Profiles are always merged when any Tier-1 identifier matches.', items: [] },
      2: { label: 'Tier 2 — Weak Identifiers',   description: 'Pre-account merge keys. Profiles are only merged when no Tier-1 identifier exists on the target.', items: [] },
      3: { label: 'Tier 3 — Track Only',          description: 'Anonymous/device identifiers. Used to track events but never to merge profiles.', items: [] },
    };

    for (const row of rows) {
      if (tiers[row.tier]) tiers[row.tier].items.push(row);
    }

    res.json({
      data:   rows,
      tiers:  Object.entries(tiers).map(([t, v]) => ({ tier: Number(t), ...v })),
      total:  rows.length,
      cached: false,
    });
  } catch (err) {
    console.error({ event: 'admin.identity_config.list_failed', error: err.message });
    res.status(500).json({ error: 'Failed to load identity config' });
  }
});

// ─── PUT /api/admin/identity-config/:type ─────────────────────────────────────
router.put('/:type', requireRole('admin'), async (req, res) => {
  const { type } = req.params;
  const allowed  = ['tier', 'priority', 'merge_strategy', 'is_active', 'description', 'display_name'];
  const updates  = {};

  for (const key of allowed) {
    if (req.body[key] !== undefined) updates[key] = req.body[key];
  }

  if (Object.keys(updates).length === 0) {
    return res.status(400).json({ error: 'No valid fields to update. Allowed: ' + allowed.join(', ') });
  }

  if (updates.tier !== undefined && ![1, 2, 3].includes(Number(updates.tier))) {
    return res.status(400).json({ error: 'tier must be 1, 2 or 3' });
  }
  if (updates.merge_strategy !== undefined && !['permanent', 'pre_account', 'track_only'].includes(updates.merge_strategy)) {
    return res.status(400).json({ error: 'merge_strategy must be permanent | pre_account | track_only' });
  }

  const effectiveTier     = updates.tier           !== undefined ? Number(updates.tier) : null;
  const effectiveStrategy = updates.merge_strategy || null;

  if (effectiveTier === 1 && effectiveStrategy && effectiveStrategy !== 'permanent') {
    return res.status(400).json({ error: 'Tier 1 identifiers must use merge_strategy = permanent' });
  }
  if (effectiveTier === 3 && effectiveStrategy && effectiveStrategy !== 'track_only') {
    return res.status(400).json({ error: 'Tier 3 identifiers must use merge_strategy = track_only' });
  }

  try {
    const { rows: before } = await db.query(
      'SELECT * FROM cdp_identity_config WHERE identifier_type = $1',
      [type]
    );
    if (!before.length) {
      return res.status(404).json({ error: `Identifier type "${type}" not found` });
    }

    const setClauses = Object.keys(updates).map((k, i) => `${k} = $${i + 2}`).join(', ');
    const values     = [type, ...Object.values(updates)];

    const { rows: after } = await db.query(
      `UPDATE cdp_identity_config
       SET ${setClauses}, updated_at = NOW()
       WHERE identifier_type = $1
       RETURNING *`,
      values
    );

    invalidateConfigCache();
    auditLog(req, 'identity_config.updated', before[0], after[0]);

    res.json({ data: after[0], cacheInvalidated: true });
  } catch (err) {
    console.error({ event: 'admin.identity_config.update_failed', type, error: err.message });
    res.status(500).json({ error: 'Failed to update identity config' });
  }
});

// ─── POST /api/admin/identity-config ─────────────────────────────────────────
router.post('/', requireRole('admin'), async (req, res) => {
  const { identifier_type, display_name, tier, priority, merge_strategy, description } = req.body;

  if (!identifier_type || !display_name || !tier || !merge_strategy) {
    return res.status(400).json({ error: 'Required: identifier_type, display_name, tier, merge_strategy' });
  }
  if (![1,2,3].includes(Number(tier))) {
    return res.status(400).json({ error: 'tier must be 1, 2 or 3' });
  }
  if (!['permanent','pre_account','track_only'].includes(merge_strategy)) {
    return res.status(400).json({ error: 'merge_strategy must be permanent | pre_account | track_only' });
  }

  try {
    const { rows } = await db.query(
      `INSERT INTO cdp_identity_config
         (identifier_type, display_name, tier, priority, merge_strategy, is_active, description)
       VALUES ($1, $2, $3, $4, $5, true, $6)
       RETURNING *`,
      [identifier_type, display_name, Number(tier), Number(priority) || 99, merge_strategy, description || null]
    );
    invalidateConfigCache();
    auditLog(req, 'identity_config.created', null, rows[0]);
    res.status(201).json({ data: rows[0] });
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: `Identifier type "" already exists` });
    console.error({ event: 'admin.identity_config.create_failed', error: err.message });
    res.status(500).json({ error: 'Failed to create identity config' });
  }
});

// ─── DELETE /api/admin/identity-config/:type ──────────────────────────────────
router.delete('/:type', requireRole('admin'), async (req, res) => {
  const { type } = req.params;
  try {
    const { rows: before } = await db.query(
      'SELECT * FROM cdp_identity_config WHERE identifier_type = $1', [type]
    );
    if (!before.length) return res.status(404).json({ error: `Identifier type "" not found` });

    await db.query('DELETE FROM cdp_identity_config WHERE identifier_type = $1', [type]);
    invalidateConfigCache();
    auditLog(req, 'identity_config.deleted', before[0], null);
    res.json({ ok: true, deleted: type });
  } catch (err) {
    console.error({ event: 'admin.identity_config.delete_failed', type, error: err.message });
    res.status(500).json({ error: 'Failed to delete identity config' });
  }
});

// ─── POST /api/admin/identity-config/reload ──────────────────────────────────
router.post('/reload', requireRole('admin'), (req, res) => {
  invalidateConfigCache();
  auditLog(req, 'identity_config.cache_reloaded', null, null);
  res.json({ ok: true, message: 'Identity config cache cleared. Next event will reload from DB.' });
});

module.exports = router;
