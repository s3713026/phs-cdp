const axios = require('axios');
const fs    = require('fs');
const path  = require('path');
const { Pool } = require('pg');

class RudderStackAdapter {
  constructor() {
    this.dataplaneUrl = process.env.RUDDERSTACK_DATA_PLANE_URL || 'http://rudder-server:8082';
    this.writeKey     = process.env.RUDDERSTACK_WRITE_KEY || 'phs_web_write_key_2024';
    this.adminPwd     = process.env.RUDDERSTACK_ADMIN_PASSWORD || 'PHS@Rudder2024!';
    this._pgPool = null;
  }

  // ── Lazy PostgreSQL pool ──────────────────────────────────────────
  get pgPool() {
    if (!this._pgPool) {
      this._pgPool = new Pool({
        host:                    process.env.RS_PG_HOST     || 'rudder-postgres',
        port:                    parseInt(process.env.RS_PG_PORT  || '5432'),
        user:                    process.env.RS_PG_USER     || 'rudder',
        password:                process.env.RS_PG_PASSWORD || 'rudderpassword',
        database:                process.env.RS_PG_DB       || 'jobsdb',
        connectionTimeoutMillis: 5000,
        idleTimeoutMillis:       15000,
        max:                     5,
        ssl:                     false,
      });
      this._pgPool.on('error', (err) => {
        console.error('[RSAdapter/PG] Pool error:', err.message);
      });
    }
    return this._pgPool;
  }

  // ── Lấy tên bảng gw_jobs mới nhất ───────────────────────────────
  async _getLatestGwTable() {
    const result = await this.pgPool.query(`
      SELECT tablename FROM pg_tables
      WHERE schemaname = 'public' AND tablename LIKE 'gw_jobs_%'
      ORDER BY tablename DESC LIMIT 1
    `);
    return result.rows[0]?.tablename || 'gw_jobs_1';
  }

  // ── Health check — ping Data Plane ──────────────────────────────
  async healthCheck() {
    try {
      const res = await axios.get(`${this.dataplaneUrl}/health`, { timeout: 5000 });
      return { status: 'connected', version: res.data?.version || 'unknown', server: res.data?.server };
    } catch (err) {
      return { status: 'disconnected', error: err.message };
    }
  }

  // ── WorkspaceConfig helpers ──────────────────────────────────────
  _findConfigPath() {
    const candidates = [
      process.env.WORKSPACE_CONFIG_PATH,
      path.join(__dirname, '../../workspaceConfig.json'),
      path.join(__dirname, '../../../phs-cdp-ui/rudderstack-setup/workspaceConfig.json'),
    ].filter(Boolean);
    for (const p of candidates) {
      if (fs.existsSync(p)) return p;
    }
    return candidates[1]; // fallback: bff root
  }

  _loadWorkspaceConfig() {
    const p = this._findConfigPath();
    if (p && fs.existsSync(p)) {
      try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch {}
    }
    return { sources: [] };
  }

  _writeWorkspaceConfig(config) {
    const candidates = [
      process.env.WORKSPACE_CONFIG_PATH,
      path.join(__dirname, '../../workspaceConfig.json'),
      path.join(__dirname, '../../../phs-cdp-ui/rudderstack-setup/workspaceConfig.json'),
    ].filter(Boolean);

    for (const p of candidates) {
      try {
        if (fs.existsSync(p) || p === candidates[1]) {
          fs.writeFileSync(p, JSON.stringify(config, null, 2), 'utf8');
          console.log('[RSAdapter] Wrote workspaceConfig to:', p);
        }
      } catch (err) {
        console.warn('[RSAdapter] Cannot write to:', p, err.message);
      }
    }
  }

  // ── Sources ──────────────────────────────────────────────────────
  getSources() {
    return this._loadWorkspaceConfig().sources || [];
  }

  getSource(id) {
    return this.getSources().find(s => s.id === id) || null;
  }

  addSource(source) {
    const config = this._loadWorkspaceConfig();
    config.sources = config.sources || [];
    const idx = config.sources.findIndex(s => s.id === source.id);
    if (idx >= 0) {
      config.sources[idx] = { ...config.sources[idx], ...source };
    } else {
      config.sources.push(source);
    }
    this._writeWorkspaceConfig(config);
    return source;
  }

  updateSource(id, updates) {
    const config = this._loadWorkspaceConfig();
    const idx = (config.sources || []).findIndex(s => s.id === id);
    if (idx < 0) throw new Error(`Source ${id} not found`);
    config.sources[idx] = { ...config.sources[idx], ...updates };
    this._writeWorkspaceConfig(config);
    return config.sources[idx];
  }

  deleteSource(id) {
    const config = this._loadWorkspaceConfig();
    const before = (config.sources || []).length;
    config.sources = (config.sources || []).filter(s => s.id !== id);
    if (config.sources.length === before) throw new Error(`Source ${id} not found`);
    this._writeWorkspaceConfig(config);
    return { deleted: true, id };
  }

  // ── Destinations ─────────────────────────────────────────────────
  // workspaceConfig format: top-level "destinations" array + sources.destinations = [id|{destinationId}]
  getDestinations() {
    const config = this._loadWorkspaceConfig();
    // Top-level destinations are the full objects
    const topDests = config.destinations || [];
    if (topDests.length > 0 && typeof topDests[0] === 'object' && topDests[0].id) {
      return topDests;
    }
    // Fallback: flatten from sources (old format where dests are embedded)
    const dests = [];
    const seen  = new Set();
    for (const src of (config.sources || [])) {
      for (const d of (src.destinations || [])) {
        if (typeof d === 'object' && d.id && !seen.has(d.id)) {
          seen.add(d.id);
          dests.push(d);
        }
      }
    }
    return dests;
  }

  // Resolve destination IDs for a source → returns full destination objects
  getSourceDestinations(sourceId) {
    const config  = this._loadWorkspaceConfig();
    const src     = (config.sources || []).find(s => s.id === sourceId);
    if (!src) return [];
    const topMap  = {};
    for (const d of (config.destinations || [])) {
      if (d && d.id) topMap[d.id] = d;
    }
    return (src.destinations || [])
      .map(ref => {
        const id = typeof ref === 'string' ? ref : ref?.destinationId;
        return topMap[id] || { id };
      })
      .filter(d => d.id);
  }

  addDestination(sourceId, destination) {
    const config = this._loadWorkspaceConfig();
    const src = (config.sources || []).find(s => s.id === sourceId);
    if (!src) throw new Error(`Source ${sourceId} not found`);
    src.destinations = src.destinations || [];
    const idx = src.destinations.findIndex(d => d.id === destination.id);
    if (idx >= 0) {
      src.destinations[idx] = { ...src.destinations[idx], ...destination };
    } else {
      src.destinations.push(destination);
    }
    this._writeWorkspaceConfig(config);
    return destination;
  }

  deleteDestination(sourceId, destId) {
    const config = this._loadWorkspaceConfig();
    const src = (config.sources || []).find(s => s.id === sourceId);
    if (!src) throw new Error(`Source ${sourceId} not found`);
    src.destinations = (src.destinations || []).filter(d => d.id !== destId);
    this._writeWorkspaceConfig(config);
    return { deleted: true, destId, sourceId };
  }

  // ── Trigger RudderStack config reload ───────────────────────────
  async triggerReload() {
    const host = process.env.RS_BACKEND_HOST || 'rudder-server';
    const endpoints = [
      `http://${host}:8082/backend/config/refreshConfig`,
      `http://${host}:8080/reload`,
      `http://${host}:8080/adminHandler?action=reload`,
    ];
    for (const url of endpoints) {
      try {
        const res = await axios.post(url, {}, {
          auth: { username: 'admin', password: this.adminPwd },
          timeout: 5000,
        });
        console.log('[RSAdapter] Config reload triggered via:', url);
        return { success: true, url, status: res.status };
      } catch (err) {
        console.warn('[RSAdapter] Reload endpoint failed:', url, err.message);
      }
    }
    return { success: false, message: 'All reload endpoints failed — config saved, RS will pick up on next restart' };
  }

  // ── Events from RudderStack Postgres ────────────────────────────
  async getEvents({ limit = 50, customerId, eventName, type, offset = 0 } = {}) {
    const gwTable = await this._getLatestGwTable();
    const result = await this.pgPool.query(`
      SELECT
        job_id,
        parameters->>'source_id'          AS source_id,
        event_payload::jsonb->'batch'->0   AS event_data,
        created_at
      FROM ${gwTable}
      ORDER BY created_at DESC
      LIMIT $1 OFFSET $2
    `, [Number(limit), Number(offset)]);

    const events = result.rows
      .map(row => {
        const e = row.event_data || {};
        return {
          id:          row.job_id,
          name:        e.event || 'Unknown',
          type:        e.type  || 'track',
          customerId:  e.userId || e.anonymousId || null,
          anonymousId: e.anonymousId || null,
          sourceId:    row.source_id,
          properties:  e.properties || {},
          traits:      e.traits     || {},
          context:     e.context    || {},
          receivedAt:  e.receivedAt || row.created_at,
          sentAt:      e.sentAt     || null,
          category:    e.properties?.category || null,
          status:      'Received',
        };
      })
      .filter(e => {
        if (customerId && e.customerId !== customerId) return false;
        if (eventName  && e.name !== eventName)        return false;
        if (type       && e.type !== type)             return false;
        return true;
      });

    return { data: events, total: events.length, table: gwTable };
  }

  // ── Event stats (count by type) ──────────────────────────────────
  async getEventStats() {
    try {
      const gwTable = await this._getLatestGwTable();

      const [byTypeRes, totalRes, todayRes] = await Promise.all([
        this.pgPool.query(`
          SELECT
            event_payload::jsonb->'batch'->0->>'type' AS event_type,
            COUNT(*) AS count,
            MAX(created_at) AS last_seen
          FROM ${gwTable}
          GROUP BY event_type
          ORDER BY count DESC
        `),
        this.pgPool.query(`SELECT COUNT(*) AS total FROM ${gwTable}`),
        this.pgPool.query(`
          SELECT COUNT(*) AS today FROM ${gwTable}
          WHERE created_at >= NOW() - INTERVAL '24 hours'
        `),
      ]);

      return {
        total:  parseInt(totalRes.rows[0]?.total || 0),
        today:  parseInt(todayRes.rows[0]?.today || 0),
        byType: byTypeRes.rows.map(r => ({ type: r.event_type, count: parseInt(r.count) })),
        table:  gwTable,
        source: 'rudderstack',
      };
    } catch (err) {
      console.warn('[RSAdapter] getEventStats error:', err.message);
      return { total: 0, today: 0, byType: [], source: 'error', error: err.message };
    }
  }

  // ── Recent event counts (cho Dashboard) ─────────────────────────
  async getRecentEventCount() {
    try {
      const gwTable = await this._getLatestGwTable();
      const result = await this.pgPool.query(`
        SELECT
          COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '24 hours')                            AS today,
          COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '1 hour')                              AS last_hour,
          COUNT(*) FILTER (WHERE event_payload::jsonb->'batch'->0->>'type' = 'identify'
                            AND  created_at >= NOW() - INTERVAL '24 hours')                            AS identify_today,
          COUNT(*) FILTER (WHERE event_payload::jsonb->'batch'->0->>'type' = 'track'
                            AND  created_at >= NOW() - INTERVAL '24 hours')                            AS track_today
        FROM ${gwTable}
      `);
      const r = result.rows[0] || {};
      return {
        eventsToday:         parseInt(r.today          || 0),
        eventsLastHour:      parseInt(r.last_hour      || 0),
        identifyEventsToday: parseInt(r.identify_today || 0),
        trackEventsToday:    parseInt(r.track_today    || 0),
        source: 'rudderstack',
      };
    } catch (err) {
      console.warn('[RSAdapter] getRecentEventCount error:', err.message);
      return { eventsToday: 0, eventsLastHour: 0, identifyEventsToday: 0, trackEventsToday: 0, source: 'error' };
    }
  }

  // ── Get profile from RS (most recent identify) ───────────────────
  async getProfile(userId) {
    if (!userId) throw new Error('userId is required');
    const gwTable = await this._getLatestGwTable();
    const result = await this.pgPool.query(`
      SELECT event_payload::jsonb->'batch'->0 AS event_data, created_at
      FROM ${gwTable}
      WHERE event_payload::jsonb->'batch'->0->>'userId' = $1
        AND event_payload::jsonb->'batch'->0->>'type'   = 'identify'
      ORDER BY created_at DESC
      LIMIT 1
    `, [userId]);

    if (!result.rows.length) return null;
    const e = result.rows[0].event_data || {};
    return {
      userId:       e.userId,
      anonymousId:  e.anonymousId || null,
      traits:       e.traits      || {},
      context:      e.context     || {},
      identifiedAt: result.rows[0].created_at,
      source:       'rudderstack',
    };
  }

  // ── Get identities (anonymousId → userId links) ──────────────────
  async getIdentities(userId) {
    if (!userId) throw new Error('userId is required');
    const gwTable = await this._getLatestGwTable();
    const result = await this.pgPool.query(`
      SELECT DISTINCT
        event_payload::jsonb->'batch'->0->>'anonymousId' AS anonymous_id,
        MIN(created_at) AS first_seen,
        MAX(created_at) AS last_seen
      FROM ${gwTable}
      WHERE event_payload::jsonb->'batch'->0->>'userId' = $1
        AND event_payload::jsonb->'batch'->0->>'anonymousId' IS NOT NULL
      GROUP BY anonymous_id
    `, [userId]);

    return {
      userId,
      identities: result.rows.map(r => ({
        type:      'anonymous',
        id:        r.anonymous_id,
        firstSeen: r.first_seen,
        lastSeen:  r.last_seen,
      })),
      source: 'rudderstack',
    };
  }

  // ── Send identify ────────────────────────────────────────────────
  async identifyCustomer(userId, traits) {
    const res = await axios.post(`${this.dataplaneUrl}/v1/identify`, {
      userId, traits,
      context: { source: 'phs-cdp-bff' },
      timestamp: new Date().toISOString(),
    }, {
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Basic ${Buffer.from(this.writeKey + ':').toString('base64')}`,
      },
      timeout: 8000,
    });
    return res.data;
  }

  // ── Send track event ─────────────────────────────────────────────
  async trackEvent(userId, eventName, properties = {}) {
    const res = await axios.post(`${this.dataplaneUrl}/v1/track`, {
      userId, event: eventName, properties,
      context: { source: 'phs-cdp-bff' },
      timestamp: new Date().toISOString(),
    }, {
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Basic ${Buffer.from(this.writeKey + ':').toString('base64')}`,
      },
      timeout: 8000,
    });
    return res.data;
  }

  // ── Send batch events ────────────────────────────────────────────
  async sendBatch(events) {
    const batch = events.map(e => ({
      type:        e.type || 'track',
      userId:      e.userId,
      anonymousId: e.anonymousId,
      event:       e.event,
      properties:  e.properties || {},
      traits:      e.traits     || {},
      timestamp:   e.timestamp  || new Date().toISOString(),
    }));
    const res = await axios.post(`${this.dataplaneUrl}/v1/batch`, {
      batch, sentAt: new Date().toISOString(),
    }, {
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Basic ${Buffer.from(this.writeKey + ':').toString('base64')}`,
      },
      timeout: 15000,
    });
    return res.data;
  }

  // ── Cleanup ──────────────────────────────────────────────────────
  async close() {
    if (this._pgPool) {
      await this._pgPool.end();
      this._pgPool = null;
    }
  }
}

module.exports = RudderStackAdapter;
