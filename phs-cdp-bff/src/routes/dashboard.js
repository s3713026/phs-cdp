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
const db        = require('../db');   // CDP Postgres
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
 * Build real dashboard metrics từ CDP Postgres + Mautic + RudderStack
 * Priority: CDP Postgres (profiles, lifecycle, activity) > Mautic > Mock
 */
async function buildRealDashboard() {
  const [
    cdpProfileStats,
    cdpLifecycleStats,
    cdpActivityStats,
    cdpActiveCustomers,
    cdpEventCount,
    allContacts,
    segments,
    mauticHealth,
    rsHealth,
    rsActivity,
  ] = await Promise.allSettled([
    // CDP Postgres: profile counts from cdp_customers
    // Known = has c360_customer_id (real PHS account)
    // Anonymous = only has anonymous_id, no account yet
    db.query(`
      SELECT
        COUNT(*)                                                    AS total,
        COUNT(*) FILTER (WHERE c360_customer_id IS NOT NULL)       AS known,
        COUNT(*) FILTER (WHERE c360_customer_id IS NULL
                           AND anonymous_id IS NOT NULL)           AS anonymous,
        COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '1 day') AS new_today
      FROM cdp_customers
    `),
    // CDP Postgres: lifecycle breakdown
    db.query(`
      SELECT lifecycle_stage, COUNT(*) AS cnt
      FROM cdp_customers
      WHERE lifecycle_stage IS NOT NULL
      GROUP BY lifecycle_stage
      ORDER BY cnt DESC
    `),
    // CDP Postgres: recent activity — join c360_event (primary) or cdp_events (fallback)
    // Try c360_event first (richer schema), fallback handled in JS
    db.query(`
      SELECT
        e.event_name,
        e.channel                                         AS source,
        e.occurred_at                                     AS created_at,
        COALESCE(c.full_name, 'Anonymous')                AS customer_name,
        c.id                                              AS customer_id
      FROM c360_event e
      LEFT JOIN cdp_customers c ON e.cdp_customer_uuid = c.id
      WHERE e.occurred_at >= NOW() - INTERVAL '24 hours'
      ORDER BY e.occurred_at DESC
      LIMIT 25
    `).catch(() =>
      // fallback to cdp_events if c360_event doesn't exist yet
      db.query(`
        SELECT
          e.event_name,
          e.source,
          e.created_at,
          COALESCE(c.full_name, 'Anonymous') AS customer_name,
          c.id                               AS customer_id
        FROM cdp_events e
        LEFT JOIN cdp_customers c ON e.customer_id = c.id
        WHERE e.created_at >= NOW() - INTERVAL '24 hours'
        ORDER BY e.created_at DESC
        LIMIT 25
      `)
    ),
    // CDP Postgres: active customers = seen in last 30 days
    db.query(`
      SELECT COUNT(*) AS active
      FROM cdp_customers
      WHERE last_seen_at >= NOW() - INTERVAL '30 days'
    `),
    // Mautic: total contacts (fallback when CDP empty)
    mautic.request('GET', '/contacts', null, { limit: 1, minimal: 1 }),
    mautic.request('GET', '/segments', null, { limit: 100 }),
    mautic.healthCheck(),
    rudder.healthCheck(),
    rudder.getRecentEventCount(),
  ]);

  // ── Customers (CDP Postgres primary, Mautic fallback) ───────────
  const cdpRow   = cdpProfileStats.status === 'fulfilled' ? cdpProfileStats.value?.rows?.[0] : null;
  const cdpTotal = cdpRow ? parseInt(cdpRow.total || 0) : 0;
  const mauticTotal = allContacts.status === 'fulfilled' && allContacts.value?.ok
    ? Number(allContacts.value.data?.total || 0) : 0;

  let customers;
  if (cdpTotal > 0) {
    customers = {
      total:         cdpTotal,
      known:         parseInt(cdpRow.known     || 0),
      anonymous:     parseInt(cdpRow.anonymous || 0),
      newToday:      parseInt(cdpRow.new_today || 0),
      mauticContacts: mauticTotal,
      growthPercent: MOCK_DASHBOARD.customers.growthPercent,
      source:        'cdp_postgres',
    };
  } else {
    customers = {
      total:         mauticTotal || MOCK_DASHBOARD.customers.total,
      known:         mauticTotal || MOCK_DASHBOARD.customers.known,
      anonymous:     Math.round((mauticTotal || MOCK_DASHBOARD.customers.total) * 0.36),
      newToday:      MOCK_DASHBOARD.customers.newToday,
      mauticContacts: mauticTotal,
      growthPercent: MOCK_DASHBOARD.customers.growthPercent,
      source:        mauticTotal > 0 ? 'mautic' : 'mock',
    };
  }

  // ── Active Customers (CDP Postgres) ──────────────────────────────
  const activeRow = cdpActiveCustomers.status === 'fulfilled'
    ? cdpActiveCustomers.value?.rows?.[0] : null;
  const activeCustomers = activeRow && parseInt(activeRow.active || 0) > 0
    ? parseInt(activeRow.active)
    : Math.round(customers.known * 0.60);

  // ── Lifecycle Breakdown (CDP Postgres) ───────────────────────────
  let lifecycleBreakdown = {};
  if (cdpLifecycleStats.status === 'fulfilled') {
    (cdpLifecycleStats.value?.rows || []).forEach(r => {
      lifecycleBreakdown[r.lifecycle_stage] = parseInt(r.cnt || 0);
    });
  }
  const hasRealLifecycle = Object.keys(lifecycleBreakdown).length > 0;
  if (!hasRealLifecycle) {
    // Mock proportional to known customers
    const k = customers.known;
    lifecycleBreakdown = {
      prospect: Math.round(k * 0.08), lead: Math.round(k * 0.07),
      ekyc: Math.round(k * 0.05), account_opening: Math.round(k * 0.06),
      funding: Math.round(k * 0.05), first_trade: Math.round(k * 0.09),
      active_investor: Math.round(k * 0.40), vip: Math.round(k * 0.05),
      dormant: Math.round(k * 0.09), churn_risk: Math.round(k * 0.04),
      reactivation: Math.round(k * 0.02),
    };
  }

  // ── Recent Customer Activity (CDP Postgres cdp_events) ───────────
  let recentCustomerActivity = [];
  if (cdpActivityStats.status === 'fulfilled') {
    recentCustomerActivity = (cdpActivityStats.value?.rows || []).map(r => ({
      eventName:    r.event_name,
      customerName: r.customer_name,
      customerId:   r.customer_id,
      source:       r.source || 'web',
      timestamp:    r.created_at,
    }));
  }

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

  // ── Recent Activity ──────────────────────────────────────────────
  // Priority: CDP Postgres (c360_event) → RudderStack GW → mock
  const cdpEventsRow  = cdpEventCount.status === 'fulfilled' ? cdpEventCount.value?.rows?.[0] : null;
  const cdpEventsTodayCnt = cdpEventsRow ? parseInt(cdpEventsRow.events_today || 0) : 0;

  const actOk = rsActivity.status === 'fulfilled' && rsActivity.value?.source === 'rudderstack';
  const rsEventsToday = actOk ? (rsActivity.value?.eventsToday || 0) : 0;

  // Use CDP count if available (direct from c360_event), else RS, else mock
  const eventsToday = cdpEventsTodayCnt > 0
    ? cdpEventsTodayCnt
    : rsEventsToday > 0
      ? rsEventsToday
      : MOCK_DASHBOARD.recentActivity.eventsToday;

  const recentActivity = {
    ...(actOk ? rsActivity.value : MOCK_DASHBOARD.recentActivity),
    eventsToday,
    source: cdpEventsTodayCnt > 0 ? 'cdp_postgres' : actOk ? 'rudderstack' : 'mock',
  };

  // ── Campaigns — mock until campaigns module is wired ────────────
  const campaigns = { ...MOCK_DASHBOARD.campaigns, source: 'mock' };

  return {
    customers, activeCustomers,
    lifecycleBreakdown: Object.entries(lifecycleBreakdown).map(([stage, cnt]) => ({ lifecycle_stage: stage, cnt })),
    lifecycleSource: hasRealLifecycle ? 'cdp_postgres' : 'mock',
    recentCustomerActivity,
    audiences, dataQuality, systemHealth, recentActivity, campaigns,
  };
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


/**
 * GET /api/dashboard/growth?period=7d|30d|90d
 *
 * Trả về time-series profile growth từ RudderStack Postgres.
 * - Mỗi điểm là số identify events tích lũy theo ngày
 * - Phân tách known (có userId) vs anonymous (chỉ có anonymousId)
 * - Fallback: trả mock với flag source='mock'
 */
router.get('/growth', requireRole('viewer'), async (req, res) => {
  const period = ['7d', '30d', '90d'].includes(req.query.period) ? req.query.period : '30d';
  const days   = period === '7d' ? 7 : period === '30d' ? 30 : 90;

  if (useMock) {
    return res.json(buildMockGrowth(period));
  }

  try {
    const gwTable = await rudder._getLatestGwTable();
    if (!gwTable) throw new Error('No RudderStack gateway table found');

    // Build N evenly-spaced date buckets
    const buckets = buildBuckets(days);

    // Single query: count identify events per day, known vs anonymous
    const result = await rudder.pgPool.query(`
      SELECT
        DATE_TRUNC('day', created_at)::date AS day,
        COUNT(*) FILTER (
          WHERE event_payload::jsonb->'batch'->0->>'userId' IS NOT NULL
            AND event_payload::jsonb->'batch'->0->>'userId' != ''
        ) AS known_count,
        COUNT(*) FILTER (
          WHERE (event_payload::jsonb->'batch'->0->>'userId' IS NULL
              OR event_payload::jsonb->'batch'->0->>'userId' = '')
            AND event_payload::jsonb->'batch'->0->>'anonymousId' IS NOT NULL
        ) AS anon_count,
        COUNT(*) AS total_count
      FROM ${gwTable}
      WHERE event_payload::jsonb->'batch'->0->>'type' = 'identify'
        AND created_at >= NOW() - INTERVAL '${days} days'
      GROUP BY day
      ORDER BY day ASC
    `);

    // Map rows into bucket slots; fill gaps with 0
    const byDay = {};
    result.rows.forEach(r => {
      byDay[r.day.toISOString().slice(0, 10)] = {
        known: parseInt(r.known_count || 0),
        anon:  parseInt(r.anon_count  || 0),
        total: parseInt(r.total_count || 0),
      };
    });

    // Accumulate running totals — start from 0 (relative growth for period)
    let cumKnown = 0, cumAnon = 0;
    const labels = [], totals = [], knowns = [], anons = [];
    buckets.forEach(({ dateStr, label }) => {
      const d = byDay[dateStr] || { known: 0, anon: 0, total: 0 };
      cumKnown += d.known;
      cumAnon  += d.anon;
      labels.push(label);
      knowns.push(cumKnown);
      anons.push(cumAnon);
      totals.push(cumKnown + cumAnon);
    });

    return res.json({
      period,
      labels,
      total:     totals,
      known:     knowns,
      anonymous: anons,
      source:    'rudderstack',
      updatedAt: new Date().toISOString(),
    });
  } catch (err) {
    console.warn('[Dashboard/growth] RS unavailable, returning mock:', err.message);
    return res.json(buildMockGrowth(period));
  }
});

// ── Helpers ──────────────────────────────────────────────────────────────────

function buildBuckets(days) {
  const points = days <= 7 ? days : days <= 30 ? 6 : 7;
  const step   = days / (points - 1);
  const buckets = [];
  for (let i = 0; i < points; i++) {
    const daysAgo = Math.round(days - i * step);
    const d = new Date();
    d.setDate(d.getDate() - daysAgo);
    const dateStr = d.toISOString().slice(0, 10);
    const label = daysAgo === 0
      ? 'Today'
      : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    buckets.push({ dateStr, label, daysAgo });
  }
  return buckets;
}

function buildMockGrowth(period) {
  const MOCK = {
    '7d':  {
      labels:    ['6 days ago','5 days ago','4 days ago','3 days ago','2 days ago','Yesterday','Today'],
      total:     [1265000, 1268500, 1271200, 1274800, 1277900, 1281300, 1284392],
      known:     [812000,  814600,  816900,  819200,  821500,  823100,  824615],
      anonymous: [453000,  453900,  454300,  455600,  456400,  458200,  459777],
    },
    '30d': {
      labels:    ['30d ago','24d ago','18d ago','12d ago','6d ago','Today'],
      total:     [1198000, 1215400, 1232800, 1251900, 1268700, 1284392],
      known:     [768000,  781200,  793500,  805800,  815900,  824615],
      anonymous: [430000,  434200,  439300,  446100,  452800,  459777],
    },
    '90d': {
      labels:    ['90d ago','72d ago','54d ago','36d ago','18d ago','Today'],
      total:     [1042000, 1089500, 1132800, 1178900, 1231500, 1284392],
      known:     [652000,  683400,  715800,  748200,  786500,  824615],
      anonymous: [390000,  406100,  417000,  430700,  445000,  459777],
    },
  };
  return { period, ...MOCK[period], source: 'mock', updatedAt: new Date().toISOString() };
}

module.exports = router;
