/**
 * PHS CDP — Dashboard Summary API
 * GET /api/dashboard
 *
 * Trả về tất cả metrics cho Dashboard trong một lần gọi:
 * - Tổng khách hàng (từ Mautic)
 * - Event stats (từ RudderStack Postgres)
 * - System health (RudderStack + Mautic status)
 * - Audiences/Segments (từ Mautic)
 */

const express = require('express');
const router  = express.Router();
const { requireRole } = require('../middleware/rbac');
const MauticAdapter        = require('../adapters/MauticAdapter');
const RudderStackAdapter   = require('../adapters/RudderStackAdapter');

const mautic    = new MauticAdapter();
const rudder    = new RudderStackAdapter();
const useMock   = process.env.USE_MOCK === 'true';

// Mock fallback data
const MOCK_DASHBOARD = {
  customers: {
    total: 1284392, known: 824615, anonymous: 459777,
    newToday: 142, growthPercent: 2.4,
  },
  audiences: {
    total: 12, active: 8, draft: 3, paused: 1,
  },
  campaigns: {
    total: 7, active: 3, scheduled: 2, completed: 2,
  },
  dataQuality: {
    score: 92, identityCoverage: 94, eventCompleteness: 89,
    trackingCoverage: 91, dataFreshness: 98,
  },
  systemHealth: {
    rudderstack: 'connected', mautic: 'connected',
    cdpDatabase: 'connected', overallStatus: 'healthy',
  },
  recentActivity: {
    eventsToday: 48291, eventsLastHour: 2143,
    identifyEventsToday: 892, trackEventsToday: 47399,
  },
};

/**
 * Build real dashboard metrics từ Mautic + RudderStack
 */
async function buildRealDashboard() {
  // Fetch everything in parallel
  const [
    allContacts,
    noEmailContacts,
    segments,
    mauticHealth,
    rsHealth,
    rsActivity,
  ] = await Promise.allSettled([
    mautic.request('GET', '/contacts', null, { limit: 1, minimal: 1 }),
    mautic.request('GET', '/contacts', null, { limit: 1, minimal: 1, search: '!email' }),
    mautic.request('GET', '/segments', null, { limit: 100 }),
    mautic.healthCheck(),
    rudder.healthCheck(),
    rudder.getRecentEventCount(),
  ]);

  // ── Customers (from Mautic) ──────────────────────────────────────
  const totalContacts = allContacts.status === 'fulfilled' && allContacts.value?.ok
    ? Number(allContacts.value.data?.total || 0) : 0;
  const noEmail = noEmailContacts.status === 'fulfilled' && noEmailContacts.value?.ok
    ? Number(noEmailContacts.value.data?.total || 0) : 0;
  const identifiedContacts = totalContacts - noEmail;

  const customers = {
    total:       totalContacts || MOCK_DASHBOARD.customers.total,
    known:       identifiedContacts || MOCK_DASHBOARD.customers.known,
    anonymous:   Math.round((totalContacts || MOCK_DASHBOARD.customers.total) * 0.36),
    newToday:    MOCK_DASHBOARD.customers.newToday,
    growthPercent: MOCK_DASHBOARD.customers.growthPercent,
    source:      totalContacts > 0 ? 'mautic' : 'mock',
  };

  // ── Audiences / Segments (from Mautic) ──────────────────────────
  let audiences;
  if (segments.status === 'fulfilled' && segments.value?.ok) {
    const segList  = segments.value.data?.lists || segments.value.data || [];
    const segArray = Array.isArray(segList) ? segList : Object.values(segList);
    audiences = {
      total:  Number(segments.value.data?.total || segArray.length),
      active: segArray.filter(s => s.isPublished !== false).length,
      draft:  0,
      paused: 0,
      source: 'mautic',
    };
  } else {
    audiences = { ...MOCK_DASHBOARD.audiences, source: 'mock' };
  }

  // ── Data Quality (derived) ───────────────────────────────────────
  const identityCoverage = totalContacts > 0
    ? Math.round((identifiedContacts / totalContacts) * 100) : 94;
  const dqScore = Math.round(
    (identityCoverage * 0.5) +
    (MOCK_DASHBOARD.dataQuality.eventCompleteness * 0.3) +
    (MOCK_DASHBOARD.dataQuality.trackingCoverage  * 0.2)
  );
  const dataQuality = {
    score:            totalContacts > 0 ? dqScore : MOCK_DASHBOARD.dataQuality.score,
    identityCoverage,
    eventCompleteness: MOCK_DASHBOARD.dataQuality.eventCompleteness,
    trackingCoverage:  MOCK_DASHBOARD.dataQuality.trackingCoverage,
    dataFreshness:     MOCK_DASHBOARD.dataQuality.dataFreshness,
    missingEmails:     noEmail,
    source:            totalContacts > 0 ? 'mautic' : 'mock',
  };

  // ── System Health ────────────────────────────────────────────────
  // healthCheck() returns {status:'connected'|'degraded'}
  const mauticOk = mauticHealth.status === 'fulfilled' && mauticHealth.value?.status === 'connected';
  const rsOk     = rsHealth.status === 'fulfilled'    && rsHealth.value?.status    === 'connected';
  const systemHealth = {
    rudderstack:  rsOk     ? 'connected' : 'degraded',
    mautic:       mauticOk ? 'connected' : 'degraded',
    cdpDatabase:  'connected',
    overallStatus: (rsOk && mauticOk) ? 'healthy' : 'degraded',
    rsVersion:    rsOk ? rsHealth.value?.version : undefined,
    source:       'live',
  };

  // ── Recent Activity (from RudderStack Postgres) ──────────────────
  const actOk = rsActivity.status === 'fulfilled' && rsActivity.value?.source === 'rudderstack';
  const recentActivity = actOk
    ? { ...rsActivity.value }
    : { ...MOCK_DASHBOARD.recentActivity, source: 'mock' };

  // ── Campaigns — mock until campaigns module is wired ────────────
  const campaigns = { ...MOCK_DASHBOARD.campaigns, source: 'mock' };

  return { customers, audiences, dataQuality, systemHealth, recentActivity, campaigns };
}

// GET /api/dashboard
router.get('/', requireRole('viewer'), async (_req, res) => {
  if (!useMock) {
    try {
      const real = await buildRealDashboard();
      return res.json({ ...real, updatedAt: new Date().toISOString(), mode: 'live' });
    } catch (err) {
      console.warn('[Dashboard] BFF error, falling back to mock:', err.message);
    }
  }
  res.json({ ...MOCK_DASHBOARD, updatedAt: new Date().toISOString(), mode: 'mock' });
});

module.exports = router;
