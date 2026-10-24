/*
  PHS CDP — centralized customer mock data (privacy-aware).
  Single source of truth for Customer 360. All data is fictional.

  Privacy-by-design notes baked into this data on purpose:
  - Financial figures are pre-banded (e.g. "₫10M – ₫50M"), never exact.
  - Sensitive identifiers are pre-masked at the data layer (e.g.
    "mi****@example.com") — there is no raw value hiding underneath
    to accidentally leak; the masked form IS the stored value.
  - Profile 2 (Trần Quốc Bảo) demonstrates a "restricted" access
    level: everything sensitive is literally "xxxxx", to show
    role-based data access rather than a graduated mask.

  This is a frontend prototype demonstrating privacy-aware CDP UX —
  it does not implement real authorization or claim legal compliance.
*/

// Fixed lifecycle funnel for the Customer Journey stepper.
export const LIFECYCLE_STAGES = ["Registered", "Onboarding", "Active", "Engaged", "High Value", "Dormant", "Reactivation"];

// Consistent across the whole app: identity sources (who captured an
// identifier) and behavioral-event sources (the CDP source-type
// taxonomy) are deliberately different vocabularies.
export const EVENT_SOURCES = ["Web", "App", "API", "Connector", "In-App", "Web Message", "Email"];

// Workspace-level activation destinations — not customer-specific,
// so they're defined once and shown identically on every profile.
export const FORWARD_DESTINATIONS = [
  { destination: "Email", type: "Campaign", status: "Connected", lastSync: "5 min ago", forwarded: "48,392" },
  { destination: "Push", type: "Campaign", status: "Connected", lastSync: "3 min ago", forwarded: "214,600" },
  { destination: "SMS", type: "Campaign", status: "Warning", lastSync: "2 hours ago", forwarded: "12,048" },
  { destination: "Webhook", type: "API", status: "Connected", lastSync: "2 min ago", forwarded: "96,340" },
  { destination: "Meta Ads", type: "Audience", status: "Connected", lastSync: "18 min ago", forwarded: "284,612" },
  { destination: "Google Ads", type: "Audience", status: "Connected", lastSync: "22 min ago", forwarded: "261,900" },
  { destination: "CRM", type: "Sync", status: "Connected", lastSync: "1 min ago", forwarded: "1,284,392" },
  { destination: "n8n", type: "Automation", status: "Connected", lastSync: "1 min ago", forwarded: "61,204" },
  { destination: "API", type: "Integration", status: "Disconnected", lastSync: "6 hours ago", forwarded: "0" },
];

export const CUSTOMERS = [
  {
    id: "PHS-CUS-1002831", // Account ID — the highest-level identity
    crmId: "CRM-847291",
    // Canonical identity id — RudderStack-Profiles-style naming,
    // consistent with js/data/data-governance.js's illustrative
    // RESOLVED_ENTITY.canonicalId ("rudder_8f92a1"). Distinct from
    // `id` (the PHS business identifier) — see Identity Graph.
    rudderId: "rudder_8f92a1",
    name: "Nguyễn Minh Anh",
    initials: "MA",
    lifecycle: "Active Investor",
    tier: "Platinum",
    status: "Active",
    lastActive: "17 Sep 2026, 20:31",
    location: "Ho Chi Minh City",
    accessLevel: "standard",
    summary: "Platinum-tier active investor based in Ho Chi Minh City, primarily engaging via mobile.",
    metrics: { portfolioBand: "₫1B – ₫5B", tradingActivity: "142 orders", engagementScore: 86, daysSinceLogin: 2 },

    // Identity resolution — fixed order, most-recent value shown by
    // default when a type has more than one.
    identities: [
      { type: "Account ID", values: [{ value: "PHS-CUS-1002831", source: "CRM", status: "Verified", lastSeen: "Today" }] },
      { type: "National ID", values: [{ value: "********6789", source: "CRM", status: "Verified", lastSeen: "14 Feb 2023" }] },
      { type: "Mobile Number", values: [
        { value: "+84 90 **** 5678", source: "CRM", status: "Verified", lastSeen: "Today" },
        { value: "+84 93 **** 2140", source: "Mobile App", status: "Unverified", lastSeen: "3 months ago" },
      ] },
      { type: "Email Address", values: [
        { value: "mi****@example.com", source: "CRM", status: "Verified", lastSeen: "Today" },
        { value: "na****@gmail.com", source: "Website", status: "Unverified", lastSeen: "8 months ago" },
      ] },
      { type: "Zalo ID", values: [{ value: "zalo-********", source: "Connector", status: "Verified", lastSeen: "Today" }] },
      { type: "Apple IDFV", values: [{ value: "5A2F9C3E-********", source: "Mobile App", status: "Active", lastSeen: "Today" }] },
      { type: "Apple IDFA", values: [{ value: "B3E7A21C-********", source: "Mobile App", status: "Active", lastSeen: "Today" }] },
      { type: "Google Advertising ID", values: [{ value: "38400000-********", source: "Mobile App", status: "Expired", lastSeen: "2 months ago" }] },
      { type: "Android Device ID", values: [{ value: "a1b2c3d4********", source: "Mobile App", status: "Active", lastSeen: "1 month ago" }] },
      { type: "AppsFlyer ID", values: [
        { value: "af-92********", source: "AppsFlyer", status: "Active", lastSeen: "1 hour ago" },
        { value: "af-77********", source: "AppsFlyer", status: "Expired", lastSeen: "5 months ago" },
      ] },
      { type: "Device Application Stamp", values: [{ value: "das-4f********", source: "API", status: "Active", lastSeen: "Today" }] },
      { type: "Anonymous ID", values: [{ value: "anon-7c********", source: "Website", status: "Active", lastSeen: "8 months ago" }] },
    ],

    // Trading Account lives here, not in Identity — it's an account
    // attribute, not a resolvable customer identity.
    attributes: {
      "Trading Account": "PHS-TRD-482193",
      "Customer Tier": "Platinum",
      "Lifecycle Stage": "Active Investor",
      "Risk Profile": "Growth",
      "Location": "Ho Chi Minh City",
      "Preferred Channel": "Mobile App",
      "Preferred Language": "Vietnamese",
      "Registration Date": "14 Feb 2023",
      "Birthday": "14 Feb",
      "Gender": "Female",
    },

    behavior: { appOpens: 62, sessions: 48, stockViews: 214, watchlistActions: 12, tradingOrders: 18, deposits: 3 },

    // Source uses the CDP event-source taxonomy (EVENT_SOURCES), not
    // the identity-source vocabulary above. No exact prices/amounts —
    // any monetary property is pre-banded.
    events: [
      { date: "17 Sep 2026", time: "20:31", type: "Place Order", category: "trading", source: "App", props: ["VNM", "BUY", "500 shares"], status: "Completed" },
      { date: "17 Sep 2026", time: "20:15", type: "View Stock", category: "behavior", source: "Web", props: ["VNM"], status: "Completed" },
      { date: "17 Sep 2026", time: "19:58", type: "Watchlist Add", category: "behavior", source: "App", props: ["FPT"] },
      { date: "16 Sep 2026", time: "09:42", type: "Deposit", category: "transaction", source: "API", props: ["> ₫100M"], status: "Completed" },
      { date: "15 Sep 2026", time: "18:23", type: "Push Message Opened", category: "engagement", source: "In-App", props: ["Campaign: Market Morning Brief"], status: "Opened" },
      { date: "15 Sep 2026", time: "08:15", type: "App Open", category: "behavior", source: "App", props: [] },
      { date: "14 Sep 2026", time: "21:10", type: "Place Order", category: "trading", source: "App", props: ["FPT", "SELL", "200 shares"], status: "Completed" },
      { date: "13 Sep 2026", time: "07:40", type: "Login", category: "behavior", source: "App", props: [] },
      { date: "12 Sep 2026", time: "14:00", type: "Campaign Email Opened", category: "engagement", source: "Email", props: ["Campaign: Portfolio Weekly Digest"], status: "Opened" },
      { date: "11 Sep 2026", time: "16:20", type: "Web Message Opened", category: "engagement", source: "Web Message", props: ["Campaign: Rate Alert"], status: "Opened" },
      { date: "10 Sep 2026", time: "09:00", type: "Search Stock", category: "behavior", source: "Connector", props: ["MWG"] },
    ],

    // Value Band replaces Price/Amount — never exact.
    transactions: [
      { date: "17 Sep 2026", type: "Buy", instrument: "VNM", side: "BUY", qty: "500", valueBand: "₫10M – ₫50M", channel: "App", status: "Completed" },
      { date: "15 Sep 2026", type: "Deposit", instrument: "Cash", side: "—", qty: "—", valueBand: "> ₫100M", channel: "App", status: "Completed" },
      { date: "14 Sep 2026", type: "Sell", instrument: "FPT", side: "SELL", qty: "200", valueBand: "₫10M – ₫50M", channel: "App", status: "Completed" },
      { date: "10 Sep 2026", type: "Buy", instrument: "HPG", side: "BUY", qty: "1,000", valueBand: "₫10M – ₫50M", channel: "App", status: "Completed" },
      { date: "08 Sep 2026", type: "Withdrawal", instrument: "Cash", side: "—", qty: "—", valueBand: "₫50M – ₫100M", channel: "App", status: "Completed" },
      { date: "05 Sep 2026", type: "Buy", instrument: "VCB", side: "BUY", qty: "300", valueBand: "₫10M – ₫50M", channel: "API", status: "Completed" },
    ],

    audiences: [
      { name: "Active Investors", joined: "12 Aug 2026", status: "Active", lastEvaluated: "17 Sep 2026" },
      { name: "High Value Customers", joined: "03 Jul 2026", status: "Active", lastEvaluated: "17 Sep 2026" },
      { name: "Premium Customers", joined: "20 Jun 2026", status: "Active", lastEvaluated: "17 Sep 2026" },
      { name: "High Engagement", joined: "15 Aug 2026", status: "Active", lastEvaluated: "17 Sep 2026" },
      { name: "Mobile Investors", joined: "12 Aug 2026", status: "Active", lastEvaluated: "17 Sep 2026" },
    ],

    engagement: {
      pushOpenRate: 72, emailOpenRate: 64, inAppEngagement: 58, webMessageEngagement: 41,
      lastCampaign: "Market Morning Brief", campaignInteractions: 18, lastEngagement: "17 Sep 2026",
    },

    consent: [
      { type: "Marketing", status: "Granted", source: "App Onboarding", updated: "14 Feb 2023" },
      { type: "Analytics", status: "Granted", source: "App Onboarding", updated: "14 Feb 2023" },
      { type: "Personalization", status: "Denied", source: "Preference Center", updated: "02 Jun 2025" },
    ],
    consentHistory: [
      { date: "02 Jun 2025", text: "Personalization changed Granted → Denied", source: "Preference Center" },
      { date: "14 Feb 2023", text: "Marketing, Analytics, Personalization granted at signup", source: "App Onboarding" },
    ],

    journey: { currentStageIndex: 4, currentLabel: "Active Investor", daysInStage: 96, previousStage: "Engaged", nextLikelyStage: "At top of defined lifecycle" },
  },

  {
    id: "PHS-CUS-1002832",
    crmId: "CRM-847292",
    rudderId: "rudder_3c7fd4",
    name: "Trần Quốc Bảo",
    initials: "QB",
    lifecycle: "Engaged",
    tier: "Gold",
    status: "Active",
    lastActive: "17 Sep 2026, 19:40",
    location: "Hanoi",
    accessLevel: "restricted",
    summary: "Gold-tier engaged customer in Hanoi. Profile details are restricted per data access policy.",
    metrics: { portfolioBand: "₫500M – ₫1B", tradingActivity: "34 orders", engagementScore: 61, daysSinceLogin: 0 },

    // Restricted view: every sensitive identity is displayed as
    // "xxxxx" — genuinely masked, not partially revealed. Account ID
    // stays visible; it's the operational key, not sensitive PII.
    identities: [
      { type: "Account ID", values: [{ value: "PHS-CUS-1002832", source: "CRM", status: "Verified", lastSeen: "Today" }] },
      { type: "National ID", values: [{ value: "xxxxx", source: "CRM", status: "Verified", lastSeen: "Today" }] },
      { type: "Mobile Number", values: [{ value: "xxxxx", source: "CRM", status: "Verified", lastSeen: "Today" }] },
      { type: "Email Address", values: [{ value: "xxxxx", source: "CRM", status: "Verified", lastSeen: "Today" }] },
      { type: "Zalo ID", values: [{ value: "xxxxx", source: "Connector", status: "Verified", lastSeen: "Today" }] },
      { type: "Apple IDFV", values: [{ value: "xxxxx", source: "Mobile App", status: "Active", lastSeen: "Today" }] },
      { type: "Apple IDFA", values: [{ value: "xxxxx", source: "Mobile App", status: "Active", lastSeen: "Today" }] },
      { type: "Google Advertising ID", values: [{ value: "xxxxx", source: "Mobile App", status: "Active", lastSeen: "Today" }] },
      { type: "Android Device ID", values: [{ value: "xxxxx", source: "Mobile App", status: "Active", lastSeen: "Today" }] },
      { type: "AppsFlyer ID", values: [{ value: "xxxxx", source: "AppsFlyer", status: "Active", lastSeen: "Today" }] },
      { type: "Device Application Stamp", values: [{ value: "xxxxx", source: "API", status: "Active", lastSeen: "Today" }] },
      { type: "Anonymous ID", values: [{ value: "xxxxx", source: "Website", status: "Active", lastSeen: "Today" }] },
    ],

    attributes: {
      "Trading Account": "PHS-TRD-482194",
      "Customer Tier": "Gold",
      "Lifecycle Stage": "Engaged",
      "Risk Profile": "Balanced",
      "Location": "Hanoi",
      "Preferred Channel": "Mobile App",
      "Preferred Language": "Vietnamese",
      "Registration Date": "02 May 2026",
      "Birthday": "xxxxx",
      "Gender": "Male",
    },

    behavior: { appOpens: 40, sessions: 30, stockViews: 88, watchlistActions: 5, tradingOrders: 4, deposits: 2 },

    events: [
      { date: "17 Sep 2026", time: "19:40", type: "Deposit", category: "transaction", source: "API", props: ["₫10M – ₫50M"], status: "Completed" },
      { date: "17 Sep 2026", time: "12:10", type: "App Open", category: "behavior", source: "App", props: [] },
      { date: "16 Sep 2026", time: "20:05", type: "View Stock", category: "behavior", source: "Web", props: ["MWG"] },
      { date: "15 Sep 2026", time: "10:00", type: "Login", category: "behavior", source: "App", props: [] },
      { date: "10 Sep 2026", time: "09:00", type: "Push Message Opened", category: "engagement", source: "In-App", props: ["Campaign: Welcome Series"], status: "Opened" },
      { date: "05 Sep 2026", time: "11:30", type: "Place Order", category: "trading", source: "App", props: ["MWG", "BUY", "100 shares"], status: "Completed" },
    ],

    transactions: [
      { date: "17 Sep 2026", type: "Deposit", instrument: "Cash", side: "—", qty: "—", valueBand: "₫10M – ₫50M", channel: "API", status: "Completed" },
      { date: "05 Sep 2026", type: "Buy", instrument: "MWG", side: "BUY", qty: "100", valueBand: "₫1M – ₫10M", channel: "App", status: "Completed" },
    ],

    audiences: [
      { name: "New Mobile Users", joined: "02 May 2026", status: "Active", lastEvaluated: "17 Sep 2026" },
      { name: "Mobile Investors", joined: "02 May 2026", status: "Active", lastEvaluated: "17 Sep 2026" },
    ],

    engagement: {
      pushOpenRate: 58, emailOpenRate: 30, inAppEngagement: 22, webMessageEngagement: 15,
      lastCampaign: "Welcome Series", campaignInteractions: 4, lastEngagement: "10 Sep 2026",
    },

    consent: [
      { type: "Marketing", status: "Granted", source: "App Onboarding", updated: "02 May 2026" },
      { type: "Analytics", status: "Granted", source: "App Onboarding", updated: "02 May 2026" },
      { type: "Personalization", status: "Granted", source: "App Onboarding", updated: "02 May 2026" },
    ],
    consentHistory: [
      { date: "02 May 2026", text: "Marketing, Analytics, Personalization granted at signup", source: "App Onboarding" },
    ],

    journey: { currentStageIndex: 3, currentLabel: "Engaged", daysInStage: 60, previousStage: "Active", nextLikelyStage: "High Value" },
  },

  // The 3 records below exist so Dashboard → Profile Samples can show
  // 5 distinct, genuinely-clickable demo profiles instead of repeating
  // the 2 above — see js/pages/dashboard.js PROFILE_SAMPLE_IDS. Same
  // shape as the records above, shorter arrays; no new fields.
  {
    id: "PHS-CUS-1002833",
    crmId: "CRM-552013",
    rudderId: "rudder_9a21e8",
    name: "Lê Hoàng Nam",
    initials: "HN",
    lifecycle: "New User",
    tier: "Standard",
    status: "Active",
    lastActive: "16 Sep 2026, 08:12",
    location: "Da Nang",
    accessLevel: "standard",
    summary: "Recently registered customer based in Da Nang, early in onboarding.",
    metrics: { portfolioBand: "< ₫1M", tradingActivity: "0 orders", engagementScore: 24, daysSinceLogin: 3 },
    identities: [
      { type: "Account ID", values: [{ value: "PHS-CUS-1002833", source: "CRM", status: "Verified", lastSeen: "16 Sep 2026" }] },
      { type: "Mobile Number", values: [{ value: "+84 91 **** 7733", source: "CRM", status: "Verified", lastSeen: "16 Sep 2026" }] },
      { type: "Email Address", values: [{ value: "le****@example.com", source: "Website", status: "Unverified", lastSeen: "16 Sep 2026" }] },
      { type: "Anonymous ID", values: [{ value: "anon-9f********", source: "Website", status: "Active", lastSeen: "16 Sep 2026" }] },
    ],
    attributes: {
      "Trading Account": "—",
      "Customer Tier": "Standard",
      "Lifecycle Stage": "New User",
      "Risk Profile": "Not assessed",
      "Location": "Da Nang",
      "Preferred Channel": "Website",
      "Preferred Language": "Vietnamese",
      "Registration Date": "16 Sep 2026",
    },
    behavior: { appOpens: 2, sessions: 3, stockViews: 6, watchlistActions: 0, tradingOrders: 0, deposits: 0 },
    events: [
      { date: "16 Sep 2026", time: "08:12", type: "App Open", category: "behavior", source: "App", props: [] },
      { date: "16 Sep 2026", time: "08:05", type: "Login", category: "behavior", source: "Web", props: [] },
    ],
    transactions: [],
    audiences: [{ name: "Recently Registered", joined: "16 Sep 2026", status: "Active", lastEvaluated: "17 Sep 2026" }],
    engagement: {
      pushOpenRate: 0, emailOpenRate: 0, inAppEngagement: 10, webMessageEngagement: 5,
      lastCampaign: "—", campaignInteractions: 0, lastEngagement: "16 Sep 2026",
    },
    consent: [
      { type: "Marketing", status: "Not Set", source: "Website", updated: "16 Sep 2026" },
      { type: "Analytics", status: "Granted", source: "Website", updated: "16 Sep 2026" },
      { type: "Personalization", status: "Not Set", source: "Website", updated: "16 Sep 2026" },
    ],
    consentHistory: [{ date: "16 Sep 2026", text: "Analytics granted at registration", source: "Website" }],
    journey: { currentStageIndex: 0, currentLabel: "Registered", daysInStage: 1, previousStage: "—", nextLikelyStage: "Onboarding" },
  },
  {
    id: "PHS-CUS-1002834",
    crmId: "CRM-118842",
    rudderId: "rudder_5d6b0c",
    name: "Phạm Thu Hà",
    initials: "TH",
    lifecycle: "High Engagement",
    tier: "Gold",
    status: "Active",
    lastActive: "17 Sep 2026, 21:05",
    location: "Hai Phong",
    accessLevel: "standard",
    summary: "Gold-tier customer in Hai Phong with high product engagement, no trade in the last 30 days.",
    metrics: { portfolioBand: "₫50M – ₫100M", tradingActivity: "6 orders", engagementScore: 79, daysSinceLogin: 0 },
    identities: [
      { type: "Account ID", values: [{ value: "PHS-CUS-1002834", source: "CRM", status: "Verified", lastSeen: "Today" }] },
      { type: "Mobile Number", values: [{ value: "+84 97 **** 4410", source: "CRM", status: "Verified", lastSeen: "Today" }] },
      { type: "Email Address", values: [{ value: "ha****@example.com", source: "CRM", status: "Verified", lastSeen: "Today" }] },
      { type: "AppsFlyer ID", values: [{ value: "af-61********", source: "AppsFlyer", status: "Active", lastSeen: "Today" }] },
    ],
    attributes: {
      "Trading Account": "PHS-TRD-482211",
      "Customer Tier": "Gold",
      "Lifecycle Stage": "High Engagement",
      "Risk Profile": "Balanced",
      "Location": "Hai Phong",
      "Preferred Channel": "Mobile App",
      "Preferred Language": "Vietnamese",
      "Registration Date": "28 Mar 2026",
    },
    behavior: { appOpens: 54, sessions: 40, stockViews: 180, watchlistActions: 9, tradingOrders: 6, deposits: 1 },
    events: [
      { date: "17 Sep 2026", time: "21:05", type: "Watchlist Add", category: "behavior", source: "App", props: ["HPG"] },
      { date: "17 Sep 2026", time: "20:40", type: "View Stock", category: "behavior", source: "App", props: ["HPG"] },
      { date: "15 Sep 2026", time: "12:10", type: "Push Message Opened", category: "engagement", source: "In-App", props: ["Campaign: Market Morning Brief"], status: "Opened" },
    ],
    transactions: [
      { date: "22 Aug 2026", type: "Buy", instrument: "HPG", side: "BUY", qty: "400", valueBand: "₫10M – ₫50M", channel: "App", status: "Completed" },
    ],
    audiences: [
      { name: "High Engagement", joined: "15 Aug 2026", status: "Active", lastEvaluated: "17 Sep 2026" },
      { name: "High Engagement — No Recent Trade", joined: "15 Aug 2026", status: "Active", lastEvaluated: "17 Sep 2026" },
    ],
    engagement: {
      pushOpenRate: 81, emailOpenRate: 52, inAppEngagement: 70, webMessageEngagement: 38,
      lastCampaign: "Market Morning Brief", campaignInteractions: 22, lastEngagement: "17 Sep 2026",
    },
    consent: [
      { type: "Marketing", status: "Granted", source: "App Onboarding", updated: "28 Mar 2026" },
      { type: "Analytics", status: "Granted", source: "App Onboarding", updated: "28 Mar 2026" },
      { type: "Personalization", status: "Granted", source: "Preference Center", updated: "10 Jun 2026" },
    ],
    consentHistory: [{ date: "10 Jun 2026", text: "Personalization granted", source: "Preference Center" }],
    journey: { currentStageIndex: 3, currentLabel: "Engaged", daysInStage: 72, previousStage: "Active", nextLikelyStage: "High Value" },
  },
  {
    id: "PHS-CUS-1002835",
    crmId: "CRM-990217",
    rudderId: "rudder_1e4f7b",
    name: "Demo Profile 5",
    initials: "D5",
    lifecycle: "Dormant Customer",
    tier: "Standard",
    status: "Inactive",
    lastActive: "02 Jul 2026, 11:20",
    location: "Can Tho",
    accessLevel: "standard",
    summary: "Dormant customer in Can Tho with no login or trading activity in the last 60+ days.",
    metrics: { portfolioBand: "₫1M – ₫10M", tradingActivity: "3 orders", engagementScore: 9, daysSinceLogin: 78 },
    identities: [
      { type: "Account ID", values: [{ value: "PHS-CUS-1002835", source: "CRM", status: "Verified", lastSeen: "02 Jul 2026" }] },
      { type: "Mobile Number", values: [{ value: "+84 98 **** 2290", source: "CRM", status: "Verified", lastSeen: "02 Jul 2026" }] },
      { type: "Email Address", values: [{ value: "de****@example.com", source: "CRM", status: "Verified", lastSeen: "02 Jul 2026" }] },
    ],
    attributes: {
      "Trading Account": "PHS-TRD-482309",
      "Customer Tier": "Standard",
      "Lifecycle Stage": "Dormant Customer",
      "Risk Profile": "Conservative",
      "Location": "Can Tho",
      "Preferred Channel": "Email",
      "Preferred Language": "Vietnamese",
      "Registration Date": "05 Jan 2025",
    },
    behavior: { appOpens: 1, sessions: 1, stockViews: 2, watchlistActions: 0, tradingOrders: 0, deposits: 0 },
    events: [{ date: "02 Jul 2026", time: "11:20", type: "Login", category: "behavior", source: "Web", props: [] }],
    transactions: [
      { date: "18 Apr 2026", type: "Sell", instrument: "VCB", side: "SELL", qty: "150", valueBand: "₫1M – ₫10M", channel: "Web", status: "Completed" },
    ],
    audiences: [{ name: "Dormant Investors", joined: "20 Jul 2026", status: "Active", lastEvaluated: "15 Sep 2026" }],
    engagement: {
      pushOpenRate: 4, emailOpenRate: 8, inAppEngagement: 2, webMessageEngagement: 1,
      lastCampaign: "Dormant Investor Re-engagement", campaignInteractions: 1, lastEngagement: "02 Jul 2026",
    },
    consent: [
      { type: "Marketing", status: "Withdrawn", source: "Preference Center", updated: "02 Jul 2026" },
      { type: "Analytics", status: "Granted", source: "App Onboarding", updated: "05 Jan 2025" },
      { type: "Personalization", status: "Denied", source: "Preference Center", updated: "02 Jul 2026" },
    ],
    consentHistory: [{ date: "02 Jul 2026", text: "Marketing changed Granted → Withdrawn", source: "Preference Center" }],
    journey: { currentStageIndex: 5, currentLabel: "Dormant", daysInStage: 78, previousStage: "Engaged", nextLikelyStage: "Reactivation" },
  },
];

// Returns undefined for an unknown id — callers (Customer 360's
// search-first flow) must show a safe not-found state rather than
// silently substituting a different profile.
export function getCustomerById(id) {
  return CUSTOMERS.find((c) => c.id === id);
}
