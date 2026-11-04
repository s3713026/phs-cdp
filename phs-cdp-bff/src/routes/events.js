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

async function getLatestGwTable() {
  const result = await pgPool.query(`
    SELECT tablename FROM pg_tables
    WHERE schemaname = 'public' AND tablename LIKE 'gw_jobs_%'
    ORDER BY tablename DESC LIMIT 1
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
          name:       e.event        || 'Unknown',
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
        id: row.job_id, name: e.event || 'Unknown', type: e.type || 'track',
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
          id: row.job_id, name: e.event || 'Unknown', type: e.type || 'track',
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
            id: row.job_id, name: e.event || 'Unknown', type: e.type || 'track',
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
