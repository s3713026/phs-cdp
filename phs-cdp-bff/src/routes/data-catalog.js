/**
 * PHS CDP — Data Catalog API Routes
 * Supports: read, create, update, delete events/attributes/sources
 * Validation: POST /api/data-catalog/validate checks an incoming event
 * Block: status = "blocked" means deprecated/ignored, not used in audience/campaign
 */
const express = require('express');
const router = express.Router();
const { requireRole } = require('../middleware/rbac');

// ── In-memory store (seeded from dataCatalog.js) ─────────────────────────────
// In production this would be persisted to cdp-postgres.
const seed = require('../data/dataCatalog');
const store = {
  events:           seed.events.map(e => ({ ...e })),
  profileAttributes: seed.profileAttributes.map(a => ({ ...a })),
  sources:          seed.sources.map(s => ({ ...s })),
  version:          seed.version,
  lastUpdated:      seed.lastUpdated,
};

function now() { return new Date().toISOString(); }
function uid(prefix) { return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2,7)}`; }

// ── Summary ───────────────────────────────────────────────────────────────────
router.get('/', requireRole('viewer'), (req, res) => {
  const domains = [...new Set(store.events.map(e => e.domain))];
  res.json({
    version: store.version,
    lastUpdated: store.lastUpdated,
    summary: {
      totalEvents:     store.events.length,
      totalAttributes: store.profileAttributes.length,
      totalSources:    store.sources.length,
      totalFields:     store.events.reduce((s, e) => s + e.properties.length, 0) + store.profileAttributes.length,
      blockedEvents:   store.events.filter(e => e.status === 'blocked').length,
      domains,
    }
  });
});

// ── EVENTS ────────────────────────────────────────────────────────────────────
router.get('/events', requireRole('viewer'), (req, res) => {
  const { domain, status, platform } = req.query;
  let events = store.events;
  if (domain)   events = events.filter(e => e.domain.toLowerCase() === domain.toLowerCase());
  if (status)   events = events.filter(e => e.status === status);
  if (platform) events = events.filter(e => e.platforms.includes(platform));
  res.json({
    data: events,
    total: events.length,
    domains: [...new Set(store.events.map(e => e.domain))],
  });
});

router.get('/events/:id', requireRole('viewer'), (req, res) => {
  const event = store.events.find(e => e.id === req.params.id);
  if (!event) return res.status(404).json({ error: 'Event not found' });
  res.json(event);
});

// CREATE event — Admin only
router.post('/events', requireRole('admin'), (req, res) => {
  const { name, domain, description, platforms, lifecycleStage, properties, validationRules } = req.body;
  if (!name || !domain) return res.status(400).json({ error: 'name and domain are required' });
  const event = {
    id: uid('evt'),
    name, domain,
    description: description || '',
    status: 'active',
    platforms: platforms || [],
    lifecycleStage: lifecycleStage || null,
    properties: properties || [],
    validationRules: validationRules || [],
    createdAt: now(),
    updatedAt: now(),
  };
  store.events.push(event);
  store.lastUpdated = now();
  res.status(201).json(event);
});

// UPDATE event — Admin only
router.put('/events/:id', requireRole('admin'), (req, res) => {
  const idx = store.events.findIndex(e => e.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Event not found' });
  const allowed = ['name','domain','description','status','platforms','lifecycleStage','properties','validationRules'];
  allowed.forEach(k => { if (req.body[k] !== undefined) store.events[idx][k] = req.body[k]; });
  store.events[idx].updatedAt = now();
  store.lastUpdated = now();
  res.json(store.events[idx]);
});

// BLOCK / UNBLOCK shortcut — Admin only
router.patch('/events/:id/status', requireRole('admin'), (req, res) => {
  const { status } = req.body; // active | blocked | deprecated
  if (!['active','blocked','deprecated'].includes(status))
    return res.status(400).json({ error: 'status must be active, blocked, or deprecated' });
  const idx = store.events.findIndex(e => e.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Event not found' });
  store.events[idx].status = status;
  store.events[idx].updatedAt = now();
  store.lastUpdated = now();
  res.json({ id: req.params.id, status });
});

// DELETE event — Admin only
router.delete('/events/:id', requireRole('admin'), (req, res) => {
  const idx = store.events.findIndex(e => e.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Event not found' });
  store.events.splice(idx, 1);
  store.lastUpdated = now();
  res.json({ deleted: req.params.id });
});

// ── ATTRIBUTES ────────────────────────────────────────────────────────────────
router.get('/attributes', requireRole('viewer'), (req, res) => {
  const { domain, sensitivity } = req.query;
  let attrs = store.profileAttributes;
  if (domain)      attrs = attrs.filter(a => a.domain.toLowerCase() === domain.toLowerCase());
  if (sensitivity) attrs = attrs.filter(a => a.sensitivity === sensitivity);
  res.json({
    data: attrs,
    total: attrs.length,
    domains: [...new Set(store.profileAttributes.map(a => a.domain))],
  });
});

router.post('/attributes', requireRole('admin'), (req, res) => {
  const { name, domain, type, source, sensitivity, description } = req.body;
  if (!name || !domain) return res.status(400).json({ error: 'name and domain are required' });
  const attr = {
    id: uid('attr'),
    name, domain,
    type: type || 'string',
    source: source || 'CDP',
    sensitivity: sensitivity || 'low',
    description: description || '',
    status: 'active',
    createdAt: now(),
    updatedAt: now(),
  };
  store.profileAttributes.push(attr);
  store.lastUpdated = now();
  res.status(201).json(attr);
});

router.put('/attributes/:id', requireRole('admin'), (req, res) => {
  const idx = store.profileAttributes.findIndex(a => a.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Attribute not found' });
  const allowed = ['name','domain','type','source','sensitivity','description','status'];
  allowed.forEach(k => { if (req.body[k] !== undefined) store.profileAttributes[idx][k] = req.body[k]; });
  store.profileAttributes[idx].updatedAt = now();
  store.lastUpdated = now();
  res.json(store.profileAttributes[idx]);
});

router.delete('/attributes/:id', requireRole('admin'), (req, res) => {
  const idx = store.profileAttributes.findIndex(a => a.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Attribute not found' });
  store.profileAttributes.splice(idx, 1);
  store.lastUpdated = now();
  res.json({ deleted: req.params.id });
});

// ── SOURCES ───────────────────────────────────────────────────────────────────
router.get('/sources', requireRole('viewer'), (req, res) => {
  res.json({ data: store.sources, total: store.sources.length });
});

router.post('/sources', requireRole('admin'), (req, res) => {
  const { name, type, platform, description } = req.body;
  if (!name) return res.status(400).json({ error: 'name is required' });
  const src = {
    id: uid('src'),
    name, type: type || 'server',
    platform: platform || 'server',
    description: description || '',
    status: 'active',
    createdAt: now(),
    updatedAt: now(),
  };
  store.sources.push(src);
  store.lastUpdated = now();
  res.status(201).json(src);
});

router.put('/sources/:id', requireRole('admin'), (req, res) => {
  const idx = store.sources.findIndex(s => s.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Source not found' });
  const allowed = ['name','type','platform','description','status'];
  allowed.forEach(k => { if (req.body[k] !== undefined) store.sources[idx][k] = req.body[k]; });
  store.sources[idx].updatedAt = now();
  store.lastUpdated = now();
  res.json(store.sources[idx]);
});

router.delete('/sources/:id', requireRole('admin'), (req, res) => {
  const idx = store.sources.findIndex(s => s.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Source not found' });
  store.sources.splice(idx, 1);
  store.lastUpdated = now();
  res.json({ deleted: req.params.id });
});

// ── VALIDATE ──────────────────────────────────────────────────────────────────
// POST /api/data-catalog/validate
// Body: { eventName, properties: { key: value, ... } }
// Returns: { valid, issues[] }
router.post('/validate', requireRole('viewer'), (req, res) => {
  const { eventName, properties = {} } = req.body;
  if (!eventName) return res.status(400).json({ error: 'eventName required' });

  const event = store.events.find(e => e.name === eventName || e.id === eventName);
  if (!event) return res.json({ valid: false, issues: [{ level: 'error', message: `Unknown event: "${eventName}". Not in Data Catalog.` }] });
  if (event.status === 'blocked') return res.json({ valid: false, blocked: true, issues: [{ level: 'error', message: `Event "${eventName}" is blocked in Data Catalog.` }] });
  if (event.status === 'deprecated') return res.json({ valid: true, deprecated: true, issues: [{ level: 'warning', message: `Event "${eventName}" is deprecated. Consider updating your tracking.` }] });

  const issues = [];
  // Check required properties
  event.properties.forEach(prop => {
    if (prop.required && (properties[prop.name] === undefined || properties[prop.name] === null || properties[prop.name] === '')) {
      issues.push({ level: 'error', field: prop.name, message: `Required property "${prop.name}" is missing.` });
    }
    // Type check
    if (properties[prop.name] !== undefined && prop.type) {
      const val = properties[prop.name];
      const jsType = typeof val;
      if (prop.type === 'number' && jsType !== 'number') issues.push({ level: 'warning', field: prop.name, message: `"${prop.name}" should be a number, got ${jsType}.` });
      if (prop.type === 'boolean' && jsType !== 'boolean') issues.push({ level: 'warning', field: prop.name, message: `"${prop.name}" should be boolean, got ${jsType}.` });
      if (prop.type === 'string' && jsType !== 'string') issues.push({ level: 'warning', field: prop.name, message: `"${prop.name}" should be a string, got ${jsType}.` });
    }
  });

  // Custom validationRules
  (event.validationRules || []).forEach(rule => {
    const val = properties[rule.field];
    if (rule.type === 'regex' && val !== undefined) {
      const re = new RegExp(rule.pattern);
      if (!re.test(String(val))) issues.push({ level: rule.level || 'error', field: rule.field, message: rule.message || `"${rule.field}" failed validation.` });
    }
    if (rule.type === 'enum' && val !== undefined) {
      if (!rule.values.includes(val)) issues.push({ level: rule.level || 'error', field: rule.field, message: `"${rule.field}" must be one of: ${rule.values.join(', ')}.` });
    }
    if (rule.type === 'min' && typeof val === 'number' && val < rule.value) {
      issues.push({ level: rule.level || 'error', field: rule.field, message: `"${rule.field}" must be >= ${rule.value}.` });
    }
    if (rule.type === 'max' && typeof val === 'number' && val > rule.value) {
      issues.push({ level: rule.level || 'error', field: rule.field, message: `"${rule.field}" must be <= ${rule.value}.` });
    }
  });

  const errors = issues.filter(i => i.level === 'error');
  res.json({ valid: errors.length === 0, issues, event: { id: event.id, name: event.name, domain: event.domain } });
});

// ── SEARCH ────────────────────────────────────────────────────────────────────
router.get('/search', requireRole('viewer'), (req, res) => {
  const { q } = req.query;
  if (!q) return res.status(400).json({ error: 'q parameter required' });
  const query = q.toLowerCase();
  const matchedEvents = store.events.filter(e =>
    e.name.toLowerCase().includes(query) || e.description.toLowerCase().includes(query) ||
    e.domain.toLowerCase().includes(query) || e.properties.some(p => p.name.toLowerCase().includes(query))
  );
  const matchedAttributes = store.profileAttributes.filter(a =>
    a.name.toLowerCase().includes(query) || a.description.toLowerCase().includes(query) || a.domain.toLowerCase().includes(query)
  );
  res.json({ query: q, events: matchedEvents, attributes: matchedAttributes, total: matchedEvents.length + matchedAttributes.length });
});

module.exports = router;
