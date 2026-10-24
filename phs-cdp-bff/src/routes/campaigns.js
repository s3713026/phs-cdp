const express = require('express');
const router  = express.Router();
const { CAMPAIGNS } = require('../mock/campaigns');
const { requireRole } = require('../middleware/rbac');

let campaigns = [...CAMPAIGNS];

router.get('/', requireRole('viewer'), (req, res) => {
  const { status } = req.query;
  const list = status ? campaigns.filter(c => c.status === status) : [...campaigns];
  res.json({ data: list, total: list.length });
});

router.get('/:id', requireRole('viewer'), (req, res) => {
  const c = campaigns.find(x => x.id === req.params.id);
  if (!c) return res.status(404).json({ error: { message: 'Campaign not found', code: 'NOT_FOUND' } });
  res.json(c);
});

router.post('/', requireRole('operator'), (req, res) => {
  const { name, audience } = req.body;
  if (!name || !audience) return res.status(400).json({ error: { message: 'name and audience are required', code: 'VALIDATION_ERROR' } });
  const newCamp = { id:`camp_${Date.now()}`, ...req.body, status:'draft', sent:0, opened:0, clicked:0, converted:0, conversionRate:0 };
  campaigns.push(newCamp);
  res.status(201).json(newCamp);
});

router.patch('/:id', requireRole('operator'), (req, res) => {
  const idx = campaigns.findIndex(x => x.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: { message: 'Campaign not found', code: 'NOT_FOUND' } });
  campaigns[idx] = { ...campaigns[idx], ...req.body };
  res.json(campaigns[idx]);
});

module.exports = router;
