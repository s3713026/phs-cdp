/**
 * Customers Route v2 — CDP Profile Store (cdp-postgres) → Mautic fallback
 * When USE_MOCK=false: never falls back to mock data.
 */
const express = require('express');
const router  = express.Router();
const { requireRole } = require('../middleware/rbac');
const MauticAdapter   = require('../adapters/MauticAdapter');
const CustomerService = require('../services/CustomerService');
const { shouldUseMock, sendNotConnected } = require('../utils/mock-guard');

const mautic = new MauticAdapter();

const LIFECYCLE_LABELS = {
  prospect: 'Prospect', lead: 'Lead', ekyc: 'eKYC', account_opening: 'Account Opening',
  funding: 'Funding', first_trade: 'First Trade', active_investor: 'Active Investor',
  vip: 'VIP', dormant: 'Dormant', churn_risk: 'Churn Risk', reactivation: 'Reactivation',
};

function mapMauticContact(contact) {
  const f = contact.fields?.all || {};
  const name = [f.firstname, f.lastname].filter(Boolean).join(' ') || f.email || `Contact #${contact.id}`;
  return {
    id: `mautic_${contact.id}`, mauticId: contact.id, name,
    email: f.email || '', phone: f.phone || f.mobile || '',
    lifecycle: f.lifecycle_stage || 'unknown',
    lifecycleLabel: LIFECYCLE_LABELS[f.lifecycle_stage] || f.lifecycle_stage || 'Unknown',
    tier: f.customer_tier || 'bronze',
    segment: f.customer_segment || '',
    joinDate: contact.dateAdded?.split('T')[0] || '',
    lastActive: contact.lastActive || contact.dateModified || '',
    tradingFrequency: f.trading_frequency || 'unknown',
    cashUtilization: Number(f.cash_utilization) || 0,
    productInterests: f.product_interests ? f.product_interests.split(',').map(s => s.trim()) : [],
    emailOpenRate: Number(f.email_open_rate) || 0,
    pushEngagement: Number(f.push_engagement) || 0,
    webVisits: Number(f.web_visits) || 0,
    productViews: Number(f.product_views) || 0,
    source: 'mautic',
  };
}

// CDP profile row → list item used by Customer 360 search, Dashboard, Profiles
function displayName(c, anonymousId) {
  if (c.full_name) return c.full_name;
  if (c.email) return c.email;
  if (c.c360_customer_id) return c.c360_customer_id;
  const anon = anonymousId || c.anonymous_id;
  return anon ? `Anonymous Visitor · ${String(anon).slice(0, 8)}` : `Visitor · ${String(c.id).slice(0, 8)}`;
}

function toListItem(c) {
  const anonymousId = c.latest_anonymous_id || c.anonymous_id || null;
  return {
    id: c.id,
    name: displayName(c, anonymousId),
    email: c.email || '',
    phone: c.phone || '',
    lifecycle: c.lifecycle_stage || 'unknown',
    lifecycleLabel: LIFECYCLE_LABELS[c.lifecycle_stage] || c.lifecycle_stage || 'Unknown',
    phs_account_id: c.c360_customer_id,
    crmId: c.c360_customer_id || anonymousId || c.id,
    anonymousId,
    isAnonymous: !c.c360_customer_id && !c.email && !c.phone,
    eventCount: c.event_count || 0,
    first_seen_at: c.first_seen_at,
    last_seen_at: c.last_seen_at,
    product_interests: c.product_interests || [],
    source: 'cdp',
  };
}

// Any id the UI may hold (internal id, account id, anonymous visitor id) → internal id
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
async function resolveCustomerId(id) {
  if (!id || id.startsWith('mautic_')) return null;
  if (UUID_RE.test(id)) {
    const direct = await CustomerService.getProfileExists(id);
    if (direct) return id;
    // a UUID that is not a profile id is most likely an anonymous visitor id
  }
  const byUser = await CustomerService.findByUserId(id);
  if (byUser) return byUser.id;
  const byAnon = await CustomerService.findByAnonymousId(id);
  if (byAnon) return byAnon.id;
  for (const type of ['email', 'phone']) {
    const found = await CustomerService.findByIdentifier(type, id);
    if (found) return found.id;
  }
  return null;
}

// ─── GET /api/customers ──────────────────────────────────────
router.get('/', requireRole('viewer'), async (req, res) => {
  const { page = 1, limit = 20, search = '', lifecycle = '', tier = '' } = req.query;

  if (shouldUseMock()) {
    const { CUSTOMERS } = require('../mock/customers');
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
    return res.json({ data, total, page: Number(page), limit: Number(limit), pages: Math.ceil(total / Number(limit)), source: 'mock' });
  }

  // 1. CDP Profile Store
  try {
    const { customers, total } = await CustomerService.listCustomers({
      limit: Number(limit), offset: (Number(page) - 1) * Number(limit),
      lifecycle_stage: lifecycle || undefined, search: search || undefined,
    });

    // A search (or a filter) is answered by the CDP even when it finds nothing —
    // never silently replaced by another system's list.
    if (customers.length > 0 || search || lifecycle) {
      return res.json({
        data: customers.map(toListItem),
        total, page: Number(page), limit: Number(limit),
        pages: Math.ceil(total / Number(limit)), source: 'cdp',
      });
    }
  } catch (dbErr) {
    console.warn('[customers] CDP DB unavailable:', dbErr.message);
    if (search || lifecycle) {
      return res.status(503).json({ error: { message: 'Customer profiles are temporarily unavailable. Please try again.', code: 'PROFILE_STORE_UNAVAILABLE' } });
    }
  }

  // 2. Fallback to Mautic
  const start = (Number(page) - 1) * Number(limit);
  const result = await mautic.getContacts({ start, limit: Number(limit), search });
  if (result.ok) {
    const contactsMap = result.data.contacts || {};
    let customers = Object.values(contactsMap).map(mapMauticContact);
    const total = result.data.total || customers.length;
    if (lifecycle) customers = customers.filter(c => c.lifecycle === lifecycle);
    return res.json({
      data: customers.map(c => ({
        id: c.id, name: c.name, email: c.email, lifecycle: c.lifecycle,
        lifecycleLabel: c.lifecycleLabel, tier: c.tier, segment: c.segment,
        lastActive: c.lastActive, tradingFrequency: c.tradingFrequency, source: 'mautic',
      })),
      total: Number(total), page: Number(page), limit: Number(limit),
      pages: Math.ceil(Number(total) / Number(limit)), source: 'mautic',
    });
  }

  // 3. No data — not connected, no mock fallback
  return sendNotConnected(res, 'Customers', 'CDP Postgres / Mautic',
    'CDP Postgres has no customer records yet and Mautic is unavailable. Send identify() events to populate profiles.');
});

// ─── GET /api/customers/:id ──────────────────────────────────
router.get('/:id', requireRole('viewer'), async (req, res) => {
  const { id } = req.params;

  if (shouldUseMock()) {
    const { CUSTOMERS } = require('../mock/customers');
    const customer = CUSTOMERS.find(c => c.id === id);
    if (!customer) return res.status(404).json({ error: { message: 'Customer not found', code: 'NOT_FOUND' } });
    return res.json({
      customer: { id: customer.id, full_name: customer.name, email: customer.email, phone: customer.phone, lifecycle_stage: customer.lifecycle, product_interests: customer.productInterests || [] },
      identities: [], recentEvents: [
        { event_name: 'Login',          occurred_at: new Date(Date.now() - 7200000).toISOString(),  source: 'web' },
        { event_name: 'Product Viewed', occurred_at: new Date(Date.now() - 10800000).toISOString(), source: 'web', properties: { product: 'Margin' } },
      ],
      consents: [], segments: customer.audiences || [], campaignHistory: [], source: 'mock',
    });
  }

  // 1. CDP Profile Store — lookup by internal id, account id or anonymous visitor id
  let resolvedUUID = null;
  try {
    resolvedUUID = await resolveCustomerId(id);
  } catch (dbErr) {
    console.warn('[customers/:id] CDP DB error:', dbErr.message);
    return res.status(503).json({ error: { message: 'Customer profiles are temporarily unavailable. Please try again.', code: 'PROFILE_STORE_UNAVAILABLE' } });
  }

  if (resolvedUUID) {
    try {
      const profile = await CustomerService.getProfile(resolvedUUID);
      if (profile) {
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
          } catch { /* marketing engine unavailable — profile still served */ }
        }
        const anonymousId = (profile.identities.find(i => i.identifier_type === 'anonymous_id') || {}).identifier_value || null;
        return res.json({
          customer: { ...profile.customer, display_name: displayName(profile.customer, anonymousId) },
          identities: profile.identities,
          recentEvents: profile.recentEvents,
          eventStats: profile.eventStats,
          consents: profile.consents,
          segments: mauticSegments,
          campaignHistory,
          source: 'cdp',
        });
      }
    } catch (dbErr) {
      console.warn('[customers/:id] CDP DB error:', dbErr.message);
      return res.status(503).json({ error: { message: 'Customer profiles are temporarily unavailable. Please try again.', code: 'PROFILE_STORE_UNAVAILABLE' } });
    }
  }

  // 2. Mautic contact (mautic_xxx)
  if (id.startsWith('mautic_')) {
    const mauticId = id.replace('mautic_', '');
    const [contactResult, segmentsResult] = await Promise.all([
      mautic.getContact(mauticId),
      mautic.getContactSegments(mauticId),
    ]);
    if (contactResult.ok) {
      const customer = mapMauticContact(contactResult.data.contact);
      const segments = segmentsResult.ok ? Object.values(segmentsResult.data.lists || {}).map(s => s.name) : [];
      return res.json({
        customer: { id: customer.id, full_name: customer.name, email: customer.email, phone: customer.phone, lifecycle_stage: customer.lifecycle, product_interests: customer.productInterests },
        identities: [], recentEvents: [], consents: [], segments, campaignHistory: [], source: 'mautic',
      });
    }
  }

  return res.status(404).json({ error: { message: 'Customer not found — CDP Postgres has no record and Mautic is unavailable', code: 'NOT_FOUND', _dataStatus: 'not_connected' } });
});

// ─── GET /api/customers/:id/events ──────────────────────────
router.get('/:id/events', requireRole('viewer'), async (req, res) => {
  const { id } = req.params;
  const { limit = 50 } = req.query;

  if (shouldUseMock()) {
    const { randomEvent } = require('../mock/events');
    const events = Array.from({ length: Math.min(Number(limit), 20) }, (_, i) => ({ ...randomEvent(i), customerId: id, source: 'mock' }));
    return res.json({ data: events, total: events.length, source: 'mock' });
  }

  try {
    const resolvedUUID = await resolveCustomerId(id);
    if (resolvedUUID) {
      const rows = await CustomerService.getEvents(resolvedUUID, { limit: Math.min(Number(limit) || 50, 500) });
      return res.json({
        data: rows.map(r => ({ ...r, event_type: r.event_category })),
        total: rows.length, source: 'cdp',
      });
    }
  } catch (dbErr) {
    console.warn('[customers/:id/events] CDP DB error:', dbErr.message);
    return res.status(503).json({ error: { message: 'Customer activity is temporarily unavailable. Please try again.', code: 'PROFILE_STORE_UNAVAILABLE' } });
  }

  if (id.startsWith('mautic_')) {
    const mauticId = id.replace('mautic_', '');
    const result = await mautic.getContactActivityLog(mauticId, { limit: Number(limit) });
    if (result.ok) {
      const events = (result.data.events || []).map((e, i) => ({
        id: `evt_${i}`, event_name: e.eventLabel || e.event || 'Activity',
        occurred_at: e.timestamp || new Date().toISOString(),
        customer_id: id, source: 'mautic', properties: e.details || {},
      }));
      return res.json({ data: events, total: events.length, source: 'mautic' });
    }
  }

  return res.json({ data: [], total: 0, _dataStatus: 'not_connected', _reason: 'No events found in CDP Postgres or Mautic for this customer.', source: 'none' });
});

module.exports = router;
