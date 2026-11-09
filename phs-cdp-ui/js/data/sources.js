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

export const SOURCES = [];


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
