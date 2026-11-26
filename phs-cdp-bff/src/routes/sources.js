const express = require('express');
const router  = express.Router();
const store   = require('../services/WorkspaceConfigStore');
const { SOURCES: MOCK_SOURCES } = require('../mock/sources');
const { requireRole } = require('../middleware/rbac');

const SOURCE_TYPE_LABEL = {
  javascript: 'Web (JavaScript)', android: 'Mobile (Android)', ios: 'Mobile (iOS)',
  node: 'Server (Node.js)', python: 'Server (Python)',
  webhook: 'Webhook',
};

function toUI(s, links) {
  const destinations = links.filter(l => l.sourceId === s.id).map(l => l.destinationId);
  return {
    id: s.id, name: s.name, writeKey: s.writeKey,
    type: SOURCE_TYPE_LABEL[String(s.type).toLowerCase()] || s.type,
    typeId: s.type, sourceDefinitionId: s.type,
    status: s.enabled ? 'connected' : 'disconnected', enabled: s.enabled,
    config: s.config || {},
    destinationCount: destinations.length, destinations,
  };
}
const fail = (res, e) => res.status(e.status || 500).json({ error: { message: e.message } });

router.get('/', requireRole('viewer'), (_req, res) => {
  if (process.env.USE_MOCK === 'true') return res.json({ data: MOCK_SOURCES, total: MOCK_SOURCES.length });
  try {
    const m = store.load();
    const data = m.sources.map(s => toUI(s, m.links));
    res.json(data.length ? { data, total: data.length } : { data: [], total: 0, _dataStatus: 'not_connected' });
  } catch (e) { fail(res, e); }
});

router.get('/:id', requireRole('viewer'), (req, res) => {
  if (process.env.USE_MOCK === 'true') {
    const s = MOCK_SOURCES.find(x => x.id === req.params.id);
    return s ? res.json(s) : res.status(404).json({ error: { message: 'Source not found', code: 'NOT_FOUND' } });
  }
  try {
    const m = store.load();
    const s = m.sources.find(x => x.id === req.params.id);
    if (!s) return res.status(404).json({ error: { message: 'Source not found', code: 'NOT_FOUND' } });
    res.json(toUI(s, m.links));
  } catch (e) { fail(res, e); }
});

router.post('/', requireRole('operator'), (req, res) => {
  try {
    const { name, sourceDefinitionId, config, enabled, category } = req.body || {};
    const s = store.createSource({ name, type: sourceDefinitionId, config, enabled, category });
    res.status(201).json(toUI(s, store.load().links));
  } catch (e) { fail(res, e); }
});

router.put('/:id', requireRole('operator'), (req, res) => {
  try {
    const s = store.updateSource(req.params.id, req.body || {});
    res.json(toUI(s, store.load().links));
  } catch (e) { fail(res, e); }
});

router.patch('/:id', requireRole('operator'), (req, res) => {
  try {
    const s = store.updateSource(req.params.id, req.body || {});
    res.json(toUI(s, store.load().links));
  } catch (e) { fail(res, e); }
});

router.delete('/:id', requireRole('operator'), (req, res) => {
  try { res.json(store.deleteSource(req.params.id)); } catch (e) { fail(res, e); }
});

module.exports = router;
