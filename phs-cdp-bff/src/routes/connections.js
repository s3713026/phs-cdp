/**
 * /api/connections — Connection Manager + Admin integrations, backed by WorkspaceConfigStore.
 */
const express = require('express');
const router  = express.Router();
const store   = require('../services/WorkspaceConfigStore');

const INFRASTRUCTURE_TYPES = new Set(['POSTGRES', 'MAUTIC']);
const isInfrastructure = (d) => INFRASTRUCTURE_TYPES.has(String(d.type).toUpperCase()) || store.isSystemDestination(d);

let _catalog = null;
async function getCatalog() {
  if (_catalog) return _catalog;
  try { _catalog = await require('../data/rsCatalogFetcher').getCatalog(); }
  catch { _catalog = { sources: [], destinations: [] }; }
  return _catalog;
}

function srcUI(s, links, cat) {
  const def = (cat.sources || []).find(x => [x.folder, x.id].map(v => String(v).toLowerCase()).includes(String(s.type).toLowerCase()));
  return {
    id: s.id, name: s.name, writeKey: s.writeKey, enabled: s.enabled,
    sourceDefinitionId: s.type, config: s.config || {},
    destinations: links.filter(l => l.sourceId === s.id).map(l => l.destinationId),
    _meta: def ? { name: def.name, category: def.category, logo: def.logo } : null,
  };
}
function destUI(d, links, cat) {
  const def = (cat.destinations || []).find(x => [x.folder, x.id].map(v => String(v).toLowerCase()).includes(String(d.type).toLowerCase()));
  return {
    id: d.id, name: d.name, enabled: d.enabled, destinationDefinitionId: d.type, config: d.config || {},
    sourceIds: links.filter(l => l.destinationId === d.id).map(l => l.sourceId),
    _infrastructure: isInfrastructure(d),
    _meta: def ? { name: def.name, category: def.category, logo: def.logo } : null,
  };
}
const fail = (res, e) => res.status(e.status || 500).json({ error: e.message });
const reload = () => ({ ok: true, note: 'Saved. The data platform applies configuration changes within a few seconds.' });

router.get('/', async (_req, res) => {
  try {
    const m = store.load(), cat = await getCatalog();
    res.json({ sources: m.sources.map(s => srcUI(s, m.links, cat)), destinations: m.destinations.map(d => destUI(d, m.links, cat)) });
  } catch (e) { fail(res, e); }
});

router.get('/sources', async (_req, res) => {
  try { const m = store.load(), cat = await getCatalog(); const data = m.sources.map(s => srcUI(s, m.links, cat)); res.json({ data, total: data.length }); }
  catch (e) { fail(res, e); }
});
router.get('/sources/:id', async (req, res) => {
  try { const m = store.load(), s = m.sources.find(x => x.id === req.params.id);
    if (!s) return res.status(404).json({ error: 'Source not found' }); res.json(srcUI(s, m.links, await getCatalog())); }
  catch (e) { fail(res, e); }
});
router.post('/sources', async (req, res) => {
  try { const { name, sourceDefinitionId, config, enabled } = req.body || {};
    const s = store.createSource({ name, type: sourceDefinitionId, config, enabled });
    res.status(201).json(srcUI(s, store.load().links, await getCatalog())); }
  catch (e) { fail(res, e); }
});
router.put('/sources/:id', async (req, res) => {
  try { const s = store.updateSource(req.params.id, req.body || {}); res.json(srcUI(s, store.load().links, await getCatalog())); }
  catch (e) { fail(res, e); }
});
router.delete('/sources/:id', (req, res) => { try { res.json(store.deleteSource(req.params.id)); } catch (e) { fail(res, e); } });

router.get('/destinations', async (req, res) => {
  try {
    const m = store.load(), cat = await getCatalog();
    let data = m.destinations.map(d => destUI(d, m.links, cat));
    if (req.query.category === 'activation')     data = data.filter(d => !d._infrastructure);
    if (req.query.category === 'infrastructure') data = data.filter(d => d._infrastructure);
    res.json({ data, total: data.length });
  } catch (e) { fail(res, e); }
});
router.get('/destinations/:id', async (req, res) => {
  try { const m = store.load(), d = m.destinations.find(x => x.id === req.params.id);
    if (!d) return res.status(404).json({ error: 'Destination not found' }); res.json(destUI(d, m.links, await getCatalog())); }
  catch (e) { fail(res, e); }
});
router.post('/destinations', async (req, res) => {
  try { const { name, destinationDefinitionId, config, enabled, sourceIds } = req.body || {};
    const d = store.createDestination({ name, type: destinationDefinitionId, config, enabled, sourceIds });
    const m = store.load(); res.status(201).json(destUI(m.destinations.find(x => x.id === d.id), m.links, await getCatalog())); }
  catch (e) { fail(res, e); }
});
router.put('/destinations/:id', async (req, res) => {
  try { store.updateDestination(req.params.id, req.body || {});
    const m = store.load(); res.json(destUI(m.destinations.find(x => x.id === req.params.id), m.links, await getCatalog())); }
  catch (e) { fail(res, e); }
});
router.delete('/destinations/:id', (req, res) => {
  try {
    const d = store.load().destinations.find(x => x.id === req.params.id);
    if (d && store.isSystemDestination(d)) return res.status(403).json({ error: 'This channel feeds the customer profile store and cannot be deleted.' });
    res.json(store.deleteDestination(req.params.id));
  } catch (e) { fail(res, e); }
});

router.post('/link', (req, res) => {
  try {
    const { sourceId, destinationId } = req.body || {};
    if (!sourceId || !destinationId) return res.status(400).json({ error: 'sourceId and destinationId required' });
    const d = store.load().destinations.find(x => x.id === destinationId);
    if (d && isInfrastructure(d)) return res.status(403).json({ error: 'Infrastructure destinations are managed by Technical Admin only.' });
    store.link(sourceId, destinationId);
    res.json({ ok: true, source: sourceId, destination: destinationId, rsReload: reload() });
  } catch (e) { fail(res, e); }
});
router.delete('/link', (req, res) => {
  try {
    const { sourceId, destinationId } = req.body || {};
    if (!sourceId || !destinationId) return res.status(400).json({ error: 'sourceId and destinationId required' });
    const d = store.load().destinations.find(x => x.id === destinationId);
    if (d && isInfrastructure(d)) return res.status(403).json({ error: 'Infrastructure destinations are managed by Technical Admin only.' });
    store.unlink(sourceId, destinationId);
    res.json({ ok: true, rsReload: reload() });
  } catch (e) { fail(res, e); }
});
router.post('/reload', (_req, res) => res.json(reload()));

module.exports = router;
