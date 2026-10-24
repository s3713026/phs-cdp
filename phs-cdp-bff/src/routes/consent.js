const express = require('express');
const router  = express.Router();
const { CONSENT_SUMMARY, CUSTOMER_CONSENTS } = require('../mock/consent');
const { requireRole } = require('../middleware/rbac');

router.get('/', requireRole('viewer'), (_req, res) => {
  res.json({ ...CONSENT_SUMMARY, updatedAt: new Date().toISOString() });
});

router.get('/customers/:id', requireRole('viewer'), (req, res) => {
  const consent = CUSTOMER_CONSENTS[req.params.id];
  if (!consent) return res.json({ customerId: req.params.id, marketing: false, analytics: false, personalization: false, updatedAt: null });
  res.json({ customerId: req.params.id, ...consent });
});

module.exports = router;
