/*
  PHS CDP — centralized Directory / Sources mock data.
  Mirrors js/data/destinations.js in shape and conventions (Phase 12.4:
  Provider -> Connection Account -> ONE Data Stream -> Data Selection)
  so the Directory's Sources and Destinations tables/detail pages can
  share the same rendering + column-manager + filter machinery. Where a
  source corresponds to an existing inbound Data Flow record, it
  references that record by id rather than redefining its data type /
  delivery mode a second time.

  Sources support a narrower stream set than Destinations — a source
  sends data INTO the CDP, so "Audience" (an activation concept) and
  "Message" (an outbound communication concept) don't apply here.
*/

import { getFlowById } from "./dataflows.js";
import { resolveDateRangeDays, CONNECTOR_OWNERS, formatMockDate, getConnectionKind, getConnectionFields, defaultProfileAttributeIds } from "./destinations.js";

export { getConnectionKind, getConnectionFields };

export const SOURCE_TYPES = ["Mobile App", "Web", "API", "Webhook", "Connector", "File / Batch", "Partner"];
export const SOURCE_STATUSES = ["Connected", "Available", "Paused", "Error", "Draft"];
export const SOURCE_DATA_STREAMS = ["Profile", "Event", "Consent"];

export const SOURCE_ICONS = {
  "PHS Mobile App": "smartphone",
  "PHS Website": "globe-2",
  AppsFlyer: "radar",
  CRM: "building-2",
  Webhook: "webhook",
  "Trading API": "landmark",
  "Partner API": "braces",
  Zalo: "message-circle",
  n8n: "workflow",
  "Consent Platform": "shield-check",
};

/* ---------------------------------------------------------------- */
/* Source Providers — each Connection Account below belongs to one    */
/* provider; `capabilities` is the set of Data Streams a NEW           */
/* Connection Account for it may choose (section 22).                 */
/* ---------------------------------------------------------------- */
export const SOURCE_PROVIDERS = [
  { id: "phs-mobile-app", name: "PHS Mobile App", category: "Mobile", capabilities: ["Event", "Profile"] },
  { id: "phs-website", name: "PHS Website", category: "Web", capabilities: ["Event", "Profile"] },
  { id: "appsflyer", name: "AppsFlyer", category: "Partner", capabilities: ["Event"] },
  { id: "crm-source", name: "CRM", category: "Connector", capabilities: ["Profile", "Consent"] },
  { id: "webhook-source", name: "Webhook", category: "Webhook", capabilities: ["Event"] },
  { id: "trading-api", name: "Trading API", category: "API", capabilities: ["Event"] },
  { id: "partner-api", name: "Partner API", category: "Partner", capabilities: ["Profile", "Event"] },
  { id: "zalo-source", name: "Zalo", category: "Connector", capabilities: ["Profile"] },
  { id: "n8n-source", name: "n8n", category: "Connector", capabilities: ["Event"] },
  { id: "consent-platform-source", name: "Consent Platform", category: "Connector", capabilities: ["Consent"] },
];
export function getSourceProvider(name) {
  return SOURCE_PROVIDERS.find((p) => p.name === name);
}
export function sourceProviderCapabilities(name) {
  return getSourceProvider(name)?.capabilities || SOURCE_DATA_STREAMS;
}
// Every current source provider uses a "connection-kind" already
// defined in destinations.js's CONNECTION_KIND_FIELDS — reused as-is.
export const SOURCE_PROVIDER_CONNECTION_KIND = {
  "PHS Mobile App": "provider",
  "PHS Website": "provider",
  AppsFlyer: "account",
  CRM: "accountUrl",
  Webhook: "webhook",
  "Trading API": "account",
  "Partner API": "httpApi",
  Zalo: "account",
  n8n: "webhook",
  "Consent Platform": "provider",
};

function activity(entries) {
  return entries.map(([time, text]) => ({ time, text }));
}

export const SOURCES = [
  {
    id: "phs-mobile-app",
    name: "PHS Mobile App — Event",
    provider: "PHS Mobile App",
    sourceType: "Mobile App",
    category: "Mobile",
    status: "Connected",
    dataStream: "Event",
    dataSelection: { mode: "all", eventIds: [], eventProperties: {} },
    lastReceived: "23 Sep 2026 · 10:45",
    dataFlowId: "flow-in-mobile",
    usersBase7d: 382419,
    configuration: [
      { label: "SDK Version", value: "PHS Mobile SDK v4.2" },
      { label: "Connection", value: "Connected" },
      { label: "Write Key", value: "••••••••••••", masked: true },
    ],
    activity: activity([
      ["23 Sep 2026 · 10:45", "Event stream healthy"],
      ["23 Sep 2026 · 06:00", "892,104 events received"],
    ]),
  },
  {
    id: "phs-website",
    name: "PHS Website — Event",
    provider: "PHS Website",
    sourceType: "Web",
    category: "Web",
    status: "Connected",
    dataStream: "Event",
    dataSelection: { mode: "all", eventIds: [], eventProperties: {} },
    lastReceived: "23 Sep 2026 · 10:41",
    dataFlowId: "flow-in-web",
    usersBase7d: 312480,
    configuration: [
      { label: "Site", value: "phs.com.vn" },
      { label: "Connection", value: "Connected" },
      { label: "Site Token", value: "••••••••••••", masked: true },
    ],
    activity: activity([
      ["23 Sep 2026 · 10:41", "Event stream healthy"],
      ["23 Sep 2026 · 06:00", "312,480 events received"],
    ]),
  },
  {
    id: "appsflyer",
    name: "PHS AppsFlyer — Events",
    provider: "AppsFlyer",
    sourceType: "Partner",
    category: "Partner",
    status: "Connected",
    dataStream: "Event",
    dataSelection: { mode: "all", eventIds: [], eventProperties: {} },
    lastReceived: "23 Sep 2026 · 10:20",
    dataFlowId: "flow-in-appsflyer",
    usersBase7d: 124820,
    configuration: [
      { label: "Account", value: "PHS Attribution Account" },
      { label: "Connection", value: "Connected" },
      { label: "Pull API Key", value: "••••••••••••", masked: true },
    ],
    activity: activity([
      ["23 Sep 2026 · 10:20", "Attribution events received"],
      ["22 Sep 2026 · 10:18", "124,820 events received"],
    ]),
  },
  {
    id: "crm-source",
    name: "PHS CRM — Profile",
    provider: "CRM",
    sourceType: "Connector",
    category: "Connector",
    status: "Connected",
    dataStream: "Profile",
    dataSelection: { attributeIds: ["accountId", "customerTier", "lifecycleStage", "location", "preferredChannel", "preferredLanguage", "birthday"] },
    lastReceived: "23 Sep 2026 · 06:00",
    dataFlowId: "flow-in-crm",
    usersBase7d: 1284392,
    configuration: [
      { label: "Instance", value: "PHS CRM Instance" },
      { label: "Connection", value: "Connected" },
      { label: "Service Account Key", value: "••••••••••••", masked: true },
    ],
    activity: activity([
      ["23 Sep 2026 · 06:00", "1,284,392 profiles received"],
      ["22 Sep 2026 · 06:00", "Batch import completed"],
    ]),
  },
  {
    id: "webhook-source",
    name: "PHS Webhook — Event",
    provider: "Webhook",
    sourceType: "Webhook",
    category: "Webhook",
    status: "Connected",
    dataStream: "Event",
    dataSelection: { mode: "all", eventIds: [], eventProperties: {} },
    lastReceived: "23 Sep 2026 · 10:33",
    dataFlowId: "flow-in-webhook",
    usersBase7d: 96340,
    configuration: [
      { label: "Endpoint", value: "https://hooks.phs-cdp.example/in/behavior-events" },
      { label: "Connection", value: "Connected" },
      { label: "Webhook Secret", value: "••••••••••••", masked: true },
    ],
    activity: activity([
      ["23 Sep 2026 · 10:33", "96,340 events received"],
      ["22 Sep 2026 · 09:12", "96,340 events received"],
    ]),
  },
  {
    id: "trading-api",
    name: "PHS Trading API — Event",
    provider: "Trading API",
    sourceType: "API",
    category: "API",
    status: "Connected",
    dataStream: "Event",
    dataSelection: { mode: "all", eventIds: [], eventProperties: {} },
    lastReceived: "23 Sep 2026 · 10:44",
    dataFlowId: "flow-in-trading",
    usersBase7d: 214600,
    configuration: [
      { label: "System", value: "Core Trading Platform" },
      { label: "Connection", value: "Connected" },
      { label: "Internal Service Token", value: "••••••••••••", masked: true },
    ],
    activity: activity([
      ["23 Sep 2026 · 10:44", "Order activity stream healthy"],
      ["23 Sep 2026 · 06:00", "214,600 events received"],
    ]),
  },
  {
    id: "partner-api",
    name: "PHS Partner API — Profile",
    provider: "Partner API",
    sourceType: "Partner",
    category: "Partner",
    status: "Available",
    dataStream: "Profile",
    dataSelection: { attributeIds: defaultProfileAttributeIds() },
    lastReceived: "—",
    dataFlowId: null,
    usersBase7d: 0,
    configuration: [
      { label: "Endpoint", value: "https://partner.example.com/api/v1/export" },
      { label: "Connection", value: "Not yet connected" },
      { label: "API Key", value: "••••••••••••", masked: true },
    ],
    activity: [],
  },
  // A second, independent connection account for the SAME provider —
  // Partner API supports both Profile and Event (see SOURCE_PROVIDERS
  // above), and the 1-account-=-1-stream rule (Phase 12.4) means an
  // Event-stream connection is a separate account, not a mutation of
  // the Profile one above. Added for Phase 13.1's Event Streams module.
  {
    id: "partner-api-events",
    name: "PHS Partner API — Events",
    provider: "Partner API",
    sourceType: "Partner",
    category: "Partner",
    status: "Error",
    dataStream: "Event",
    dataSelection: { mode: "all", eventIds: [], eventProperties: {} },
    lastReceived: "24 Sep 2026 · 09:58",
    dataFlowId: null,
    usersBase7d: 0,
    configuration: [
      { label: "Endpoint", value: "https://partner.example.com/api/v1/events" },
      { label: "Connection", value: "Error — validation service unavailable" },
      { label: "API Key", value: "••••••••••••", masked: true },
    ],
    activity: [],
  },
  {
    id: "zalo-source",
    name: "PHS Zalo — Profile",
    provider: "Zalo",
    sourceType: "Connector",
    category: "Connector",
    status: "Connected",
    dataStream: "Profile",
    dataSelection: { attributeIds: ["accountId", "customerTier", "location"] },
    lastReceived: "23 Sep 2026 · 06:00",
    dataFlowId: "flow-in-zalo",
    usersBase7d: 71204,
    configuration: [
      { label: "Account", value: "PHS Official Account" },
      { label: "Connection", value: "Connected" },
      { label: "OA Access Token", value: "••••••••••••", masked: true },
    ],
    activity: activity([
      ["23 Sep 2026 · 06:00", "71,204 profiles received"],
      ["22 Sep 2026 · 06:00", "Batch import completed"],
    ]),
  },
  {
    id: "n8n-source",
    name: "PHS n8n — Event",
    provider: "n8n",
    sourceType: "Connector",
    category: "Connector",
    status: "Connected",
    dataStream: "Event",
    dataSelection: { mode: "all", eventIds: [], eventProperties: {} },
    lastReceived: "23 Sep 2026 · 09:40",
    dataFlowId: null,
    usersBase7d: 22140,
    configuration: [
      { label: "Workflow", value: "PHS Automation Workspace" },
      { label: "Connection", value: "Connected" },
      { label: "Webhook Secret", value: "••••••••••••", masked: true },
    ],
    activity: activity([
      ["23 Sep 2026 · 09:40", "Workflow events received"],
      ["22 Sep 2026 · 09:40", "22,140 events received"],
    ]),
  },
  // ── Real RudderStack sources (from workspaceConfig.json) ──
  {
    id: "phs-web-source",
    name: "PHS Web App",
    provider: "JavaScript",
    sourceType: "Web",
    category: "Client-side",
    status: "Connected",
    enabled: true,
    writeKey: "phs_web_write_key_2024",
    dataStream: "Events",
    dataSelection: { mode: "all", eventIds: [], eventProperties: {} },
    lastReceived: "Đang hoạt động",
    dataFlowId: "flow-in-web-source",
    usersBase7d: 8420,
    configuration: [
      { label: "SDK", value: "RudderStack JavaScript SDK" },
      { label: "Write Key", value: "••••••••••••", masked: true },
      { label: "Data Plane", value: "http://100.117.24.87:8080" },
    ],
    activity: activity([
      ["Hôm nay", "Source hoạt động bình thường"],
    ]),
  },
  {
    id: "phs-mobile-source",
    name: "PHS Mobile App",
    provider: "Android",
    sourceType: "Mobile App",
    category: "Mobile",
    status: "Connected",
    enabled: true,
    writeKey: "phs_mobile_write_key_2024",
    dataStream: "Events",
    dataSelection: { mode: "all", eventIds: [], eventProperties: {} },
    lastReceived: "Đang hoạt động",
    dataFlowId: "flow-in-mobile-source",
    usersBase7d: 3150,
    configuration: [
      { label: "SDK", value: "RudderStack Android SDK" },
      { label: "Write Key", value: "••••••••••••", masked: true },
    ],
    activity: activity([
      ["Hôm nay", "Source hoạt động bình thường"],
    ]),
  },
  {
    id: "phs-server-source",
    name: "PHS Server Side",
    provider: "Node.js",
    sourceType: "Backend",
    category: "Server-side",
    status: "Connected",
    enabled: true,
    writeKey: "phs_server_write_key_2024",
    dataStream: "Events",
    dataSelection: { mode: "all", eventIds: [], eventProperties: {} },
    lastReceived: "Đang hoạt động",
    dataFlowId: "flow-in-server-source",
    usersBase7d: 2100,
    configuration: [
      { label: "SDK", value: "RudderStack Node.js SDK" },
      { label: "Write Key", value: "••••••••••••", masked: true },
    ],
    activity: activity([
      ["Hôm nay", "Source hoạt động bình thường"],
    ]),
  },
  {
    id: "src-mviv7tva-ph6f",
    name: "PHS JavaScript — Event Test",
    provider: "JavaScript",
    sourceType: "Web",
    category: "Client-side",
    status: "Connected",
    enabled: true,
    writeKey: "phs_JAVASCRIPT_mviv7tva",
    dataStream: "Events",
    dataSelection: { mode: "all", eventIds: [], eventProperties: {} },
    lastReceived: "—",
    dataFlowId: null,
    usersBase7d: 0,
    configuration: [
      { label: "SDK", value: "RudderStack JavaScript SDK" },
      { label: "Write Key", value: "••••••••••••", masked: true },
    ],
    activity: activity([
      ["Khởi tạo", "Source test event được tạo"],
    ]),
  },
  {
    id: "src-mvivzpgo-qmhf",
    name: "PHS CRM — Profile",
    provider: "CRM",
    sourceType: "CRM",
    category: "Business",
    status: "Connected",
    enabled: true,
    writeKey: "phs_CRM_mvivzpgo",
    dataStream: "Profiles",
    dataSelection: { mode: "all", eventIds: [], eventProperties: {} },
    lastReceived: "—",
    dataFlowId: null,
    usersBase7d: 0,
    configuration: [
      { label: "Loại nguồn", value: "CRM Integration" },
      { label: "Write Key", value: "••••••••••••", masked: true },
    ],
    activity: activity([
      ["Khởi tạo", "CRM source kết nối profile data"],
    ]),
  },
];

function baseUsersFor(id) {
  const s = SOURCES.find((x) => x.id === id);
  return s ? s.usersBase7d : 0;
}
function hashString(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) >>> 0;
  return h;
}
function mockDateOffset(id, minDays, maxDays) {
  const span = maxDays - minDays;
  const days = minDays + (hashString(id + "-date") % span);
  const d = new Date(2026, 8, 23);
  d.setDate(d.getDate() - days);
  return formatMockDate(d);
}
function legacyAuthType(s) {
  return (s.configuration || []).some((c) => c.masked) ? "API Key" : "None";
}
function legacyValue(s, label) {
  const row = (s.configuration || []).find((c) => c.label === label);
  return row ? row.value : "";
}
function buildSourceConnectionFromLegacy(s) {
  const kind = getConnectionKind(s.provider) || SOURCE_PROVIDER_CONNECTION_KIND[s.provider];
  if (kind === "webhook") return { webhookUrl: legacyValue(s, "Endpoint"), method: "POST", headers: [], authType: legacyAuthType(s) };
  if (kind === "httpApi") return { baseUrl: legacyValue(s, "Endpoint"), method: "POST", authType: legacyAuthType(s), headers: [] };
  if (kind === "accountUrl") return { account: legacyValue(s, "Instance") || legacyValue(s, "Account"), apiBaseUrl: "", authType: legacyAuthType(s) };
  if (kind === "provider") return { account: legacyValue(s, "SDK Version") || legacyValue(s, "Site") || legacyValue(s, "Workflow") || legacyValue(s, "Account"), authType: legacyAuthType(s) };
  return { account: legacyValue(s, "Account") || legacyValue(s, "System") || legacyValue(s, "Instance"), authType: legacyAuthType(s) };
}

SOURCES.forEach((s) => {
  s.createdAt = mockDateOffset(s.id, 25, 240);
  s.lastEdit = mockDateOffset(s.id + "-edit", 1, 20);
  s.owner = CONNECTOR_OWNERS[hashString(s.id + "-owner") % CONNECTOR_OWNERS.length];
  s.connection = buildSourceConnectionFromLegacy(s);
  s.deliveryConfig = { mode: s.dataStream === "Profile" ? "Batch" : "Stream" };
});

export function getSourceById(id) {
  return SOURCES.find((s) => s.id === id);
}

export function resolveSourceDataFlow(source) {
  return source.dataFlowId ? getFlowById(source.dataFlowId) : null;
}

/** Data Selection summary string — mirrors dataSelectionSummary() in
 * destinations.js for the Sources side (Profile / Event / Consent only). */
export function sourceDataSelectionSummary(s) {
  const sel = s.dataSelection || {};
  if (s.dataStream === "Profile") return `${(sel.attributeIds || []).length} attributes`;
  if (s.dataStream === "Event") return sel.mode === "all" ? "All events" : `${(sel.eventIds || []).length} selected events`;
  if (s.dataStream === "Consent") return `${(sel.types || []).length} consent types`;
  return "—";
}

/** Users Through Connection — responds to the shared date-range
 * filter, same deterministic jitter model as getUsersThroughConnector. */
export function getUsersThroughSource(source, dateFilter) {
  const days = resolveDateRangeDays(dateFilter);
  const mult = days / 7;
  const jitter = 0.9 + (hashString(source.id) % 21) / 100;
  return Math.max(0, Math.round(source.usersBase7d * mult * jitter));
}

/** All Connection Accounts belonging to one source provider (section 25). */
export function connectionAccountsForSourceProvider(providerName) {
  return SOURCES.filter((s) => s.provider === providerName);
}

/* ---------------------------------------------------------------- */
/* Source activity — same shape/filtering model as connector activity */
/* on the Destinations side; kept local since it's about events        */
/* received rather than users/audiences activated.                     */
/* ---------------------------------------------------------------- */
const RECENT_SOURCE_ACTIVITY_SEED = {
  "phs-mobile-app": [
    { daysAgo: 0, hour: 10, minute: 45, event: "App Open", dataType: "Event", users: 8214, records: 18420, status: "Received" },
    { daysAgo: 0, hour: 9, minute: 30, event: "Login", dataType: "Event", users: 6120, records: 6120, status: "Received" },
    { daysAgo: 1, hour: 10, minute: 40, event: "App Open", dataType: "Event", users: 7940, records: 17100, status: "Received" },
  ],
  "phs-website": [
    { daysAgo: 0, hour: 10, minute: 41, event: "View Stock", dataType: "Event", users: 5210, records: 12040, status: "Received" },
    { daysAgo: 1, hour: 10, minute: 30, event: "View Stock", dataType: "Event", users: 4980, records: 11500, status: "Received" },
  ],
  "trading-api": [
    { daysAgo: 0, hour: 10, minute: 44, event: "Place Order", dataType: "Event", users: 3120, records: 3120, status: "Received" },
    { daysAgo: 1, hour: 9, minute: 55, event: "Place Order", dataType: "Event", users: 2940, records: 2940, status: "Received" },
  ],
};

function buildSourceActivityFor(source) {
  const seed = RECENT_SOURCE_ACTIVITY_SEED[source.id] || [];
  const entries = seed.map((e, i) => ({ sourceId: source.id, id: `${source.id}-a${i}`, ...e }));
  if (source.status === "Available" || source.status === "Draft") return entries;

  const startDay = seed.length ? Math.max(...seed.map((e) => e.daysAgo)) + 1 : 0;
  for (let day = startDay; day < 90; day++) {
    const h = hashString(`${source.id}-${day}`);
    if (h % 4 === 0) continue;
    const users = Math.max(20, Math.round(source.usersBase7d * (0.08 + (h % 18) / 100)));
    const records = Math.round(users * (1 + (h % 6) / 10));
    entries.push({
      sourceId: source.id,
      id: `${source.id}-g${day}`,
      daysAgo: day,
      hour: 6 + (h % 14),
      minute: h % 60,
      event: null,
      dataType: source.dataStream,
      users,
      records,
      status: h % 53 === 0 ? "Delayed" : "Received",
    });
  }
  return entries;
}

export const SOURCE_ACTIVITY = SOURCES.flatMap(buildSourceActivityFor);

export function formatSourceActivityTimestamp(entry) {
  const d = new Date(2026, 8, 23 - entry.daysAgo);
  return `${formatMockDate(d)} · ${String(entry.hour).padStart(2, "0")}:${String(entry.minute).padStart(2, "0")}`;
}

export function getSourceActivity(sourceId, { dateFilter, dataType, status } = {}) {
  const days = resolveDateRangeDays(dateFilter);
  return SOURCE_ACTIVITY.filter((e) => e.sourceId === sourceId)
    .filter((e) => e.daysAgo < days)
    .filter((e) => !dataType || dataType === "all" || e.dataType === dataType)
    .filter((e) => !status || status === "all" || e.status === status)
    .sort((a, b) => a.daysAgo - b.daysAgo || b.hour * 60 + b.minute - (a.hour * 60 + a.minute));
}

export function summarizeSourceActivity(entries) {
  const users = entries.reduce((s, e) => s + e.users, 0);
  const records = entries.reduce((s, e) => s + e.records, 0);
  const received = entries.filter((e) => e.status === "Received").length;
  const total = entries.length || 1;
  return { users, records, successRate: (received / total) * 100, count: entries.length };
}

/* ---------------------------------------------------------------- */
/* Add Source — catalog offered in the guided setup (Step 1: choose    */
/* Provider).                                                          */
/* ---------------------------------------------------------------- */
export const ADD_SOURCE_CATALOG = [
  { category: "Mobile", names: ["PHS Mobile App"] },
  { category: "Web", names: ["PHS Website"] },
  { category: "API", names: ["Trading API"] },
  { category: "Connector", names: ["CRM", "Zalo", "n8n", "Consent Platform"] },
  { category: "Partner", names: ["AppsFlyer", "Partner API"] },
  { category: "Webhook", names: ["Webhook"] },
];

/** The Provider definition for a catalog name (capabilities/category),
 * not a specific Connection Account instance. */
export function getSourceTemplate(name) {
  return getSourceProvider(name);
}
