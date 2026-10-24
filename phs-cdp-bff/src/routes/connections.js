/**
 * /api/connections — Full CRUD for RudderStack workspaceConfig.json
 *
 * GET    /api/connections                  → full config (sources + destinations)
 * GET    /api/connections/sources          → sources list
 * GET    /api/connections/sources/:id      → single source
 * POST   /api/connections/sources          → create source
 * PUT    /api/connections/sources/:id      → update source
 * DELETE /api/connections/sources/:id      → delete source
 *
 * GET    /api/connections/destinations     → destinations list
 *   ?category=activation                  → only non-infrastructure destinations (for Connection Manager)
 *   ?category=infrastructure              → only infrastructure destinations (for Admin)
 * GET    /api/connections/destinations/:id → single destination
 * POST   /api/connections/destinations     → create destination
 * PUT    /api/connections/destinations/:id → update destination
 * DELETE /api/connections/destinations/:id → delete destination
 *
 * POST   /api/connections/link             → link source ↔ destination
 * DELETE /api/connections/link             → unlink source ↔ destination
 * POST   /api/connections/reload           → signal RudderStack to reload config
 */
const express = require('express');
const router  = express.Router();
const fs      = require('fs');
const path    = require('path');
const http    = require('http');

// ─── Infrastructure destination types (hidden from Marketing UI) ──────────────
const INFRASTRUCTURE_TYPES = new Set(['POSTGRES', 'MAUTIC']);

function isInfrastructure(dest) {
  return (
    dest.category === 'infrastructure' ||
    INFRASTRUCTURE_TYPES.has(dest.destinationDefinitionId?.toUpperCase())
  );
}

// ─── Config file location ─────────────────────────────────────────────────────
const WS_CANDIDATES = [
  path.join(__dirname, '../../workspaceConfig.json'),
  path.join(__dirname, '../../../phs-cdp-ui/rudderstack-setup/workspaceConfig.json'),
];

function getConfigPath() {
  for (const p of WS_CANDIDATES) {
    if (fs.existsSync(p)) return p;
  }
  return WS_CANDIDATES[0]; // default write target
}

function readConfig() {
  const p = getConfigPath();
  try {
    return JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch (_) {
    return { sources: [], destinations: [] };
  }
}

function writeConfig(cfg) {
  const p = getConfigPath();
  fs.writeFileSync(p, JSON.stringify(cfg, null, 2));
  // Also sync to UI copy if different path
  for (const c of WS_CANDIDATES) {
    if (c !== p) {
      try { fs.writeFileSync(c, JSON.stringify(cfg, null, 2)); } catch (_) {}
    }
  }
}

// ─── RudderStack reload ───────────────────────────────────────────────────────
const RS_HOST = process.env.RUDDERSTACK_HOST || '100.117.24.87';
const RS_PORT = process.env.RUDDERSTACK_PORT || 8082;

function reloadRudderStack() {
  return new Promise((resolve) => {
    // Try /reload endpoint (custom or enterprise)
    const req = http.request(
      { hostname: RS_HOST, port: RS_PORT, path: '/reload', method: 'POST', timeout: 5000 },
      (res) => resolve({ ok: true, status: res.statusCode })
    );
    req.on('error', () => resolve({ ok: false, reason: 'reload endpoint unavailable — restart RudderStack manually' }));
    req.setTimeout(5000, () => { req.destroy(); resolve({ ok: false, reason: 'timeout' }); });
    req.end();
  });
}

// ─── ID generator ────────────────────────────────────────────────────────────
function uid(prefix) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

// ─── Enrichment: add catalog metadata to items ────────────────────────────────
// (logo, category etc. from rsCatalogFetcher — lazy loaded)
let _catalog = null;
async function getCatalog() {
  if (_catalog) return _catalog;
  try {
    const { getCatalog: fetch } = require('../data/rsCatalogFetcher');
    _catalog = await fetch();
  } catch (_) { _catalog = { sources: [], destinations: [] }; }
  return _catalog;
}

async function enrichSource(src) {
  const cat = await getCatalog();
  const def = cat.sources.find(s =>
    s.folder === src.sourceDefinitionId?.toLowerCase() ||
    s.id    === src.sourceDefinitionId?.toLowerCase()
  );
  return {
    ...src,
    _meta: def ? { name: def.name, category: def.category, logo: def.logo } : null,
  };
}

async function enrichDest(dest) {
  const cat = await getCatalog();
  const def = cat.destinations.find(d =>
    d.folder === dest.destinationDefinitionId?.toLowerCase() ||
    d.id     === dest.destinationDefinitionId?.toUpperCase()
  );
  return {
    ...dest,
    _infrastructure: isInfrastructure(dest),
    _meta: def ? { name: def.name, category: def.category, logo: def.logo } : null,
  };
}

// ─── GET /api/connections ─────────────────────────────────────────────────────
router.get('/', async (req, res) => {
  try {
    const cfg = readConfig();
    const [sources, destinations] = await Promise.all([
      Promise.all((cfg.sources || []).map(enrichSource)),
      Promise.all((cfg.destinations || []).map(enrichDest)),
    ]);
    res.json({ sources, destinations });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ─── Sources ──────────────────────────────────────────────────────────────────
router.get('/sources', async (req, res) => {
  try {
    const cfg = readConfig();
    const sources = await Promise.all((cfg.sources || []).map(enrichSource));
    res.json({ data: sources, total: sources.length });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.get('/sources/:id', async (req, res) => {
  try {
    const cfg = readConfig();
    const src = (cfg.sources || []).find(s => s.id === req.params.id);
    if (!src) return res.status(404).json({ error: 'Source not found' });
    res.json(await enrichSource(src));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/sources', async (req, res) => {
  try {
    const { name, sourceDefinitionId, config = {}, enabled = true } = req.body;
    if (!name || !sourceDefinitionId) return res.status(400).json({ error: 'name and sourceDefinitionId are required' });
    const cfg = readConfig();
    const newSrc = {
      id: uid('src'),
      name,
      writeKey: `phs_${sourceDefinitionId}_${Date.now().toString(36)}`,
      enabled,
      sourceDefinitionId,
      config,
      destinations: [],
    };
    cfg.sources = [...(cfg.sources || []), newSrc];
    writeConfig(cfg);
    res.status(201).json(await enrichSource(newSrc));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.put('/sources/:id', async (req, res) => {
  try {
    const cfg = readConfig();
    const idx = (cfg.sources || []).findIndex(s => s.id === req.params.id);
    if (idx === -1) return res.status(404).json({ error: 'Source not found' });
    const { id, writeKey, ...updates } = req.body; // protect immutable fields
    cfg.sources[idx] = { ...cfg.sources[idx], ...updates };
    writeConfig(cfg);
    res.json(await enrichSource(cfg.sources[idx]));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.delete('/sources/:id', async (req, res) => {
  try {
    const cfg = readConfig();
    const before = (cfg.sources || []).length;
    cfg.sources = (cfg.sources || []).filter(s => s.id !== req.params.id);
    if (cfg.sources.length === before) return res.status(404).json({ error: 'Source not found' });
    writeConfig(cfg);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ─── Destinations ─────────────────────────────────────────────────────────────
router.get('/destinations', async (req, res) => {
  try {
    const cfg = readConfig();
    let destinations = await Promise.all((cfg.destinations || []).map(enrichDest));

    // Filter by category if requested
    const cat = req.query.category;
    if (cat === 'activation') {
      // Only show activation channels (non-infrastructure) — for Connection Manager
      destinations = destinations.filter(d => !d._infrastructure);
    } else if (cat === 'infrastructure') {
      // Only show infrastructure destinations — for Admin view
      destinations = destinations.filter(d => d._infrastructure);
    }

    res.json({ data: destinations, total: destinations.length });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.get('/destinations/:id', async (req, res) => {
  try {
    const cfg = readConfig();
    const dest = (cfg.destinations || []).find(d => d.id === req.params.id);
    if (!dest) return res.status(404).json({ error: 'Destination not found' });
    res.json(await enrichDest(dest));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/destinations', async (req, res) => {
  try {
    const { name, destinationDefinitionId, config = {}, enabled = true } = req.body;
    if (!name || !destinationDefinitionId) return res.status(400).json({ error: 'name and destinationDefinitionId are required' });
    const cfg = readConfig();
    const newDest = { id: uid('dest'), name, destinationDefinitionId, enabled, config };
    cfg.destinations = [...(cfg.destinations || []), newDest];
    writeConfig(cfg);
    res.status(201).json(await enrichDest(newDest));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.put('/destinations/:id', async (req, res) => {
  try {
    const cfg = readConfig();
    const idx = (cfg.destinations || []).findIndex(d => d.id === req.params.id);
    if (idx === -1) return res.status(404).json({ error: 'Destination not found' });
    const { id, ...updates } = req.body;
    cfg.destinations[idx] = { ...cfg.destinations[idx], ...updates };
    writeConfig(cfg);
    res.json(await enrichDest(cfg.destinations[idx]));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.delete('/destinations/:id', async (req, res) => {
  try {
    const cfg = readConfig();
    const before = (cfg.destinations || []).length;
    cfg.destinations = (cfg.destinations || []).filter(d => d.id !== req.params.id);
    // Also remove from source destination lists
    cfg.sources = (cfg.sources || []).map(s => ({
      ...s,
      destinations: (s.destinations || []).filter(dId => dId !== req.params.id),
    }));
    if (cfg.destinations.length === before) return res.status(404).json({ error: 'Destination not found' });
    writeConfig(cfg);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ─── Link / Unlink Source ↔ Destination ──────────────────────────────────────
router.post('/link', async (req, res) => {
  try {
    const { sourceId, destinationId } = req.body;
    if (!sourceId || !destinationId) return res.status(400).json({ error: 'sourceId and destinationId required' });
    const cfg = readConfig();
    const src = (cfg.sources || []).find(s => s.id === sourceId);
    if (!src) return res.status(404).json({ error: 'Source not found' });
    const dest = (cfg.destinations || []).find(d => d.id === destinationId);
    if (!dest) return res.status(404).json({ error: 'Destination not found' });
    // Block linking infrastructure destinations via the Marketing UI
    if (isInfrastructure(dest)) {
      return res.status(403).json({ error: 'Infrastructure destinations are managed by Technical Admin only.' });
    }
    if (!src.destinations) src.destinations = [];
    if (!src.destinations.includes(destinationId)) src.destinations.push(destinationId);
    writeConfig(cfg);
    // Auto-reload RudderStack so the new connection takes effect immediately
    const rsReload = await reloadRudderStack();
    res.json({ ok: true, source: src.id, destination: destinationId, rsReload });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.delete('/link', async (req, res) => {
  try {
    const { sourceId, destinationId } = req.body;
    if (!sourceId || !destinationId) return res.status(400).json({ error: 'sourceId and destinationId required' });
    const cfg = readConfig();
    const src = (cfg.sources || []).find(s => s.id === sourceId);
    if (!src) return res.status(404).json({ error: 'Source not found' });
    const dest = (cfg.destinations || []).find(d => d.id === destinationId);
    // Block unlinking infrastructure destinations via the Marketing UI
    if (dest && isInfrastructure(dest)) {
      return res.status(403).json({ error: 'Infrastructure destinations are managed by Technical Admin only.' });
    }
    src.destinations = (src.destinations || []).filter(id => id !== destinationId);
    writeConfig(cfg);
    // Auto-reload RudderStack so the disconnected source stops sending to this destination
    const rsReload = await reloadRudderStack();
    res.json({ ok: true, rsReload });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ─── Reload RudderStack ───────────────────────────────────────────────────────
router.post('/reload', async (req, res) => {
  const result = await reloadRudderStack();
  res.json(result);
});

module.exports = router;
