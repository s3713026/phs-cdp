/**
 * PHS CDP — Customer 360 BFF Integration Layer
 *
 * Replaces the ES-module import of inline mock data with live BFF calls.
 * The HTML page includes this script BEFORE customer-360.js so the BFF-aware
 * functions are available when the page module initialises.
 *
 * This file is NOT a module (loaded as plain <script>) so it can patch
 * window-level globals that the module also reads.
 *
 * Mount order in customer-360.html:
 *   1. api.js              ← PHSAPI client
 *   2. customer-360-bff.js ← this file, patches module behaviour
 *   3. (module) customer-360.js  ← existing page module, unchanged
 */

(function () {
  'use strict';

  if (typeof PHSAPI === 'undefined') {
    console.warn('[C360-BFF] PHSAPI not found. BFF integration skipped.');
    return;
  }

  const LIFECYCLE_LABELS = {
    prospect: 'Prospect', lead: 'Lead', ekyc: 'eKYC',
    account_opening: 'Account Opening', funding: 'Funding',
    first_trade: 'First Trade', active_investor: 'Active Investor',
    vip: 'VIP', dormant: 'Dormant', churn_risk: 'Churn Risk',
    reactivation: 'Reactivation',
  };

  // ── Display helpers ──────────────────────────────────────────────────────
  const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const pad = (n) => String(n).padStart(2, '0');
  function fmtDate(iso) {
    const d = new Date(iso);
    if (isNaN(d)) return '—';
    return `${pad(d.getDate())} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
  }
  function fmtTime(iso) {
    const d = new Date(iso);
    return isNaN(d) ? '' : `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }
  function fmtDateTime(iso) {
    return iso ? `${fmtDate(iso)}, ${fmtTime(iso)}` : '—';
  }
  function ago(iso) {
    if (!iso) return '—';
    const s = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
    if (s < 60) return 'Just now';
    if (s < 3600) return `${Math.floor(s / 60)} min ago`;
    if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
    return `${Math.floor(s / 86400)} d ago`;
  }

  const SOURCE_LABEL = { web: 'Web', mobile: 'App', server: 'API', app: 'App', api: 'API' };
  const IDENTITY_LABEL = {
    phs_account_id: 'Account ID', national_id_hash: 'National ID (hashed)', phone: 'Mobile Number',
    email: 'Email Address', idfa: 'Apple IDFA', idfv: 'Apple IDFV', gaid: 'Google Advertising ID',
    app_user_id: 'App User ID', xpro_user_id: 'XPro User ID', zalo_id: 'Zalo ID',
    cloudgo_contact_id: 'CloudGO Contact ID', anonymous_id: 'Anonymous Visitor ID',
  };
  const IDENTITY_ORDER = Object.keys(IDENTITY_LABEL);
  const CONSENT_LABEL = {
    marketing_email: 'Marketing Email', push_notification: 'Push Notification',
    sms: 'SMS', data_processing: 'Data Processing',
  };

  function eventCategory(name, type) {
    const n = String(name || '').toLowerCase();
    if (/order|trade|buy|sell/.test(n)) return 'trading';
    if (/deposit|withdraw|transfer|payment/.test(n)) return 'transaction';
    if (/campaign|email|push|sms|message|notification|opened|clicked/.test(n)) return 'engagement';
    return 'behavior';
  }

  function propChips(props) {
    const out = [];
    for (const [k, v] of Object.entries(props || {})) {
      if (v === null || v === undefined || v === '' || typeof v === 'object') continue;
      if (['category', 'page_url', 'referrer', 'page_path'].includes(k)) continue;
      out.push(`${k}: ${String(v).slice(0, 60)}`);
      if (out.length >= 4) break;
    }
    return out;
  }

  function mapEvents(list) {
    return (list || []).map(e => {
      const props = typeof e.properties === 'string' ? safeJson(e.properties) : (e.properties || {});
      const src = SOURCE_LABEL[String(e.source || e.channel || 'web').toLowerCase()] || 'Web';
      let title = e.event_name || 'Event';
      const pageName = props.page_name || props.name;
      if (title === 'Page Viewed' && pageName) title = `Page Viewed — ${String(pageName).slice(0, 60)}`;
      return {
        date: fmtDate(e.occurred_at), time: fmtTime(e.occurred_at),
        type: title, category: eventCategory(e.event_name, e.event_category),
        source: src, props: propChips(props), status: undefined,
        _iso: e.occurred_at, _session: e.session_id || null, _name: e.event_name || '',
      };
    });
  }
  function safeJson(s) { try { return JSON.parse(s); } catch { return {}; } }

  function mapIdentities(rows) {
    const byType = new Map();
    (rows || []).forEach(r => {
      const t = r.identifier_type;
      if (!byType.has(t)) byType.set(t, []);
      byType.get(t).push({
        value: r.identifier_value,
        source: ({ web: 'Website', mobile: 'Mobile App', crm: 'CRM', rudderstack: 'Data Platform', server: 'API' })[r.source] || 'Data Platform',
        status: r.is_verified ? 'Verified' : 'Active',
        lastSeen: ago(r.last_seen_at || r.created_at),
        // Keep raw timestamp for sorting — most recent value shown first (primary)
        _ts: new Date(r.last_seen_at || r.created_at || 0).getTime(),
      });
    });
    return [...byType.entries()]
      .sort((a, b) => (IDENTITY_ORDER.indexOf(a[0]) + 1 || 99) - (IDENTITY_ORDER.indexOf(b[0]) + 1 || 99))
      .map(([type, values]) => ({
        type: IDENTITY_LABEL[type] || type,
        // Sort values: most recently seen first so the primary (shown by default) is the latest
        values: [...values].sort((a, b) => b._ts - a._ts),
      }));
  }

  function mapConsents(rows) {
    return (rows || []).map(r => ({
      type: CONSENT_LABEL[r.consent_type] || r.consent_type,
      status: r.status ? 'Granted' : 'Denied',
      source: 'Preference Center', updated: fmtDate(r.updated_at),
    }));
  }

  function behaviorFrom(events, stats) {
    const cutoff = Date.now() - 30 * 86400000;
    const recent = events.filter(e => new Date(e._iso).getTime() >= cutoff);
    const count = (re) => recent.filter(e => re.test(e._name.toLowerCase())).length;
    const sessions = new Set(recent.map(e => e._session).filter(Boolean)).size;
    return {
      appOpens:         count(/app open|login|screen viewed/),
      sessions:         stats && stats.sessions30d ? stats.sessions30d : sessions,
      stockViews:       count(/stock viewed|view stock|product viewed|page viewed/),
      watchlistActions: count(/watchlist/),
      tradingOrders:    count(/order|trade/),
      deposits:         count(/deposit/),
    };
  }

  /**
   * Normalize a BFF customer response → the flat shape customer-360.js renders.
   * BFF: { customer, identities[], recentEvents[], eventStats, consents[], segments[] }
   * List rows from /api/customers are already flat.
   */
  function normalizeBffCustomer(raw) {
    if (!raw) return null;
    const c = (raw.customer && typeof raw.customer === 'object') ? raw.customer : raw;
    const isDetail = !!(raw.customer && typeof raw.customer === 'object');

    const anonRow = (raw.identities || []).find(i => i.identifier_type === 'anonymous_id');
    const name = c.display_name || c.name || c.full_name || c.email || c.c360_customer_id
      || (anonRow ? `Anonymous Visitor · ${String(anonRow.identifier_value).slice(0, 8)}` : c.anonymousId ? `Anonymous Visitor · ${String(c.anonymousId).slice(0, 8)}` : `Visitor · ${String(c.id || '?').slice(0, 8)}`);
    const initials = (/^(Anonymous )?Visitor/.test(name) ? 'AV' :
      name.split(/\s+/).slice(0, 2).map(w => (w[0] || '')).join('').toUpperCase()) || '?';

    const attrs = c.custom_attributes || c.customAttributes || {};
    const lifecycle = c.lifecycle_stage || c.lifecycle || 'unknown';
    const lifecycleLabel = LIFECYCLE_LABELS[lifecycle] || c.lifecycleLabel || lifecycle || 'Unknown';

    const events = isDetail ? mapEvents(raw.recentEvents) : [];
    const stats = raw.eventStats || {};
    const lastActiveIso = c.last_seen_at || c.lastActive || '';
    const accountId = c.c360_customer_id || c.phs_account_id || '';
    const isAnonymous = isDetail ? (!c.c360_customer_id && !c.email && !c.phone) : !!c.isAnonymous;

    const attributes = {};
    if (accountId) attributes['Account ID'] = accountId;
    if (c.email) attributes['Email'] = c.email;
    if (c.phone) attributes['Phone'] = c.phone;
    attributes['Lifecycle Stage'] = lifecycleLabel;
    if (c.kyc_status) attributes['KYC Status'] = c.kyc_status;
    if (c.account_status) attributes['Account Status'] = c.account_status;
    if (c.first_seen_at) attributes['First Seen'] = fmtDate(c.first_seen_at);
    Object.entries(attrs).slice(0, 12).forEach(([k, v]) => { attributes[k.replace(/_/g, ' ')] = String(v); });

    const eng = events.filter(e => e.category === 'engagement').length;
    const interests = Array.isArray(c.product_interests) ? c.product_interests
      : Array.isArray(c.productInterests) ? c.productInterests : [];

    return {
      id:        c.id || accountId,
      crmId:     String(accountId || c.crmId || (anonRow && anonRow.identifier_value) || c.anonymousId || c.id || ''),
      anonymousId: (anonRow && anonRow.identifier_value) || c.anonymousId || '',
      name, initials,
      email: c.email || '', phone: c.phone || '',
      lifecycle: lifecycleLabel, lifecycleKey: lifecycle, lifecycleLabel,
      status: lastActiveIso && (Date.now() - new Date(lastActiveIso).getTime()) < 30 * 86400000 ? 'Active' : (lastActiveIso ? 'Inactive' : 'Unknown'),
      tier: isAnonymous ? 'Anonymous' : (attrs.customer_tier || c.tier || 'Standard'),
      segment: c.segment || attrs.customer_segment || '',
      location: c.province || attrs.location || '—',
      summary: isAnonymous
        ? 'Anonymous visitor. Activity is kept and will join the customer profile automatically when this visitor signs in or is identified.'
        : `${lifecycleLabel} customer${c.first_seen_at ? ` · first seen ${fmtDate(c.first_seen_at)}` : ''}.`,
      accessLevel: 'standard',
      joinDate: c.first_seen_at ? fmtDate(c.first_seen_at) : '',
      lastActive: lastActiveIso ? (isDetail ? fmtDateTime(lastActiveIso) : ago(lastActiveIso)) : '—',
      last_seen_at: lastActiveIso,
      productInterests: interests,
      eventCount: c.eventCount || stats.total || 0,
      isAnonymous,

      metrics: {
        portfolioBand: '—',
        tradingActivity: `${events.filter(e => e.category === 'trading').length} orders`,
        engagementScore: Math.min(100, Math.round((stats.last30d || events.length) * 4)),
        daysSinceLogin: lastActiveIso ? Math.floor((Date.now() - new Date(lastActiveIso).getTime()) / 86400000) : '—',
      },
      journey: {
        currentStageIndex: Math.max(0, ['Registered','Onboarding','Active','Engaged','High Value','Dormant','Reactivation'].indexOf(lifecycleLabel)),
        currentLabel: lifecycleLabel, daysInStage: '—', previousStage: '—', nextLikelyStage: '—',
      },

      identities: mapIdentities(raw.identities),
      attributes,
      behavior: behaviorFrom(events, stats),
      events,
      transactions: [],
      consent: mapConsents(raw.consents),
      consentHistory: [],
      engagement: {
        pushOpenRate: 0, emailOpenRate: 0, inAppEngagement: 0, webMessageEngagement: 0,
        lastCampaign: '—', campaignInteractions: eng, lastEngagement: events.length ? events[0].date : '—',
      },
      audiences: (raw.segments || []).map(n => ({ name: n, joined: '—', status: 'Active', lastEvaluated: '—' })),
      recentEvents: raw.recentEvents || [],
      campaignHistory: raw.campaignHistory || [],
      source: raw.source || c.source || 'bff',
    };
  }

  // ── Customer list cache for the switcher dropdown ─────────────────────────
  let _customerListCache = null;

  async function fetchCustomerList(query) {
    try {
      const res = await PHSAPI.customers.list({ search: query, limit: 20 });
      _customerListCache = (res.data || res.customers || []).map(normalizeBffCustomer).filter(Boolean);
      return _customerListCache;
    } catch (err) {
      console.error('[C360-BFF] Failed to load customer list:', err.message);
      return _customerListCache || [];
    }
  }

  // ── Main customer fetch ───────────────────────────────────────────────────
  async function fetchCustomer(id) {
    try {
      const raw = await PHSAPI.customers.get(id);
      return normalizeBffCustomer(raw);
    } catch (err) {
      console.error(`[C360-BFF] Failed to load customer ${id}:`, err.message);
      return null;
    }
  }

  // ── Expose on window so the module can call them ──────────────────────────
  window.PHSC360 = {
    fetchCustomer,
    fetchCustomerList,
    getCache: () => _customerListCache,
  };

  // Pre-warm the customer list so the switcher feels instant
  fetchCustomerList('').then(list => {
    console.log(`[C360-BFF] Pre-warmed ${list.length} customers`);
  });

})();
