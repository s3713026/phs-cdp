const express = require('express');
const router  = express.Router();
const { CUSTOMERS, LIFECYCLE_LABELS } = require('../mock/customers');
const { requireRole } = require('../middleware/rbac');
const MauticAdapter = require('../adapters/MauticAdapter');

const mautic  = new MauticAdapter();
const useMock = process.env.USE_MOCK === 'true';

// Helper: map Mautic contact → PHS Customer format
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

// GET /api/customers
router.get('/', requireRole('viewer'), async (req, res) => {
  const { page = 1, limit = 20, search = '', lifecycle = '', tier = '' } = req.query;

  if (!useMock) {
    const start = (Number(page) - 1) * Number(limit);
    const result = await mautic.getContacts({ start, limit: Number(limit), search });

    if (result.ok) {
      const contactsMap = result.data.contacts || {};
      let customers = Object.values(contactsMap).map(mapContactToCustomer);
      const total = result.data.total || customers.length;

      // Filter phía BFF nếu Mautic search không đủ
      if (lifecycle) customers = customers.filter(c => c.lifecycle === lifecycle);
      if (tier)      customers = customers.filter(c => c.tier === tier);

      // Nếu Mautic trả về rỗng → merge với mock để UI luôn có data demo
      if (customers.length === 0) {
        let mockList = [...CUSTOMERS];
        if (lifecycle) mockList = mockList.filter(c => c.lifecycle === lifecycle);
        if (tier)      mockList = mockList.filter(c => c.tier === tier);
        const mockTotal = mockList.length;
        const mockStart = (Number(page) - 1) * Number(limit);
        const data = mockList.slice(mockStart, mockStart + Number(limit)).map(c => ({
          id: c.id, name: c.name, email: c.email,
          lifecycle: c.lifecycle, lifecycleLabel: LIFECYCLE_LABELS[c.lifecycle] || c.lifecycle,
          tier: c.tier, segment: c.segment, lastActive: c.lastActive,
          tradingFrequency: c.tradingFrequency, source: 'mock',
        }));
        return res.json({ data, total: mockTotal, page: Number(page), limit: Number(limit), pages: Math.ceil(mockTotal / Number(limit)), source: 'mock_fallback' });
      }

      const data = customers.map(c => ({
        id: c.id, name: c.name, email: c.email,
        lifecycle: c.lifecycle, lifecycleLabel: c.lifecycleLabel,
        tier: c.tier, segment: c.segment, lastActive: c.lastActive,
        tradingFrequency: c.tradingFrequency, source: 'mautic',
      }));
      return res.json({ data, total: Number(total), page: Number(page), limit: Number(limit), pages: Math.ceil(Number(total) / Number(limit)), source: 'mautic' });
    }

    console.warn(`[Customers] Mautic unavailable: ${result.message}. Using mock.`);
  }

  // Mock fallback
  let list = [...CUSTOMERS];
  if (search)    list = list.filter(c => c.name.toLowerCase().includes(search.toLowerCase()) || c.id.includes(search) || c.email.toLowerCase().includes(search.toLowerCase()));
  if (lifecycle) list = list.filter(c => c.lifecycle === lifecycle);
  if (tier)      list = list.filter(c => c.tier === tier);
  const total = list.length;
  const start = (Number(page) - 1) * Number(limit);
  const data  = list.slice(start, start + Number(limit)).map(c => ({
    id: c.id, name: c.name, email: c.email,
    lifecycle: c.lifecycle, lifecycleLabel: LIFECYCLE_LABELS[c.lifecycle] || c.lifecycle,
    tier: c.tier, segment: c.segment, lastActive: c.lastActive,
    tradingFrequency: c.tradingFrequency, source: 'mock',
  }));
  res.json({ data, total, page: Number(page), limit: Number(limit), pages: Math.ceil(total / Number(limit)), source: 'mock' });
});

// GET /api/customers/:id
router.get('/:id', requireRole('viewer'), async (req, res) => {
  const { id } = req.params;

  if (!useMock && id.startsWith('mautic_')) {
    const mauticId = id.replace('mautic_', '');
    const [contactResult, segmentsResult] = await Promise.all([
      mautic.getContact(mauticId),
      mautic.getContactSegments(mauticId),
    ]);

    if (contactResult.ok) {
      const customer = mapContactToCustomer(contactResult.data.contact);
      const segments = segmentsResult.ok ? Object.values(segmentsResult.data.lists || {}).map(s => s.name) : [];
      return res.json({
        ...customer,
        audiences: segments,
        recentEvents: [
          { name:'Login', timestamp: new Date(Date.now()-7200000).toISOString(), source:'web' },
        ],
        campaignHistory: [],
      });
    }
  }

  // Mock fallback
  const customer = CUSTOMERS.find(c => c.id === id);
  if (!customer) return res.status(404).json({ error: { message: 'Customer not found', code: 'NOT_FOUND' } });
  res.json({
    ...customer,
    lifecycleLabel: LIFECYCLE_LABELS[customer.lifecycle] || customer.lifecycle,
    recentEvents: [
      { name:'Login',          timestamp: new Date(Date.now()-7200000).toISOString(),  source:'web' },
      { name:'Product Viewed', timestamp: new Date(Date.now()-10800000).toISOString(), source:'web', properties:{ product:'Margin' } },
      { name:'Stock Viewed',   timestamp: new Date(Date.now()-14400000).toISOString(), source:'mobile_ios', properties:{ symbol:'VIC' } },
    ],
    campaignHistory: [
      { name:'Margin Introduction', sentAt:'2024-01-08T09:00:00Z', channel:'email', status:'opened' },
    ],
    source: 'mock',
  });
});

// GET /api/customers/:id/events
router.get('/:id/events', requireRole('viewer'), async (req, res) => {
  const { id } = req.params;
  const { limit = 50 } = req.query;

  if (!useMock && id.startsWith('mautic_')) {
    const mauticId = id.replace('mautic_', '');
    const result = await mautic.getContactActivityLog(mauticId, { limit: Number(limit) });
    if (result.ok) {
      const events = result.data.events || [];
      const mapped = events.map((e, i) => ({
        id:          `evt_${i}`,
        name:        e.eventLabel || e.event || 'Activity',
        type:        e.event || 'custom',
        timestamp:   e.timestamp || new Date().toISOString(),
        customerId:  id,
        source:      'mautic',
        properties:  e.details || {},
      }));
      return res.json({ data: mapped, total: mapped.length, source: 'mautic' });
    }
  }

  const { randomEvent } = require('../mock/events');
  const events = Array.from({ length: Math.min(Number(limit), 50) }, (_, i) => ({
    ...randomEvent(i), customerId: id, source: 'mock',
  }));
  res.json({ data: events, total: events.length, source: 'mock' });
});

// ── POST /api/customers/identify ──────────────────────────────────────────────
// Direct identity resolution endpoint — called by frontend/app SDK
// Bypasses RudderStack webhook limitation in self-hosted mode
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

    // Anonymous only — record but don't create full profile
    return res.json({ status: 'ok', anonymousId, action: 'anonymous_tracked' });
  } catch (err) {
    console.error('[customers/identify] Error:', err.message);
    res.status(500).json({ error: 'Identity resolution failed' });
  }
});

// ── POST /api/customers/track ──────────────────────────────────────────────
// Direct event tracking endpoint
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
      customer?.id || null,
      anonymousId || null,
      event,
      properties,
      'web',
      null
    );
    return res.json({ status: 'ok', result });
  } catch (err) {
    console.error('[customers/track] Error:', err.message);
    res.status(500).json({ error: 'Event tracking failed' });
  }
});

module.exports = router;
