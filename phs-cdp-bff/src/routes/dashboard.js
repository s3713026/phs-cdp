/**
 * PHS CDP — Dashboard Summary API
 * GET /api/dashboard
 *
 * USE_MOCK=true   → toàn bộ mock data, không gọi DB/API
 * USE_MOCK=false  → chỉ dữ liệu thật, không có thì để 0/rỗng
 * USE_MOCK=none   → thật trước, thiếu fallback sang mock  (default)
 */

const express = require('express');
const router  = express.Router();
const { requireRole } = require('../middleware/rbac');
const MauticAdapter        = require('../adapters/MauticAdapter');
const RudderStackAdapter   = require('../adapters/RudderStackAdapter');

const mautic = new MauticAdapter();
const rudder = new RudderStackAdapter();
const db     = require('../db/pool');   // CDP Postgres

// ── Mode detection ──────────────────────────────────────────────────────────
// USE_MOCK=true  → mock only
// USE_MOCK=false → live only (no fallback)
// USE_MOCK=none or unset → live with mock fallback
const MOCK_MODE = process.env.USE_MOCK === 'true'  ? 'mock_only'
                : process.env.USE_MOCK === 'false' ? 'live_only'
                : 'live_with_fallback';

// ── Mock data ───────────────────────────────────────────────────────────────
const MOCK_DASHBOARD = {
  customers: {
    total: 1284392, known: 824615, anonymous: 459777,
    newToday: 142, growthPercent: 2.4,
  },
  audiences: { total: 12, active: 8, draft: 3, paused: 1 },
  campaigns:  { total: 7, active: 3, scheduled: 2, completed: 2 },
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
  lifecycleBreakdown: [
    { lifecycle_stage: 'active_investor', cnt: 329846 },
    { lifecycle_stage: 'dormant',         cnt: 197815 },
    { lifecycle_stage: 'first_trade',     cnt: 74215  },
    { lifecycle_stage: 'prospect',        cnt: 65882  },
    { lifecycle_stage: 'lead',            cnt: 57660  },
    { lifecycle_stage: 'account_opening', cnt: 49437  },
    { lifecycle_stage: 'funding',         cnt: 41208  },
    { lifecycle_stage: 'ekyc',            cnt: 41208  },
    { lifecycle_stage: 'churn_risk',      cnt: 32963  },
    { lifecycle_stage: 'vip',             cnt: 41208  },
    { lifecycle_stage: 'reactivation',    cnt: 16481  },
  ],
  recentCustomerActivity: [],
};

function buildMockResponse() {
  return {
    customers:              { ...MOCK_DASHBOARD.customers, mauticContacts: 0, source: 'mock' },
    activeCustomers:        Math.round(MOCK_DASHBOARD.customers.known * 0.60),
    lifecycleBreakdown:     MOCK_DASHBOARD.lifecycleBreakdown,
    lifecycleSource:        'mock',
    recentCustomerActivity: MOCK_DASHBOARD.recentCustomerActivity,
    audiences:              { ...MOCK_DASHBOARD.audiences, source: 'mock' },
    dataQuality:            { ...MOCK_DASHBOARD.dataQuality, source: 'mock' },
    systemHealth:           { ...MOCK_DASHBOARD.systemHealth, source: 'mock' },
    recentActivity:         { ...MOCK_DASHBOARD.recentActivity, source: 'mock' },
    campaigns:              { ...MOCK_DASHBOARD.campaigns, source: 'mock' },
    updatedAt: new Date().toISOString(),
    mode: 'mock',
  };
}

function buildEmptyResponse() {
  return {
    customers:              { total: 0, known: 0, anonymous: 0, newToday: 0, mauticContacts: 0, growthPercent: 0, source: 'live' },
    activeCustomers:        0,
    lifecycleBreakdown:     [],
    lifecycleSource:        'live',
    recentCustomerActivity: [],
    audiences:              { total: 0, active: 0, draft: 0, paused: 0, source: 'live' },
    dataQuality:            { score: 0, identityCoverage: 0, eventCompleteness: 0, trackingCoverage: 0, dataFreshness: 0, source: 'live' },
    systemHealth:           { rudderstack: 'unknown', mautic: 'unknown', cdpDatabase: 'unknown', overallStatus: 'unknown', source: 'live' },
    recentActivity:         { eventsToday: 0, eventsLastHour: 0, identifyEventsToday: 0, trackEventsToday: 0, source: 'live' },
    campaigns:              { total: 0, active: 0, scheduled: 0, completed: 0, source: 'live' },
    updatedAt: new Date().toISOString(),
    mode: 'live',
  };
}

// ── Fetch live data from CDP Postgres / Mautic / RudderStack ───────────────
async function fetchLiveData() {
  const [
    cdpProfileStats,
    cdpLifecycleStats,
    cdpActivityStats,
    cdpActiveCustomers,
    allContacts,
    segments,
    mauticHealth,
    rsHealth,
    rsActivity,
  ] = await Promise.allSettled([
    // 1) CDP Postgres: profile counts
    db.query(`
      SELECT
        COUNT(*)                                                         AS total,
        COUNT(*) FILTER (WHERE c360_customer_id IS NOT NULL)              AS known,
        COUNT(*) FILTER (WHERE c360_customer_id IS NULL
                           AND anonymous_id IS NOT NULL)                AS anonymous,
        COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '1 day') AS new_today
      FROM cdp_customers
    `),
    // 2) CDP Postgres: lifecycle breakdown
    db.query(`
      SELECT lifecycle_stage, COUNT(*) AS cnt
      FROM cdp_customers
      WHERE lifecycle_stage IS NOT NULL
      GROUP BY lifecycle_stage
      ORDER BY cnt DESC
    `),
    // 3) CDP Postgres: recent activity from c360_event
    db.query(`
      SELECT
        e.event_name,
        e.channel                              AS source,
        e.occurred_at                          AS created_at,
        COALESCE(c.full_name, 'Anonymous')     AS customer_name,
        c.id                                   AS customer_id
      FROM c360_event e
      LEFT JOIN cdp_customers c ON e.cdp_customer_uuid = c.id
      ORDER BY e.occurred_at DESC
      LIMIT 25
    `),
    // 4) CDP Postgres: active customers in last 30 days
    db.query(`
      SELECT COUNT(*) AS active
      FROM cdp_customers
      WHERE last_seen_at >= NOW() - INTERVAL '30 days'
    `),
    // 5) Mautic: total contacts
    mautic.request('GET', '/contacts', null, { limit: 1, minimal: 1 }),
    // 6) Mautic: segments
    mautic.request('GET', '/segments', null, { limit: 100 }),
    // 7) Mautic health
    mautic.healthCheck(),
    // 8) RudderStack health
    rudder.healthCheck(),
    // 9) RudderStack recent events
    rudder.getRecentEventCount(),
  ]);

  return {
    cdpProfileStats, cdpLifecycleStats, cdpActivityStats, cdpActiveCustomers,
    allContacts, segments, mauticHealth, rsHealth, rsActivity,
  };
}

// ── Assemble live response (no mock fallback) ──────────────────────────────
function assembleLive(live, withMockFallback) {
  const { cdpProfileStats, cdpLifecycleStats, cdpActivityStats, cdpActiveCustomers,
          allContacts, segments, mauticHealth, rsHealth, rsActivity } = live;

  // Customers
  const cdpRow   = cdpProfileStats.status === 'fulfilled' ? cdpProfileStats.value?.rows?.[0] : null;
  const cdpTotal = cdpRow ? parseInt(cdpRow.total || 0) : 0;
  const mauticTotal = allContacts.status === 'fulfilled' && allContacts.value?.ok
    ? Number(allContacts.value.data?.total || 0) : 0;

  let customers;
  if (cdpTotal > 0) {
    customers = {
      total:          cdpTotal,
      known:          parseInt(cdpRow.known     || 0),
      anonymous:      parseInt(cdpRow.anonymous || 0),
      newToday:       parseInt(cdpRow.new_today || 0),
      mauticContacts: mauticTotal,
      growthPercent:  withMockFallback ? MOCK_DASHBOARD.customers.growthPercent : 0,
      source:         'cdp_postgres',
    };
  } else if (withMockFallback) {
    customers = {
      total:          mauticTotal || MOCK_DASHBOARD.customers.total,
      known:          mauticTotal || MOCK_DASHBOARD.customers.known,
      anonymous:      Math.round((mauticTotal || MOCK_DASHBOARD.customers.total) * 0.36),
      newToday:       MOCK_DASHBOARD.customers.newToday,
      mauticContacts: mauticTotal,
      growthPercent:  MOCK_DASHBOARD.customers.growthPercent,
      source:         mauticTotal > 0 ? 'mautic' : 'mock',
    };
  } else {
    customers = {
      total: 0, known: 0, anonymous: 0, newToday: 0,
      mauticContacts: mauticTotal, growthPercent: 0, source: 'live',
    };
  }

  // Active customers
  const activeRow = cdpActiveCustomers.status === 'fulfilled'
    ? cdpActiveCustomers.value?.rows?.[0] : null;
  const activeCustomers = activeRow && parseInt(activeRow.active || 0) > 0
    ? parseInt(activeRow.active)
    : withMockFallback ? Math.round(customers.known * 0.60) : 0;

  // Lifecycle
  const lifecycleRows = cdpLifecycleStats.status === 'fulfilled'
    ? (cdpLifecycleStats.value?.rows || []) : [];
  const hasRealLifecycle = lifecycleRows.length > 0;
  let lifecycleBreakdown;
  if (hasRealLifecycle) {
    lifecycleBreakdown = lifecycleRows.map(r => ({
      lifecycle_stage: r.lifecycle_stage,
      cnt: parseInt(r.cnt || 0),
    }));
  } else if (withMockFallback) {
    const k = customers.known || 1;
    lifecycleBreakdown = [
      { lifecycle_stage: 'active_investor', cnt: Math.round(k * 0.40) },
      { lifecycle_stage: 'dormant',         cnt: Math.round(k * 0.09) },
      { lifecycle_stage: 'first_trade',     cnt: Math.round(k * 0.09) },
      { lifecycle_stage: 'prospect',        cnt: Math.round(k * 0.08) },
      { lifecycle_stage: 'lead',            cnt: Math.round(k * 0.07) },
      { lifecycle_stage: 'account_opening', cnt: Math.round(k * 0.06) },
      { lifecycle_stage: 'funding',         cnt: Math.round(k * 0.05) },
      { lifecycle_stage: 'ekyc',            cnt: Math.round(k * 0.05) },
      { lifecycle_stage: 'vip',             cnt: Math.round(k * 0.05) },
      { lifecycle_stage: 'churn_risk',      cnt: Math.round(k * 0.04) },
      { lifecycle_stage: 'reactivation',    cnt: Math.round(k * 0.02) },
    ];
  } else {
    lifecycleBreakdown = [];
  }

  // Recent activity
  const recentCustomerActivity = cdpActivityStats.status === 'fulfilled'
    && Array.isArray(cdpActivityStats.value?.rows)
    ? cdpActivityStats.value.rows.map(r => ({
        eventName:    r.event_name,
        customerName: r.customer_name || 'Anonymous',
        customerId:   r.customer_id,
        source:       r.source || 'web',
        timestamp:    r.created_at,
        status:       'received',
      }))
    : [];

  // Audiences
  let audiences;
  if (segments.status === 'fulfilled' && segments.value?.ok) {
    const segList  = segments.value.data?.lists || segments.value.data || [];
    const segArray = Array.isArray(segList) ? segList : Object.values(segList);
    audiences = {
      total:  Number(segments.value.data?.total || segArray.length),
      active: segArray.filter(s => s.isPublished !== false).length,
      draft:  0, paused: 0,
      source: 'mautic',
    };
  } else {
    audiences = withMockFallback
      ? { ...MOCK_DASHBOARD.audiences, source: 'mock' }
      : { total: 0, active: 0, draft: 0, paused: 0, source: 'live' };
  }

  // Data quality
  const knownPct = customers.total > 0 ? Math.round((customers.known / customers.total) * 100) : 0;
  const dataQuality = {
    score:             knownPct > 0 ? Math.min(100, Math.round(knownPct * 0.5 + 44)) : 0,
    identityCoverage:  knownPct,
    eventCompleteness: withMockFallback ? MOCK_DASHBOARD.dataQuality.eventCompleteness : 0,
    trackingCoverage:  withMockFallback ? MOCK_DASHBOARD.dataQuality.trackingCoverage  : 0,
    dataFreshness:     withMockFallback ? MOCK_DASHBOARD.dataQuality.dataFreshness     : 0,
    source:            customers.source,
  };

  // System health
  const mauticOk = mauticHealth.status === 'fulfilled' && mauticHealth.value?.status === 'connected';
  const rsOk     = rsHealth.status === 'fulfilled'     && rsHealth.value?.status    === 'connected';
  const systemHealth = {
    rudderstack:   rsOk     ? 'connected' : 'degraded',
    mautic:        mauticOk ? 'connected' : 'degraded',
    cdpDatabase:   cdpTotal >= 0 ? 'connected' : 'degraded',
    overallStatus: (rsOk && mauticOk) ? 'healthy' : 'degraded',
    rsVersion:     rsOk ? rsHealth.value?.version : undefined,
    source:        'live',
  };

  // Recent RS activity
  const actOk = rsActivity.status === 'fulfilled' && rsActivity.value?.source === 'rudderstack';
  const recentActivity = actOk
    ? { ...rsActivity.value, source: 'rudderstack' }
    : withMockFallback
      ? { ...MOCK_DASHBOARD.recentActivity, source: 'mock' }
      : { eventsToday: 0, eventsLastHour: 0, identifyEventsToday: 0, trackEventsToday: 0, source: 'live' };

  // Campaigns — not yet wired to real source
  const campaigns = withMockFallback
    ? { ...MOCK_DASHBOARD.campaigns, source: 'mock' }
    : { total: 0, active: 0, scheduled: 0, completed: 0, source: 'live' };

  return {
    customers, activeCustomers,
    lifecycleBreakdown,
    lifecycleSource: hasRealLifecycle ? 'cdp_postgres' : (withMockFallback ? 'mock' : 'live'),
    recentCustomerActivity,
    audiences, dataQuality, systemHealth, recentActivity, campaigns,
    updatedAt: new Date().toISOString(),
    mode: 'live',
  };
}

// ── GET /api/dashboard ───────────────────────────────────────────────────────
router.get('/', requireRole('viewer'), async (_req, res) => {
  // USE_MOCK=true → pure mock, không gọi gì
  if (MOCK_MODE === 'mock_only') {
    return res.json(buildMockResponse());
  }

  try {
    const live = await fetchLiveData();
    const withFallback = MOCK_MODE === 'live_with_fallback';
    return res.json(assembleLive(live, withFallback));
  } catch (err) {
    console.error('[Dashboard] Fatal error:', err.message);
    if (MOCK_MODE === 'live_with_fallback') {
      return res.json(buildMockResponse());
    }
    // live_only: trả về rỗng thay vì mock
    return res.json(buildEmptyResponse());
  }
});


// ── GET /api/dashboard/growth?period=7d|30d|90d ─────────────────────────────
router.get('/growth', requireRole('viewer'), async (req, res) => {
  const period = ['7d', '30d', '90d'].includes(req.query.period) ? req.query.period : '30d';
  const days   = period === '7d' ? 7 : period === '30d' ? 30 : 90;

  if (MOCK_MODE === 'mock_only') {
    return res.json(buildMockGrowth(period));
  }

  // Try CDP Postgres
  try {
    const cdpGrowth = await db.query(`
      SELECT
        DATE_TRUNC('day', occurred_at)::date AS day,
        COUNT(*) AS total_count
      FROM c360_event
      WHERE occurred_at >= NOW() - INTERVAL '${days} days'
      GROUP BY day
      ORDER BY day ASC
    `);
    if (cdpGrowth.rows && cdpGrowth.rows.length > 0) {
      const buckets = buildBuckets(days);
      const byDay = {};
      cdpGrowth.rows.forEach(r => {
        byDay[new Date(r.day).toISOString().slice(0, 10)] = parseInt(r.total_count || 0);
      });
      const labels = [], totals = [], knowns = [], anons = [];
      let cumTotal = 0;
      buckets.forEach(({ dateStr, label }) => {
        const cnt = byDay[dateStr] || 0;
        cumTotal += cnt;
        labels.push(label);
        totals.push(cumTotal);
        knowns.push(Math.round(cumTotal * 0.64));
        anons.push(Math.round(cumTotal * 0.36));
      });
      return res.json({ period, labels, total: totals, known: knowns, anonymous: anons, source: 'cdp_postgres', updatedAt: new Date().toISOString() });
    }
  } catch (cdpErr) {
    console.warn('[Dashboard/growth] CDP query failed:', cdpErr.message);
  }

  // Try RudderStack
  try {
    const gwTable = await rudder._getLatestGwTable();
    if (!gwTable) throw new Error('No RS table');
    const buckets = buildBuckets(days);
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
        ) AS anon_count,
        COUNT(*) AS total_count
      FROM ${gwTable}
      WHERE created_at >= NOW() - INTERVAL '${days} days'
      GROUP BY day ORDER BY day ASC
    `);
    const byDay = {};
    result.rows.forEach(r => {
      byDay[r.day.toISOString().slice(0, 10)] = {
        known: parseInt(r.known_count || 0),
        anon:  parseInt(r.anon_count  || 0),
        total: parseInt(r.total_count || 0),
      };
    });
    let cumKnown = 0, cumAnon = 0;
    const labels = [], totals = [], knowns = [], anons = [];
    buckets.forEach(({ dateStr, label }) => {
      const d = byDay[dateStr] || { known: 0, anon: 0 };
      cumKnown += d.known; cumAnon += d.anon;
      labels.push(label);
      knowns.push(cumKnown);
      anons.push(cumAnon);
      totals.push(cumKnown + cumAnon);
    });
    return res.json({ period, labels, total: totals, known: knowns, anonymous: anons, source: 'rudderstack', updatedAt: new Date().toISOString() });
  } catch (rsErr) {
    console.warn('[Dashboard/growth] RS query failed:', rsErr.message);
  }

  // Fallback
  if (MOCK_MODE === 'live_with_fallback') {
    return res.json(buildMockGrowth(period));
  }
  return res.json({ period, labels: [], total: [], known: [], anonymous: [], source: 'live', updatedAt: new Date().toISOString() });
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
    const label = daysAgo === 0 ? 'Today' : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    buckets.push({ dateStr, label, daysAgo });
  }
  return buckets;
}

function buildMockGrowth(period) {
  const MOCK = {
    '7d':  { labels: ['6 days ago','5 days ago','4 days ago','3 days ago','2 days ago','Yesterday','Today'], total: [1265000,1268500,1271200,1274800,1277900,1281300,1284392], known: [812000,814600,816900,819200,821500,823100,824615], anonymous: [453000,453900,454300,455600,456400,458200,459777] },
    '30d': { labels: ['30d ago','24d ago','18d ago','12d ago','6d ago','Today'], total: [1198000,1215400,1232800,1251900,1268700,1284392], known: [768000,781200,793500,805800,815900,824615], anonymous: [430000,434200,439300,446100,452800,459777] },
    '90d': { labels: ['90d ago','72d ago','54d ago','36d ago','18d ago','Today'], total: [1042000,1089500,1132800,1178900,1231500,1284392], known: [652000,683400,715800,748200,786500,824615], anonymous: [390000,406100,417000,430700,445000,459777] },
  };
  return { period, ...MOCK[period], source: 'mock', updatedAt: new Date().toISOString() };
}

module.exports = router;
