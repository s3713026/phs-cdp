const express = require('express');
const router  = express.Router();
const RudderStackAdapter = require('../adapters/RudderStackAdapter');
const { SOURCES: MOCK_SOURCES } = require('../mock/sources');
const { requireRole } = require('../middleware/rbac');

// Helper — map writeKey → source type label
const SOURCE_TYPE_LABEL = {
  javascript: 'Web (JavaScript)',
  android:    'Mobile (Android)',
  ios:        'Mobile (iOS)',
  node:       'Server (Node.js)',
  python:     'Server (Python)',
};

// Transform raw workspaceConfig source → UI-friendly shape
function transformSource(raw) {
  // workspaceConfig stores destinations as an array of destinationId strings
  const rawDests = raw.destinations || [];
  const destIds  = rawDests.map((d) => (typeof d === 'string' ? d : d?.id)).filter(Boolean);
  return {
    id:               raw.id,
    name:             raw.name,
    writeKey:         raw.writeKey,
    type:             SOURCE_TYPE_LABEL[(raw.sourceDefinitionId || '').toLowerCase()] || raw.sourceDefinitionId,
    typeId:           raw.sourceDefinitionId,
    status:           raw.enabled ? 'connected' : 'disconnected',
    enabled:          raw.enabled,
    destinationCount: destIds.length,   // count for table display
    destinations:     destIds,           // IDs so UI can build connection-map links
  };
}

router.get('/', requireRole('viewer'), (_req, res) => {
  if (process.env.USE_MOCK === 'true') {
    return res.json({ data: MOCK_SOURCES, total: MOCK_SOURCES.length });
  }

  const rs      = new RudderStackAdapter();
  const rawList = rs.getSources();

  if (!rawList.length) {
    return res.json({ data: MOCK_SOURCES, total: MOCK_SOURCES.length, _fallback: 'mock' });
  }

  const data = rawList.map(transformSource);
  res.json({ data, total: data.length });
});

router.get('/:id', requireRole('viewer'), (req, res) => {
  if (process.env.USE_MOCK === 'true') {
    const s = MOCK_SOURCES.find(x => x.id === req.params.id);
    if (!s) return res.status(404).json({ error: { message: 'Source not found', code: 'NOT_FOUND' } });
    return res.json(s);
  }

  const rs      = new RudderStackAdapter();
  const rawList = rs.getSources();
  const raw     = rawList.find(x => x.id === req.params.id);

  if (!raw) return res.status(404).json({ error: { message: 'Source not found', code: 'NOT_FOUND' } });
  res.json(transformSource(raw));
});

// ─── WRITE operations ─────────────────────────────────────────────────────────
const fs   = require('fs');
const path = require('path');
const WS_CANDIDATES = [
  path.join(__dirname, '../../workspaceConfig.json'),
  path.join(__dirname, '../../../phs-cdp-ui/rudderstack-setup/workspaceConfig.json'),
];
function getConfigPath() {
  for (const p of WS_CANDIDATES) if (fs.existsSync(p)) return p;
  return WS_CANDIDATES[0];
}
function readCfg() {
  try { return JSON.parse(fs.readFileSync(getConfigPath(), 'utf8')); } catch { return { sources:[], destinations:[] }; }
}
// ─── RudderStack reload helper ─────────────────────────────────────────────────
const http = require('http');
function reloadRudderStack() {
  const RS_HOST = process.env.RS_HOST || '100.117.24.87';
  const RS_PORT = parseInt(process.env.RS_CONTROL_PORT || '8082');
  const RS_PASS = process.env.RUDDER_ADMIN_PASSWORD || 'PHS@Rudder2024!';
  const auth    = Buffer.from(`admin:${RS_PASS}`).toString('base64');
  const endpoints = ['/backend/config/refreshConfig', '/adminHandler'];
  function tryNext(i) {
    if (i >= endpoints.length) return;
    const opts = {
      hostname: RS_HOST, port: RS_PORT, path: endpoints[i], method: 'POST',
      headers: { Authorization: `Basic ${auth}`, 'Content-Type': 'application/json' },
    };
    const req = http.request(opts, r => {
      if (r.statusCode < 300) console.log(`[RS] reload OK via ${endpoints[i]} (${r.statusCode})`);
      else tryNext(i + 1);
    });
    req.on('error', () => tryNext(i + 1));
    req.end(JSON.stringify({ arg: 'reload-features' }));
  }
  tryNext(0);
}

function writeCfg(cfg) {
  const p = getConfigPath();
  fs.writeFileSync(p, JSON.stringify(cfg, null, 2));
  WS_CANDIDATES.filter(c => c !== p).forEach(c => { try { fs.writeFileSync(c, JSON.stringify(cfg, null, 2)); } catch {} });
}
function uid(pfx) { return `${pfx}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2,6)}`; }

// POST /sources — create new source
router.post('/', requireRole('operator'), (req, res) => {
  try {
    const { name, sourceDefinitionId, config = {}, enabled = true } = req.body;
    if (!name || !sourceDefinitionId) return res.status(400).json({ error: { message: 'name and sourceDefinitionId required' } });
    const cfg = readCfg();
    const src = {
      id: uid('src'), name,
      writeKey: `phs_${sourceDefinitionId}_${Date.now().toString(36)}`,
      enabled, sourceDefinitionId, config, destinations: [],
    };
    cfg.sources.push(src);
    writeCfg(cfg);
    res.status(201).json(transformSource(src));
  } catch (e) { res.status(500).json({ error: { message: e.message } }); }
});

// PUT /sources/:id — update source
router.put('/:id', requireRole('operator'), (req, res) => {
  try {
    const cfg = readCfg();
    const idx = cfg.sources.findIndex(s => s.id === req.params.id);
    if (idx === -1) return res.status(404).json({ error: { message: 'Source not found' } });
    const { id, writeKey, ...updates } = req.body;
    cfg.sources[idx] = { ...cfg.sources[idx], ...updates };
    writeCfg(cfg);
    reloadRudderStack();
    res.json(transformSource(cfg.sources[idx]));
  } catch (e) { res.status(500).json({ error: { message: e.message } }); }
});

// DELETE /sources/:id — delete source
router.delete('/:id', requireRole('operator'), (req, res) => {
  try {
    const cfg = readCfg();
    const before = cfg.sources.length;
    cfg.sources = cfg.sources.filter(s => s.id !== req.params.id);
    if (cfg.sources.length === before) return res.status(404).json({ error: { message: 'Source not found' } });
    writeCfg(cfg);
    reloadRudderStack();
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: { message: e.message } }); }
});

// PATCH /sources/:id — toggle enabled
router.patch('/:id', requireRole('operator'), (req, res) => {
  try {
    const cfg = readCfg();
    const src = cfg.sources.find(s => s.id === req.params.id);
    if (!src) return res.status(404).json({ error: { message: 'Source not found' } });
    Object.assign(src, req.body);
    writeCfg(cfg);
    res.json(transformSource(src));
  } catch (e) { res.status(500).json({ error: { message: e.message } }); }
});

module.exports = router;
