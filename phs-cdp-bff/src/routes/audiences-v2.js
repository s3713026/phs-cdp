/**
 * Audiences Route v2 — backed by CDP Profile Store (cdp-postgres)
 * Replaces routes/audiences.js
 * Mount at /api/audiences in server.js
 */
const express = require('express');
const router  = express.Router();
const { requireRole } = require('../middleware/rbac');
const AudienceService = require('../services/AudienceService');
const { AUDIENCES } = require('../mock/audiences');

const useMock = process.env.USE_MOCK === 'true';

// ─── GET /api/audiences ──────────────────────────────────────
router.get('/', requireRole('viewer'), async (req, res) => {
  if (!useMock) {
    try {
      const audiences = await AudienceService.listAudiences();
      if (audiences.length > 0) {
        return res.json({ data: audiences, total: audiences.length, source: 'cdp' });
      }
    } catch (dbErr) {
      console.warn('[audiences] CDP DB unavailable:', dbErr.message);
    }
  }
  // Mock fallback
  res.json({ data: AUDIENCES, total: AUDIENCES.length, source: 'mock' });
});

// ─── GET /api/audiences/:id ──────────────────────────────────
router.get('/:id', requireRole('viewer'), async (req, res) => {
  const { id } = req.params;
  if (!useMock) {
    try {
      const audience = await AudienceService.getAudience(id);
      if (audience) return res.json(audience);
    } catch (dbErr) {
      console.warn('[audiences/:id] CDP DB error:', dbErr.message);
    }
  }
  const audience = AUDIENCES.find(a => a.id === id);
  if (!audience) return res.status(404).json({ error: { message: 'Audience not found', code: 'NOT_FOUND' } });
  res.json(audience);
});

// ─── POST /api/audiences ─────────────────────────────────────
router.post('/', requireRole('operator'), async (req, res) => {
  const { name, description, type, conditions } = req.body;
  if (!name) return res.status(400).json({ error: { message: 'name is required', code: 'VALIDATION_ERROR' } });

  const createdBy = req.headers['x-phs-role'] || 'marketing_user';

  if (!useMock) {
    try {
      const audience = await AudienceService.createAudience(
        { name, description, type: type || 'dynamic', conditions: conditions || [] },
        createdBy,
      );
      return res.status(201).json(audience);
    } catch (err) {
      console.error('[audiences POST] Error:', err.message);
      return res.status(500).json({ error: { message: 'Failed to create audience', detail: err.message } });
    }
  }

  // Mock
  const newAudience = {
    id: `aud_${Date.now()}`,
    name, description, type: type || 'dynamic', conditions: conditions || [],
    status: 'draft', estimated_size: 0, created_at: new Date().toISOString(),
  };
  res.status(201).json(newAudience);
});

// ─── PUT /api/audiences/:id ──────────────────────────────────
router.put('/:id', requireRole('operator'), async (req, res) => {
  const { id } = req.params;
  const changedBy = req.headers['x-phs-role'] || 'marketing_user';

  if (!useMock) {
    try {
      const updated = await AudienceService.updateAudience(id, req.body, changedBy);
      return res.json(updated);
    } catch (err) {
      if (err.message === 'Audience not found') return res.status(404).json({ error: { message: 'Audience not found' } });
      console.error('[audiences PUT] Error:', err.message);
      return res.status(500).json({ error: { message: 'Failed to update audience', detail: err.message } });
    }
  }

  // Mock
  const audience = AUDIENCES.find(a => a.id === id);
  if (!audience) return res.status(404).json({ error: { message: 'Audience not found' } });
  Object.assign(audience, req.body, { updated_at: new Date().toISOString() });
  res.json(audience);
});

// ─── GET /api/audiences/:id/preview ─────────────────────────
router.get('/:id/preview', requireRole('viewer'), async (req, res) => {
  const { id } = req.params;
  if (!useMock) {
    try {
      const preview = await AudienceService.previewAudienceSize(id);
      if (preview) return res.json(preview);
    } catch (err) {
      console.warn('[audiences/:id/preview] Error:', err.message);
    }
  }
  res.json({ estimated_size: 0, mautic_synced: false });
});

// ─── DELETE /api/audiences/:id ───────────────────────────────
router.delete('/:id', requireRole('manager'), async (req, res) => {
  const { id } = req.params;
  if (!useMock) {
    try {
      const { query } = require('../db/pool');
      await query("UPDATE cdp_audiences SET status = 'archived', updated_at = NOW() WHERE id = $1", [id]);
      return res.json({ success: true });
    } catch (err) {
      console.error('[audiences DELETE] Error:', err.message);
      return res.status(500).json({ error: { message: 'Failed to archive audience' } });
    }
  }
  res.json({ success: true });
});

module.exports = router;
