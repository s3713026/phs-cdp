/**
 * Data Quality — event pipeline health from RudderStack.
 *
 * Source of truth:
 *   - Event volume / violations → RudderStack Postgres (gw_jobs_* tables)
 *   - Identity coverage         → cdp_customers Postgres
 *
 * Mautic is NOT a data source for this module.
 */
const express = require('express');
const router  = express.Router();
const { requireRole } = require('../middleware/rbac');
const { Pool }        = require('pg');

// ── RudderStack Postgres ──────────────────────────────────────────────────────
const rsPg = new Pool({
  host:     process.env.RS_PG_HOST     || 'rudder-postgres',
  port:     parseInt(process.env.RS_PG_PORT || '5432'),
  user:     process.env.RS_PG_USER     || 'rudder',
  password: process.env.RS_PG_PASSWORD || 'rudderpassword',
  database: process.env.RS_PG_DB       || 'jobsdb',
  connectionTimeoutMillis: 5000,
  max: 3,
});

// ── CDP Postgres ──────────────────────────────────────────────────────────────
const cdpPg = new Pool({
  host:     process.env.CDP_DB_HOST     || 'cdp-postgres',
  port:     parseInt(process.env.CDP_DB_PORT || '5432'),
  user:     process.env.CDP_DB_USER     || 'cdp',
  password: process.env.CDP_DB_PASSWORD || '',
  database: process.env.CDP_DB_NAME     || 'cdp_profiles',
  connectionTimeoutMillis: 5000,
  max: 3,
});

rsPg.on('error', err => console.error('[DQ/rsPg]', err.message));
cdpPg.on('error', err => console.error('[DQ/cdpPg]', err.message));

// ── Find latest gw_jobs table ─────────────────────────────────────────────────
async function getGwTable() {
  const r = await rsPg.query(`
    SELECT tablename FROM pg_tables
    WHERE schemaname = 'public' AND tablename LIKE 'gw_jobs_%'
    ORDER BY tablename DESC LIMIT 1
  `);
  return r.rows[0]?.tablename || null;
}

// ── Build overview from RudderStack + CDP Postgres ───────────────────────────
async function buildOverview() {
  const overview = {
    totalEvents: 0,
    eventsLast24h: 0,
    uniqueSources: 0,
    errorCount: 0,
    errorRate: null,
    identityCoverage: null,
    totalCustomers: 0,
    identifiedCustomers: 0,
    updatedAt: new Date().toISOString(),
    _dataStatus: 'not_connected',
    source: 'rudderstack',
  };

  // ── RudderStack event stats ─────────────────────────────────────────────
  try {
    const gwTable = await getGwTable();
    if (gwTable) {
      const [totalRes, last24hRes, sourcesRes, errorsRes] = await Promise.all([
        rsPg.query(`SELECT COUNT(*) FROM ${gwTable}`),
        rsPg.query(`SELECT COUNT(*) FROM ${gwTable} WHERE created_at > NOW() - INTERVAL '24 hours'`),
        rsPg.query(`SELECT COUNT(DISTINCT parameters->>'source_id') FROM ${gwTable}`),
        rsPg.query(`SELECT COUNT(*) FROM ${gwTable} WHERE error_code IS NOT NULL AND error_code != ''`),
      ]);
      overview.totalEvents       = Number(totalRes.rows[0].count);
      overview.eventsLast24h     = Number(last24hRes.rows[0].count);
      overview.uniqueSources     = Number(sourcesRes.rows[0].count);
      overview.errorCount        = Number(errorsRes.rows[0].count);
      overview.errorRate         = overview.totalEvents > 0
        ? Math.round((overview.errorCount / overview.totalEvents) * 10000) / 100
        : 0;
      overview._dataStatus       = 'connected';
    }
  } catch (err) {
    console.warn('[DQ] RudderStack query failed:', err.message);
  }

  // ── CDP identity coverage ───────────────────────────────────────────────
  try {
    const [totalRes, identifiedRes] = await Promise.all([
      cdpPg.query(`SELECT COUNT(*) FROM cdp_customers`),
      cdpPg.query(`SELECT COUNT(*) FROM cdp_customers WHERE email IS NOT NULL AND email != ''`),
    ]);
    overview.totalCustomers      = Number(totalRes.rows[0].count);
    overview.identifiedCustomers = Number(identifiedRes.rows[0].count);
    overview.identityCoverage    = overview.totalCustomers > 0
      ? Math.round((overview.identifiedCustomers / overview.totalCustomers) * 100)
      : null;
  } catch (err) {
    console.warn('[DQ] CDP Postgres query failed:', err.message);
  }

  return overview;
}

// ── GET /api/data-quality ─────────────────────────────────────────────────────
router.get('/', requireRole('viewer'), async (_req, res) => {
  try {
    const overview = await buildOverview();
    return res.json(overview);
  } catch (err) {
    console.error('[DataQuality] overview error:', err.message);
    return res.json({
      _dataStatus: 'error', error: err.message,
      updatedAt: new Date().toISOString(), source: 'none',
    });
  }
});

// ── GET /api/data-quality/issues ─────────────────────────────────────────────
router.get('/issues', requireRole('viewer'), async (req, res) => {
  const { severity } = req.query;
  try {
    const gwTable = await getGwTable().catch(() => null);
    const issues = [];

    if (!gwTable) {
      return res.json({ data: [], total: 0, _dataStatus: 'not_connected', source: 'rudderstack' });
    }

    // Error events from RudderStack
    const errRes = await rsPg.query(`
      SELECT
        error_code,
        error_response,
        parameters->>'source_id' AS source_id,
        COUNT(*) AS cnt,
        MAX(created_at) AS latest_at
      FROM ${gwTable}
      WHERE error_code IS NOT NULL AND error_code != ''
      GROUP BY error_code, error_response, source_id
      ORDER BY cnt DESC
      LIMIT 50
    `);

    errRes.rows.forEach((row, idx) => {
      issues.push({
        id:           `rs_err_${idx}`,
        severity:     Number(row.cnt) > 100 ? 'critical' : Number(row.cnt) > 10 ? 'warning' : 'info',
        type:         'event_error',
        title:        `Event Error: ${row.error_code || 'Unknown'}`,
        description:  row.error_response || `${row.cnt} events failed with error code ${row.error_code}`,
        affectedCount: Number(row.cnt),
        sourceId:     row.source_id,
        latestAt:     row.latest_at,
        source:       'RudderStack',
        status:       'Open',
      });
    });

    const filtered = severity ? issues.filter(i => i.severity === severity) : issues;
    return res.json({ data: filtered, total: filtered.length, source: 'rudderstack' });
  } catch (err) {
    console.error('[DataQuality/issues] error:', err.message);
    return res.json({ data: [], total: 0, _dataStatus: 'error', error: err.message });
  }
});

module.exports = router;
