const express = require('express');
const router  = express.Router();
const { DQ_OVERVIEW, DQ_ISSUES } = require('../mock/dataQuality');
const { requireRole } = require('../middleware/rbac');
const MauticAdapter = require('../adapters/MauticAdapter');

const mautic  = new MauticAdapter();
const useMock = process.env.USE_MOCK === 'true';

/**
 * Build real Data Quality overview from Mautic contact stats
 */
async function buildRealOverview() {
  // Fetch contacts to get total count + basic stats
  const [allContacts, noEmailContacts] = await Promise.all([
    mautic.request('GET', '/contacts', null, { limit: 1, minimal: 1 }),
    mautic.request('GET', '/contacts', null, { limit: 1, minimal: 1, search: '!email' }),
  ]);

  const total     = allContacts.ok  ? Number(allContacts.data?.total  || 0) : 0;
  const noEmail   = noEmailContacts.ok ? Number(noEmailContacts.data?.total || 0) : 0;

  // Segments count (health proxy)
  const segsResult = await mautic.request('GET', '/segments', null, { limit: 1 });
  const totalSegs  = segsResult.ok ? Number(segsResult.data?.total || 0) : 0;

  if (total === 0) return null; // Mautic unreachable

  const identified     = total - noEmail;
  const identityCov    = total > 0 ? Math.round((identified / total) * 100) : 0;
  const emailComplete  = identityCov;
  // Derive an overall score: weighted average
  const overallScore   = Math.round((identityCov * 0.5) + (emailComplete * 0.3) + (totalSegs > 0 ? 95 : 80) * 0.2);

  return {
    overallScore,
    identityCoverage:   identityCov,
    eventCompleteness:  89,   // from RS — keep mock until RS data available
    trackingCoverage:   91,   // from RS — keep mock until RS data available
    dataFreshness:      98,
    totalCustomers:     total,
    identifiedCustomers: identified,
    anonymousVisitors:  Math.round(total * 0.28), // estimate
    duplicateProfiles:  0,
    missingEmails:      noEmail,
    invalidPhones:      0,
    totalSegments:      totalSegs,
  };
}

// GET /api/data-quality
router.get('/', requireRole('viewer'), async (_req, res) => {
  if (!useMock) {
    try {
      const real = await buildRealOverview();
      if (real) {
        return res.json({ ...real, updatedAt: new Date().toISOString(), source: 'mautic' });
      }
    } catch (err) {
      console.warn('[DataQuality] Mautic error:', err.message);
    }
  }
  // Mock fallback
  res.json({ ...DQ_OVERVIEW, updatedAt: new Date().toISOString(), source: 'mock' });
});

// GET /api/data-quality/issues
router.get('/issues', requireRole('viewer'), async (req, res) => {
  const { severity } = req.query;

  if (!useMock) {
    try {
      const real = await buildRealOverview();
      if (real) {
        const issues = [];
        if (real.missingEmails > 0) {
          issues.push({
            id: 'dqi_email', severity: real.missingEmails > 1000 ? 'critical' : 'warning',
            type: 'missing_identifier', title: 'Missing Email Addresses',
            description: `${real.missingEmails.toLocaleString()} customer profiles are missing email addresses, preventing email campaign delivery.`,
            affectedCount: real.missingEmails,
            recommendation: 'Trigger email collection campaign for affected customers.',
            source: 'Mautic',
          });
        }
        if (real.duplicateProfiles > 0) {
          issues.push({
            id: 'dqi_dupe', severity: 'warning',
            type: 'duplicate_identity', title: 'Duplicate Customer Profiles',
            description: `${real.duplicateProfiles} duplicate profiles detected.`,
            affectedCount: real.duplicateProfiles,
            recommendation: 'Run identity resolution to merge duplicate profiles.',
            source: 'RudderStack',
          });
        }
        // Static known issues
        issues.push({
          id: 'dqi_events', severity: 'info',
          type: 'event_missing_property', title: 'Missing Campaign ID in Events',
          description: 'Some Campaign Clicked events are missing campaign_id property.',
          affectedCount: 0,
          recommendation: 'Update SDK to always include campaign_id.',
          source: 'Web SDK',
        });

        const filtered = severity ? issues.filter(i => i.severity === severity) : issues;
        return res.json({ data: filtered, total: filtered.length, source: 'mautic' });
      }
    } catch (err) {
      console.warn('[DataQuality/issues] Mautic error:', err.message);
    }
  }

  // Mock fallback
  const list = severity ? DQ_ISSUES.filter(i => i.severity === severity) : DQ_ISSUES;
  res.json({ data: list, total: list.length, source: 'mock' });
});

module.exports = router;
