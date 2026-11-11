const express = require('express');
const router  = express.Router();
const { LIFECYCLE_LABELS } = require('../mock/customers');
const { requireRole }      = require('../middleware/rbac');
const db                   = require('../db/pool');

// ── GOLDEN demo profile ID — the only mock profile kept ──────────────────────
const GOLDEN_ID = 'PHS-CUS-GOLDEN-001';

// ── Map cdp_customers row → API shape ────────────────────────────────────────
function mapDbCustomer(row) {
  const attrs = row.custom_attributes || {};
  return {
    id:               row.c360_customer_id || row.id,
    dbId:             row.id,
    name:             row.full_name || row.email || `Customer ${row.c360_customer_id || row.id}`,
    email:            row.email    || '',
    phone:            row.phone    || '',
    lifecycle:        row.lifecycle_stage || 'unknown',
    lifecycleLabel:   LIFECYCLE_LABELS[row.lifecycle_stage] || row.lifecycle_stage || 'Unknown',
    tier:             attrs.customer_tier       || 'bronze',
    segment:          attrs.customer_segment    || '',
    joinDate:         row.first_seen_at ? row.first_seen_at.toISOString().split('T')[0] : '',
    lastActive:       row.last_seen_at  ? row.last_seen_at.toISOString()  : '',
    tradingFrequency: attrs.trading_frequency   || 'unknown',
    cashUtilization:  Number(attrs.cash_utilization)  || 0,
    productInterests: Array.isArray(row.product_interests) ? row.product_interests : [],
    emailOpenRate:    Number(attrs.email_open_rate)    || 0,
    pushEngagement:   Number(attrs.push_engagement)    || 0,
    webVisits:        Number(attrs.web_visits)         || 0,
    productViews:     Number(attrs.product_views)      || 0,
    kycStatus:        row.kyc_status || '',
    source:           'postgres',
  };
}

// ── GET /api/customers ────────────────────────────────────────────────────────
router.get('/', requireRole('viewer'), async (req, res) => {
  const { page = 1, limit = 20, search = '', lifecycle = '' } = req.query;
  const offset = (Number(page) - 1) * Number(limit);

  try {
    // Build dynamic WHERE
    const conditions = [];
    const params     = [];
    let   p          = 1;

    if (search) {
      conditions.push(`(full_name ILIKE $${p} OR email ILIKE $${p} OR c360_customer_id ILIKE $${p})`);
      params.push(`%${search}%`);
      p++;
    }
    if (lifecycle) {
      conditions.push(`lifecycle_stage = $${p}`);
      params.push(lifecycle);
      p++;
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    const countResult = await db.query(
      `SELECT COUNT(*) FROM cdp_customers ${where}`, params
    );
    const total = Number(countResult.rows[0].count);

    const rows = await db.query(
      `SELECT * FROM cdp_customers ${where}
       ORDER BY last_seen_at DESC NULLS LAST, created_at DESC
       LIMIT $${p} OFFSET $${p + 1}`,
      [...params, Number(limit), offset]
    );

    const data = rows.rows.map(mapDbCustomer);

    // Always prepend GOLDEN demo profile on page 1 (unless filtered out)
    const { CUSTOMERS } = require('../mock/customers');
    const golden = CUSTOMERS.find(c => c.id === GOLDEN_ID);
    const goldenMatches = golden && (!search ||
      golden.id.toLowerCase().includes(search.toLowerCase()) ||
      golden.name.toLowerCase().includes(search.toLowerCase()));
    const prefix = (Number(page) === 1 && goldenMatches) ? [{
      ...golden,
      lifecycleLabel: LIFECYCLE_LABELS[golden.lifecycle] || golden.lifecycle,
      source: 'mock_golden',
    }] : [];

    return res.json({
      data:  [...prefix, ...data],
      total: total + prefix.length,
      page:  Number(page),
      limit: Number(limit),
      pages: Math.ceil((total + prefix.length) / Number(limit)),
      source: 'postgres',
    });
  } catch (err) {
    console.error('[Customers] DB error:', err.message);
    return res.json({ data: [], total: 0, page: 1, limit: Number(limit), pages: 0, source: 'postgres', _dataStatus: 'db_error', error: err.message });
  }
});

// ── GET /api/customers/:id ────────────────────────────────────────────────────
router.get('/:id', requireRole('viewer'), async (req, res) => {
  const { id } = req.params;

  // GOLDEN demo profile — always available
  if (id === GOLDEN_ID) {
    const { CUSTOMERS } = require('../mock/customers');
    const golden = CUSTOMERS.find(c => c.id === GOLDEN_ID);
    if (golden) {
      return res.json({
        ...golden,
        lifecycleLabel: LIFECYCLE_LABELS[golden.lifecycle] || golden.lifecycle,
        source: 'mock_golden',
      });
    }
  }

  try {
    // Try phs_account_id first, then UUID
    const result = await db.query(
      `SELECT c.*, 
        json_agg(DISTINCT jsonb_build_object(
          'id_type', i.id_type, 'id_value', i.id_value,
          'source', i.source, 'verified', i.verified, 'last_seen_at', i.last_seen_at
        )) FILTER (WHERE i.id IS NOT NULL) AS identities,
        json_agg(DISTINCT jsonb_build_object(
          'channel', con.channel, 'opted_in', con.opted_in
        )) FILTER (WHERE con.id IS NOT NULL) AS consents
       FROM cdp_customers c
       LEFT JOIN cdp_identities i ON i.customer_id = c.id
       LEFT JOIN cdp_consents   con ON con.customer_id = c.id
       WHERE c.c360_customer_id = $1 OR c.id::text = $1
       GROUP BY c.id
       LIMIT 1`,
      [id]
    );

    if (!result.rows.length) {
      return res.status(404).json({ error: { message: 'Customer not found', code: 'NOT_FOUND' } });
    }

    const row      = result.rows[0];
    const customer = mapDbCustomer(row);

    // Recent events
    const evtResult = await db.query(
      `SELECT event_name, event_type, occurred_at, source, properties
       FROM cdp_events
       WHERE customer_id = $1
       ORDER BY occurred_at DESC
       LIMIT 20`,
      [row.id]
    );

    return res.json({
      ...customer,
      identities:   row.identities  || [],
      consents:     row.consents    || [],
      recentEvents: evtResult.rows.map(e => ({
        name:       e.event_name,
        type:       e.event_type,
        timestamp:  e.occurred_at,
        source:     e.source,
        properties: e.properties || {},
      })),
      campaignHistory: [],
      source: 'postgres',
    });
  } catch (err) {
    console.error('[Customers/:id] DB error:', err.message);
    return res.status(500).json({ error: { message: 'Failed to load customer', code: 'DB_ERROR' } });
  }
});

// ── GET /api/customers/:id/events ─────────────────────────────────────────────
router.get('/:id/events', requireRole('viewer'), async (req, res) => {
  const { id }      = req.params;
  const { limit = 50, offset = 0 } = req.query;

  try {
    // Resolve UUID from phs_account_id
    const lookup = await db.query(
      `SELECT id FROM cdp_customers WHERE c360_customer_id = $1 OR id::text = $1 LIMIT 1`, [id]
    );
    if (!lookup.rows.length) return res.json({ data: [], total: 0, source: 'postgres' });

    const dbId     = lookup.rows[0].id;
    const result   = await db.query(
      `SELECT * FROM cdp_events
       WHERE customer_id = $1
       ORDER BY occurred_at DESC
       LIMIT $2 OFFSET $3`,
      [dbId, Number(limit), Number(offset)]
    );
    const countR   = await db.query(`SELECT COUNT(*) FROM cdp_events WHERE customer_id = $1`, [dbId]);

    return res.json({
      data:   result.rows.map(e => ({
        id:          e.id,
        name:        e.event_name,
        type:        e.event_type,
        timestamp:   e.occurred_at,
        source:      e.source,
        anonymousId: e.anonymous_id,
        properties:  e.properties || {},
      })),
      total:  Number(countR.rows[0].count),
      source: 'postgres',
    });
  } catch (err) {
    console.error('[Customers/:id/events] DB error:', err.message);
    return res.json({ data: [], total: 0, source: 'postgres', error: err.message });
  }
});

// ── POST /api/customers/identify ──────────────────────────────────────────────
router.post('/identify', async (req, res) => {
  try {
    const { userId, anonymousId, traits = {} } = req.body;
    if (!userId && !anonymousId) {
      return res.status(400).json({ error: 'userId or anonymousId required' });
    }
    const CustomerService = require('../services/CustomerService');
    if (userId) {
      const customer = await CustomerService.upsertProfile(userId, traits, anonymousId);
      return res.json({ status: 'ok', customer });
    }
    return res.json({ status: 'ok', anonymousId, action: 'anonymous_tracked' });
  } catch (err) {
    console.error('[customers/identify] Error:', err.message);
    res.status(500).json({ error: 'Identity resolution failed' });
  }
});

// ── POST /api/customers/track ──────────────────────────────────────────────
router.post('/track', async (req, res) => {
  try {
    const { userId, anonymousId, event, properties = {} } = req.body;
    if (!event) return res.status(400).json({ error: 'event name required' });
    const CustomerService = require('../services/CustomerService');
    let customer = null;
    if (userId) {
      customer = await CustomerService.findByUserId(userId);
      if (!customer) customer = await CustomerService.upsertProfile(userId, {}, anonymousId);
    }
    const result = await CustomerService.recordEvent(
      customer?.id || null, anonymousId || null, event, properties, 'web', null
    );
    return res.json({ status: 'ok', result });
  } catch (err) {
    console.error('[customers/track] Error:', err.message);
    res.status(500).json({ error: 'Event tracking failed' });
  }
});

module.exports = router;
