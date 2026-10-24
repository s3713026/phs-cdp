const EVENT_TYPES = [
  'Account Registered','Account Opened','eKYC Started','eKYC Completed',
  'First Deposit','First Trade','Login','Product Viewed','Stock Viewed',
  'Margin Viewed','Campaign Opened','Campaign Clicked','Push Opened',
  'Portfolio Viewed','Watchlist Updated','Order Placed','Order Filled',
];
const CUSTOMER_IDS = ['PHS-001234','PHS-001235','PHS-001236','PHS-001237','PHS-001238'];
const SOURCES      = ['web','mobile_ios','mobile_android','server'];

function randomEvent(i) {
  const t = new Date(Date.now() - Math.floor(Math.random() * 3600000));
  return {
    id: `evt_${Date.now()}_${i}`,
    name: EVENT_TYPES[Math.floor(Math.random() * EVENT_TYPES.length)],
    customerId: CUSTOMER_IDS[Math.floor(Math.random() * CUSTOMER_IDS.length)],
    anonymousId: `anon_${Math.random().toString(36).slice(2, 10)}`,
    source: SOURCES[Math.floor(Math.random() * SOURCES.length)],
    timestamp: t.toISOString(),
    properties: { page_url: 'https://phs.vn/products', session_id: `sess_${Math.random().toString(36).slice(2,8)}` },
    consentStatus: 'granted',
  };
}

const EVENTS_HISTORY = Array.from({ length: 100 }, (_, i) => randomEvent(i));

module.exports = { EVENTS_HISTORY, randomEvent, EVENT_TYPES };
