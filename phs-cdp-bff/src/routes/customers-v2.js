/**
 * Customers Route v2 — integrates with CDP Profile Store (cdp-postgres)
 * Falls back to Mautic when CDP profile not found
 * Replaces routes/customers.js
 *
 * Drop-in replacement: mount at /api/customers in server.js
 */
const express = require('express');
const router  = express.Router();
const { requireRole } = require('../middleware/rbac');
const MauticAdapter   = require('../adapters/MauticAdapter');
const CustomerService = require('../services/CustomerService');
const { CUSTOMERS, LIFECYCLE_LABELS } = require('../mock/customers');

const mautic  = new MauticAdapter();
const useMock = process.env.USE_MOCK === 'true';

/** Map Mautic contact → PHS Customer format (unchanged from v1) */
function mapContactToCustomer(contact) {
  const f = contact.fields?.all || {};
  const name = [f.firstname, f.lastname].filter(Boolean).join(' ') || f.email || `Contact #${contact.id}`;
  return {
    id:               `mautic_${contact.id}`,
    mauticId:         contact.id,
    name,
    email:            f.email || '',
    phone:            f.phone || f.mobile || '',
    lifecycle:        f.lifecycle_stage || 'unknown',
    lifecycleLabel:   LIFECYCLE_LABELS[f.lifecycle_stage] || f.lifecycle_stage || 'Unknown',
    tier:             f.customer_tier || 'bronze',
    segment:          f.customer_segment || '',
    joinDate:         contact.dateAdded?.split('T')[0] || '',
    lastActive:       contact.lastActive || contact.dateModified || '',
    tradingFrequency: f.trading_frequency || 'unknown',
    cashUtilization:  Number(f.cash_utilization) || 0,
    productInterests: f.product_interests ? f.product_interests.split(',').map(s => s.trim()) : [],
    emailOpenRate:    Number(f.email_open_rate) || 0,
    pushEngagement:   Number(f.push_engagement) || 0,
    webVisits:        Number(f.web_visits) || 0,
    productViews:     Number(f.product_views) || 0,
    source:           'mautic',
  };
}

// ─── GET /api/customers ───────────────────────────────────────
router.get('/', requireRole('viewer'), async (req, res) => {
  const { page = 1, limit = 20, search = '', lifecycle = '', tier = '' } = req.query;

  if (!useMock) {
    // Try CDP Profile Store first
    try {
      const { customers, total } = await CustomerService.listCustomers({
        limit: Number(limit),
        offset: (Number(page) - 1) * Number(limit),
        lifecycle_stage: lifecycle || undefined,
        search: search || undefined,
      });

      if (customers.length > 0) {
        return res.json({
          data: customers.map(c => ({
            id:             c.id,
            name:           c.full_name || c.email || c.phs_account_id,
            email:          c.email || '',
            phone:          c.phone || '',
            lifecycle:      c.lifecycle_stage || 'unknown',
            lifecycleLabel: LIFECYCLE_LABELS[c.lifecycle_stage] || c.lifecycle_stage || 'Unknown',
            phs_account_id: c.phs_account_id,
            last_seen_at:   c.last_seen_at,
            product_interests: c.product_interests || [],
            source: 'cdp',
          })),
          total,
          page: Number(page),
          limit: Number(limit),
          pages: Math.ceil(total / Number(limit)),
          source: 'cdp',
        });
      }
    } catch (dbErr) {
      console.warn('[customers] CDP DB unavailable:', dbErr.message);
    }

    // Fallback to Mautic
    const start = (Number(page) - 1) * Number(limit);
    const result = await mautic.getContacts({ start, limit: Number(limit), search });
    if (result.ok) {
      const contactsMap = result.data.contacts || {};
      let customers = Object.values(contactsMap).map(mapContactToCustomer);
      const total = result.data.total || customers.length;
      if (lifecycle) customers = customers.filter(c => c.lifecycle === lifecycle);
      const data = customers.map(c => ({
        id: c.id, name: c.name, email: c.email, lifecycle: c.lifecycle,
        lifecycleLabel: c.lifecycleLabel, tier: c.tier, segment: c.segment,
        lastActive: c.lastActive, tradingFrequency: c.tradingFrequency, source: 'mautic',
      }));
      return res.json({ data, total: Number(total), page: Number(page), limit: Number(limit), pages: Math.ceil(Number(total) / Number(limit)), source: 'mautic' });
    }
  }

  // Mock fallback
  let list = [...CUSTOMERS];
  if (search)    list = list.filter(c => c.name.toLowerCase().includes(search.toLowerCase()) || c.email?.toLowerCase().includes(search.toLowerCase()));
  if (lifecycle) list = list.filter(c => c.lifecycle === lifecycle);
  if (tier)      list = list.filter(c => c.tier === tier);
  const total = list.length;
  const start = (Number(page) - 1) * Number(limit);
  const data  = list.slice(start, start + Number(limit)).map(c => ({
    id: c.id, name: c.name, email: c.email, lifecycle: c.lifecycle,
    lifecycleLabel: LIFECYCLE_LABELS[c.lifecycle] || c.lifecycle,
    tier: c.tier, segment: c.segment, lastActive: c.lastActive,
    tradingFrequency: c.tradingFrequency, source: 'mock',
  }));
  res.json({ data, total, page: Number(page), limit: Number(limit), pages: Math.ceil(total / Number(limit)), source: 'mock' });
});

// ─── GET /api/customers/:id — Unified C360 ───────────────────
router.get('/:id', requireRole('viewer'), async (req, res) => {
  const { id } = req.params;

  if (!useMock) {
    // 1. Try CDP Profile Store (UUID)
    const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
    if (isUUID) {
      try {
        const profile = await CustomerService.getProfile(id);
        if (profile) {
          // Enrich with Mautic segments + campaign history
          let mauticSegments = [], campaignHistory = [];
          if (profile.customer.email) {
            try {
              const contacts = await mautic.getContacts({ search: profile.customer.email, limit: 1 });
              const mauticContact = Object.values(contacts.data?.contacts || {})[0];
              if (mauticContact) {
                const [segsRes, actRes] = await Promise.all([
                  mautic.getContactSegments(mauticContact.id),
                  mautic.getContactActivityLog(mauticContact.id, { limit: 10 }),
                ]);
                mauticSegments = segsRes.ok ? Object.values(segsRes.data?.lists || {}).map(s => s.name) : [];
                campaignHistory = actRes.ok ? (actRes.data?.events || []).slice(0, 10) : [];
              }
            } catch { /* Mautic unavailable */ }
          }

          return res.json({
            customer:       profile.customer,
            identities:     profile.identities,
            recentEvents:   profile.recentEvents,
            consents:       profile.consents,
            segments:       mauticSegments,
            campaignHistory,
            source: 'cdp',
          });
        }
      } catch (dbErr) {
        console.warn('[customers/:id] CDP DB error:', dbErr.message);
      }
    }

    // 2. Try Mautic ID (legacy mautic_xxx)
    if (id.startsWith('mautic_')) {
      const mauticId = id.replace('mautic_', '');
      const [contactResult, segmentsResult] = await Promise.all([
        mautic.getContact(mauticId),
        mautic.getContactSegments(mauticId),
      ]);
      if (contactResult.ok) {
        const customer = mapContactToCustomer(contactResult.data.contact);
        const segments = segmentsResult.ok ? Object.values(segmentsResult.data.lists || {}).map(s => s.name) : [];
        return res.json({
          customer: {
            id: customer.id,
            full_name: customer.name,
            email: customer.email,
            phone: customer.phone,
            lifecycle_stage: customer.lifecycle,
            product_interests: customer.productInterests,
          },
          identities:     [],
          recentEvents:   [],
          consents:       [],
          segments,
          campaignHistory: [],
          source: 'mautic',
        });
      }
    }
  }

  // Mock fallback
  const customer = CUSTOMERS.find(c => c.id === id);
  if (!customer) return res.status(404).json({ error: { message: 'Customer not found', code: 'NOT_FOUND' } });
  res.json({
    customer: {
      id: customer.id,
      full_name: customer.name,
      email: customer.email,
      phone: customer.phone,
      lifecycle_stage: customer.lifecycle,
      product_interests: customer.productInterests || [],
    },
    identities:   [],
    recentEvents: [
      { event_name:'Login',          occurred_at: new Date(Date.now()-7200000).toISOString(),  source:'web' },
      { event_name:'Product Viewed', occurred_at: new Date(Date.now()-10800000).toISOString(), source:'web', properties:{ product:'Margin' } },
      { event_name:'Stock Viewed',   occurred_at: new Date(Date.now()-14400000).toISOString(), source:'mobile', properties:{ symbol:'VIC' } },
    ],
    consents:     [],
    segments:     customer.audiences || [],
    campaignHistory: [
      { name:'Margin Introduction', sentAt:'2024-01-08T09:00:00Z', channel:'email', status:'opened' },
    ],
    source: 'mock',
  });
});

// ─── GET /api/customers/:id/events ───────────────────────────
router.get('/:id/events', requireRole('viewer'), async (req, res) => {
  const { id } = req.params;
  const { limit = 50 } = req.query;

  if (!useMock) {
    const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
    if (isUUID) {
      try {
        const { query } = require('../db/pool');
        const result = await query(`
          SELECT * FROM cdp_events WHERE customer_id = $1
          ORDER BY occurred_at DESC LIMIT $2
        `, [id, Number(limit)]);
        return res.json({ data: result.rows, total: result.rows.length, source: 'cdp' });
      } catch (dbErr) {
        console.warn('[customers/:id/events] CDP DB error:', dbErr.message);
      }
    }

    if (id.startsWith('mautic_')) {
      const mauticId = id.replace('mautic_', '');
      const result = await mautic.getContactActivityLog(mauticId, { limit: Number(limit) });
      if (result.ok) {
        const events = result.data.events || [];
        const mapped = events.map((e, i) => ({
          id: `evt_${i}`, event_name: e.eventLabel || e.event || 'Activity',
          occurred_at: e.timestamp || new Date().toISOString(),
          customer_id: id, source: 'mautic', properties: e.details || {},
        }));
        return res.json({ data: mapped, total: mapped.length, source: 'mautic' });
      }
    }
  }

  const { randomEvent } = require('../mock/events');
  const events = Array.from({ length: Math.min(Number(limit), 50) }, (_, i) => ({
    ...randomEvent(i), customerId: id, source: 'mock',
  }));
  res.json({ data: events, total: events.length, source: 'mock' });
});

module.exports = router;
