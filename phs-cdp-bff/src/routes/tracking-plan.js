/**
 * PHS CDP — Tracking Plan API Routes
 * Business UI: "Data Tracking Rules"
 */
const express = require('express');
const router = express.Router();
const { requireRole } = require('../middleware/rbac');
const TRACKING_PLAN = require('../data/trackingPlan');

// GET /api/tracking-plan — Lấy toàn bộ tracking plan
router.get('/', requireRole('viewer'), (req, res) => {
  const { category } = req.query;

  let events = TRACKING_PLAN.events;
  if (category) {
    const filtered = {};
    Object.entries(events)
      .filter(([, s]) => s.category === category)
      .forEach(([name, s]) => { filtered[name] = s; });
    events = filtered;
  }

  res.json({
    version: TRACKING_PLAN.version,
    name: TRACKING_PLAN.name,
    totalEvents: Object.keys(TRACKING_PLAN.events).length,
    categories: [...new Set(Object.values(TRACKING_PLAN.events).map(e => e.category))],
    events,
    identifyTraits: TRACKING_PLAN.identifyTraits
  });
});

// GET /api/tracking-plan/events — Danh sách tên event
router.get('/events', requireRole('viewer'), (req, res) => {
  const eventList = Object.entries(TRACKING_PLAN.events).map(([name, schema]) => ({
    name,
    category: schema.category,
    description: schema.description,
    requiredFields: schema.required,
    optionalFields: schema.optional,
    nextLifecycle: schema.nextLifecycle || null
  }));
  res.json({ data: eventList, total: eventList.length });
});

// POST /api/tracking-plan/validate — Validate một event
router.post('/validate', requireRole('viewer'), (req, res) => {
  const { eventName, properties } = req.body;
  if (!eventName) {
    return res.status(400).json({ error: 'eventName is required' });
  }
  const result = TRACKING_PLAN.validate(eventName, properties || {});
  res.json(result);
});

// GET /api/tracking-plan/categories — Danh sách categories
router.get('/categories', requireRole('viewer'), (req, res) => {
  const categories = {};
  Object.entries(TRACKING_PLAN.events).forEach(([name, schema]) => {
    if (!categories[schema.category]) categories[schema.category] = [];
    categories[schema.category].push(name);
  });
  res.json({ categories });
});

module.exports = router;
