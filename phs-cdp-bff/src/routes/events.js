const express = require('express');
const router  = express.Router();
const { requireRole } = require('../middleware/rbac');
const { Pool } = require('pg');
const RudderStackAdapter = require('../adapters/RudderStackAdapter');

const rudder = new RudderStackAdapter();

const pgPool = new Pool({
  host:                    process.env.RS_PG_HOST     || 'rudder-postgres',
  port:                    parseInt(process.env.RS_PG_PORT || '5432'),
  user:                    process.env.RS_PG_USER     || 'rudder',
  password:                process.env.RS_PG_PASSWORD || 'rudderpassword',
  database:                process.env.RS_PG_DB       || 'jobsdb',
  connectionTimeoutMillis: 5000,
  idleTimeoutMillis:       10000,
  max:                     5,
  ssl:                     false,
});

pgPool.on('error', (err) => {
  console.error('[PG Pool] Unexpected error:', err.message);
});

// Display name of an SDK event: track → its event name, page/screen → "Page Viewed: <name>".
function eventName(e) {
  if (e.type === 'page')   return `Page Viewed${e.name ? ': ' + e.name : (e.properties && e.properties.title ? ': ' + e.properties.title : '')}`;
  if (e.type === 'screen') return `Screen Viewed${e.name ? ': ' + e.name : ''}`;
  if (e.type === 'identify') return 'Identify';
  if (e.type === 'alias') return 'Alias';
  return e.event || 'Unknown';
}

async function getLatestGwTable() {
  const result = await pgPool.query(`
    SELECT tablename FROM pg_tables
    WHERE schemaname = 'public' AND tablename LIKE 'gw_jobs_%'
    ORDER BY NULLIF(regexp_replace(tablename, '[^0-9]', '', 'g'), '')::int DESC NULLS LAST LIMIT 1
  `);
  return result.rows[0]?.tablename || 'gw_jobs_1';
}

// GET /events — list events from RudderStack Postgres
router.get('/', requireRole('viewer'), async (req, res) => {
  const { limit = 50, customerId, eventName } = req.query;

  try {
    const gwTable = await getLatestGwTable();

    const sql = `
      SELECT
        job_id,
        parameters->>'source_id' AS source_id,
        event_payload::jsonb->'batch'->0 AS event_data,
        created_at
      FROM ${gwTable}
      ORDER BY created_at DESC
      LIMIT $1
    `;
    const result = await pgPool.query(sql, [Number(limit)]);

    const data = result.rows
      .map(row => {
        const e = row.event_data || {};
        return {
          id:         row.job_id,
          name:       eventName(e),
          type:       e.type         || 'track',
          customerId: e.userId       || e.anonymousId || null,
          sourceId:   row.source_id,
          properties: e.properties   || {},
          receivedAt: e.receivedAt   || row.created_at,
        };
      })
      .filter(e => {
        if (customerId && e.customerId !== customerId) return false;
        if (eventName  && e.name       !== eventName)  return false;
        return true;
      });

    res.json({ data, total: data.length });
  } catch (err) {
    console.error('[events] PG error:', err.message);
    res.status(500).json({ error: { message: 'Failed to load events', detail: err.message } });
  }
});

// GET /events/stats — aggregate stats from RudderStack
router.get('/stats', requireRole('viewer'), async (_req, res) => {
  try {
    const stats = await rudder.getEventStats();
    res.json(stats);
  } catch (err) {
    console.error('[events/stats] error:', err.message);
    res.status(500).json({ error: { message: 'Failed to load event stats', detail: err.message } });
  }
});


// GET /events/flow-stats — per source / destination activity for Data → All Data Flows
//   inbound  : events accepted by the gateway, per source (all gw_jobs tables, last 7 days)
//   outbound : deliveries per destination (router tables); the system webhook also reports its own counters
router.get('/flow-stats', requireRole('viewer'), async (_req, res) => {
  const out = { sources: {}, destinations: {}, generatedAt: new Date().toISOString() };

  // Helper: query with a per-call timeout so RS Postgres slow tables don't block the response
  const withTimeout = (promise, ms) => Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error('query timeout')), ms)),
  ]);

  const tables = async (prefix) => {
    try {
      const r = await withTimeout(
        pgPool.query(`SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename LIKE $1`, [prefix + '_%']),
        3000
      );
      return r.rows.map(r => r.tablename).filter(t => /^[a-z_0-9]+$/.test(t));
    } catch { return []; }
  };

  try {
    for (const t of await tables('gw_jobs')) {
      try {
        const r = await withTimeout(pgPool.query(
          `SELECT parameters->>'source_id' AS id, COUNT(*)::int AS n, MAX(created_at) AS last
             FROM ${t} WHERE created_at > NOW() - INTERVAL '7 days' GROUP BY 1`), 4000);
        for (const row of r.rows) {
          if (!row.id) continue;
          const o = out.sources[row.id] || (out.sources[row.id] = { records: 0, last: null });
          o.records += row.n;
          if (!o.last || row.last > o.last) o.last = row.last;
        }
      } catch { /* skip slow/broken table */ }
    }
  } catch (err) { out.sourceError = err.message; }

  try {
    for (const t of await tables('rt_jobs')) {
      try {
        const r = await withTimeout(pgPool.query(
          `SELECT parameters->>'destination_id' AS id, COUNT(*)::int AS n, MAX(created_at) AS last
             FROM ${t} WHERE created_at > NOW() - INTERVAL '7 days' GROUP BY 1`), 4000);
        for (const row of r.rows) {
          if (!row.id) continue;
          const o = out.destinations[row.id] || (out.destinations[row.id] = { records: 0, last: null });
          o.records += row.n;
          if (!o.last || row.last > o.last) o.last = row.last;
        }
      } catch { /* skip slow/broken table */ }
    }
  } catch (err) { out.destinationError = err.message; }

  // Webhook / CDP Postgres event counters (persistent — survives BFF restarts)
  try {
    const w = require("./webhook")._status();
    try {
      const cdpDb = require("../db");
      const cdpRes = await withTimeout(
        cdpDb.query("SELECT COUNT(*) AS total_events, MAX(occurred_at) AS last_event FROM c360_event"),
        3000
      );
      const cdpRow = cdpRes.rows[0];
      const cdpTotal = parseInt(cdpRow?.total_events || 0);
      out.webhook = {
        stored:         cdpTotal > 0 ? cdpTotal : w.stored,
        failed:         w.failed,
        lastReceivedAt: cdpRow?.last_event || w.lastReceivedAt,
        source:         cdpTotal > 0 ? "cdp_postgres" : "in_memory",
      };
    } catch (cdpErr) {
      out.webhook = { stored: w.stored, failed: w.failed, lastReceivedAt: w.lastReceivedAt, source: "in_memory" };
    }
  } catch { out.webhook = { stored: 0, failed: 0, lastReceivedAt: null }; }

  res.json(out);
});

// GET /events/health — RudderStack data plane health
router.get('/health', requireRole('viewer'), async (_req, res) => {
  try {
    const health = await rudder.healthCheck();
    res.json(health);
  } catch (err) {
    res.status(500).json({ status: 'error', error: err.message });
  }
});

// GET /events/stream — snapshot for polling
router.get('/stream', requireRole('viewer'), async (req, res) => {
  const { limit = 50, customerId, eventName } = req.query;
  try {
    const gwTable = await getLatestGwTable();
    const sql = `
      SELECT job_id, parameters->>'source_id' AS source_id,
             event_payload::jsonb->'batch'->0 AS event_data, created_at
      FROM ${gwTable} ORDER BY created_at DESC LIMIT $1
    `;
    const result = await pgPool.query(sql, [Number(limit)]);
    const data = result.rows.map(row => {
      const e = row.event_data || {};
      return {
        id: row.job_id, name: eventName(e), type: e.type || 'track',
        customerId: e.userId || e.anonymousId || null,
        sourceId: row.source_id, properties: e.properties || {},
        receivedAt: e.receivedAt || row.created_at,
        category: e.properties?.category || 'Behavior',
        status: 'Received',
      };
    }).filter(e => {
      if (customerId && e.customerId !== customerId) return false;
      if (eventName && e.name !== eventName) return false;
      return true;
    });
    res.json({ data, total: data.length });
  } catch (err) {
    res.status(500).json({ error: { message: 'Failed to load events', detail: err.message } });
  }
});

// GET /events/stream/sse — Server-Sent Events real-time stream
router.get('/stream/sse', requireRole('viewer'), async (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.flushHeaders();

  let lastJobId = 0;

  // Send initial snapshot
  try {
    const gwTable = await getLatestGwTable();
    const init = await pgPool.query(
      `SELECT job_id, parameters->>'source_id' AS source_id,
              event_payload::jsonb->'batch'->0 AS event_data, created_at
       FROM ${gwTable} ORDER BY created_at DESC LIMIT 20`
    );
    if (init.rows.length > 0) {
      lastJobId = init.rows[0].job_id;
      init.rows.forEach(row => {
        const e = row.event_data || {};
        const event = {
          id: row.job_id, name: eventName(e), type: e.type || 'track',
          customerId: e.userId || e.anonymousId || null,
          sourceId: row.source_id, properties: e.properties || {},
          receivedAt: e.receivedAt || row.created_at,
          category: 'Behavior', status: 'Received',
        };
        res.write(`event: event\ndata: ${JSON.stringify(event)}\n\n`);
      });
    }
  } catch (err) {
    console.error('[sse] init error:', err.message);
  }

  // Poll for new events every 5s
  const interval = setInterval(async () => {
    try {
      const gwTable = await getLatestGwTable();
      const result = await pgPool.query(
        `SELECT job_id, parameters->>'source_id' AS source_id,
                event_payload::jsonb->'batch'->0 AS event_data, created_at
         FROM ${gwTable} WHERE job_id > $1 ORDER BY created_at DESC LIMIT 10`,
        [lastJobId]
      );
      if (result.rows.length > 0) {
        lastJobId = result.rows[0].job_id;
        result.rows.forEach(row => {
          const e = row.event_data || {};
          const event = {
            id: row.job_id, name: eventName(e), type: e.type || 'track',
            customerId: e.userId || e.anonymousId || null,
            sourceId: row.source_id, properties: e.properties || {},
            receivedAt: e.receivedAt || row.created_at,
            category: 'Behavior', status: 'Received',
          };
          res.write(`event: event\ndata: ${JSON.stringify(event)}\n\n`);
        });
      }
      // Heartbeat
      res.write(': heartbeat\n\n');
    } catch (err) {
      console.error('[sse] poll error:', err.message);
    }
  }, 5000);

  req.on('close', () => {
    clearInterval(interval);
  });
});

module.exports = router;
