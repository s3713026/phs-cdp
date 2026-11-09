/**
 * PHS CDP — Data Catalog API Routes v2.0
 *
 * Endpoints:
 *   GET    /api/data-catalog                          — summary
 *   GET    /api/data-catalog/events                   — list events
 *   GET    /api/data-catalog/events/:id               — get event
 *   POST   /api/data-catalog/events                   — create event (admin)
 *   PUT    /api/data-catalog/events/:id               — update event (admin)
 *   PATCH  /api/data-catalog/events/:id/status        — block/unblock global (admin)
 *   PUT    /api/data-catalog/events/:id/source-rules  — set source rules for event (admin)
 *   PUT    /api/data-catalog/events/:id/properties/:propName/source-rules — set param source rules (admin)
 *   DELETE /api/data-catalog/events/:id               — delete event (admin)
 *
 *   GET    /api/data-catalog/attributes               — list attributes
 *   POST   /api/data-catalog/attributes               — create (admin)
 *   PUT    /api/data-catalog/attributes/:id           — update (admin)
 *   PUT    /api/data-catalog/attributes/:id/source-rules — set source rules (admin)
 *   DELETE /api/data-catalog/attributes/:id           — delete (admin)
 *
 *   GET    /api/data-catalog/sources                  — list sources
 *   POST   /api/data-catalog/sources                  — create (admin)
 *   PUT    /api/data-catalog/sources/:id              — update (admin)
 *   DELETE /api/data-catalog/sources/:id              — delete (admin)
 *
 *   POST   /api/data-catalog/validate                 — validate event payload
 *   GET    /api/data-catalog/search                   — search events + attributes
 */

const express = require('express');
const router = express.Router();
const { requireRole } = require('../middleware/rbac');

// ── In-memory store ───────────────────────────────────────────────────────────
const seed = require('../data/dataCatalog');
const store = {
  events:            seed.events.map(e => ({ ...e, properties: e.properties.map(p => ({ ...p, sourceRules: p.sourceRules || [] })), sourceRules: e.sourceRules || [] })),
  profileAttributes: seed.profileAttributes.map(a => ({ ...a, sourceRules: a.sourceRules || [] })),
  sources:           seed.sources.map(s => ({ ...s })),
  version:           seed.version,
  lastUpdated:       seed.lastUpdated,
};

function now() { return new Date().toISOString(); }
function uid(prefix) { return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`; }

// ── Source rule helpers ───────────────────────────────────────────────────────
/**
 * Resolve effective action for an item given a sourceId.
 * Priority: sourceRule (specific) > global status
 *
 * @param {string} globalStatus  — 'active' | 'blocked' | 'deprecated'
 * @param {Array}  sourceRules   — [{sourceId, action, reason, writable?}]
 * @param {string} sourceId      — the source making the request
 * @returns {{ action: string, reason?: string, writable?: boolean }}
 */
function resolveSourceAction(globalStatus, sourceRules, sourceId) {
  if (sourceId) {
    const rule = (sourceRules || []).find(r => r.sourceId === sourceId);
    if (rule) return rule;
  }
  // Fall back to global
  if (globalStatus === 'blocked')    return { action: 'block',    reason: 'Event is globally blocked' };
  if (globalStatus === 'deprecated') return { action: 'deprecated' };
  return { action: 'allow' };
}

// ── SUMMARY ───────────────────────────────────────────────────────────────────
router.get('/', requireRole('viewer'), (req, res) => {
  const domains = [...new Set(store.events.map(e => e.domain))];
  res.json({
    version: store.version,
    lastUpdated: store.lastUpdated,
    summary: {
      totalEvents:      store.events.length,
      totalAttributes:  store.profileAttributes.length,
      totalSources:     store.sources.length,
      totalFields:      store.events.reduce((s, e) => s + e.properties.length, 0) + store.profileAttributes.length,
      blockedEvents:    store.events.filter(e => e.status === 'blocked').length,
      deprecatedEvents: store.events.filter(e => e.status === 'deprecated').length,
      domains,
    }
  });
});

// ── EVENTS — READ ─────────────────────────────────────────────────────────────
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

// ── EVENTS — CREATE ───────────────────────────────────────────────────────────
router.post('/events', requireRole('admin'), (req, res) => {
  const { name, domain, description, platforms, lifecycleStage, properties, validationRules, sourceRules } = req.body;
  if (!name || !domain) return res.status(400).json({ error: 'name and domain are required' });
  const event = {
    id: uid('evt'),
    name, domain,
    description:     description || '',
    status:          'active',
    platforms:       platforms || [],
    lifecycleStage:  lifecycleStage || null,
    properties:      (properties || []).map(p => ({ ...p, sourceRules: p.sourceRules || [] })),
    validationRules: validationRules || [],
    sourceRules:     sourceRules || [],
    createdAt:       now(),
    updatedAt:       now(),
  };
  store.events.push(event);
  store.lastUpdated = now();
  res.status(201).json(event);
});

// ── EVENTS — UPDATE ───────────────────────────────────────────────────────────
router.put('/events/:id', requireRole('admin'), (req, res) => {
  const idx = store.events.findIndex(e => e.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Event not found' });
  const allowed = ['name', 'domain', 'description', 'status', 'platforms', 'lifecycleStage', 'properties', 'validationRules', 'sourceRules'];
  allowed.forEach(k => {
    if (req.body[k] !== undefined) {
      // ensure sourceRules nested in properties
      if (k === 'properties') {
        store.events[idx][k] = req.body[k].map(p => ({ ...p, sourceRules: p.sourceRules || [] }));
      } else {
        store.events[idx][k] = req.body[k];
      }
    }
  });
  store.events[idx].updatedAt = now();
  store.lastUpdated = now();
  res.json(store.events[idx]);
});

// ── EVENTS — STATUS ───────────────────────────────────────────────────────────
router.patch('/events/:id/status', requireRole('admin'), (req, res) => {
  const { status } = req.body;
  if (!['active', 'blocked', 'deprecated'].includes(status))
    return res.status(400).json({ error: 'status must be active, blocked, or deprecated' });
  const idx = store.events.findIndex(e => e.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Event not found' });
  store.events[idx].status = status;
  store.events[idx].updatedAt = now();
  store.lastUpdated = now();
  res.json({ id: req.params.id, status });
});

// ── EVENTS — SOURCE RULES ─────────────────────────────────────────────────────
// PUT /events/:id/source-rules
// Body: { rules: [{ sourceId, action, reason? }] }
router.put('/events/:id/source-rules', requireRole('admin'), (req, res) => {
  const idx = store.events.findIndex(e => e.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Event not found' });
  const { rules } = req.body;
  if (!Array.isArray(rules)) return res.status(400).json({ error: 'rules must be an array' });
  // Validate rule actions
  for (const r of rules) {
    if (!r.sourceId) return res.status(400).json({ error: 'Each rule must have a sourceId' });
    if (!['allow', 'block', 'deprecated'].includes(r.action))
      return res.status(400).json({ error: `Invalid action "${r.action}". Use allow, block, or deprecated` });
  }
  store.events[idx].sourceRules = rules;
  store.events[idx].updatedAt = now();
  store.lastUpdated = now();
  res.json({ id: req.params.id, sourceRules: rules });
});

// ── EVENTS — PARAMETER SOURCE RULES ──────────────────────────────────────────
// PUT /events/:id/properties/:propName/source-rules
// Body: { rules: [{ sourceId, action, reason? }] }
router.put('/events/:id/properties/:propName/source-rules', requireRole('admin'), (req, res) => {
  const idx = store.events.findIndex(e => e.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Event not found' });
  const propIdx = store.events[idx].properties.findIndex(p => p.name === req.params.propName);
  if (propIdx === -1) return res.status(404).json({ error: `Property "${req.params.propName}" not found` });
  const { rules } = req.body;
  if (!Array.isArray(rules)) return res.status(400).json({ error: 'rules must be an array' });
  for (const r of rules) {
    if (!r.sourceId) return res.status(400).json({ error: 'Each rule must have a sourceId' });
    if (!['allow', 'block', 'require'].includes(r.action))
      return res.status(400).json({ error: `Invalid action "${r.action}". Use allow, block, or require` });
  }
  store.events[idx].properties[propIdx].sourceRules = rules;
  store.events[idx].updatedAt = now();
  store.lastUpdated = now();
  res.json({ eventId: req.params.id, property: req.params.propName, sourceRules: rules });
});

// ── EVENTS — DELETE ───────────────────────────────────────────────────────────
router.delete('/events/:id', requireRole('admin'), (req, res) => {
  const idx = store.events.findIndex(e => e.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Event not found' });
  store.events.splice(idx, 1);
  store.lastUpdated = now();
  res.json({ deleted: req.params.id });
});

// ── ATTRIBUTES — READ ─────────────────────────────────────────────────────────
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

// ── ATTRIBUTES — CREATE ───────────────────────────────────────────────────────
router.post('/attributes', requireRole('admin'), (req, res) => {
  const { name, domain, type, source, sensitivity, description, sourceRules } = req.body;
  if (!name || !domain) return res.status(400).json({ error: 'name and domain are required' });
  const attr = {
    id: uid('attr'),
    name, domain,
    type:        type || 'string',
    source:      source || '',
    sensitivity: sensitivity || 'low',
    description: description || '',
    sourceRules: sourceRules || [],
    createdAt:   now(),
    updatedAt:   now(),
  };
  store.profileAttributes.push(attr);
  store.lastUpdated = now();
  res.status(201).json(attr);
});

// ── ATTRIBUTES — UPDATE ───────────────────────────────────────────────────────
router.put('/attributes/:id', requireRole('admin'), (req, res) => {
  const idx = store.profileAttributes.findIndex(a => a.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Attribute not found' });
  const allowed = ['name', 'domain', 'type', 'source', 'sensitivity', 'description', 'sourceRules'];
  allowed.forEach(k => { if (req.body[k] !== undefined) store.profileAttributes[idx][k] = req.body[k]; });
  store.profileAttributes[idx].updatedAt = now();
  store.lastUpdated = now();
  res.json(store.profileAttributes[idx]);
});

// ── ATTRIBUTES — SOURCE RULES ─────────────────────────────────────────────────
// PUT /attributes/:id/source-rules
// Body: { rules: [{ sourceId, action, writable?, reason? }] }
router.put('/attributes/:id/source-rules', requireRole('admin'), (req, res) => {
  const idx = store.profileAttributes.findIndex(a => a.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Attribute not found' });
  const { rules } = req.body;
  if (!Array.isArray(rules)) return res.status(400).json({ error: 'rules must be an array' });
  for (const r of rules) {
    if (!r.sourceId) return res.status(400).json({ error: 'Each rule must have a sourceId' });
    if (!['allow', 'block', 'readonly'].includes(r.action))
      return res.status(400).json({ error: `Invalid action "${r.action}". Use allow, block, or readonly` });
  }
  store.profileAttributes[idx].sourceRules = rules;
  store.profileAttributes[idx].updatedAt = now();
  store.lastUpdated = now();
  res.json({ id: req.params.id, sourceRules: rules });
});

// ── ATTRIBUTES — DELETE ───────────────────────────────────────────────────────
router.delete('/attributes/:id', requireRole('admin'), (req, res) => {
  const idx = store.profileAttributes.findIndex(a => a.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Attribute not found' });
  store.profileAttributes.splice(idx, 1);
  store.lastUpdated = now();
  res.json({ deleted: req.params.id });
});

// ── SOURCES — READ ────────────────────────────────────────────────────────────
router.get('/sources', requireRole('viewer'), (req, res) => {
  const { type, status } = req.query;
  let sources = store.sources;
  if (type)   sources = sources.filter(s => s.type === type);
  if (status) sources = sources.filter(s => s.status === status);
  res.json({ data: sources, total: sources.length });
});

// ── SOURCES — CREATE ──────────────────────────────────────────────────────────
router.post('/sources', requireRole('admin'), (req, res) => {
  const { name, type, platform, description } = req.body;
  if (!name) return res.status(400).json({ error: 'name is required' });
  const source = {
    id:          uid('src'),
    name,
    type:        type || 'web',
    platform:    platform || '',
    description: description || '',
    status:      'active',
    createdAt:   now(),
    updatedAt:   now(),
  };
  store.sources.push(source);
  store.lastUpdated = now();
  res.status(201).json(source);
});

// ── SOURCES — UPDATE ──────────────────────────────────────────────────────────
router.put('/sources/:id', requireRole('admin'), (req, res) => {
  const idx = store.sources.findIndex(s => s.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Source not found' });
  const allowed = ['name', 'type', 'platform', 'description', 'status'];
  allowed.forEach(k => { if (req.body[k] !== undefined) store.sources[idx][k] = req.body[k]; });
  store.sources[idx].updatedAt = now();
  store.lastUpdated = now();
  res.json(store.sources[idx]);
});

// ── SOURCES — DELETE ──────────────────────────────────────────────────────────
router.delete('/sources/:id', requireRole('admin'), (req, res) => {
  const idx = store.sources.findIndex(s => s.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Source not found' });
  store.sources.splice(idx, 1);
  store.lastUpdated = now();
  res.json({ deleted: req.params.id });
});

// ── VALIDATE ──────────────────────────────────────────────────────────────────
// POST /api/data-catalog/validate
// Body: { eventName, sourceId?, properties: { key: value, ... } }
//
// Validation priority:
//   1. Event sourceRule for this sourceId (specific) > global event status
//   2. Property sourceRule for this sourceId (specific) > property.required (default)
//
router.post('/validate', requireRole('viewer'), (req, res) => {
  const { eventName, properties = {}, sourceId } = req.body;
  if (!eventName) return res.status(400).json({ error: 'eventName required' });

  const event = store.events.find(e => e.name === eventName || e.id === eventName);
  if (!event) {
    return res.json({
      valid: false,
      issues: [{ level: 'error', message: `Unknown event: "${eventName}". Not in Data Catalog.` }]
    });
  }

  // ── 1. Resolve event-level action ────────────────────────────────────────
  const eventAction = resolveSourceAction(event.status, event.sourceRules, sourceId);

  if (eventAction.action === 'block') {
    return res.json({
      valid:   false,
      blocked: true,
      issues:  [{ level: 'error', message: `Event "${eventName}" is blocked${sourceId ? ` for source "${sourceId}"` : ''}.${eventAction.reason ? ' Reason: ' + eventAction.reason : ''}` }],
      resolvedVia: sourceId ? 'source-rule' : 'global-status',
    });
  }

  const issues = [];

  if (eventAction.action === 'deprecated') {
    issues.push({ level: 'warning', message: `Event "${eventName}" is deprecated. Consider updating your tracking.` });
  }

  // ── 2. Resolve per-property rules ────────────────────────────────────────
  event.properties.forEach(prop => {
    const propAction = resolveSourceAction(
      prop.required ? 'active' : 'optional',
      prop.sourceRules || [],
      sourceId
    );

    // Block this parameter — strip/reject it
    if (propAction.action === 'block') {
      if (properties[prop.name] !== undefined) {
        issues.push({
          level: 'warning',
          field: prop.name,
          message: `Property "${prop.name}" is not accepted from source "${sourceId}". It will be ignored.${propAction.reason ? ' Reason: ' + propAction.reason : ''}`
        });
      }
      return; // skip further checks for this property
    }

    // Determine effective required: 'require' action overrides default
    const effectiveRequired = propAction.action === 'require' ? true : prop.required;

    // Required check
    if (effectiveRequired && (properties[prop.name] === undefined || properties[prop.name] === null || properties[prop.name] === '')) {
      issues.push({
        level: 'error',
        field: prop.name,
        message: `Required property "${prop.name}" is missing.${propAction.action === 'require' ? ` (Required for source "${sourceId}")` : ''}`
      });
    }

    // Type check
    if (properties[prop.name] !== undefined && prop.type) {
      const val    = properties[prop.name];
      const jsType = typeof val;
      if (prop.type === 'number'  && jsType !== 'number')  issues.push({ level: 'warning', field: prop.name, message: `"${prop.name}" should be a number, got ${jsType}.` });
      if (prop.type === 'boolean' && jsType !== 'boolean') issues.push({ level: 'warning', field: prop.name, message: `"${prop.name}" should be boolean, got ${jsType}.` });
      if (prop.type === 'string'  && jsType !== 'string')  issues.push({ level: 'warning', field: prop.name, message: `"${prop.name}" should be a string, got ${jsType}.` });
    }
  });

  // ── 3. Custom validationRules (global, not per-source) ───────────────────
  (event.validationRules || []).forEach(rule => {
    const val = properties[rule.field];
    if (val === undefined) return;
    if (rule.type === 'regex') {
      if (!new RegExp(rule.pattern).test(String(val)))
        issues.push({ level: rule.level || 'error', field: rule.field, message: rule.message || `"${rule.field}" failed pattern validation.` });
    }
    if (rule.type === 'enum') {
      if (!rule.values.includes(val))
        issues.push({ level: rule.level || 'error', field: rule.field, message: `"${rule.field}" must be one of: ${rule.values.join(', ')}.` });
    }
    if (rule.type === 'min' && typeof val === 'number' && val < rule.value)
      issues.push({ level: rule.level || 'error', field: rule.field, message: `"${rule.field}" must be >= ${rule.value}.` });
    if (rule.type === 'max' && typeof val === 'number' && val > rule.value)
      issues.push({ level: rule.level || 'error', field: rule.field, message: `"${rule.field}" must be <= ${rule.value}.` });
  });

  const errors = issues.filter(i => i.level === 'error');
  res.json({
    valid:  errors.length === 0,
    issues,
    sourceId: sourceId || null,
    event:  { id: event.id, name: event.name, domain: event.domain },
  });
});

// ── ATTRIBUTE WRITE CHECK ─────────────────────────────────────────────────────
// POST /api/data-catalog/check-attribute-write
// Body: { attributeId, sourceId }
// Returns: { allowed, writable, reason }
router.post('/check-attribute-write', requireRole('viewer'), (req, res) => {
  const { attributeId, sourceId } = req.body;
  if (!attributeId || !sourceId) return res.status(400).json({ error: 'attributeId and sourceId required' });

  const attr = store.profileAttributes.find(a => a.id === attributeId || a.name === attributeId);
  if (!attr) return res.status(404).json({ error: `Attribute "${attributeId}" not found` });

  const rule = resolveSourceAction(attr.status || 'active', attr.sourceRules || [], sourceId);

  if (rule.action === 'block') {
    return res.json({ allowed: false, writable: false, reason: rule.reason || `Attribute "${attr.name}" is blocked for source "${sourceId}"` });
  }
  if (rule.action === 'readonly' || rule.writable === false) {
    return res.json({ allowed: true, writable: false, reason: rule.reason || `Attribute "${attr.name}" is read-only for source "${sourceId}"` });
  }
  return res.json({ allowed: true, writable: true, attribute: { id: attr.id, name: attr.name, sensitivity: attr.sensitivity } });
});

// ── SEARCH ────────────────────────────────────────────────────────────────────
router.get('/search', requireRole('viewer'), (req, res) => {
  const { q } = req.query;
  if (!q) return res.status(400).json({ error: 'q parameter required' });
  const query = q.toLowerCase();
  const matchedEvents = store.events.filter(e =>
    e.name.toLowerCase().includes(query) || (e.description || '').toLowerCase().includes(query) ||
    e.domain.toLowerCase().includes(query) || e.properties.some(p => p.name.toLowerCase().includes(query))
  );
  const matchedAttributes = store.profileAttributes.filter(a =>
    a.name.toLowerCase().includes(query) || (a.description || '').toLowerCase().includes(query) ||
    a.domain.toLowerCase().includes(query)
  );
  res.json({ query: q, events: matchedEvents, attributes: matchedAttributes, total: matchedEvents.length + matchedAttributes.length });
});

module.exports = router;
