/*
  PHS CDP — centralized audience / segmentation mock data.
  Single source of truth for the Audiences module. All data is
  fictional. Member counts are profile counts, never financial
  amounts; any financial condition uses a value band, never a raw
  figure, consistent with Customer 360's privacy rules.

  This file also defines the TYPED condition system: every field has
  a data type, and the operator list + value control shown in the
  builder come from that type — never a single generic operator list.

  Sample members intentionally reuse the two customers that exist in
  Customer 360 (js/data/customers.js) — Nguyễn Minh Anh and Trần Quốc
  Bảo — so clicking through from an audience's Members tab lands on a
  real, working Customer 360 profile rather than a dead end.
*/

import { EVENT_CATALOG } from "./events.js";

export const AUDIENCE_TYPES = ["Attribute", "Behavioral", "Consent", "Identity", "Attribute + Behavioral", "Identity + Behavioral", "Multi-condition"];
export const AUDIENCE_STATUSES = ["Active", "Draft", "Paused"];
export const AUDIENCE_OWNERS = ["CRM Team", "Lifecycle Team", "Growth Team"];

export const VALUE_BANDS = ["> ₫100,000,000", "₫50,000,000 – ₫100,000,000", "₫10,000,000 – ₫50,000,000", "₫1,000,000 – ₫10,000,000", "< ₫1,000,000"];
export const CONSENT_VALUES = ["Granted", "Denied", "Pending"];
export const TIME_UNITS = ["days", "weeks", "months"];
export const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

// Segment Builder's own field-group taxonomy for the small set of
// catalog events it exposes as conditions — a UI grouping axis,
// deliberately distinct from the Event Catalog's own category.
const SEGMENT_FIELD_GROUP_OVERRIDE = { "Push Open": "Engagement", "Email Open": "Engagement", "In-App Message Open": "Engagement", "Web Message Open": "Engagement" };
const EVENT_CONDITION_FIELDS = EVENT_CATALOG.filter((e) => e.category === "Behavior" || e.category === "Transaction" || e.category === "Engagement").reduce((acc, e) => {
  acc[e.name] = { type: "event", category: SEGMENT_FIELD_GROUP_OVERRIDE[e.name] || "Behavior" };
  return acc;
}, {});

/* ---------------------------------------------------------------- */
/* Typed field catalog                                               */
/* ---------------------------------------------------------------- */
// Every field has exactly one data type. The builder derives its
// operator list and value control(s) from this type — a field never
// offers an operator that doesn't make sense for its data.
export const FIELD_META = {
  // Profile
  "Customer Tier": { type: "text-categorical", category: "Profile", options: ["Platinum", "Gold", "Silver", "Standard"] },
  "Lifecycle Stage": { type: "text-categorical", category: "Profile", options: ["New User", "Active Investor", "Engaged", "High Engagement", "Dormant Customer"] },
  "Risk Profile": { type: "text-categorical", category: "Profile", options: ["Conservative", "Balanced", "Growth"] },
  Location: { type: "text", category: "Profile" },
  "Preferred Channel": { type: "text-categorical", category: "Profile", options: ["Mobile App", "Web", "Email", "Push"] },
  "Preferred Language": { type: "text-categorical", category: "Profile", options: ["Vietnamese", "English"] },
  Gender: { type: "text-categorical", category: "Profile", options: ["Male", "Female"] },
  Birthday: { type: "birthday", category: "Profile" },
  "Registration Date": { type: "date", category: "Profile" },
  "Last Active": { type: "date", category: "Profile" },
  "eKYC Status": { type: "text-categorical", category: "Profile", options: ["Complete", "Incomplete"] },

  // Identity — privacy-aware only: existence/equality, never a
  // browsable list of raw values.
  "Account ID": { type: "identity", category: "Identity" },
  "National ID": { type: "identity", category: "Identity" },
  "Mobile Number": { type: "identity", category: "Identity" },
  "Email Address": { type: "identity", category: "Identity" },
  "Zalo ID": { type: "identity", category: "Identity" },
  "Apple IDFV": { type: "identity", category: "Identity" },
  "Apple IDFA": { type: "identity", category: "Identity" },
  "Google Advertising ID": { type: "identity", category: "Identity" },
  "Android Device ID": { type: "identity", category: "Identity" },
  "AppsFlyer ID": { type: "identity", category: "Identity" },
  "Device Application Stamp": { type: "identity", category: "Identity" },
  "Anonymous ID": { type: "identity", category: "Identity" },

  // Behavior/Transaction event conditions — pulled from the canonical
  // Event Catalog (js/data/events.js, Phase 13) rather than a second
  // hardcoded event list. Segment Builder keeps its own "Behavior" /
  // "Engagement" field-group taxonomy (a UI grouping axis, distinct
  // from the catalog's own Behavior/Transaction/Engagement/System
  // categories), so Place Order-style transaction events stay grouped
  // here exactly where they always were.
  ...EVENT_CONDITION_FIELDS,
  "App Opens": { type: "number", category: "Behavior" },
  Sessions: { type: "number", category: "Behavior" },
  "Watchlist Actions": { type: "number", category: "Behavior" },
  "Trading Orders": { type: "number", category: "Behavior" },
  "Engagement Score": { type: "number", category: "Engagement" },

  // Consent
  "Marketing Consent": { type: "consent", category: "Consent" },
  "Analytics Consent": { type: "consent", category: "Consent" },
  "Personalization Consent": { type: "consent", category: "Consent" },

  // Financial — band-only, never a raw amount.
  "Portfolio Value Band": { type: "band", category: "Financial / Value Band" },
  "Trading Value Band": { type: "band", category: "Financial / Value Band" },
  "Deposit Value Band": { type: "band", category: "Financial / Value Band" },
  "Order Value Band": { type: "band", category: "Financial / Value Band" },
};

export const FIELD_CATEGORIES = ["Profile", "Identity", "Behavior", "Engagement", "Consent", "Financial / Value Band"];

// Field select options, grouped — derived from FIELD_META so the
// catalog and the type map can never drift apart.
export const CONDITION_FIELDS = FIELD_CATEGORIES.reduce((acc, cat) => {
  acc[cat] = Object.keys(FIELD_META).filter((f) => FIELD_META[f].category === cat);
  return acc;
}, {});

export const FINANCIAL_FIELDS = new Set(CONDITION_FIELDS["Financial / Value Band"]);

/* ---------------------------------------------------------------- */
/* Typed operators                                                   */
/* ---------------------------------------------------------------- */
export const OPERATORS_BY_TYPE = {
  text: ["equals", "does not equal", "contains", "does not contain", "starts with", "ends with", "is known", "is unknown"],
  "text-categorical": ["equals", "does not equal", "is known", "is unknown"],
  number: ["equals", "does not equal", "greater than", "greater than or equal to", "less than", "less than or equal to", "between", "is known", "is unknown"],
  date: ["is", "is not", "before", "after", "on or before", "on or after", "between", "within last", "within next", "more than X days ago", "more than X days from now", "is known", "is unknown"],
  birthday: ["is today", "is tomorrow", "within next", "within previous", "month is", "day is", "is in month", "is between (annual)"],
  event: ["occurred", "did not occur", "occurred within last", "did not occur within last", "occurred more than", "occurred at least", "occurred between"],
  consent: ["equals", "is not", "is known", "is unknown"],
  band: ["equals", "does not equal", "is known", "is unknown"],
  identity: ["is known", "is unknown", "equals", "does not equal"],
};

const NO_VALUE_OPERATORS = new Set(["is known", "is unknown", "occurred", "did not occur", "is today", "is tomorrow"]);

/**
 * Describes the value control(s) a given (field type, operator) pair
 * needs. This is what makes the builder typed: the UI is generated
 * from this schema, so it is structurally impossible to e.g. type a
 * raw number into a Value Band field or compare Birthday to a full
 * date — those controls simply never render.
 */
export function getValueSchema(fieldType, operator) {
  if (NO_VALUE_OPERATORS.has(operator)) return [];

  switch (fieldType) {
    case "text-categorical":
      return [{ key: "value", control: "select", optionsFrom: "field" }];
    case "text":
      return [{ key: "value", control: "text" }];
    case "number":
      if (operator === "between") return [{ key: "min", control: "number" }, { key: "max", control: "number" }];
      return [{ key: "value", control: "number" }];
    case "date":
      if (operator === "between") return [{ key: "start", control: "date" }, { key: "end", control: "date" }];
      if (operator === "within last" || operator === "within next")
        return [{ key: "amount", control: "number" }, { key: "unit", control: "unit" }];
      if (operator === "more than X days ago" || operator === "more than X days from now")
        return [{ key: "amount", control: "number", suffix: "days" }];
      return [{ key: "value", control: "date" }];
    case "birthday":
      if (operator === "within next" || operator === "within previous")
        return [{ key: "amount", control: "number", suffix: "days" }];
      if (operator === "month is" || operator === "is in month") return [{ key: "month", control: "month" }];
      if (operator === "day is") return [{ key: "day", control: "day" }];
      if (operator === "is between (annual)")
        return [
          { key: "startMonth", control: "month" },
          { key: "startDay", control: "day" },
          { key: "endMonth", control: "month" },
          { key: "endDay", control: "day" },
        ];
      return [];
    case "event":
      if (operator === "occurred within last" || operator === "did not occur within last")
        return [{ key: "amount", control: "number" }, { key: "unit", control: "unit" }];
      if (operator === "occurred more than" || operator === "occurred at least")
        return [
          { key: "count", control: "number", suffix: "times" },
          { key: "windowAmount", control: "number", prefix: "within last" },
          { key: "windowUnit", control: "unit" },
        ];
      if (operator === "occurred between") return [{ key: "start", control: "date" }, { key: "end", control: "date" }];
      return [];
    case "consent":
      return [{ key: "value", control: "select", options: CONSENT_VALUES }];
    case "band":
      return [{ key: "value", control: "select", options: VALUE_BANDS }];
    case "identity":
      if (operator === "equals" || operator === "does not equal") return [{ key: "value", control: "text", placeholder: "Reference value" }];
      return [];
    default:
      return [{ key: "value", control: "text" }];
  }
}

/** Human-readable rendering of a condition's params, for read-only display (Definition tab). */
export function formatConditionValue(condition) {
  const meta = FIELD_META[condition.field];
  if (!meta) return "";
  const schema = getValueSchema(meta.type, condition.operator);
  const p = condition.params || {};
  if (!schema.length) return "";

  if (meta.type === "birthday") {
    if (condition.operator === "within next" || condition.operator === "within previous") return `${p.amount ?? "—"} days`;
    if (condition.operator === "month is" || condition.operator === "is in month") return MONTHS[(p.month ?? 1) - 1] || "—";
    if (condition.operator === "day is") return `Day ${p.day ?? "—"}`;
    if (condition.operator === "is between (annual)")
      return `${p.startDay ?? "—"} ${monthShort(p.startMonth)} → ${p.endDay ?? "—"} ${monthShort(p.endMonth)}`;
  }
  if (schema.length === 1) {
    const part = schema[0];
    const val = p[part.key];
    return part.suffix ? `${val ?? "—"} ${part.suffix}` : val ?? "—";
  }
  if (condition.operator === "between" && meta.type === "number") return `${p.min ?? "—"} and ${p.max ?? "—"}`;
  if (condition.operator === "between" || condition.operator === "occurred between") return `${p.start ?? "—"} → ${p.end ?? "—"}`;
  if (condition.operator === "within last" || condition.operator === "within next" || condition.operator === "occurred within last" || condition.operator === "did not occur within last")
    return `${p.amount ?? "—"} ${p.unit ?? "days"}`;
  if (condition.operator === "occurred more than" || condition.operator === "occurred at least")
    return `${p.count ?? "—"} times within last ${p.windowAmount ?? "—"} ${p.windowUnit ?? "days"}`;
  return schema.map((part) => p[part.key]).filter(Boolean).join(" ");
}

function monthShort(m) {
  return m ? MONTHS[m - 1].slice(0, 3) : "—";
}

/* ---------------------------------------------------------------- */
/* Birthday recurring-date math — month/day only, no birth year.     */
/* Correctly wraps across the calendar year boundary.                */
/* ---------------------------------------------------------------- */
export function daysUntilNextBirthday(month, day, referenceDate = new Date()) {
  const ref = new Date(referenceDate.getFullYear(), referenceDate.getMonth(), referenceDate.getDate());
  let next = new Date(ref.getFullYear(), month - 1, day);
  if (next < ref) next = new Date(ref.getFullYear() + 1, month - 1, day);
  return Math.round((next - ref) / 86400000);
}

export function daysSinceLastBirthday(month, day, referenceDate = new Date()) {
  const ref = new Date(referenceDate.getFullYear(), referenceDate.getMonth(), referenceDate.getDate());
  let last = new Date(ref.getFullYear(), month - 1, day);
  if (last > ref) last = new Date(ref.getFullYear() - 1, month - 1, day);
  return Math.round((ref - last) / 86400000);
}

/* ---------------------------------------------------------------- */
/* Workspace-level activation destinations                           */
/* ---------------------------------------------------------------- */
export const ACTIVATION_DESTINATIONS = [
  { destination: "Email", type: "Messaging", status: "Ready", lastSync: "18 Sep 2026" },
  { destination: "Push", type: "Messaging", status: "Ready", lastSync: "18 Sep 2026" },
  { destination: "SMS", type: "Messaging", status: "Connected", lastSync: "17 Sep 2026" },
  { destination: "Webhook", type: "Data Delivery", status: "Connected", lastSync: "18 Sep 2026" },
  { destination: "Meta Ads", type: "Advertising", status: "Ready", lastSync: "17 Sep 2026" },
  { destination: "Google Ads", type: "Advertising", status: "Ready", lastSync: "17 Sep 2026" },
  { destination: "CRM", type: "Sync", status: "Connected", lastSync: "18 Sep 2026" },
  { destination: "n8n", type: "Workflow", status: "Connected", lastSync: "18 Sep 2026" },
  { destination: "API", type: "Data Delivery", status: "Ready", lastSync: "18 Sep 2026" },
];

const SAMPLE_MEMBERS = [
  { name: "Nguyễn Minh Anh", crmId: "CRM-847291", tier: "Platinum", lifecycle: "Active Investor", location: "Ho Chi Minh City", lastActive: "Today" },
  { name: "Trần Quốc Bảo", crmId: "CRM-847292", tier: "Gold", lifecycle: "Engaged", location: "Hanoi", lastActive: "Yesterday" },
];

const COMPOSITION_DEFAULT = {
  "Customer Tier": [
    { label: "Platinum", pct: 32 },
    { label: "Gold", pct: 46 },
    { label: "Silver", pct: 22 },
  ],
  "Preferred Channel": [
    { label: "Mobile App", pct: 71 },
    { label: "Web", pct: 21 },
    { label: "Other", pct: 8 },
  ],
  Lifecycle: [
    { label: "Active Investor", pct: 64 },
    { label: "Engaged", pct: 25 },
    { label: "Dormant", pct: 11 },
  ],
};

// Condition-object shape used everywhere: { field, operator, params }.
// `params` holds whatever named parts that (type, operator) pair's
// value schema needs — see getValueSchema() above.
export const AUDIENCES = [
  {
    id: "aud-001",
    name: "Active Mobile Investors",
    description: "Customers who actively use the mobile app and have recent investment activity.",
    type: "Behavioral",
    memberCount: 48231,
    status: "Active",
    owner: "CRM Team",
    updatedAt: "18 Sep 2026",
    updatedDaysAgo: 0,
    createdAt: "12 Aug 2026",
    evaluationMode: "Automatic",
    dataFreshness: "Near real-time",
    lastEvaluated: "18 Sep 2026 · 09:42",
    logic: "ALL",
    conditions: [
      { field: "Preferred Channel", operator: "equals", params: { value: "Mobile App" } },
      { field: "Lifecycle Stage", operator: "equals", params: { value: "Active Investor" } },
      { field: "Last Active", operator: "within last", params: { amount: 30, unit: "days" } },
      { field: "Trading Orders", operator: "greater than", params: { value: 5 } },
    ],
    composition: COMPOSITION_DEFAULT,
    sampleMembers: SAMPLE_MEMBERS,
  },
  {
    id: "aud-002",
    name: "High Value Customers",
    description: "Customers with portfolio value within the defined high-value band and recent activity.",
    type: "Attribute + Behavioral",
    memberCount: 12804,
    status: "Active",
    owner: "CRM Team",
    updatedAt: "17 Sep 2026",
    updatedDaysAgo: 1,
    createdAt: "03 Jul 2026",
    evaluationMode: "Automatic",
    dataFreshness: "Near real-time",
    lastEvaluated: "17 Sep 2026 · 22:10",
    logic: "ALL",
    conditions: [
      { field: "Portfolio Value Band", operator: "equals", params: { value: "> ₫100,000,000" } },
      { field: "Last Active", operator: "within last", params: { amount: 30, unit: "days" } },
    ],
    composition: {
      "Customer Tier": [
        { label: "Platinum", pct: 58 },
        { label: "Gold", pct: 34 },
        { label: "Silver", pct: 8 },
      ],
      "Preferred Channel": [
        { label: "Mobile App", pct: 62 },
        { label: "Web", pct: 29 },
        { label: "Other", pct: 9 },
      ],
      Lifecycle: [
        { label: "Active Investor", pct: 71 },
        { label: "Engaged", pct: 22 },
        { label: "Dormant", pct: 7 },
      ],
    },
    sampleMembers: SAMPLE_MEMBERS,
  },
  {
    id: "aud-003",
    name: "Dormant Investors",
    description: "Customers with no recent login or trading activity.",
    type: "Behavioral",
    memberCount: 31420,
    status: "Active",
    owner: "Lifecycle Team",
    updatedAt: "15 Sep 2026",
    updatedDaysAgo: 3,
    createdAt: "20 Jun 2026",
    evaluationMode: "Automatic",
    dataFreshness: "Daily",
    lastEvaluated: "15 Sep 2026 · 06:00",
    logic: "ALL",
    conditions: [
      { field: "Last Active", operator: "more than X days ago", params: { amount: 30 } },
      { field: "Trading Orders", operator: "equals", params: { value: 0 } },
    ],
    composition: {
      "Customer Tier": [
        { label: "Standard", pct: 54 },
        { label: "Silver", pct: 31 },
        { label: "Gold", pct: 15 },
      ],
      "Preferred Channel": [
        { label: "Email", pct: 48 },
        { label: "Mobile App", pct: 37 },
        { label: "Other", pct: 15 },
      ],
      Lifecycle: [{ label: "Dormant", pct: 100 }],
    },
    sampleMembers: SAMPLE_MEMBERS,
  },
  {
    id: "aud-004",
    name: "Mobile App Users",
    description: "Customers with active mobile application identity.",
    type: "Identity + Behavioral",
    memberCount: 96382,
    status: "Active",
    owner: "Growth Team",
    updatedAt: "18 Sep 2026",
    updatedDaysAgo: 0,
    createdAt: "01 Mar 2025",
    evaluationMode: "Automatic",
    dataFreshness: "Near real-time",
    lastEvaluated: "18 Sep 2026 · 08:05",
    logic: "ALL",
    conditions: [
      { field: "Android Device ID", operator: "is known", params: {} },
      { field: "App Open", operator: "occurred within last", params: { amount: 90, unit: "days" } },
    ],
    composition: {
      "Customer Tier": [
        { label: "Standard", pct: 44 },
        { label: "Silver", pct: 30 },
        { label: "Gold", pct: 18 },
      ],
      "Preferred Channel": [{ label: "Mobile App", pct: 100 }],
      Lifecycle: [
        { label: "Active Investor", pct: 41 },
        { label: "New User", pct: 33 },
        { label: "Engaged", pct: 26 },
      ],
    },
    sampleMembers: SAMPLE_MEMBERS,
  },
  {
    id: "aud-005",
    name: "Birthday — Next 30 Days",
    description: "Customers whose birthday falls within the next 30 days.",
    type: "Attribute",
    memberCount: 3182,
    status: "Active",
    owner: "CRM Team",
    updatedAt: "18 Sep 2026",
    updatedDaysAgo: 0,
    createdAt: "14 Feb 2023",
    evaluationMode: "Automatic",
    dataFreshness: "Daily",
    lastEvaluated: "18 Sep 2026 · 06:00",
    logic: "ALL",
    conditions: [{ field: "Birthday", operator: "within next", params: { amount: 30 } }],
    composition: {
      "Customer Tier": [
        { label: "Standard", pct: 49 },
        { label: "Silver", pct: 28 },
        { label: "Gold", pct: 23 },
      ],
      "Preferred Channel": [
        { label: "Mobile App", pct: 66 },
        { label: "Email", pct: 24 },
        { label: "Other", pct: 10 },
      ],
      Lifecycle: [
        { label: "Active Investor", pct: 40 },
        { label: "Engaged", pct: 35 },
        { label: "Dormant", pct: 25 },
      ],
    },
    sampleMembers: SAMPLE_MEMBERS,
  },
  {
    id: "aud-006",
    name: "Marketing Consent — Email",
    description: "Customers with valid email marketing consent.",
    type: "Consent",
    memberCount: 54812,
    status: "Active",
    owner: "CRM Team",
    updatedAt: "18 Sep 2026",
    updatedDaysAgo: 0,
    createdAt: "10 Jan 2022",
    evaluationMode: "Automatic",
    dataFreshness: "Near real-time",
    lastEvaluated: "18 Sep 2026 · 09:00",
    logic: "ALL",
    conditions: [
      { field: "Marketing Consent", operator: "equals", params: { value: "Granted" } },
      { field: "Email Address", operator: "is known", params: {} },
    ],
    composition: {
      "Customer Tier": [
        { label: "Standard", pct: 51 },
        { label: "Silver", pct: 27 },
        { label: "Gold", pct: 22 },
      ],
      "Preferred Channel": [
        { label: "Email", pct: 55 },
        { label: "Mobile App", pct: 38 },
        { label: "Other", pct: 7 },
      ],
      Lifecycle: [
        { label: "Active Investor", pct: 38 },
        { label: "Engaged", pct: 34 },
        { label: "Dormant", pct: 28 },
      ],
    },
    sampleMembers: SAMPLE_MEMBERS,
  },
  {
    id: "aud-007",
    name: "Recently Registered",
    description: "Customers registered within the last 30 days.",
    type: "Attribute",
    memberCount: 4218,
    status: "Active",
    owner: "Growth Team",
    updatedAt: "18 Sep 2026",
    updatedDaysAgo: 0,
    createdAt: "18 Sep 2026",
    evaluationMode: "Automatic",
    dataFreshness: "Near real-time",
    lastEvaluated: "18 Sep 2026 · 09:42",
    logic: "ALL",
    conditions: [{ field: "Registration Date", operator: "within last", params: { amount: 30, unit: "days" } }],
    composition: {
      "Customer Tier": [
        { label: "Standard", pct: 82 },
        { label: "Silver", pct: 13 },
        { label: "Gold", pct: 5 },
      ],
      "Preferred Channel": [
        { label: "Mobile App", pct: 88 },
        { label: "Web", pct: 12 },
      ],
      Lifecycle: [{ label: "New User", pct: 100 }],
    },
    sampleMembers: SAMPLE_MEMBERS,
  },
  {
    id: "aud-008",
    name: "High Engagement — No Recent Trade",
    description: "Customers with high engagement but no recent trading activity.",
    type: "Behavioral",
    memberCount: 8642,
    status: "Active",
    owner: "Lifecycle Team",
    updatedAt: "17 Sep 2026",
    updatedDaysAgo: 1,
    createdAt: "15 Aug 2026",
    evaluationMode: "Automatic",
    dataFreshness: "Near real-time",
    lastEvaluated: "17 Sep 2026 · 20:00",
    logic: "ALL",
    conditions: [
      { field: "Engagement Score", operator: "greater than or equal to", params: { value: 80 } },
      { field: "Trading Orders", operator: "equals", params: { value: 0 } },
      { field: "Last Active", operator: "within last", params: { amount: 30, unit: "days" } },
    ],
    composition: {
      "Customer Tier": [
        { label: "Gold", pct: 41 },
        { label: "Silver", pct: 33 },
        { label: "Platinum", pct: 26 },
      ],
      "Preferred Channel": [
        { label: "Mobile App", pct: 74 },
        { label: "Web", pct: 18 },
        { label: "Other", pct: 8 },
      ],
      Lifecycle: [
        { label: "Engaged", pct: 68 },
        { label: "Active Investor", pct: 22 },
        { label: "New User", pct: 10 },
      ],
    },
    sampleMembers: SAMPLE_MEMBERS,
  },
  {
    id: "aud-009",
    name: "Premium Segment Test",
    description: "Draft segment testing a tighter premium-tier definition ahead of a Q4 campaign.",
    type: "Multi-condition",
    memberCount: 1204,
    status: "Draft",
    owner: "Growth Team",
    updatedAt: "10 Sep 2026",
    updatedDaysAgo: 8,
    createdAt: "10 Sep 2026",
    evaluationMode: "Manual",
    dataFreshness: "Not yet evaluated",
    lastEvaluated: "10 Sep 2026 · 15:22",
    logic: "ALL",
    conditions: [
      { field: "Portfolio Value Band", operator: "equals", params: { value: "> ₫100,000,000" } },
      { field: "Customer Tier", operator: "equals", params: { value: "Platinum" } },
      { field: "Push Open", operator: "occurred within last", params: { amount: 7, unit: "days" } },
    ],
    composition: {
      "Customer Tier": [{ label: "Platinum", pct: 100 }],
      "Preferred Channel": [
        { label: "Mobile App", pct: 80 },
        { label: "Web", pct: 20 },
      ],
      Lifecycle: [
        { label: "Active Investor", pct: 77 },
        { label: "Engaged", pct: 23 },
      ],
    },
    sampleMembers: SAMPLE_MEMBERS,
  },
  {
    id: "aud-010",
    name: "Legacy High Risk Flag",
    description: "Older conservative-risk customers with no activity in the last quarter. Paused pending review.",
    type: "Attribute",
    memberCount: 2140,
    status: "Paused",
    owner: "Lifecycle Team",
    updatedAt: "02 Aug 2026",
    updatedDaysAgo: 47,
    createdAt: "05 May 2024",
    evaluationMode: "Manual",
    dataFreshness: "Stale",
    lastEvaluated: "02 Aug 2026 · 11:00",
    logic: "ALL",
    conditions: [
      { field: "Risk Profile", operator: "equals", params: { value: "Conservative" } },
      { field: "Last Active", operator: "more than X days ago", params: { amount: 90 } },
    ],
    composition: {
      "Customer Tier": [
        { label: "Standard", pct: 66 },
        { label: "Silver", pct: 34 },
      ],
      "Preferred Channel": [
        { label: "Email", pct: 70 },
        { label: "Mobile App", pct: 30 },
      ],
      Lifecycle: [{ label: "Dormant", pct: 100 }],
    },
    sampleMembers: SAMPLE_MEMBERS,
  },
  {
    id: "aud-011",
    name: "Verified Email Identities",
    description: "Customers with a verified email address on file.",
    type: "Identity",
    memberCount: 71904,
    status: "Active",
    owner: "CRM Team",
    updatedAt: "16 Sep 2026",
    updatedDaysAgo: 2,
    createdAt: "14 Feb 2023",
    evaluationMode: "Automatic",
    dataFreshness: "Near real-time",
    lastEvaluated: "16 Sep 2026 · 09:42",
    logic: "ALL",
    conditions: [{ field: "Email Address", operator: "is known", params: {} }],
    composition: {
      "Customer Tier": [
        { label: "Standard", pct: 47 },
        { label: "Silver", pct: 29 },
        { label: "Gold", pct: 24 },
      ],
      "Preferred Channel": [
        { label: "Mobile App", pct: 68 },
        { label: "Web", pct: 22 },
        { label: "Other", pct: 10 },
      ],
      Lifecycle: [
        { label: "Active Investor", pct: 46 },
        { label: "Engaged", pct: 31 },
        { label: "Dormant", pct: 23 },
      ],
    },
    sampleMembers: SAMPLE_MEMBERS,
  },
  {
    id: "aud-012",
    name: "Funded — No First Trade",
    description: "Customers who have made a deposit but have not yet placed their first trade.",
    type: "Behavioral",
    memberCount: 12420,
    status: "Active",
    owner: "Growth Team",
    updatedAt: "05 Oct 2026",
    updatedDaysAgo: 1,
    createdAt: "02 Sep 2026",
    evaluationMode: "Automatic",
    dataFreshness: "Near real-time",
    lastEvaluated: "05 Oct 2026 · 09:42",
    logic: "ALL",
    conditions: [
      { field: "Deposit", operator: "occurred", params: {} },
      { field: "Place Order", operator: "did not occur", params: {} },
    ],
    composition: {
      "Customer Tier": [
        { label: "Standard", pct: 61 },
        { label: "Silver", pct: 27 },
        { label: "Gold", pct: 12 },
      ],
      "Preferred Channel": [
        { label: "Mobile App", pct: 74 },
        { label: "Web", pct: 26 },
      ],
      Lifecycle: [
        { label: "New User", pct: 58 },
        { label: "Engaged", pct: 42 },
      ],
    },
    sampleMembers: SAMPLE_MEMBERS,
  },
  {
    id: "aud-013",
    name: "eKYC Incomplete",
    description: "Customers with an incomplete eKYC verification step.",
    type: "Attribute",
    memberCount: 5340,
    status: "Active",
    owner: "CRM Team",
    updatedAt: "04 Oct 2026",
    updatedDaysAgo: 2,
    createdAt: "18 Aug 2026",
    evaluationMode: "Automatic",
    dataFreshness: "Near real-time",
    lastEvaluated: "04 Oct 2026 · 09:42",
    logic: "ALL",
    conditions: [{ field: "eKYC Status", operator: "equals", params: { value: "Incomplete" } }],
    composition: {
      "Customer Tier": [
        { label: "Standard", pct: 89 },
        { label: "Silver", pct: 11 },
      ],
      "Preferred Channel": [
        { label: "Mobile App", pct: 81 },
        { label: "Web", pct: 19 },
      ],
      Lifecycle: [{ label: "New User", pct: 100 }],
    },
    sampleMembers: SAMPLE_MEMBERS,
  },
];

export function getAudienceById(id) {
  return AUDIENCES.find((a) => a.id === id);
}

/* Reachable = has at least one deliverable channel identity on file.
   Consent Eligible = reachable AND marketing consent granted — a
   narrower subset of Reachable, never the same number. Both are
   derived, deterministic per-audience rates, not a second consent
   engine (Consent & Preferences remains the source of truth for
   actual consent state). Used by Audience Insights and Campaigns so
   every "Reachable" / "Consent Eligible" figure in the prototype
   traces back to this one function. The Funded — No First Trade
   figures match the Phase 17 spec's literal example exactly. */
export function reachMetrics(audience) {
  if (audience.id === "aud-012") return { reachable: 10891, consentEligible: 9842 };
  const h = hashString(audience.id + "-reach");
  const reachablePct = 80 + (h % 15); // 80-94%
  const consentPct = reachablePct - (5 + (h % 10)); // always lower than reachable
  return {
    reachable: Math.round(audience.memberCount * (reachablePct / 100)),
    consentEligible: Math.round(audience.memberCount * (Math.max(consentPct, 40) / 100)),
  };
}

/* ---------------------------------------------------------------- */
/* Compact example templates — click to populate the builder.        */
/* ---------------------------------------------------------------- */
export const AUDIENCE_EXAMPLES = [
  {
    name: "Birthday — Next 30 Days",
    purpose: "Birthday campaign audience.",
    conditions: [{ field: "Birthday", operator: "within next", params: { amount: 30 } }],
  },
  {
    name: "Active Mobile Investors",
    purpose: "Identify recently active mobile investors.",
    conditions: [
      { field: "Preferred Channel", operator: "equals", params: { value: "Mobile App" } },
      { field: "Lifecycle Stage", operator: "equals", params: { value: "Active Investor" } },
      { field: "Last Active", operator: "within last", params: { amount: 30, unit: "days" } },
    ],
  },
  {
    name: "High Engagement — No Recent Trade",
    purpose: "Identify highly engaged customers without recent trading activity.",
    conditions: [
      { field: "Engagement Score", operator: "greater than or equal to", params: { value: 80 } },
      { field: "Trading Orders", operator: "equals", params: { value: 0 } },
      { field: "Last Active", operator: "within last", params: { amount: 30, unit: "days" } },
    ],
  },
  {
    name: "Email Marketing Consent",
    purpose: "Customers eligible for email marketing communication.",
    conditions: [
      { field: "Marketing Consent", operator: "equals", params: { value: "Granted" } },
      { field: "Email Address", operator: "is known", params: {} },
    ],
  },
  {
    name: "High Value Customers",
    purpose: "Identify customers within a defined value band.",
    conditions: [
      { field: "Portfolio Value Band", operator: "equals", params: { value: "> ₫100,000,000" } },
      { field: "Lifecycle Stage", operator: "equals", params: { value: "Active Investor" } },
    ],
  },
  {
    name: "Dormant Investors",
    purpose: "Identify potentially dormant customers.",
    conditions: [
      { field: "Last Active", operator: "more than X days ago", params: { amount: 30 } },
      { field: "Trading Orders", operator: "equals", params: { value: 0 } },
    ],
  },
];

function hashString(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) >>> 0;
  return h;
}

/**
 * Deterministic mock size estimate for the audience builder — not a
 * real computation over profile data, just a stable, plausible
 * shrinking number so the live preview feels responsive.
 */
export function estimateAudienceSize(conditions) {
  const BASE_PROFILES = 1284392;
  if (!conditions.length) return BASE_PROFILES;
  let factor = 1;
  conditions.forEach((c) => {
    const seed = hashString(`${c.field}|${c.operator}|${JSON.stringify(c.params || {})}`);
    const reduction = 0.15 + (seed % 45) / 100; // 0.15–0.59 per condition
    factor *= reduction;
  });
  return Math.max(120, Math.round(BASE_PROFILES * factor));
}

/** True if a condition's required value parts are all filled in. */
export function isConditionComplete(condition) {
  const meta = FIELD_META[condition.field];
  if (!meta) return false;
  const schema = getValueSchema(meta.type, condition.operator);
  return schema.every((part) => {
    const v = condition.params?.[part.key];
    return v !== undefined && v !== null && v !== "";
  });
}
