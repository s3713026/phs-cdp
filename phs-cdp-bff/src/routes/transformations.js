/**
 * /api/transformations — Transformation CRUD backed by workspaceConfig.json
 *
 * RudderStack self-hosted config-from-file stores transformations as:
 * {
 *   "transformations": [
 *     { "id": "...", "name": "...", "code": "...", "codeVersion": "2", "versionId": "..." }
 *   ],
 *   "destTransformations": [
 *     { "destinationId": "...", "transformationId": "..." }
 *   ]
 * }
 */
const express = require('express');
const router  = express.Router();
const fs      = require('fs');
const path    = require('path');
const { requireRole } = require('../middleware/rbac');

const WS_CANDIDATES = [
  path.join(__dirname, '../../workspaceConfig.json'),
  path.join(__dirname, '../../../phs-cdp-ui/rudderstack-setup/workspaceConfig.json'),
];
function getConfigPath() {
  for (const p of WS_CANDIDATES) if (fs.existsSync(p)) return p;
  return WS_CANDIDATES[0];
}
function readCfg() {
  try { return JSON.parse(fs.readFileSync(getConfigPath(), 'utf8')); }
  catch { return { sources: [], destinations: [], transformations: [], destTransformations: [] }; }
}
function writeCfg(cfg) {
  const p = getConfigPath();
  fs.writeFileSync(p, JSON.stringify(cfg, null, 2));
  WS_CANDIDATES.filter(c => c !== p).forEach(c => {
    try { fs.writeFileSync(c, JSON.stringify(cfg, null, 2)); } catch {}
  });
}
function uid(pfx) {
  return `${pfx}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

// Transform raw workspaceConfig transformation → UI shape
function toUI(t, destTransformations, destinations) {
  const linkedDestIds = (destTransformations || [])
    .filter(dt => dt.transformationId === t.id)
    .map(dt => dt.destinationId);
  const linkedDestNames = linkedDestIds.map(id => {
    const d = (destinations || []).find(x => x.id === id);
    return d ? d.name : id;
  });
  return {
    id:            t.id,
    name:          t.name,
    code:          t.code || '',
    codeVersion:   t.codeVersion || '2',
    versionId:     t.versionId || t.id,
    description:   t.description || '',
    language:      'JavaScript',
    status:        t.status || 'Published',
    version:       t.version || 'v1',
    lastModified:  t.updatedAt || t.createdAt || new Date().toISOString(),
    createdAt:     t.createdAt || new Date().toISOString(),
    owner:         t.createdBy || 'System',
    destinations:  linkedDestNames,
    destinationIds: linkedDestIds,
  };
}

// GET /transformations
router.get('/', requireRole('viewer'), (_req, res) => {
  const cfg  = readCfg();
  const trfs = (cfg.transformations || []).map(t =>
    toUI(t, cfg.destTransformations, cfg.destinations)
  );
  res.json({ data: trfs, total: trfs.length });
});

// GET /transformations/:id
router.get('/:id', requireRole('viewer'), (req, res) => {
  const cfg = readCfg();
  const t   = (cfg.transformations || []).find(x => x.id === req.params.id);
  if (!t) return res.status(404).json({ error: { message: 'Transformation not found' } });
  res.json(toUI(t, cfg.destTransformations, cfg.destinations));
});

// POST /transformations — create
router.post('/', requireRole('operator'), (req, res) => {
  try {
    const { name, code = 'export default function transform(event, metadata) {\n  return event;\n}',
            description = '', destinationIds = [] } = req.body;
    if (!name) return res.status(400).json({ error: { message: 'name is required' } });

    const cfg = readCfg();
    const trf = {
      id:          uid('trf'),
      name,
      code,
      codeVersion: '2',
      versionId:   uid('ver'),
      description,
      status:      'Published',
      version:     'v1',
      createdAt:   new Date().toISOString(),
      updatedAt:   new Date().toISOString(),
    };
    cfg.transformations = cfg.transformations || [];
    cfg.destTransformations = cfg.destTransformations || [];
    cfg.transformations.push(trf);

    // Link to destinations
    for (const destId of destinationIds) {
      if ((cfg.destinations || []).some(d => d.id === destId)) {
        cfg.destTransformations.push({ destinationId: destId, transformationId: trf.id });
      }
    }
    writeCfg(cfg);
    res.status(201).json(toUI(trf, cfg.destTransformations, cfg.destinations));
  } catch (e) {
    res.status(500).json({ error: { message: e.message } });
  }
});

// PUT /transformations/:id — full update (save code)
router.put('/:id', requireRole('operator'), (req, res) => {
  try {
    const cfg = readCfg();
    const idx = (cfg.transformations || []).findIndex(t => t.id === req.params.id);
    if (idx === -1) return res.status(404).json({ error: { message: 'Transformation not found' } });

    const { name, code, description, destinationIds, status } = req.body;
    const existing = cfg.transformations[idx];
    cfg.transformations[idx] = {
      ...existing,
      ...(name        !== undefined ? { name }        : {}),
      ...(code        !== undefined ? { code }        : {}),
      ...(description !== undefined ? { description } : {}),
      ...(status      !== undefined ? { status }      : {}),
      updatedAt: new Date().toISOString(),
      versionId: uid('ver'), // new version on each save
    };

    // Update destination links
    if (Array.isArray(destinationIds)) {
      cfg.destTransformations = (cfg.destTransformations || [])
        .filter(dt => dt.transformationId !== req.params.id);
      for (const destId of destinationIds) {
        cfg.destTransformations.push({ destinationId: destId, transformationId: req.params.id });
      }
    }
    writeCfg(cfg);
    res.json(toUI(cfg.transformations[idx], cfg.destTransformations, cfg.destinations));
  } catch (e) {
    res.status(500).json({ error: { message: e.message } });
  }
});

// DELETE /transformations/:id
router.delete('/:id', requireRole('operator'), (req, res) => {
  try {
    const cfg = readCfg();
    const before = (cfg.transformations || []).length;
    cfg.transformations = (cfg.transformations || []).filter(t => t.id !== req.params.id);
    if (cfg.transformations.length === before)
      return res.status(404).json({ error: { message: 'Transformation not found' } });
    // Remove destination links
    cfg.destTransformations = (cfg.destTransformations || [])
      .filter(dt => dt.transformationId !== req.params.id);
    writeCfg(cfg);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: { message: e.message } });
  }
});

// POST /transformations/:id/run-test — test transformation with sample event
router.post('/:id/run-test', requireRole('operator'), (req, res) => {
  try {
    const cfg = readCfg();
    const t   = (cfg.transformations || []).find(x => x.id === req.params.id);
    if (!t) return res.status(404).json({ error: { message: 'Transformation not found' } });
    const testEvent = req.body.event || { type: 'track', event: 'Test Event', properties: {} };
    // In self-hosted mode we can't actually run JS server-side without a sandbox.
    // Return the code echo + sample output so the UI shows something useful.
    res.json({
      success: true,
      message: 'Test run simulated (code execution requires RudderStack sandbox)',
      input:   testEvent,
      output:  testEvent, // identity transform — RS would run the actual code
      code:    t.code,
    });
  } catch (e) {
    res.status(500).json({ error: { message: e.message } });
  }
});

module.exports = router;
