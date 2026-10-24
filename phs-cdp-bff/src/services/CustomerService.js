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
   * Find by userId (phs_account_id) or anonymous_id
   */
  async findByUserId(userId) {
    const result = await db.query(`
      SELECT * FROM cdp_customers
      WHERE phs_account_id = $1
      LIMIT 1
    `, [userId]);
    if (result.rows[0]) return result.rows[0];
    // Try identity graph
    return this.findByIdentifier('phs_account_id', userId);
  },

  async findByAnonymousId(anonymousId) {
    const result = await db.query(`
      SELECT * FROM cdp_customers WHERE anonymous_id = $1 LIMIT 1
    `, [anonymousId]);
    if (result.rows[0]) return result.rows[0];
    return this.findByIdentifier('anonymous_id', anonymousId);
  },

  /**
   * Upsert profile from RudderStack identify() event
   * @param {string} userId   - RudderStack userId (phs_account_id)
   * @param {object} traits   - Profile traits from RS
   * @param {string} anonymousId
   */
  async upsertProfile(userId, traits = {}, anonymousId = null) {
    const client = await db.getClient();
    try {
      await client.query('BEGIN');

      // Build update fields
      const updates = {};
      if (traits.email)       updates.email = traits.email;
      if (traits.phone)       updates.phone = traits.phone;
      if (traits.name || traits.full_name)
                              updates.full_name = traits.name || traits.full_name;
      if (traits.lifecycle_stage) updates.lifecycle_stage = traits.lifecycle_stage;
      if (traits.kyc_status)  updates.kyc_status = traits.kyc_status;
      if (traits.product_interests)
                              updates.product_interests = JSON.stringify(traits.product_interests);

      if (anonymousId)        updates.anonymous_id = anonymousId;
      updates.last_seen_at  = new Date().toISOString();

      // Upsert into cdp_customers
      const setClauses = Object.entries(updates)
        .map(([k, _], i) => `${k} = $${i + 2}`)
        .join(', ');
      const values = [userId, ...Object.values(updates)];

      let customer;
      if (setClauses) {
        const result = await client.query(`
          INSERT INTO cdp_customers (phs_account_id, ${Object.keys(updates).join(', ')}, first_seen_at)
          VALUES ($1, ${Object.keys(updates).map((_, i) => `$${i + 2}`).join(', ')}, NOW())
          ON CONFLICT (phs_account_id) DO UPDATE SET ${setClauses}, updated_at = NOW()
          RETURNING *
        `, values);
        customer = result.rows[0];
      } else {
        // No traits — just ensure customer exists
        const result = await client.query(`
          INSERT INTO cdp_customers (phs_account_id, first_seen_at)
          VALUES ($1, NOW())
          ON CONFLICT (phs_account_id) DO UPDATE SET updated_at = NOW()
          RETURNING *
        `, [userId]);
        customer = result.rows[0];
      }

      // Upsert identities
      const identities = [
        { type: 'phs_account_id', value: userId },
      ];
      if (traits.email) identities.push({ type: 'email', value: traits.email });
      if (traits.phone) identities.push({ type: 'phone', value: traits.phone });
      if (anonymousId)  identities.push({ type: 'anonymous_id', value: anonymousId });

      for (const id of identities) {
        if (!id.value) continue;
        await client.query(`
          INSERT INTO cdp_identities (customer_id, identifier_type, identifier_value, source)
          VALUES ($1, $2, $3, 'rudderstack')
          ON CONFLICT (identifier_type, identifier_value)
          DO UPDATE SET customer_id = $1
        `, [customer.id, id.type, id.value]);
      }

      await client.query('COMMIT');
      return customer;
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  },

  /**
   * Merge anonymous → known (from RS alias() event)
   * previousId = anonymous_id, userId = known phs_account_id
   */
  async mergeIdentities(previousId, userId) {
    const client = await db.getClient();
    try {
      await client.query('BEGIN');

      // Find or create the known customer
      let knownCustomer = await this.findByUserId(userId);
      if (!knownCustomer) {
        const result = await client.query(`
          INSERT INTO cdp_customers (phs_account_id, anonymous_id, first_seen_at)
          VALUES ($1, $2, NOW())
          ON CONFLICT (phs_account_id) DO UPDATE SET anonymous_id = $2, updated_at = NOW()
          RETURNING *
        `, [userId, previousId]);
        knownCustomer = result.rows[0];
      }

      // Reassign all events from anonymous_id to known customer
      await client.query(`
        UPDATE cdp_events
        SET customer_id = $1
        WHERE anonymous_id = $2 AND customer_id IS NULL
      `, [knownCustomer.id, previousId]);

      // Link anonymous_id in identity graph
      await client.query(`
        INSERT INTO cdp_identities (customer_id, identifier_type, identifier_value, source)
        VALUES ($1, 'anonymous_id', $2, 'rudderstack')
        ON CONFLICT (identifier_type, identifier_value)
        DO UPDATE SET customer_id = $1
      `, [knownCustomer.id, previousId]);

      await client.query('COMMIT');
      return knownCustomer;
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  },

  /**
   * Get unified Customer 360 profile
   * Combines: cdp_customers + identities + events + consents
   */
  async getProfile(customerId) {
    const [customerRes, identitiesRes, eventsRes, consentsRes] = await Promise.all([
      db.query('SELECT * FROM cdp_customers WHERE id = $1', [customerId]),
      db.query('SELECT * FROM cdp_identities WHERE customer_id = $1 ORDER BY created_at ASC', [customerId]),
      db.query(`
        SELECT * FROM cdp_events
        WHERE customer_id = $1
        ORDER BY occurred_at DESC
        LIMIT 20
      `, [customerId]),
      db.query('SELECT * FROM cdp_consents WHERE customer_id = $1', [customerId]),
    ]);

    if (!customerRes.rows[0]) return null;

    return {
      customer:     customerRes.rows[0],
      identities:   identitiesRes.rows,
      recentEvents: eventsRes.rows,
      consents:     consentsRes.rows,
    };
  },

  /**
   * Insert a behavioral event
   */
  async recordEvent(customerId, anonymousId, eventName, properties = {}, source = 'web', sessionId = null) {
    const result = await db.query(`
      INSERT INTO cdp_events
        (customer_id, anonymous_id, event_name, event_category, properties, source, session_id, occurred_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
      RETURNING id
    `, [
      customerId || null,
      anonymousId || null,
      eventName,
      properties.category || null,
      JSON.stringify(properties),
      source,
      sessionId || null,
    ]);
    return result.rows[0];
  },

  /**
   * List customers (paginated)
   */
  async listCustomers({ limit = 50, offset = 0, lifecycle_stage, search } = {}) {
    let where = [];
    let params = [];
    let idx = 1;

    if (lifecycle_stage) {
      where.push(`lifecycle_stage = $${idx++}`);
      params.push(lifecycle_stage);
    }
    if (search) {
      where.push(`(full_name ILIKE $${idx} OR email ILIKE $${idx} OR phs_account_id ILIKE $${idx})`);
      params.push(`%${search}%`);
      idx++;
    }

    const whereClause = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const result = await db.query(`
      SELECT * FROM cdp_customers
      ${whereClause}
      ORDER BY last_seen_at DESC NULLS LAST
      LIMIT $${idx} OFFSET $${idx + 1}
    `, [...params, limit, offset]);

    const countResult = await db.query(`
      SELECT COUNT(*) FROM cdp_customers ${whereClause}
    `, params);

    return {
      customers: result.rows,
      total: parseInt(countResult.rows[0].count),
    };
  },
};

module.exports = CustomerService;
