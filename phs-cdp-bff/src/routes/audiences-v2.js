/**
 * Audiences Route v2 — CDP Profile Store (cdp-postgres)
 * USE_MOCK=false → never fall through to mock data
 */
const express = require('express');
const router  = express.Router();
const { requireRole } = require('../middleware/rbac');
const AudienceService = require('../services/AudienceService');
const { shouldUseMock, sendNotConnected } = require('../utils/mock-guard');

// ─── GET /api/audiences ──────────────────────────────────────
router.get('/', requireRole('viewer'), async (req, res) => {
  if (shouldUseMock()) {
    const { AUDIENCES } = require('../mock/audiences');
    return res.json({ data: AUDIENCES, total: AUDIENCES.length, source: 'mock' });
  }
  try {
    const audiences = await AudienceService.listAudiences();
    return res.json({ data: audiences, total: audiences.length, source: 'cdp' });
  } catch (dbErr) {
    console.warn('[audiences] CDP DB unavailable:', dbErr.message);
    return sendNotConnected(res, 'Audiences', 'CDP Postgres',
      'CDP Postgres is unavailable. Audiences are stored in cdp_audiences table.');
  }
});

// ─── GET /api/audiences/:id ──────────────────────────────────
router.get('/:id', requireRole('viewer'), async (req, res) => {
  const { id } = req.params;
  if (shouldUseMock()) {
    const { AUDIENCES } = require('../mock/audiences');
    const audience = AUDIENCES.find(a => a.id === id);
    if (!audience) return res.status(404).json({ error: { message: 'Audience not found', code: 'NOT_FOUND' } });
    return res.json(audience);
  }
  try {
    const audience = await AudienceService.getAudience(id);
    if (audience) return res.json(audience);
    return res.status(404).json({ error: { message: 'Audience not found', code: 'NOT_FOUND' } });
  } catch (dbErr) {
    console.warn('[audiences/:id] CDP DB error:', dbErr.message);
    return res.status(503).json({ error: { message: 'CDP Postgres unavailable', code: 'NOT_CONNECTED', _dataStatus: 'not_connected' } });
  }
});

// ─── POST /api/audiences ─────────────────────────────────────
router.post('/', requireRole('operator'), async (req, res) => {
  const { name, description, type, conditions } = req.body;
  if (!name) return res.status(400).json({ error: { message: 'name is required', code: 'VALIDATION_ERROR' } });
  const createdBy = req.headers['x-phs-role'] || 'marketing_user';

  if (shouldUseMock()) {
    return res.status(201).json({
      id: `aud_${Date.now()}`, name, description, type: type || 'dynamic',
      conditions: conditions || [], status: 'draft', estimated_size: 0,
      created_at: new Date().toISOString(), source: 'mock',
    });
  }
  try {
    const audience = await AudienceService.createAudience(
      { name, description, type: type || 'dynamic', conditions: conditions || [] }, createdBy,
    );
    return res.status(201).json(audience);
  } catch (err) {
    console.error('[audiences POST]', err.message);
    return res.status(500).json({ error: { message: 'Failed to create audience', detail: err.message } });
  }
});

// ─── PUT /api/audiences/:id ──────────────────────────────────
router.put('/:id', requireRole('operator'), async (req, res) => {
  const { id } = req.params;
  const changedBy = req.headers['x-phs-role'] || 'marketing_user';

  if (shouldUseMock()) {
    const { AUDIENCES } = require('../mock/audiences');
    const audience = AUDIENCES.find(a => a.id === id);
    if (!audience) return res.status(404).json({ error: { message: 'Audience not found' } });
    Object.assign(audience, req.body, { updated_at: new Date().toISOString() });
    return res.json(audience);
  }
  try {
    const updated = await AudienceService.updateAudience(id, req.body, changedBy);
    return res.json(updated);
  } catch (err) {
    if (err.message === 'Audience not found') return res.status(404).json({ error: { message: 'Audience not found' } });
    return res.status(500).json({ error: { message: 'Failed to update audience', detail: err.message } });
  }
});

// ─── GET /api/audiences/:id/preview ─────────────────────────
router.get('/:id/preview', requireRole('viewer'), async (req, res) => {
  const { id } = req.params;
  if (shouldUseMock()) return res.json({ estimated_size: 0, mautic_synced: false, source: 'mock' });
  try {
    const preview = await AudienceService.previewAudienceSize(id);
    if (preview) return res.json(preview);
    return res.json({ estimated_size: 0, mautic_synced: false, source: 'cdp' });
  } catch (err) {
    console.warn('[audiences/:id/preview]', err.message);
    return res.json({ estimated_size: null, mautic_synced: false, _dataStatus: 'not_connected', source: 'none' });
  }
});

// ─── DELETE /api/audiences/:id ───────────────────────────────
router.delete('/:id', requireRole('manager'), async (req, res) => {
  const { id } = req.params;
  if (shouldUseMock()) return res.json({ success: true, source: 'mock' });
  try {
    const { query } = require('../db/pool');
    await query("UPDATE cdp_audiences SET status = 'archived', updated_at = NOW() WHERE id = $1", [id]);
    return res.json({ success: true });
  } catch (err) {
    return res.status(500).json({ error: { message: 'Failed to archive audience', detail: err.message } });
  }
});

module.exports = router;
