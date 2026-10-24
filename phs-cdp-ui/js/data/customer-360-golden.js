/*
  PHS CDP — Customer 360 Golden Customer fixture.

  One fully-populated, deterministic SYNTHETIC demo customer, built so
  selecting it exercises every already-implemented Customer 360
  section (Identity & Attributes, Customer Journey, Behavior & Usage
  Insights, RFM + population positioning, Recommended Next Actions,
  Audience Membership, Campaigns & Journeys, Engagement & Support). It
  is not a real PHS account and has no production meaning.

  WHY THIS LIVES IN ITS OWN FILE INSTEAD OF js/data/customers.js:
  see the resolution-path note that used to live here — unchanged from
  the original version of this file. Summary: js/pages/customer-360.js
  resolves a customer id through searchCustomers()/localMatches()/
  fetchCustomerRecord(), all extended to also check GOLDEN_CUSTOMER, so
  customers.js itself stays byte-identical and journeys.js's
  TEST_CUSTOMERS / dashboard.js's profile samples are unaffected.

  EVENT HISTORY (REWRITTEN for the analytics-refinement task): a full
  60-day span, 20 Jul 2026 – 17 Sep 2026, split into two consecutive,
  equal-length 30-day windows that js/data/customer-360-behavior.js's
  activityDeclineVsBaseline() already uses by construction (current =
  last 30 days before the shared reference date 17 Sep 2026;
  comparison = the 30 days immediately before that) — so the Activity
  Decline chart and the Engagement Change signal have real, non-
  contrived depth to compare, not a hand-picked illustrative pair.

  Built from THREE layers, all deterministic:
   1. A handful of hand-placed NARRATIVE events (registration → eKYC →
      account opening → first trade), dated 06–16 Jul 2026 — BEFORE
      both 30-day windows, so they never pollute either period's count
      (correct: they are one-time funnel milestones, not recurring
      usage).
   2. A seeded (mulberry32, fixed seed, never Math.random()) generator
      producing the bulk of "ongoing usage" events across the full
      20 Jul–17 Sep span — see generateUsageEvents() below. Re-running
      this module always produces the exact same array (asserted by
      the determinism self-check at the bottom), so the demo never
      shows different numbers between page loads.
   3. Two hand-placed "Place Order Failed" events (28 Aug, 03 Sep) —
      deliberate, explicit evidence for the Journey Friction signal
      (customer-360-behavior.js's journeyFrictionSignal()). A
      generator could produce this by chance; placing it explicitly
      guarantees the signal has real, inspectable evidence rather than
      being left to chance.

  DEVICE/PLATFORM: every event has both `source` (the existing CDP
  taxonomy) and `device` — App events are "Android App" (she has no
  Apple identity on file), Web events split Desktop Web / Mobile Web;
  engagement-channel events (Email/In-App/Web Message/API) stay
  "Unknown" device, since those are not a customer device signal.

  TRANSACTIONS: 9 total, spanning both windows, deterministic. All 4
  value bands reused are the exact ones already used elsewhere in this
  app (never invented). Exactly ONE is `status: "Cancelled"` —
  deliberately, to prove customer-360-behavior.js's rfmForCustomer()
  qualifying filter correctly excludes it (a Cancelled order must
  never count toward Frequency or Monetary).

  `behavior.*` 30-day aggregates below are DERIVED from the actual
  events array at module-load time (filtered to the current 30-day
  window), not hand-guessed — so they can never silently disagree with
  the charts that read the same underlying events.
*/

const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
function fmtDate(d) {
  return `${String(d.getDate()).padStart(2, "0")} ${MONTH_NAMES[d.getMonth()]} ${d.getFullYear()}`;
}
function fmtTime(h, m) {
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

// Intentionally a SEPARATE, file-local copy of the same small mulberry32
// PRNG used in customer-360-population.js (not imported) — keeps this
// fixture file independently readable/portable, with its own fixed seed.
const GOLDEN_EVENTS_SEED = 724724;
function mulberry32(seed) {
  let a = seed >>> 0;
  return function rand() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function pickWeighted(rand, entries) {
  const total = entries.reduce((s, [, w]) => s + w, 0);
  let r = rand() * total;
  for (const [value, weight] of entries) {
    if (r < weight) return value;
    r -= weight;
  }
  return entries[entries.length - 1][0];
}
function pickInt(rand, min, max) {
  return min + Math.floor(rand() * (max - min + 1));
}

// Hour-of-day weights — a plausible (not uniform) active-investor
// pattern: quiet overnight, a morning-commute bump, a lunch bump, and
// the largest bump in the evening.
const HOUR_WEIGHTS = [
  [0, 1], [1, 1], [2, 1], [3, 1], [4, 1], [5, 2],
  [6, 4], [7, 8], [8, 10], [9, 6], [10, 4], [11, 4],
  [12, 7], [13, 5], [14, 4], [15, 4], [16, 5], [17, 6],
  [18, 9], [19, 10], [20, 9], [21, 8], [22, 5], [23, 3],
];
const SYMBOL_WEIGHTS = [["VPB", 55], ["FPT", 18], ["HPG", 15], ["MWG", 12]];
const PRODUCT_INFO_WEIGHTS = [["Margin Trading Info", 30], ["Mutual Fund Overview", 25], ["Bond Product Info", 25], ["IPO Subscription Info", 20]];
const FEATURE_WEIGHTS = [["Price Alert Setup", 35], ["Portfolio Analysis Tool", 30], ["Watchlist Sort", 20], ["Dark Mode Toggle", 15]];
const CAMPAIGN_WEIGHTS = [["High Engagement Product Nurture", 45], ["Portfolio Weekly Digest", 30], ["Market Morning Brief", 25]];
const EVENT_TYPE_WEIGHTS = [
  ["View Stock", 32],
  ["Search Stock", 9],
  ["Watchlist Add", 6],
  ["App Open", 16],
  ["Login", 9],
  ["View Product Information", 7],
  ["Feature Interaction", 6],
  ["Place Order", 6],
  ["Campaign Email Opened", 2],
  ["Push Message Opened", 3],
  ["Help Center Opened", 1],
  ["Web Message Opened", 2],
];

function platformFor(rand) {
  const platform = pickWeighted(rand, [["App", 65], ["Web", 35]]);
  if (platform === "App") return { source: "App", device: "Android App" };
  const device = pickWeighted(rand, [["Desktop Web", 40], ["Mobile Web", 60]]);
  return { source: "Web", device };
}

function buildUsageEvent(rand, dateObj) {
  const hour = pickWeighted(rand, HOUR_WEIGHTS);
  const minute = pickInt(rand, 0, 59);
  const time = fmtTime(hour, minute);
  const date = fmtDate(dateObj);
  const type = pickWeighted(rand, EVENT_TYPE_WEIGHTS);
  const ts = new Date(dateObj.getFullYear(), dateObj.getMonth(), dateObj.getDate(), hour, minute).getTime();

  if (["View Stock", "Search Stock", "Watchlist Add"].includes(type)) {
    const symbol = pickWeighted(rand, SYMBOL_WEIGHTS);
    const { source, device } = platformFor(rand);
    return { date, time, type, category: "behavior", source, device, props: [symbol], _ts: ts };
  }
  if (type === "View Product Information") {
    const product = pickWeighted(rand, PRODUCT_INFO_WEIGHTS);
    const { source, device } = platformFor(rand);
    return { date, time, type, category: "behavior", source, device, props: [product], _ts: ts };
  }
  if (type === "Feature Interaction") {
    const feature = pickWeighted(rand, FEATURE_WEIGHTS);
    const { source, device } = platformFor(rand);
    return { date, time, type, category: "behavior", source, device, props: [feature], _ts: ts };
  }
  if (type === "App Open" || type === "Login" || type === "Help Center Opened") {
    const { source, device } = platformFor(rand);
    return { date, time, type, category: "behavior", source, device, props: [], _ts: ts };
  }
  if (type === "Place Order") {
    const symbol = pickWeighted(rand, SYMBOL_WEIGHTS);
    const side = pickWeighted(rand, [["BUY", 70], ["SELL", 30]]);
    const qty = pickInt(rand, 100, 500);
    return { date, time, type, category: "trading", source: "App", device: "Android App", props: [symbol, side, `${qty} shares`], status: "Completed", _ts: ts };
  }
  if (type === "Campaign Email Opened") {
    const campaign = pickWeighted(rand, CAMPAIGN_WEIGHTS);
    return { date, time, type, category: "engagement", source: "Email", device: "Unknown", props: [`Campaign: ${campaign}`], status: "Opened", _ts: ts };
  }
  if (type === "Push Message Opened") {
    const campaign = pickWeighted(rand, CAMPAIGN_WEIGHTS);
    return { date, time, type, category: "engagement", source: "In-App", device: "Unknown", props: [`Campaign: ${campaign}`], status: "Opened", _ts: ts };
  }
  // Web Message Opened
  const campaign = pickWeighted(rand, CAMPAIGN_WEIGHTS);
  return { date, time, type, category: "engagement", source: "Web Message", device: "Unknown", props: [`Campaign: ${campaign}`], status: "Opened", _ts: ts };
}

/** The bulk "ongoing usage" layer — every day from 20 Jul to 17 Sep
 * 2026 (60 days) gets a deterministically-chosen activity LEVEL
 * (Quiet/Normal/Active, not a flat per-day constant), then that many
 * events with randomized-but-seeded hour/type/subject — avoiding both
 * an obviously uniform pattern and any duplicated identical event. */
function generateUsageEvents() {
  const rand = mulberry32(GOLDEN_EVENTS_SEED);
  const events = [];
  const start = new Date(2026, 6, 20); // 20 Jul 2026
  const end = new Date(2026, 8, 17); // 17 Sep 2026
  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    // The reference "today" (17 Sep 2026) must never land on a
    // randomly-Quiet-zero day — several fields elsewhere in this
    // fixture (metrics.daysSinceLogin: 0, churnRiskCard's "not
    // flagged" expectation) assume she was active on the reference
    // date itself, and leaving it to chance previously produced a
    // 2-day gap (last real event 15 Sep, not 17 Sep).
    const isReferenceDay = d.getTime() === end.getTime();
    const level = isReferenceDay ? "Normal" : pickWeighted(rand, [["Quiet", 25], ["Normal", 50], ["Active", 25]]);
    const count = level === "Quiet" ? pickInt(rand, 0, 1) : level === "Normal" ? pickInt(rand, 2, 4) : pickInt(rand, 5, 8);
    for (let i = 0; i < count; i++) events.push(buildUsageEvent(rand, d));
  }
  return events;
}

// Hand-placed narrative events — registration through first trade,
// all BEFORE both 30-day windows (20 Jul onward), so they never
// appear in the Daily Trend / heatmap / decline-comparison windows.
const NARRATIVE_EVENTS = [
  { date: "06 Jul 2026", time: "09:10", type: "Login", category: "behavior", source: "Web", device: "Desktop Web", props: [], _ts: new Date(2026, 6, 6, 9, 10).getTime() },
  { date: "06 Jul 2026", time: "09:15", type: "View Stock", category: "behavior", source: "Web", device: "Desktop Web", props: ["VPB"], _ts: new Date(2026, 6, 6, 9, 15).getTime() },
  { date: "08 Jul 2026", time: "14:20", type: "eKYC Submitted", category: "behavior", source: "App", device: "Android App", props: [], _ts: new Date(2026, 6, 8, 14, 20).getTime() },
  { date: "09 Jul 2026", time: "10:05", type: "eKYC Verified", category: "behavior", source: "App", device: "Android App", props: [], status: "Completed", _ts: new Date(2026, 6, 9, 10, 5).getTime() },
  { date: "10 Jul 2026", time: "11:00", type: "Account Opened", category: "behavior", source: "App", device: "Android App", props: [], status: "Completed", _ts: new Date(2026, 6, 10, 11, 0).getTime() },
  { date: "14 Jul 2026", time: "09:30", type: "Deposit", category: "transaction", source: "API", device: "Unknown", props: ["₫50M – ₫100M"], status: "Completed", _ts: new Date(2026, 6, 14, 9, 30).getTime() },
  { date: "16 Jul 2026", time: "10:15", type: "Place Order", category: "trading", source: "App", device: "Android App", props: ["VPB", "BUY", "300 shares"], status: "Completed", _ts: new Date(2026, 6, 16, 10, 15).getTime() },
  { date: "16 Jul 2026", time: "10:16", type: "View Stock", category: "behavior", source: "App", device: "Android App", props: ["VPB"], _ts: new Date(2026, 6, 16, 10, 16).getTime() },
];

// Journey Friction evidence — two distinct failed-order events, same
// instrument/step, 6 days apart, inside the CURRENT 30-day window
// (19 Aug–17 Sep). A generator could produce this by chance; placing
// it explicitly guarantees journeyFrictionSignal() has real evidence.
const FRICTION_EVENTS = [
  { date: "28 Aug 2026", time: "16:42", type: "Place Order Failed", category: "trading", source: "App", device: "Android App", props: ["VPB", "BUY", "Insufficient buying power"], error: "Insufficient buying power", status: "Failed", _ts: new Date(2026, 7, 28, 16, 42).getTime() },
  { date: "03 Sep 2026", time: "09:51", type: "Place Order Failed", category: "trading", source: "App", device: "Android App", props: ["VPB", "BUY", "Price moved beyond limit"], error: "Price moved beyond limit", status: "Failed", _ts: new Date(2026, 8, 3, 9, 51).getTime() },
];

function buildEvents() {
  const all = [...NARRATIVE_EVENTS, ...generateUsageEvents(), ...FRICTION_EVENTS];
  all.sort((a, b) => b._ts - a._ts); // most-recent-first, matching this app's existing customer records' convention
  return all.map(({ _ts, ...rest }) => rest);
}

export const GOLDEN_EVENTS = buildEvents();

/** Genuinely derived from the most recent Login/App Open event,
 * rather than hand-asserted — so `metrics.daysSinceLogin` (used by
 * churnRiskCard/inactivityIndicator) can never silently disagree with
 * the actual event log. */
function deriveDaysSinceLogin(events) {
  const ref = new Date(2026, 8, 17);
  const dates = events
    .filter((e) => e.type === "Login" || e.type === "App Open")
    .map((e) => {
      const m = /^(\d{2})\s+([A-Za-z]{3})\s+(\d{4})$/.exec(e.date);
      return new Date(Number(m[3]), MONTH_NAMES.indexOf(m[2]), Number(m[1]));
    });
  if (!dates.length) return null;
  const mostRecent = dates.reduce((a, b) => (b > a ? b : a));
  return Math.round((ref - mostRecent) / 86400000);
}

// Dev-time determinism self-check — mirrors customer-360-population.js's.
(function assertDeterministic() {
  const again = [...NARRATIVE_EVENTS, ...generateUsageEvents(), ...FRICTION_EVENTS].sort((a, b) => b._ts - a._ts).map(({ _ts, ...rest }) => rest);
  if (JSON.stringify(again) !== JSON.stringify(GOLDEN_EVENTS)) {
    console.warn("[customer-360-golden] event generator is NOT deterministic — investigate before relying on this fixture.");
  }
})();

// 9 transactions spanning both windows. Value bands reuse the exact 4
// literal bands already used elsewhere in this app (never invented).
// Exactly one is Cancelled — see module header.
export const GOLDEN_TRANSACTIONS = [
  { date: "14 Jul 2026", type: "Deposit", instrument: "Cash", side: "—", qty: "—", valueBand: "₫50M – ₫100M", channel: "App", status: "Completed" },
  { date: "16 Jul 2026", type: "Buy", instrument: "VPB", side: "BUY", qty: "300", valueBand: "₫10M – ₫50M", channel: "App", status: "Completed" },
  { date: "24 Jul 2026", type: "Buy", instrument: "FPT", side: "BUY", qty: "200", valueBand: "₫1M – ₫10M", channel: "App", status: "Completed" },
  { date: "02 Aug 2026", type: "Sell", instrument: "VPB", side: "SELL", qty: "100", valueBand: "₫1M – ₫10M", channel: "App", status: "Completed" },
  { date: "11 Aug 2026", type: "Buy", instrument: "HPG", side: "BUY", qty: "400", valueBand: "₫10M – ₫50M", channel: "App", status: "Completed" },
  { date: "22 Aug 2026", type: "Buy", instrument: "VPB", side: "BUY", qty: "200", valueBand: "₫10M – ₫50M", channel: "App", status: "Completed" },
  { date: "29 Aug 2026", type: "Deposit", instrument: "Cash", side: "—", qty: "—", valueBand: "₫10M – ₫50M", channel: "App", status: "Completed" },
  // Deliberately Cancelled — must NOT count toward RFM Frequency/Monetary.
  { date: "05 Sep 2026", type: "Buy", instrument: "VPB", side: "BUY", qty: "150", valueBand: "₫10M – ₫50M", channel: "App", status: "Cancelled" },
  { date: "12 Sep 2026", type: "Buy", instrument: "MWG", side: "BUY", qty: "300", valueBand: "₫10M – ₫50M", channel: "App", status: "Completed" },
];

// behavior.* 30-day aggregates DERIVED from the actual events array
// (filtered to the current 30-day window, 19 Aug–17 Sep 2026) rather
// than hand-guessed — can never silently disagree with the charts
// that read the same events.
function deriveBehavior30d(events, transactions) {
  const windowStart = new Date(2026, 7, 19); // 19 Aug 2026
  const windowEnd = new Date(2026, 8, 17); // 17 Sep 2026
  const inWindow = (dateStr) => {
    const m = /^(\d{1,2})\s+([A-Za-z]{3})\s+(\d{4})$/.exec(dateStr);
    if (!m) return false;
    const monthIndex = MONTH_NAMES.indexOf(m[2]);
    const d = new Date(Number(m[3]), monthIndex, Number(m[1]));
    return d >= windowStart && d <= windowEnd;
  };
  const windowed = events.filter((e) => inWindow(e.date));
  const count = (type) => windowed.filter((e) => e.type === type).length;
  return {
    appOpens: count("App Open"),
    sessions: count("App Open") + count("Login"),
    stockViews: count("View Stock"),
    watchlistActions: count("Watchlist Add"),
    tradingOrders: windowed.filter((e) => e.type === "Place Order" && e.status === "Completed").length,
    deposits: transactions.filter((t) => t.type === "Deposit" && inWindow(t.date)).length,
  };
}

export const GOLDEN_CUSTOMER = {
  id: "PHS-CUS-GOLDEN-001",
  crmId: "CRM-GOLDEN-001",
  rudderId: "rudder_golden001",
  name: "Nguyễn Minh An",
  initials: "GC",
  lifecycle: "Active Investor",
  tier: "Gold",
  status: "Active",
  lastActive: `${GOLDEN_EVENTS[0].date}, ${GOLDEN_EVENTS[0].time}`,
  location: "Ho Chi Minh City",
  accessLevel: "standard",
  summary:
    "Synthetic demo customer created to showcase every supported Customer 360 section — not a real PHS account or transaction history. Gold-tier active investor based in Ho Chi Minh City, primarily engaging via mobile.",
  metrics: { portfolioBand: "₫50M – ₫100M", tradingActivity: "7 orders", engagementScore: 78, daysSinceLogin: deriveDaysSinceLogin(GOLDEN_EVENTS) ?? 0 },

  identities: [
    { type: "Account ID", values: [{ value: "PHS-CUS-GOLDEN-001", source: "CRM", status: "Verified", lastSeen: "Today" }] },
    { type: "National ID", values: [{ value: "********0001", source: "CRM", status: "Verified", lastSeen: "06 Jul 2026" }] },
    { type: "Mobile Number", values: [{ value: "+84 90 **** 0001", source: "CRM", status: "Verified", lastSeen: "Today" }] },
    { type: "Email Address", values: [{ value: "an****@example.com", source: "CRM", status: "Verified", lastSeen: "Today" }] },
    { type: "Zalo ID", values: [{ value: "zalo-g0ld3n01", source: "Connector", status: "Verified", lastSeen: "Today" }] },
    { type: "AppsFlyer ID", values: [{ value: "af-g0ld3n01", source: "AppsFlyer", status: "Active", lastSeen: "Today" }] },
    { type: "Android Device ID", values: [{ value: "gldn0001android", source: "Mobile App", status: "Active", lastSeen: "Today" }] },
  ],

  attributes: {
    "Trading Account": "PHS-TRD-GOLDEN01",
    "Customer Tier": "Gold",
    "Lifecycle Stage": "Active Investor",
    "Risk Profile": "Growth",
    "Location": "Ho Chi Minh City",
    "Preferred Channel": "Mobile App",
    "Preferred Language": "Vietnamese",
    "Registration Date": "06 Jul 2026",
    "Demo Profile": "Synthetic demo customer — not a real PHS account, created to showcase all supported Customer 360 sections.",
  },

  behavior: deriveBehavior30d(GOLDEN_EVENTS, GOLDEN_TRANSACTIONS),

  events: GOLDEN_EVENTS,
  transactions: GOLDEN_TRANSACTIONS,

  // Existing audience NAMES only, reused read-only — no new audience
  // definitions, nothing written to js/data/audiences.js.
  audiences: [
    { name: "Active Investors", joined: "16 Jul 2026", status: "Active", lastEvaluated: "17 Sep 2026" },
    { name: "High Engagement", joined: "15 Aug 2026", status: "Active", lastEvaluated: "17 Sep 2026" },
    { name: "Mobile Investors", joined: "16 Jul 2026", status: "Active", lastEvaluated: "17 Sep 2026" },
  ],

  engagement: {
    pushOpenRate: 68, emailOpenRate: 55, inAppEngagement: 60, webMessageEngagement: 30,
    lastCampaign: "High Engagement Product Nurture", campaignInteractions: 9, lastEngagement: GOLDEN_EVENTS[0].date,
  },

  consent: [
    { type: "Marketing", status: "Granted", source: "App Onboarding", updated: "06 Jul 2026" },
    { type: "Analytics", status: "Granted", source: "App Onboarding", updated: "06 Jul 2026" },
    { type: "Personalization", status: "Granted", source: "App Onboarding", updated: "06 Jul 2026" },
  ],
  consentHistory: [
    { date: "06 Jul 2026", text: "Marketing, Analytics, Personalization granted at signup", source: "App Onboarding" },
  ],

  // currentStageIndex 4 mirrors Nguyễn Minh Anh's position (the
  // richest existing example) in the real LIFECYCLE_STAGES array
  // (customers.js) — "Registered, Onboarding, Active, Engaged, High
  // Value, Dormant, Reactivation". daysInStage is the actual day
  // count from the first-trade event (16 Jul 2026) to the shared
  // reference date (17 Sep 2026), not an asserted number.
  journey: { currentStageIndex: 4, currentLabel: "Active Investor", daysInStage: 63, previousStage: "Onboarding", nextLikelyStage: "Engaged" },
};

export function getGoldenCustomer() {
  return GOLDEN_CUSTOMER;
}
