const express = require('express');
const router  = express.Router();
const { requireRole } = require('../middleware/rbac');
const { shouldUseMock, sendNotConnected } = require('../utils/mock-guard');

let journeys = [];
if (shouldUseMock()) {
  journeys = [...require('../mock/journeys').JOURNEYS];
}

router.get('/', requireRole('viewer'), (req, res) => {
  if (!shouldUseMock()) return sendNotConnected(res, 'Journeys', 'Mautic', 'Journey engine not yet wired to Mautic automation API.');
  res.json({ data: journeys, total: journeys.length, source: 'mock' });
});

router.get('/:id', requireRole('viewer'), (req, res) => {
  if (!shouldUseMock()) return res.status(404).json({ error: { message: 'Journey not found — Mautic not connected', code: 'NOT_CONNECTED' } });
  const j = journeys.find(x => x.id === req.params.id);
  if (!j) return res.status(404).json({ error: { message: 'Journey not found', code: 'NOT_FOUND' } });
  res.json(j);
});

router.post('/', requireRole('operator'), (req, res) => {
  if (!shouldUseMock()) return res.status(503).json({ error: { message: 'Journey creation requires Mautic integration (not yet connected).', code: 'NOT_CONNECTED' } });
  const { name } = req.body;
  if (!name) return res.status(400).json({ error: { message: 'name is required', code: 'VALIDATION_ERROR' } });
  const newJourney = { id: `journey_${Date.now()}`, ...req.body, status: 'draft', enrolledCount: 0, completedCount: 0 };
  journeys.push(newJourney);
  res.status(201).json(newJourney);
});

router.patch('/:id', requireRole('operator'), (req, res) => {
  if (!shouldUseMock()) return res.status(503).json({ error: { message: 'Journey update requires Mautic integration (not yet connected).', code: 'NOT_CONNECTED' } });
  const idx = journeys.findIndex(x => x.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: { message: 'Journey not found', code: 'NOT_FOUND' } });
  journeys[idx] = { ...journeys[idx], ...req.body };
  res.json(journeys[idx]);
});

module.exports = router;
