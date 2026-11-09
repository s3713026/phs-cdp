/**
 * GET /api/module-status
 *
 * Returns the connection status of each major module.
 * UI uses this on page load to decide whether to show real data or empty state.
 *
 * Response:
 * {
 *   useMock: false,
 *   modules: {
 *     customers:   { status: 'connected'|'not_connected'|'degraded', source: 'cdp'|'mautic'|'mock'|'none', note: '' },
 *     audiences:   { ... },
 *     campaigns:   { status: 'not_connected', source: 'none', note: 'Mautic campaign API not wired yet' },
 *     journeys:    { ... },
 *     dataQuality: { ... },
 *     events:      { ... },
 *     sources:     { ... },
 *     destinations:{ ... },
 *   }
 * }
 */
const express      = require('express');
const router       = express.Router();
const { requireRole } = require('../middleware/rbac');
const { USE_MOCK }    = require('../utils/mock-guard');
const MauticAdapter   = require('../adapters/MauticAdapter');
const RudderStackAdapter = require('../adapters/RudderStackAdapter');

const mautic = new MauticAdapter();
const rs     = new RudderStackAdapter();

router.get('/', requireRole('viewer'), async (_req, res) => {
  if (USE_MOCK) {
    // All modules "connected" via mock
    const mockStatus = s => ({ status: 'mock', source: 'mock', note: 'USE_MOCK=true — showing demo data' });
    return res.json({
      useMock: true,
      modules: {
        customers:    mockStatus(), audiences: mockStatus(), campaigns:    mockStatus(),
        journeys:     mockStatus(), dataQuality: mockStatus(), events:     mockStatus(),
        sources:      mockStatus(), destinations: mockStatus(), dataCatalog: mockStatus(),
      },
    });
  }

  // Check each backend in parallel
  const [mauticOk, rsOk, cdpOk] = await Promise.all([
    mautic.healthCheck().then(r => r?.status === 'connected').catch(() => false),
    rs.healthCheck().catch(() => false),
    // Quick CDP Postgres check
    (async () => {
      try {
        const { query } = require('../db/pool');
        await query('SELECT 1');
        return true;
      } catch { return false; }
    })(),
  ]);

  // Check if CDP has any data
  let cdpHasCustomers = false, cdpHasAudiences = false;
  if (cdpOk) {
    try {
      const { query } = require('../db/pool');
      const [custRes, audRes] = await Promise.all([
        query('SELECT COUNT(*) FROM cdp_customers'),
        query('SELECT COUNT(*) FROM cdp_audiences'),
      ]);
      cdpHasCustomers = parseInt(custRes.rows[0].count) > 0;
      cdpHasAudiences = parseInt(audRes.rows[0].count) > 0;
    } catch { /* ignore */ }
  }

  const modules = {
    customers: cdpOk
      ? { status: cdpHasCustomers ? 'connected' : 'empty', source: 'cdp',
          note: cdpHasCustomers ? 'CDP Postgres' : 'CDP Postgres connected but no customer records yet. Send identify() events.' }
      : mauticOk
        ? { status: 'connected', source: 'mautic', note: 'Served from Mautic contacts (CDP Postgres unavailable)' }
        : { status: 'not_connected', source: 'none', note: 'CDP Postgres and Mautic both unavailable.' },

    audiences: cdpOk
      ? { status: cdpHasAudiences ? 'connected' : 'empty', source: 'cdp',
          note: cdpHasAudiences ? 'CDP Postgres' : 'CDP Postgres connected but no audiences created yet.' }
      : { status: 'not_connected', source: 'none', note: 'CDP Postgres unavailable.' },

    campaigns: {
      status: 'not_connected', source: 'none',
      note: 'Campaign engine not yet wired to Mautic API (Phase 6 — pending).',
    },

    journeys: {
      status: 'not_connected', source: 'none',
      note: 'Journey engine not yet wired to Mautic automation API (Phase 7 — pending).',
    },

    dataQuality: mauticOk
      ? { status: 'connected', source: 'mautic', note: 'Basic quality metrics from Mautic contact stats. RudderStack event quality pending Phase 8.' }
      : { status: 'not_connected', source: 'none', note: 'Mautic unavailable — cannot compute quality metrics.' },

    events: rsOk
      ? { status: 'connected', source: 'rudderstack', note: 'Live events from RudderStack Postgres (gw_jobs_*)' }
      : { status: 'not_connected', source: 'none', note: 'RudderStack data plane unavailable.' },

    sources: rsOk
      ? { status: 'connected', source: 'rudderstack', note: 'Read from workspaceConfig.json' }
      : { status: 'not_connected', source: 'none', note: 'RudderStack unavailable.' },

    destinations: rsOk
      ? { status: 'connected', source: 'rudderstack', note: 'Read from workspaceConfig.json' }
      : { status: 'not_connected', source: 'none', note: 'RudderStack unavailable.' },

    dataCatalog: {
      status: 'not_connected', source: 'none',
      note: 'Data Catalog uses in-memory seed data — not persisted. CDP Postgres integration pending.',
    },
  };

  res.json({ useMock: false, modules, backends: { mautic: mauticOk, rudderstack: rsOk, cdpPostgres: cdpOk } });
});

module.exports = router;
