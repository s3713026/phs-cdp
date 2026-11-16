const express = require('express');
const router  = express.Router();
const store   = require('../services/WorkspaceConfigStore');
const { requireRole } = require('../middleware/rbac');

const DEST_TYPE_LABEL = {
  POSTGRES: 'PostgreSQL (Data Warehouse)', MAUTIC: 'Mautic (Marketing Automation)',
  BIGQUERY: 'BigQuery', REDSHIFT: 'Redshift', SNOWFLAKE: 'Snowflake',
  AMPLITUDE: 'Amplitude', AM: 'Amplitude', MIXPANEL: 'Mixpanel', MP: 'Mixpanel', WEBHOOK: 'Webhook',
};

function toUI(d, links) {
  const sourceIds = links.filter(l => l.destinationId === d.id).map(l => l.sourceId);
  return {
    id: d.id, name: d.name,
    type: DEST_TYPE_LABEL[d.type] || d.displayType || d.type,
    typeId: d.type, destinationDefinitionId: d.type,
    status: d.enabled ? 'connected' : 'disconnected', enabled: d.enabled,
    system: store.isSystemDestination(d),
    usedBySources: sourceIds.length > 0, sourceIds,
    config: d.config || {}, connection: d.config || {},
    advancedConfig: d.advancedConfig || {},
    deliveryConfig: d.deliveryConfig || { mode: 'Stream', retries: 3, timeout: 30 },
    consentConfig:  d.consentConfig  || { required: false, purposes: [] },
    dataSelection:  d.dataSelection  || {},
  };
}
const fail = (res, e) => res.status(e.status || 500).json({ error: { message: e.message } });

router.get('/', requireRole('viewer'), (_req, res) => {
  try {
    const m = store.load();
    const data = m.destinations.map(d => toUI(d, m.links));
    res.json({ data, total: data.length, source: data.length ? 'workspaceConfig' : 'empty' });
  } catch (e) { fail(res, e); }
});

router.get('/:id', requireRole('viewer'), (req, res) => {
  try {
    const m = store.load();
    const d = m.destinations.find(x => x.id === req.params.id);
    if (!d) return res.status(404).json({ error: { message: 'Destination not found', code: 'NOT_FOUND' } });
    res.json(toUI(d, m.links));
  } catch (e) { fail(res, e); }
});

router.post('/', requireRole('operator'), (req, res) => {
  try {
    const { name, destinationDefinitionId, config, enabled, sourceIds } = req.body || {};
    const d = store.createDestination({ name, type: destinationDefinitionId, config, enabled, sourceIds });
    const m = store.load();
    res.status(201).json(toUI(m.destinations.find(x => x.id === d.id), m.links));
  } catch (e) { fail(res, e); }
});

function update(req, res) {
  try {
    const d = store.updateDestination(req.params.id, req.body || {});
    const m = store.load();
    res.json(toUI(m.destinations.find(x => x.id === d.id), m.links));
  } catch (e) { fail(res, e); }
}
router.put('/:id',   requireRole('operator'), update);
router.patch('/:id', requireRole('operator'), update);

router.delete('/:id', requireRole('operator'), (req, res) => {
  try {
    const m = store.load();
    const d = m.destinations.find(x => x.id === req.params.id);
    if (d && store.isSystemDestination(d)) {
      return res.status(403).json({ error: { message: 'This channel delivers events into the customer profile store and cannot be deleted.' } });
    }
    res.json(store.deleteDestination(req.params.id));
  } catch (e) { fail(res, e); }
});

module.exports = router;
