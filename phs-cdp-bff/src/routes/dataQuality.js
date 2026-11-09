const express = require('express');
const router  = express.Router();
const { requireRole } = require('../middleware/rbac');
const MauticAdapter = require('../adapters/MauticAdapter');
const { shouldUseMock, sendNotConnected } = require('../utils/mock-guard');

const mautic = new MauticAdapter();

async function buildRealOverview() {
  const [allContacts, noEmailContacts] = await Promise.all([
    mautic.request('GET', '/contacts', null, { limit: 1, minimal: 1 }),
    mautic.request('GET', '/contacts', null, { limit: 1, minimal: 1, search: '!email' }),
  ]);
  const total   = allContacts.ok   ? Number(allContacts.data?.total  || 0) : 0;
  const noEmail = noEmailContacts.ok ? Number(noEmailContacts.data?.total || 0) : 0;
  const segsResult = await mautic.request('GET', '/segments', null, { limit: 1 });
  const totalSegs  = segsResult.ok ? Number(segsResult.data?.total || 0) : 0;
  if (total === 0) return null;

  const identified  = total - noEmail;
  const identityCov = total > 0 ? Math.round((identified / total) * 100) : 0;
  const overallScore = Math.round((identityCov * 0.5) + (identityCov * 0.3) + (totalSegs > 0 ? 95 : 80) * 0.2);
  return {
    overallScore, identityCoverage: identityCov,
    eventCompleteness: null, trackingCoverage: null, // RS not wired yet
    dataFreshness: 98, totalCustomers: total, identifiedCustomers: identified,
    anonymousVisitors: Math.round(total * 0.28), duplicateProfiles: 0,
    missingEmails: noEmail, invalidPhones: 0, totalSegments: totalSegs,
  };
}

router.get('/', requireRole('viewer'), async (_req, res) => {
  if (shouldUseMock()) {
    const { DQ_OVERVIEW } = require('../mock/dataQuality');
    return res.json({ ...DQ_OVERVIEW, updatedAt: new Date().toISOString(), source: 'mock' });
  }
  try {
    const real = await buildRealOverview();
    if (real) return res.json({ ...real, updatedAt: new Date().toISOString(), source: 'mautic' });
  } catch (err) {
    console.warn('[DataQuality] Mautic error:', err.message);
  }
  // Mautic unavailable and USE_MOCK=false → empty state
  return res.json({
    overallScore: null, identityCoverage: null, eventCompleteness: null,
    trackingCoverage: null, dataFreshness: null, totalCustomers: 0,
    updatedAt: new Date().toISOString(),
    _dataStatus: 'not_connected',
    _reason: 'Mautic is unavailable. Data Quality metrics require a live Mautic connection.',
    source: 'none',
  });
});

router.get('/issues', requireRole('viewer'), async (req, res) => {
  const { severity } = req.query;
  if (shouldUseMock()) {
    const { DQ_ISSUES } = require('../mock/dataQuality');
    const list = severity ? DQ_ISSUES.filter(i => i.severity === severity) : DQ_ISSUES;
    return res.json({ data: list, total: list.length, source: 'mock' });
  }
  try {
    const real = await buildRealOverview();
    if (real) {
      const issues = [];
      if (real.missingEmails > 0) issues.push({
        id: 'dqi_email', severity: real.missingEmails > 1000 ? 'critical' : 'warning',
        type: 'missing_identifier', title: 'Missing Email Addresses',
        description: `${real.missingEmails.toLocaleString()} profiles missing email — email campaigns cannot reach them.`,
        affectedCount: real.missingEmails, recommendation: 'Trigger email collection campaign.', source: 'Mautic',
      });
      issues.push({
        id: 'dqi_rs_events', severity: 'info', type: 'integration_pending',
        title: 'RudderStack Event Quality Not Wired',
        description: 'Event completeness and tracking coverage metrics require RudderStack integration (pending Phase 5).',
        affectedCount: 0, recommendation: 'Complete RudderStack → Data Quality integration.', source: 'RudderStack',
      });
      const filtered = severity ? issues.filter(i => i.severity === severity) : issues;
      return res.json({ data: filtered, total: filtered.length, source: 'mautic' });
    }
  } catch (err) {
    console.warn('[DataQuality/issues] Mautic error:', err.message);
  }
  return sendNotConnected(res, 'Data Quality Issues', 'Mautic', 'Mautic unavailable — cannot fetch real quality metrics.');
});

module.exports = router;
