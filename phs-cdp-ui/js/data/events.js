/*
  PHS CDP — centralized Event Catalog (Phase 13).
  This is the SINGLE canonical source of truth for every event the CDP
  tracks. Everything downstream — Journey Builder's event triggers,
  Segment Builder's event conditions, and Activation's Event data
  stream — reads its event list from here rather than maintaining a
  second hardcoded catalog. This file is intentionally a leaf module:
  it does not import from journeys.js, audiences.js, destinations.js or
  sources.js, so those can safely import from it without creating a
  cycle. Usage references (which audiences/journeys/destinations use a
  given event) are stored here as plain name strings and resolved
  against the real records by the page that renders them — never a
  second copy of an Audience, Journey or Destination object.
*/

/* ---------------------------------------------------------------- */
/* Small mock-time primitives — intentionally mirrors the equivalent  */
/* helpers in js/data/destinations.js (kept independent on purpose so */
/* this file stays a dependency-free leaf module; see file header).   */
/* ---------------------------------------------------------------- */
export const MOCK_TODAY = "24 Sep 2026";
export const DATE_RANGE_PRESETS = ["Today", "Yesterday", "Last 7 days", "Last 30 days", "Custom range"];
const PRESET_DAYS = { Today: 1, Yesterday: 1, "Last 7 days": 7, "Last 30 days": 30 };
export function resolveDateRangeDays(dateFilter) {
  if (!dateFilter) return 1;
  if (dateFilter.preset === "Custom range" && dateFilter.from && dateFilter.to) {
    const from = new Date(dateFilter.from);
    const to = new Date(dateFilter.to);
    return Math.max(1, Math.round((to - from) / 86400000) + 1);
  }
  return PRESET_DAYS[dateFilter.preset] ?? 1;
}
function hashString(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) >>> 0;
  return h;
}
const MONTHS_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
export function formatMockDate(d) {
  return `${String(d.getDate()).padStart(2, "0")} ${MONTHS_SHORT[d.getMonth()]} ${d.getFullYear()}`;
}
function mockDateOffset(id, minDays, maxDays) {
  const span = maxDays - minDays;
  const days = minDays + (hashString(id + "-date") % span);
  const d = new Date(2026, 8, 24); // 24 Sep 2026
  d.setDate(d.getDate() - days);
  return formatMockDate(d);
}

/* ---------------------------------------------------------------- */
/* Core taxonomy                                                     */
/* ---------------------------------------------------------------- */
// "Behavior" is a category, never a top-level event stream — see
// section 3/41 of the Phase 13 spec.
export const EVENT_CATEGORIES = ["Behavior", "Transaction", "Engagement", "System"];
export const EVENT_CATEGORY_META = {
  Behavior: { icon: "activity" },
  Transaction: { icon: "banknote" },
  Engagement: { icon: "message-square" },
  System: { icon: "settings-2" },
};
export const EVENT_STATUSES = ["Active", "Draft", "Deprecated", "Disabled"];
export const EVENT_STATUS_META = {
  Active: { dot: "status-dot--success", badge: "badge--success" },
  Draft: { dot: "", badge: "badge--neutral" },
  Deprecated: { dot: "status-dot--warning", badge: "badge--warning" },
  Disabled: { dot: "status-dot--danger", badge: "badge--danger" },
};
export const PROPERTY_TYPES = ["String", "Number", "Boolean", "DateTime", "Enum", "Object"];
// Sources an event can arrive from — the same system names used by
// js/data/dataflows.js's SYSTEM_ICONS/FLOWS, referenced by name only
// (never a duplicate connection object).
export const EVENT_SOURCES = ["Mobile App", "Web", "Trading Platform", "CRM", "API", "AppsFlyer", "Email", "Push", "Webhook"];
export const EXPLORER_STATUSES = ["Received", "Processed", "Rejected", "Warning"];
export const EXPLORER_STATUS_META = {
  Received: { badge: "badge--success" },
  Processed: { badge: "badge--primary" },
  Rejected: { badge: "badge--neutral" },
  Warning: { badge: "badge--warning" },
};

export function toCanonicalName(displayName) {
  return displayName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

/* ---------------------------------------------------------------- */
/* Property helper — privacy-aware by construction: a "banded" enum   */
/* property never carries an `example` that looks like a real amount. */
/* ---------------------------------------------------------------- */
function prop(key, label, type, opts = {}) {
  return { key, label, type, required: !!opts.required, sensitive: !!opts.sensitive, description: opts.description || "", example: opts.example ?? "", enumValues: opts.enumValues, banded: !!opts.banded };
}

const VALUE_BAND_ENUM = ["> ₫100,000,000", "₫50,000,000 – ₫100,000,000", "₫10,000,000 – ₫50,000,000", "₫1,000,000 – ₫10,000,000", "< ₫1,000,000"];

const P = {
  timestamp: () => prop("timestamp", "timestamp", "DateTime", { required: true, description: "When the event occurred on the client/source.", example: "2026-09-24T10:41:56Z" }),
  platform: () => prop("platform", "platform", "Enum", { required: true, description: "Client platform.", enumValues: ["iOS", "Android", "Web"], example: "iOS" }),
  appVersion: () => prop("app_version", "app_version", "String", { description: "App build version.", example: "8.4.1" }),
  deviceType: () => prop("device_type", "device_type", "Enum", { description: "Device form factor.", enumValues: ["Phone", "Tablet"], example: "Phone" }),
  sessionId: () => prop("session_id", "session_id", "String", { sensitive: false, description: "Client session identifier.", example: "sess_8f21a" }),
  instrument: () => prop("instrument", "instrument", "String", { description: "Ticker symbol.", example: "VNM" }),
  market: () => prop("market", "market", "Enum", { description: "Exchange.", enumValues: ["HOSE", "HNX", "UPCOM"], example: "HOSE" }),
  screen: () => prop("screen", "screen", "String", { description: "App screen name.", example: "stock_detail" }),
  side: () => prop("side", "side", "Enum", { required: true, description: "Order direction.", enumValues: ["BUY", "SELL"], example: "BUY" }),
  quantity: () => prop("quantity", "quantity", "Number", { description: "Order quantity (shares).", example: "500" }),
  orderType: () => prop("order_type", "order_type", "Enum", { description: "Order type.", enumValues: ["Market", "Limit"], example: "Market" }),
  tradingAccount: () => prop("trading_account", "trading_account", "String", { sensitive: true, description: "Internal trading account reference.", example: "TA-••••291" }),
  orderValueBand: () => prop("order_value_band", "order_value_band", "Enum", { description: "Privacy-aware order value band — never an exact amount.", banded: true, enumValues: VALUE_BAND_ENUM, example: "> ₫100,000,000" }),
  depositValueBand: () => prop("deposit_value_band", "deposit_value_band", "Enum", { description: "Privacy-aware deposit value band.", banded: true, enumValues: VALUE_BAND_ENUM, example: "₫10,000,000 – ₫50,000,000" }),
  withdrawalValueBand: () => prop("withdrawal_value_band", "withdrawal_value_band", "Enum", { description: "Privacy-aware withdrawal value band.", banded: true, enumValues: VALUE_BAND_ENUM, example: "₫1,000,000 – ₫10,000,000" }),
  method: (values) => prop("method", "method", "Enum", { description: "Method used.", enumValues: values, example: values[0] }),
  campaignId: () => prop("campaign_id", "campaign_id", "String", { description: "Campaign reference.", example: "camp_birthday_q3" }),
  templateId: () => prop("template_id", "template_id", "String", { description: "Message template reference.", example: "tmpl_birthday_v2" }),
  channel: (values) => prop("channel", "channel", "Enum", { description: "Delivery channel.", enumValues: values, example: values[0] }),
  messageId: () => prop("message_id", "message_id", "String", { description: "Message delivery reference.", example: "msg_9f2a1" }),
  fieldName: () => prop("field_name", "field_name", "String", { description: "Profile field that changed.", example: "preferred_channel" }),
  updateSource: () => prop("source", "source", "Enum", { description: "System that triggered the update.", enumValues: ["CRM", "API", "Customer"], example: "CRM" }),
  consentType: () => prop("consent_type", "consent_type", "Enum", { description: "Which consent changed.", enumValues: ["Marketing", "Analytics", "Personalization"], example: "Marketing" }),
  consentStatus: () => prop("status", "status", "Enum", { description: "New consent state.", enumValues: ["Granted", "Denied", "Pending"], example: "Granted" }),
  audienceId: () => prop("audience_id", "audience_id", "String", { description: "Audience identifier.", example: "aud-003" }),
  audienceName: () => prop("audience_name", "audience_name", "String", { description: "Audience display name.", example: "Dormant Investors" }),
  query: () => prop("query", "query", "String", { description: "Search text entered.", example: "VNM" }),
  resultCount: () => prop("result_count", "result_count", "Number", { description: "Number of search results returned.", example: "12" }),
};

/* ---------------------------------------------------------------- */
/* Usage — plain name references, resolved against the real Audience /*/
/* Journey / Destination records by whatever page renders them.       */
/* ---------------------------------------------------------------- */
function usage(audiences = [], journeys = [], destinations = []) {
  return { audiences, journeys, destinations };
}

// Deterministic per-day baseline event volume — the same hash-jitter
// pattern used throughout the app (see getUsersThroughConnector).
const BASE_EVENTS_PER_DAY = {
  app_open: 182420,
  login: 96210,
  view_stock: 214800,
  search_stock: 58200,
  watchlist_add: 21400,
  place_order: 18421,
  buy: 11200,
  sell: 8900,
  deposit: 4210,
  withdrawal: 1840,
  push_open: 42100,
  email_open: 31820,
  in_app_message_open: 18400,
  web_message_open: 9200,
  profile_updated: 6400,
  consent_updated: 2100,
  audience_entered: 14200,
  audience_exited: 9800,
};

function statsFor(canonicalName, id) {
  const base = BASE_EVENTS_PER_DAY[canonicalName] || 1000;
  const jitter = 0.9 + (hashString(id + "-stats") % 21) / 100;
  const eventsToday = Math.round(base * jitter);
  const uniqueCustomersToday = Math.round(eventsToday / (1.4 + (hashString(id + "-avg") % 30) / 100));
  return { eventsToday, uniqueCustomersToday, avgPerCustomer: +(eventsToday / Math.max(1, uniqueCustomersToday)).toFixed(2) };
}

/* ---------------------------------------------------------------- */
/* The canonical Event Catalog                                        */
/* ---------------------------------------------------------------- */
const RAW_EVENTS = [
  {
    id: "ev-app-open",
    name: "App Open",
    category: "Behavior",
    description: "Customer opened the PHS mobile application.",
    properties: [P.timestamp(), P.platform(), P.appVersion(), P.deviceType(), P.sessionId()],
    sources: ["Mobile App"],
    usage: usage(["Active Mobile Investors", "Mobile App Users"], ["Mobile Engagement Boost"], []),
  },
  {
    id: "ev-login",
    name: "Login",
    category: "Behavior",
    description: "Customer signed in to the PHS mobile app or website.",
    properties: [P.timestamp(), P.method(["Password", "Biometric", "OTP"]), P.platform(), P.deviceType(), P.sessionId()],
    sources: ["Mobile App", "Web"],
    usage: usage(["Active Mobile Investors"], ["New Investor Onboarding"], []),
  },
  {
    id: "ev-view-stock",
    name: "View Stock",
    category: "Behavior",
    description: "Customer viewed a stock detail screen.",
    properties: [P.timestamp(), P.instrument(), P.market(), P.screen(), P.sessionId()],
    sources: ["Mobile App", "Web"],
    usage: usage(["Active Mobile Investors"], [], []),
  },
  {
    id: "ev-search-stock",
    name: "Search Stock",
    category: "Behavior",
    description: "Customer searched for a stock or instrument.",
    properties: [P.timestamp(), P.query(), P.resultCount(), P.screen()],
    sources: ["Mobile App", "Web"],
    usage: usage([], [], []),
  },
  {
    id: "ev-watchlist-add",
    name: "Watchlist Add",
    category: "Behavior",
    description: "Customer added an instrument to their watchlist.",
    properties: [P.timestamp(), P.instrument(), P.market()],
    sources: ["Mobile App", "Web"],
    usage: usage(["Active Mobile Investors"], [], []),
  },
  {
    id: "ev-place-order",
    name: "Place Order",
    category: "Transaction",
    description: "Customer submitted a trading order.",
    properties: [P.timestamp(), P.instrument(), P.side(), P.quantity(), P.orderType(), P.tradingAccount(), P.orderValueBand()],
    sources: ["Mobile App", "Trading Platform", "API"],
    usage: usage(["High Value Customers", "Active Mobile Investors"], ["Post Trade Engagement", "High Value Investor Engagement"], ["PHS Webhook — Event", "PHS n8n — Event"]),
  },
  {
    id: "ev-buy",
    name: "Buy",
    category: "Transaction",
    description: "Customer completed a buy-side trade execution.",
    properties: [P.timestamp(), P.instrument(), P.quantity(), P.orderValueBand(), P.tradingAccount()],
    sources: ["Trading Platform", "API"],
    usage: usage(["High Value Customers"], ["Post Trade Engagement"], ["PHS n8n — Event"]),
  },
  {
    id: "ev-sell",
    name: "Sell",
    category: "Transaction",
    description: "Customer completed a sell-side trade execution.",
    properties: [P.timestamp(), P.instrument(), P.quantity(), P.orderValueBand(), P.tradingAccount()],
    sources: ["Trading Platform", "API"],
    usage: usage(["High Value Customers"], ["Post Trade Engagement"], []),
  },
  {
    id: "ev-deposit",
    name: "Deposit",
    category: "Transaction",
    description: "Customer deposited funds into their trading account.",
    properties: [P.timestamp(), P.method(["Bank Transfer", "E-Wallet", "Counter"]), P.depositValueBand(), P.tradingAccount()],
    sources: ["Trading Platform", "CRM"],
    usage: usage(["High Value Customers"], [], ["PHS Webhook — Event"]),
  },
  {
    id: "ev-withdrawal",
    name: "Withdrawal",
    category: "Transaction",
    description: "Customer withdrew funds from their trading account.",
    properties: [P.timestamp(), P.method(["Bank Transfer", "E-Wallet"]), P.withdrawalValueBand(), P.tradingAccount()],
    sources: ["Trading Platform", "CRM"],
    usage: usage([], [], ["PHS Webhook — Event"]),
  },
  {
    id: "ev-push-open",
    name: "Push Open",
    category: "Engagement",
    description: "Customer opened a push notification.",
    properties: [P.timestamp(), P.campaignId(), P.templateId(), P.channel(["Push"]), P.messageId()],
    sources: ["Push"],
    usage: usage([], ["Birthday Engagement"], []),
  },
  {
    id: "ev-email-open",
    name: "Email Open",
    category: "Engagement",
    description: "Customer opened a marketing or transactional email.",
    properties: [P.timestamp(), P.campaignId(), P.templateId(), P.channel(["Email"]), P.messageId()],
    sources: ["Email"],
    usage: usage(["Marketing Consent — Email"], ["Email Consent Nurture", "Q2 Birthday Campaign"], ["PHS Email — Marketing"]),
  },
  {
    id: "ev-in-app-message-open",
    name: "In-App Message Open",
    category: "Engagement",
    description: "Customer opened an in-app message.",
    properties: [P.timestamp(), P.campaignId(), P.templateId(), P.channel(["In-App"]), P.messageId()],
    sources: ["Mobile App"],
    usage: usage([], ["High Value Investor Engagement"], ["PHS In-App — Engagement"]),
  },
  {
    id: "ev-web-message-open",
    name: "Web Message Open",
    category: "Engagement",
    description: "Customer opened an on-site web message.",
    properties: [P.timestamp(), P.campaignId(), P.templateId(), P.channel(["Web Message"]), P.messageId()],
    sources: ["Web"],
    usage: usage([], ["Re-engage High Engagement Non-Traders"], ["PHS Web Message — Engagement"]),
  },
  {
    id: "ev-profile-updated",
    name: "Profile Updated",
    category: "System",
    description: "A customer profile attribute changed.",
    properties: [P.timestamp(), P.fieldName(), P.updateSource()],
    sources: ["CRM", "API"],
    usage: usage([], [], ["PHS CRM — Profile"]),
  },
  {
    id: "ev-consent-updated",
    name: "Consent Updated",
    category: "System",
    description: "A customer's consent state changed. Recorded as an event only — the Consent data stream itself remains a separate concept from Behavior.",
    properties: [P.timestamp(), P.consentType(), P.consentStatus(), P.channel(["Email", "Push", "SMS", "Zalo"])],
    sources: ["CRM", "Web", "Mobile App"],
    usage: usage(["Marketing Consent — Email"], ["Email Consent Nurture"], ["PHS Consent — Compliance"]),
  },
  {
    id: "ev-audience-entered",
    name: "Audience Entered",
    category: "System",
    description: "A customer newly qualified for an audience.",
    properties: [P.timestamp(), P.audienceId(), P.audienceName()],
    sources: [],
    usage: usage(["Dormant Investors", "High Value Customers"], ["Dormant Investor Re-engagement"], []),
  },
  {
    id: "ev-audience-exited",
    name: "Audience Exited",
    category: "System",
    description: "A customer no longer qualifies for an audience.",
    properties: [P.timestamp(), P.audienceId(), P.audienceName()],
    sources: [],
    usage: usage(["Recently Registered"], [], []),
  },
];

// Deterministic status/date fields — computed once, never re-randomized.
export const EVENT_CATALOG = RAW_EVENTS.map((e) => {
  const canonicalName = toCanonicalName(e.name);
  const status = "Active"; // every catalog event ships Active in this prototype
  return {
    ...e,
    canonicalName,
    status,
    version: "v1",
    primarySource: e.sources[0] || null,
    createdAt: mockDateOffset(e.id, 30, 210),
    updatedAt: mockDateOffset(e.id + "-upd", 1, 21),
    lastReceived: e.sources.length ? `${MOCK_TODAY} · ${String(8 + (hashString(e.id) % 12)).padStart(2, "0")}:${String(hashString(e.id + "m") % 60).padStart(2, "0")}` : "Generated internally",
    stats: statsFor(canonicalName, e.id),
  };
});

export function getEventById(id) {
  return EVENT_CATALOG.find((e) => e.id === id);
}
export function getEventByName(name) {
  return EVENT_CATALOG.find((e) => e.name === name);
}
export function getEventByCanonicalName(canonicalName) {
  return EVENT_CATALOG.find((e) => e.canonicalName === canonicalName);
}

/** Event names grouped by category — used by Activation's Event data
 * stream picker and Event Explorer's category filter. Always derived,
 * never a second hand-maintained list. */
export function eventsByCategory() {
  const groups = {};
  EVENT_CATEGORIES.forEach((c) => (groups[c] = []));
  EVENT_CATALOG.forEach((e) => groups[e.category].push(e.name));
  return groups;
}

/** name -> properties[] map, in the shape Activation's per-event
 * property drill-down (Add/Edit Destination) already expects. */
export const EVENT_PROPERTIES_MAP = EVENT_CATALOG.reduce((acc, e) => {
  acc[e.name] = e.properties.map((p) => ({ key: p.key, label: p.label, banded: p.banded }));
  return acc;
}, {});

/** Validates a canonical name against the catalog (used by Create/Edit
 * Event Definition) — must be unique, lowercase snake_case. */
export function validateCanonicalName(canonicalName, excludeId) {
  if (!canonicalName) return "Canonical name is required.";
  if (!/^[a-z][a-z0-9_]*$/.test(canonicalName)) return "Use lowercase snake_case (e.g. app_open).";
  const clash = EVENT_CATALOG.find((e) => e.canonicalName === canonicalName && e.id !== excludeId);
  if (clash) return `Canonical name already used by "${clash.name}".`;
  return null;
}

/** Flags a Number-typed property whose name suggests it carries an
 * exact financial amount — Create/Edit Event Definition blocks these,
 * steering toward a *_band Enum instead (section 27/9). */
const FINANCIAL_NAME_PATTERN = /(value|amount|price|balance)$/i;
export function isUnsafeFinancialProperty(property) {
  return property.type === "Number" && FINANCIAL_NAME_PATTERN.test(property.key || "");
}

export function getUsersActiveForRange(baseline, dateFilter) {
  const days = resolveDateRangeDays(dateFilter);
  return Math.max(0, Math.round(baseline * days));
}

/* ---------------------------------------------------------------- */
/* Event Explorer — an operational, per-occurrence activity log        */
/* (distinct from the catalog's aggregate stats). Deterministic        */
/* generation so the same filters always render the same rows.         */
/* ---------------------------------------------------------------- */
const EXPLORER_CUSTOMER_POOL = ["CRM-847291", "CRM-847292", "CRM-552013", "CRM-118842", "CRM-990217", "CRM-334477", "CRM-771029", "CRM-205588"];
function maskCustomerId(id) {
  return `CRM-••••${id.slice(-3)}`;
}

function propertySummary(event, hash) {
  if (event.name === "Place Order" || event.name === "Buy" || event.name === "Sell") {
    const sides = ["BUY", "SELL"];
    const instruments = ["VNM", "FPT", "MWG", "HPG", "VIC"];
    return `${instruments[hash % instruments.length]} · ${sides[hash % 2]} · ${100 * (1 + (hash % 20))}`;
  }
  if (event.name === "App Open") return `${["iOS", "Android"][hash % 2]} · v8.4.${hash % 5}`;
  if (event.name === "Login") return `${["Password", "Biometric", "OTP"][hash % 3]} · ${["iOS", "Android", "Web"][hash % 3]}`;
  if (event.name === "Search Stock") return `"${["VNM", "FPT", "MWG"][hash % 3]}" · ${1 + (hash % 12)} results`;
  if (event.name === "Email Open" || event.name === "Push Open" || event.name === "In-App Message Open" || event.name === "Web Message Open") return `Campaign: ${["Market Brief", "Birthday Greeting", "Q2 Update"][hash % 3]}`;
  if (event.name === "View Stock" || event.name === "Watchlist Add") return ["VNM", "FPT", "MWG", "HPG"][hash % 4];
  if (event.name === "Deposit" || event.name === "Withdrawal") return VALUE_BAND_ENUM[hash % VALUE_BAND_ENUM.length];
  if (event.name === "Consent Updated") return `${["Marketing", "Analytics"][hash % 2]} · Granted`;
  if (event.name === "Profile Updated") return `${["preferred_channel", "lifecycle_stage", "location"][hash % 3]} · CRM`;
  if (event.name === "Audience Entered" || event.name === "Audience Exited") return ["Dormant Investors", "High Value Customers", "Recently Registered"][hash % 3];
  return "—";
}

function generateExplorerEntries() {
  const entries = [];
  EVENT_CATALOG.filter((e) => e.sources.length).forEach((event) => {
    for (let day = 0; day < 30; day++) {
      const perDay = Math.max(1, Math.round((event.stats.eventsToday / 60) * (0.4 + (hashString(event.id + day) % 30) / 50)));
      const count = Math.min(perDay, 6); // cap per-day rows kept for the explorer table sample
      for (let i = 0; i < count; i++) {
        const h = hashString(`${event.id}-${day}-${i}`);
        const source = event.sources[h % event.sources.length];
        const customer = EXPLORER_CUSTOMER_POOL[h % EXPLORER_CUSTOMER_POOL.length];
        const status = h % 43 === 0 ? "Rejected" : h % 17 === 0 ? "Warning" : h % 5 === 0 ? "Processed" : "Received";
        const hour = 6 + (h % 15);
        const minute = h % 60;
        const second = h % 60;
        entries.push({
          id: `${event.id}-x${day}-${i}`,
          eventId: event.id,
          eventName: event.name,
          category: event.category,
          source,
          customer,
          customerMasked: maskCustomerId(customer),
          properties: propertySummary(event, h),
          status,
          daysAgo: day,
          hour,
          minute,
          second,
          receivedDelaySec: 1 + (h % 4),
        });
      }
    }
  });
  return entries.sort((a, b) => a.daysAgo - b.daysAgo || b.hour * 3600 + b.minute * 60 + b.second - (a.hour * 3600 + a.minute * 60 + a.second));
}

export const EXPLORER_ACTIVITY = generateExplorerEntries();

export function formatExplorerTimestamp(entry) {
  const d = new Date(2026, 8, 24 - entry.daysAgo);
  return `${formatMockDate(d)} · ${String(entry.hour).padStart(2, "0")}:${String(entry.minute).padStart(2, "0")}`;
}
export function formatExplorerEventTime(entry) {
  return `${String(entry.hour).padStart(2, "0")}:${String(entry.minute).padStart(2, "0")}:${String(entry.second).padStart(2, "0")}`;
}
export function formatExplorerReceivedTime(entry) {
  const total = entry.hour * 3600 + entry.minute * 60 + entry.second + entry.receivedDelaySec;
  const h = Math.floor(total / 3600) % 24;
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export function getExplorerEvents({ dateFilter, category, source, status, eventName, query } = {}) {
  const days = resolveDateRangeDays(dateFilter);
  const q = (query || "").trim().toLowerCase();
  return EXPLORER_ACTIVITY.filter((e) => e.daysAgo < days)
    .filter((e) => !category || category === "all" || e.category === category)
    .filter((e) => !source || source === "all" || e.source === source)
    .filter((e) => !status || status === "all" || e.status === status)
    .filter((e) => !eventName || eventName === "all" || e.eventName === eventName)
    .filter((e) => !q || e.eventName.toLowerCase().includes(q) || e.customerMasked.toLowerCase().includes(q));
}

export function summarizeExplorerEvents(entries) {
  const uniqueCustomers = new Set(entries.map((e) => e.customer)).size;
  return { events: entries.length, uniqueCustomers };
}

/* ---------------------------------------------------------------- */
/* Event Stream — ingestion health by source (section 20/21).          */
/* Reuses source identity from EVENT_SOURCES; the caller cross-        */
/* references js/data/dataflows.js FLOWS for the real connection       */
/* record rather than this file redefining one.                        */
/* ---------------------------------------------------------------- */
const STREAM_BASE_EVENTS_TODAY = {
  "Mobile App": 1240000,
  Web: 486000,
  "Trading Platform": 420000,
  AppsFlyer: 180000,
  CRM: 96000,
  API: 64000,
  Email: 58000,
  Push: 42000,
  Webhook: 21000,
};
export function streamHealthForSource(sourceName) {
  const h = hashString(sourceName + "-health");
  const eventsToday = STREAM_BASE_EVENTS_TODAY[sourceName] || 5000;
  return {
    source: sourceName,
    eventsToday,
    eventsPerMinute: Math.round(eventsToday / 1440) + (h % 40),
    lastReceivedSec: 1 + (h % 30),
    latencySec: +((0.6 + (h % 30) / 10)).toFixed(1),
    status: h % 19 === 0 ? "Delayed" : "Healthy",
  };
}

/** Received/Processed/Rejected/Warning split for one event definition
 * — event-level observability, intentionally not a full Data Quality
 * system (section 22). */
export function qualitySplitForEvent(event) {
  const h = hashString(event.id + "-quality");
  const rejected = +((h % 8) / 10).toFixed(1);
  const warning = +(((h >> 3) % 8) / 10).toFixed(1);
  const received = +(100 - rejected - warning).toFixed(1);
  return { received, rejected, warning };
}
