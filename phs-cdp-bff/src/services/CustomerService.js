/**
 * CustomerService — Unified Customer Profile Store
 * Handles identity resolution + profile upserts + C360 retrieval
 */
const db = require('../db/pool');

const CustomerService = {

  /**
   * Find a customer by any identifier
   */
  async findByIdentifier(type, value) {
    const result = await db.query(`
      SELECT c.* FROM cdp_customers c
      JOIN cdp_identities i ON i.customer_id = c.id
      WHERE i.identifier_type = $1 AND i.identifier_value = $2
      LIMIT 1
    `, [type, value]);
    return result.rows[0] || null;
  },

  /**
   * Find by userId (c360_customer_id) or anonymous_id
   */
  async findByUserId(userId) {
    const result = await db.query(`
      SELECT * FROM cdp_customers
      WHERE c360_customer_id = $1
      LIMIT 1
    `, [userId]);
    if (result.rows[0]) return result.rows[0];
    // Try identity graph
    return this.findByIdentifier('phs_account_id', userId);
  },

  async getProfileExists(id) {
    const result = await db.query('SELECT 1 FROM cdp_customers WHERE id = $1', [id]);
    return result.rows.length > 0;
  },

  async findByAnonymousId(anonymousId) {
    const result = await db.query(`
      SELECT * FROM cdp_customers WHERE anonymous_id = $1 LIMIT 1
    `, [anonymousId]);
    if (result.rows[0]) return result.rows[0];
    return this.findByIdentifier('anonymous_id', anonymousId);
  },

  /**
   * Upsert profile from an identify() call.
   * Kept for internal callers; the single write path is IdentityResolutionService.
   */
  async upsertProfile(userId, traits = {}, anonymousId = null) {
    const IdentityResolutionService = require('./IdentityResolutionService');
    const { customer } = await IdentityResolutionService.resolveIdentity({
      phs_account_id: userId || null,
      anonymous_id:   anonymousId || null,
      email:          traits.email || null,
      phone:          traits.phone || null,
      full_name:      traits.name || traits.full_name || null,
    }, { source: 'server' }, traits);
    return customer;
  },

  /**
   * Merge anonymous → known (alias). previousId = anonymous id, userId = account id.
   */
  async mergeIdentities(previousId, userId) {
    const IdentityResolutionService = require('./IdentityResolutionService');
    const { customer } = await IdentityResolutionService.resolveIdentity(
      { phs_account_id: userId, anonymous_id: previousId }, { source: 'server' },
    );
    return customer;
  },

  /**
   * Events of a customer: everything linked to the profile, plus events that
   * were stored without a link but carry one of the profile's anonymous ids.
   */
  async getEvents(customerId, { limit = 50, offset = 0 } = {}) {
    const result = await db.query(`
      SELECT e.event_id AS id, e.event_name, e.event_category, e.channel AS source,
             e.platform, e.screen_name, e.occurred_at, e.received_at,
             e.properties, e.confidence_score, e.anonymous_id, e.session_id
      FROM c360_event e
      WHERE e.cdp_customer_uuid = $1
         OR (e.cdp_customer_uuid IS NULL AND e.anonymous_id IN (
               SELECT identifier_value FROM cdp_identities
               WHERE customer_id = $1 AND identifier_type = 'anonymous_id'))
      ORDER BY e.occurred_at DESC
      LIMIT $2 OFFSET $3
    `, [customerId, limit, offset]);
    return result.rows;
  },

  async countEvents(customerId) {
    const result = await db.query(`
      SELECT COUNT(*)                                                        AS total,
             COUNT(*) FILTER (WHERE e.occurred_at >= NOW() - INTERVAL '30 days') AS last_30d,
             COUNT(DISTINCT e.session_id) FILTER (WHERE e.occurred_at >= NOW() - INTERVAL '30 days') AS sessions_30d,
             MIN(e.occurred_at) AS first_event_at,
             MAX(e.occurred_at) AS last_event_at
      FROM c360_event e
      WHERE e.cdp_customer_uuid = $1
         OR (e.cdp_customer_uuid IS NULL AND e.anonymous_id IN (
               SELECT identifier_value FROM cdp_identities
               WHERE customer_id = $1 AND identifier_type = 'anonymous_id'))
    `, [customerId]);
    const r = result.rows[0] || {};
    return {
      total:        parseInt(r.total || 0),
      last30d:      parseInt(r.last_30d || 0),
      sessions30d:  parseInt(r.sessions_30d || 0),
      firstEventAt: r.first_event_at || null,
      lastEventAt:  r.last_event_at || null,
    };
  },

  /**
   * Get unified Customer 360 profile
   * Combines: cdp_customers + identities + events + consents
   */
  async getProfile(customerId) {
    const [customerRes, identitiesRes, events, eventStats, consentsRes] = await Promise.all([
      db.query('SELECT * FROM cdp_customers WHERE id = $1', [customerId]),
      db.query('SELECT * FROM cdp_identities WHERE customer_id = $1 ORDER BY tier ASC, priority ASC, created_at ASC', [customerId]),
      this.getEvents(customerId, { limit: 100 }),
      this.countEvents(customerId),
      db.query('SELECT * FROM cdp_consents WHERE customer_id = $1', [customerId]),
    ]);

    if (!customerRes.rows[0]) return null;

    return {
      customer:     customerRes.rows[0],
      identities:   identitiesRes.rows,
      recentEvents: events,
      eventStats,
      consents:     consentsRes.rows,
    };
  },

  /**
   * Insert a behavioral event (legacy helper — delegates to the single write path).
   */
  async recordEvent(customerId, anonymousId, eventName, properties = {}, source = 'web', sessionId = null, rsMessageId = null) {
    const IdentityResolutionService = require('./IdentityResolutionService');
    let customer = null;
    if (customerId) {
      const r = await db.query('SELECT * FROM cdp_customers WHERE id = $1', [customerId]);
      customer = r.rows[0] || null;
    }
    return IdentityResolutionService.recordEvent(customer, customer ? 20 : 0, {
      event_name: eventName, event_category: properties.category || null,
      channel: source, properties, session_id: sessionId,
      rudderstack_message_id: rsMessageId, anonymous_id: anonymousId,
    });
  },

  /**
   * List customers (paginated)
   */
  async listCustomers({ limit = 50, offset = 0, lifecycle_stage, search } = {}) {
    let where = [];
    let params = [];
    let idx = 1;

    if (lifecycle_stage) {
      where.push(`c.lifecycle_stage = $${idx++}`);
      params.push(lifecycle_stage);
    }
    if (search) {
      // Also search in cdp_identities table (anonymousId, phone, email stored there)
      where.push(`(
        c.full_name ILIKE $${idx}
        OR c.email ILIKE $${idx}
        OR c.c360_customer_id ILIKE $${idx}
        OR c.anonymous_id ILIKE $${idx}
        OR EXISTS (
          SELECT 1 FROM cdp_identities i
          WHERE i.customer_id = c.id
            AND i.identifier_value ILIKE $${idx}
        )
      )`);
      params.push(`%${search}%`);
      idx++;
    }

    const whereClause = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const result = await db.query(`
      SELECT c.*,
             (SELECT i.identifier_value FROM cdp_identities i
               WHERE i.customer_id = c.id AND i.identifier_type = 'anonymous_id'
               ORDER BY i.last_seen_at DESC NULLS LAST LIMIT 1)            AS latest_anonymous_id,
             (SELECT COUNT(*) FROM c360_event e WHERE e.cdp_customer_uuid = c.id)::int AS event_count
      FROM cdp_customers c
      ${whereClause}
      ORDER BY c.last_seen_at DESC NULLS LAST
      LIMIT $${idx} OFFSET $${idx + 1}
    `, [...params, limit, offset]);

    const countResult = await db.query(`
      SELECT COUNT(*) FROM cdp_customers c ${whereClause}
    `, params);

    return {
      customers: result.rows,
      total: parseInt(countResult.rows[0].count),
    };
  },
};

module.exports = CustomerService;