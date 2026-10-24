const express = require('express');
const router  = express.Router();
const fs      = require('fs');
const path    = require('path');
const { requireRole } = require('../middleware/rbac');

const DEST_TYPE_LABEL = {
  POSTGRES:    'PostgreSQL (Data Warehouse)',
  MAUTIC:      'Mautic (Marketing Automation)',
  BIGQUERY:    'BigQuery',
  REDSHIFT:    'Redshift',
  SNOWFLAKE:   'Snowflake',
  AMPLITUDE:   'Amplitude',
  MIXPANEL:    'Mixpanel',
  WEBHOOK:     'Webhook',
};

function loadDestinations() {
  const candidates = [
    process.env.WORKSPACE_CONFIG_PATH,
    path.join(__dirname, '../../workspaceConfig.json'),
    path.join(__dirname, '../../../phs-cdp-ui/rudderstack-setup/workspaceConfig.json'),
  ].filter(Boolean);

  for (const p of candidates) {
    if (fs.existsSync(p)) {
      try {
        const raw = JSON.parse(fs.readFileSync(p, 'utf8'));
        const dests = raw.destinations || [];
        // Also collect destinations referenced from sources
        const sourceDestIds = new Set(
          (raw.sources || []).flatMap(s => s.destinations || [])
        );
        return dests.map(d => ({
          id:          d.id,
          name:        d.name,
          type:        DEST_TYPE_LABEL[d.destinationDefinitionId] || d.destinationDefinitionId,
          typeId:      d.destinationDefinitionId,
          status:      d.enabled ? 'connected' : 'disconnected',
          enabled:     d.enabled,
          usedBySources: sourceDestIds.has(d.id),
          config: d.config || {},
          connection: d.config || {},
          // Persisted UI-layer config (written back by the custom UI)
          advancedConfig:  d.advancedConfig  || {},
          deliveryConfig:  d.deliveryConfig  || { mode: 'Stream', retries: 3, timeout: 30 },
          consentConfig:   d.consentConfig   || { required: false, purposes: [] },
          dataSelection:   d.dataSelection   || {},
        }));
      } catch {
        // try next
      }
    }
  }
  return [];
}

router.get('/', requireRole('viewer'), (_req, res) => {
  const data = loadDestinations();
  res.json({ data, total: data.length, source: data.length ? 'workspaceConfig' : 'empty' });
});

router.get('/:id', requireRole('viewer'), (req, res) => {
  const data = loadDestinations();
  const d = data.find(x => x.id === req.params.id);
  if (!d) return res.status(404).json({ error: { message: 'Destination not found', code: 'NOT_FOUND' } });
  res.json(d);
});


// ─── RudderStack reload helper ────────────────────────────────────────────────
const http = require('http');
function reloadRudderStack() {
  const RS_HOST = process.env.RS_HOST || '100.117.24.87';
  const RS_PORT = parseInt(process.env.RS_CONTROL_PORT || '8082');
  const RS_PASS = process.env.RUDDER_ADMIN_PASSWORD || 'PHS@Rudder2024!';
  const auth    = Buffer.from(`admin:${RS_PASS}`).toString('base64');
  // RS self-hosted config-from-file: try known admin reload endpoints
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

// ─── WRITE operations ─────────────────────────────────────────────────────────
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
function writeCfg(cfg) {
  const p = getConfigPath();
  fs.writeFileSync(p, JSON.stringify(cfg, null, 2));
  WS_CANDIDATES.filter(c => c !== p).forEach(c => { try { fs.writeFileSync(c, JSON.stringify(cfg, null, 2)); } catch {} });
}
function uid(pfx) { return `${pfx}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2,6)}`; }
function toUI(d) {
  const data = loadDestinations();
  return data.find(x => x.id === d.id) || d;
}

// POST /destinations — create
router.post('/', requireRole('operator'), (req, res) => {
  try {
    const { name, destinationDefinitionId, config = {}, enabled = true, sourceIds = [] } = req.body;
    if (!name || !destinationDefinitionId) return res.status(400).json({ error: { message: 'name and destinationDefinitionId required' } });
    const cfg = readCfg();
    const dest = { id: uid('dest'), name, destinationDefinitionId, enabled, config };
    cfg.destinations.push(dest);

    // Link source → destination for each provided sourceId
    if (Array.isArray(sourceIds) && sourceIds.length > 0) {
      if (!Array.isArray(cfg.destTransformations)) cfg.destTransformations = [];
      sourceIds.forEach(srcId => {
        const src = (cfg.sources || []).find(s => s.id === srcId);
        if (src) {
          if (!Array.isArray(src.destinations)) src.destinations = [];
          if (!src.destinations.find(d => d.destinationId === dest.id)) {
            src.destinations.push({ destinationId: dest.id });
          }
        }
      });
    }

    writeCfg(cfg);
    reloadRudderStack();
    res.status(201).json(toUI(dest));
  } catch (e) { res.status(500).json({ error: { message: e.message } }); }
});

// PUT /destinations/:id — full update
router.put('/:id', requireRole('operator'), (req, res) => {
  try {
    const cfg = readCfg();
    const idx = cfg.destinations.findIndex(d => d.id === req.params.id);
    if (idx === -1) return res.status(404).json({ error: { message: 'Destination not found' } });
    const { id, config, advancedConfig, deliveryConfig, consentConfig, dataSelection, ...rest } = req.body;
    const existing = cfg.destinations[idx];
    cfg.destinations[idx] = {
      ...existing,
      ...rest,
      // Map UI "config" (connection config) back to rudderstack-style config field
      ...(config !== undefined ? { config } : {}),
      // Persist advanced/delivery/consent/dataSelection as-is (stored in workspaceConfig)
      ...(advancedConfig  !== undefined ? { advancedConfig }  : {}),
      ...(deliveryConfig  !== undefined ? { deliveryConfig }  : {}),
      ...(consentConfig   !== undefined ? { consentConfig }   : {}),
      ...(dataSelection   !== undefined ? { dataSelection }   : {}),
    };
    // Flatten advancedConfig fields into RS config so RudderStack reads them
    if (advancedConfig && typeof advancedConfig === 'object') {
      const RS_ADV_KEYS = [
        'requestTimeout','maxAttempts','noOfWorkers','maxBatchSize',
        'uploadFreq','warehouseSyncFreq','enableDedup','skipTracksTable','skipUsersTable'
      ];
      cfg.destinations[idx].config = cfg.destinations[idx].config || {};
      RS_ADV_KEYS.forEach(k => {
        if (advancedConfig[k] !== undefined) cfg.destinations[idx].config[k] = advancedConfig[k];
      });
    }
    writeCfg(cfg);
    reloadRudderStack();
    res.json(toUI(cfg.destinations[idx]));
  } catch (e) { res.status(500).json({ error: { message: e.message } }); }
});

// PATCH /destinations/:id — partial update (toggle enabled etc.)
router.patch('/:id', requireRole('operator'), (req, res) => {
  try {
    const cfg = readCfg();
    const dest = cfg.destinations.find(d => d.id === req.params.id);
    if (!dest) return res.status(404).json({ error: { message: 'Destination not found' } });
    Object.assign(dest, req.body);
    writeCfg(cfg);
    res.json(toUI(dest));
  } catch (e) { res.status(500).json({ error: { message: e.message } }); }
});

// DELETE /destinations/:id — delete
router.delete('/:id', requireRole('operator'), (req, res) => {
  try {
    const cfg = readCfg();
    const before = cfg.destinations.length;
    cfg.destinations = cfg.destinations.filter(d => d.id !== req.params.id);
    // Remove from source destination lists too
    cfg.sources = (cfg.sources||[]).map(s => ({
      ...s, destinations: (s.destinations||[]).filter(id => id !== req.params.id)
    }));
    if (cfg.destinations.length === before) return res.status(404).json({ error: { message: 'Destination not found' } });
    writeCfg(cfg);
    reloadRudderStack();
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: { message: e.message } }); }
});

module.exports = router;
