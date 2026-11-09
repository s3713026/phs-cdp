const express = require('express');
const router  = express.Router();
const { requireRole } = require('../middleware/rbac');
const { shouldUseMock, sendNotConnected } = require('../utils/mock-guard');

// Mock only loaded when USE_MOCK=true
let campaigns = [];
if (shouldUseMock()) {
  campaigns = [...require('../mock/campaigns').CAMPAIGNS];
}

router.get('/', requireRole('viewer'), (req, res) => {
  if (!shouldUseMock()) return sendNotConnected(res, 'Campaigns', 'Mautic', 'Campaign engine not yet wired to Mautic API.');
  const { status } = req.query;
  const list = status ? campaigns.filter(c => c.status === status) : [...campaigns];
  res.json({ data: list, total: list.length, source: 'mock' });
});

router.get('/:id', requireRole('viewer'), (req, res) => {
  if (!shouldUseMock()) return res.status(404).json({ error: { message: 'Campaign not found — Mautic not connected', code: 'NOT_CONNECTED' } });
  const c = campaigns.find(x => x.id === req.params.id);
  if (!c) return res.status(404).json({ error: { message: 'Campaign not found', code: 'NOT_FOUND' } });
  res.json(c);
});

router.post('/', requireRole('operator'), (req, res) => {
  if (!shouldUseMock()) return res.status(503).json({ error: { message: 'Campaign creation requires Mautic integration (not yet connected).', code: 'NOT_CONNECTED' } });
  const { name, audience } = req.body;
  if (!name || !audience) return res.status(400).json({ error: { message: 'name and audience are required', code: 'VALIDATION_ERROR' } });
  const newCamp = { id: `camp_${Date.now()}`, ...req.body, status: 'draft', sent: 0, opened: 0, clicked: 0, converted: 0, conversionRate: 0 };
  campaigns.push(newCamp);
  res.status(201).json(newCamp);
});

router.patch('/:id', requireRole('operator'), (req, res) => {
  if (!shouldUseMock()) return res.status(503).json({ error: { message: 'Campaign update requires Mautic integration (not yet connected).', code: 'NOT_CONNECTED' } });
  const idx = campaigns.findIndex(x => x.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: { message: 'Campaign not found', code: 'NOT_FOUND' } });
  campaigns[idx] = { ...campaigns[idx], ...req.body };
  res.json(campaigns[idx]);
});

module.exports = router;
