const express = require('express');
const router  = express.Router();
const { JOURNEYS } = require('../mock/journeys');
const { requireRole } = require('../middleware/rbac');

let journeys = [...JOURNEYS];

router.get('/', requireRole('viewer'), (_req, res) => res.json({ data: journeys, total: journeys.length }));
router.get('/:id', requireRole('viewer'), (req, res) => {
  const j = journeys.find(x => x.id === req.params.id);
  if (!j) return res.status(404).json({ error: { message: 'Journey not found', code: 'NOT_FOUND' } });
  res.json(j);
});
router.post('/', requireRole('operator'), (req, res) => {
  const newJ = { id:`jrn_${Date.now()}`, ...req.body, status:'draft', activeCustomers:0, completionRate:0, createdAt: new Date().toISOString() };
  journeys.push(newJ);
  res.status(201).json(newJ);
});

module.exports = router;
