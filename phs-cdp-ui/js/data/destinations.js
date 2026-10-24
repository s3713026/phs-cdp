/*
  PHS CDP — centralized Activation / Destinations mock data.
  Single source of truth for the Destinations module (list, detail,
  Add Destination). This module sits at the end of the CDP mental
  model — Data Flows describe movement, Audiences describe who
  qualifies, Journeys decide when/why, Activation defines where data
  can be delivered. It references those existing models by id/name
  rather than duplicating them.

  DATA STREAM MODEL (Phase 12.4)
  -------------------------------
  Provider -> Connection Account -> ONE Data Stream -> Data Selection -> Delivery

  A Provider (e.g. "Meta Ads") is a connector type. A user can create
  several Connection Accounts against the same provider (e.g.
  "PHS Meta Ads — Audience" and "PHS Meta Ads — Event"), but every
  single Connection Account carries EXACTLY ONE Data Stream — never a
  mix of Profile + Event + Audience in one account. "Behavior" is not
  a Data Stream; it is one of three Event categories (Behavior,
  Transaction, Engagement) inside the Event stream.

  Each element of `DESTINATIONS` below is a Connection Account (kept
  under the historical export name so the rest of the app — table,
  filters, column manager — doesn't need a second rename pass).
*/

import { AUDIENCES } from "./audiences.js";
import { JOURNEYS, JOURNEY_AUDIENCE_NAMES, JOURNEY_OWNERS, EVENT_OPTIONS } from "./journeys.js";
import { getFlowById } from "./dataflows.js";
import { EVENT_CATEGORIES, eventsByCategory, EVENT_PROPERTIES_MAP } from "./events.js";

// Read-only imports from js/data/journeys.js — Journey Builder itself
// is never touched, but its event/audience catalogs are the existing
// canonical lists, so the Destination configuration form reuses them
// instead of inventing a second one.
export { JOURNEY_AUDIENCE_NAMES as ACTIVITY_AUDIENCE_OPTIONS, JOURNEY_OWNERS as CONNECTOR_OWNERS, EVENT_OPTIONS as DESTINATION_EVENT_CATALOG };

export const DESTINATION_CATEGORIES = ["Customer Engagement", "Advertising", "CRM / Business", "Analytics / Data"];
export const DESTINATION_STATUSES = ["Connected", "Available", "Paused", "Disconnected", "Error", "Draft"];
export const DELIVERY_MODES = ["Batch", "Stream", "Message"];

/* ---------------------------------------------------------------- */
/* Core Data Stream model (Phase 12.4)                                */
/* ---------------------------------------------------------------- */
export const DATA_STREAMS = ["Profile", "Event", "Audience", "Message", "Consent"];
export const STREAM_META = {
  Profile: { icon: "user-round", description: "Customer attributes and profile state." },
  Event: { icon: "zap", description: "Behavior, transaction and engagement events." },
  Audience: { icon: "users-round", description: "Audience membership and segment activation." },
  Message: { icon: "message-square", description: "Customer-facing communication." },
  Consent: { icon: "shield-check", description: "Customer permissions and preferences." },
};
// One Data Stream maps to exactly one Destination Type — the old
// per-provider override table is gone; the type is always derived.
export const DESTINATION_TYPES = ["Profile Destination", "Event Destination", "Audience Destination", "Communication Destination", "Consent Destination"];
const STREAM_TO_DESTINATION_TYPE = {
  Profile: "Profile Destination",
  Event: "Event Destination",
  Audience: "Audience Destination",
  Message: "Communication Destination",
  Consent: "Consent Destination",
};
export function classifyDestinationType(connectionAccount) {
  return STREAM_TO_DESTINATION_TYPE[connectionAccount.dataStream] || "Destination";
}

// Which delivery modes a Data Stream can use — a Connection Account's
// deliveryConfig.mode is always one of these for its own dataStream.
export const STREAM_DELIVERY_OPTIONS = {
  Profile: ["Batch", "Stream"],
  Event: ["Stream", "Batch"],
  Audience: ["Batch"],
  Message: ["Message"],
  Consent: ["Batch", "Stream"],
};

// Event categories/properties — Behavior is one of these, never a
// top-level Data Stream. Sourced entirely from the canonical Event
// Catalog (js/data/events.js, Phase 13) rather than a second event
// model; this module only re-exports what Activation's Event data
// stream picker already expected these names to mean.
export { EVENT_CATEGORIES, eventsByCategory };
const EVENT_PROPERTIES = EVENT_PROPERTIES_MAP;
export { EVENT_PROPERTIES };

// Profile Attribute catalog — grouped, with sensitive identity fields
// explicitly opt-in and financial fields always privacy-aware (banded,
// never an exact amount).
export const PROFILE_ATTRIBUTE_GROUPS = [
  {
    group: "Identity",
    attributes: [
      { id: "accountId", label: "Account ID", sensitive: false, defaultChecked: true },
      { id: "mobileNumber", label: "Mobile Number", sensitive: true, defaultChecked: false },
      { id: "emailAddress", label: "Email Address", sensitive: true, defaultChecked: false },
      { id: "zaloId", label: "Zalo ID", sensitive: true, defaultChecked: false },
      { id: "appsflyerId", label: "AppsFlyer ID", sensitive: true, defaultChecked: false },
    ],
  },
  {
    group: "Customer Attributes",
    attributes: [
      { id: "customerTier", label: "Customer Tier", defaultChecked: true },
      { id: "lifecycleStage", label: "Lifecycle Stage", defaultChecked: true },
      { id: "riskProfile", label: "Risk Profile", defaultChecked: true },
      { id: "location", label: "Location", defaultChecked: true },
      { id: "preferredChannel", label: "Preferred Channel", defaultChecked: true },
      { id: "preferredLanguage", label: "Preferred Language", defaultChecked: true },
      { id: "gender", label: "Gender", defaultChecked: false },
      { id: "birthday", label: "Birthday", defaultChecked: true, note: "Day + Month only" },
    ],
  },
  {
    group: "Financial / Aggregated",
    attributes: [
      { id: "portfolioValueBand", label: "Portfolio Value Band", banded: true, defaultChecked: false },
      { id: "tradingValueBand", label: "Trading Value Band", banded: true, defaultChecked: false },
      { id: "depositValueBand", label: "Deposit Value Band", banded: true, defaultChecked: false },
      { id: "orderValueBand", label: "Order Value Band", banded: true, defaultChecked: false },
    ],
  },
];
export const PROFILE_ATTRIBUTES = PROFILE_ATTRIBUTE_GROUPS.flatMap((g) => g.attributes);
export function getProfileAttribute(id) {
  return PROFILE_ATTRIBUTES.find((a) => a.id === id);
}
export function defaultProfileAttributeIds() {
  return PROFILE_ATTRIBUTES.filter((a) => a.defaultChecked).map((a) => a.id);
}

export const CONSENT_TYPES = ["Marketing", "Analytics", "Personalization"];
export const CONSENT_CHANNELS = ["Email", "Push", "SMS", "Zalo"];
export const CONSENT_STATES = ["Granted", "Denied", "Pending"];
export const MESSAGE_CHANNELS = ["Email", "Push", "In-App", "Web Message", "SMS", "Zalo"];
export const AUDIENCE_MEMBERSHIP_MODES = ["Dynamic", "Batch Snapshot"];

/* ---------------------------------------------------------------- */
/* Providers — connector types. Each Connection Account below belongs */
/* to exactly one Provider; a Provider's `capabilities` list is the   */
/* set of Data Streams a NEW Connection Account for it may choose.    */
/* ---------------------------------------------------------------- */
export const PROVIDERS = [
  { id: "meta-ads", name: "Meta Ads", category: "Advertising", capabilities: ["Audience", "Event"] },
  { id: "google-ads", name: "Google Ads", category: "Advertising", capabilities: ["Audience"] },
  { id: "crm", name: "CRM", category: "CRM / Business", capabilities: ["Profile", "Consent"] },
  { id: "webhook", name: "Webhook", category: "CRM / Business", capabilities: ["Event", "Profile"] },
  { id: "email", name: "Email", category: "Customer Engagement", capabilities: ["Message"] },
  { id: "push", name: "Push", category: "Customer Engagement", capabilities: ["Message"] },
  { id: "in-app", name: "In-App", category: "Customer Engagement", capabilities: ["Message"] },
  { id: "web-message", name: "Web Message", category: "Customer Engagement", capabilities: ["Message"] },
  { id: "sms", name: "SMS", category: "Customer Engagement", capabilities: ["Message"] },
  { id: "zalo", name: "Zalo", category: "Customer Engagement", capabilities: ["Profile", "Message", "Audience"] },
  { id: "n8n", name: "n8n", category: "CRM / Business", capabilities: ["Event"] },
  { id: "http-api", name: "HTTP API", category: "CRM / Business", capabilities: ["Event", "Profile"] },
  { id: "analytics-platform", name: "Analytics Platform", category: "Analytics / Data", capabilities: ["Event"] },
  { id: "data-warehouse", name: "Data Warehouse", category: "Analytics / Data", capabilities: ["Profile", "Event"] },
  { id: "custom-api", name: "Custom API", category: "Analytics / Data", capabilities: ["Event", "Profile"] },
  { id: "consent-platform", name: "Consent Platform", category: "CRM / Business", capabilities: ["Consent"] },
  { id: "mautic", name: "Mautic", category: "CRM / Business", capabilities: ["Audience", "Profile", "Message"] },
];
export function getProvider(name) {
  return PROVIDERS.find((p) => p.name === name);
}
export function providerCapabilities(name) {
  return getProvider(name)?.capabilities || DATA_STREAMS;
}

/* ---------------------------------------------------------------- */
/* Shared Destination Configuration schema — the SAME field set is    */
/* used to build the Add Destination form and the Edit Destination    */
/* page. Which fields render depends only on the account's `provider` */
/* (its connector type) and its (fixed after creation) `dataStream` —  */
/* never on whether the caller is creating or editing — see            */
/* js/pages/destinations.js's renderDestinationConfigForm().           */
/* ---------------------------------------------------------------- */
export const AUTH_TYPES = ["None", "API Key", "Bearer Token", "Basic Auth"];
export const HTTP_METHODS_WEBHOOK = ["POST", "PUT"];
export const HTTP_METHODS_API = ["POST", "PUT", "PATCH"];
export const SYNC_FREQUENCIES = ["Every hour", "Every 6 hours", "Daily"];
/**
 * ADVANCED_FIELD_DEFS — maps directly to RudderStack self-hosted workspaceConfig fields.
 *
 * Each entry:
 *   key        → field key stored in advancedConfig AND sent to BFF/workspaceConfig
 *   rsKey      → actual RudderStack config key (for documentation/mapping)
 *   label      → UI label (business-friendly)
 *   type       → "select" | "number" | "toggle"
 *   options    → for type "select"
 *   min/max    → for type "number"
 *   hint       → shown below the field
 *   scope      → which destination types this applies to ("all" | "warehouse" | "streaming" | "webhook")
 */
export const ADVANCED_FIELD_DEFS = [
  {
    key: "requestTimeout", rsKey: "requestTimeout", label: "Request Timeout",
    type: "select", scope: "all",
    options: ["5000", "10000", "30000", "60000"],
    optionLabels: ["5 seconds", "10 seconds (default)", "30 seconds", "60 seconds"],
    hint: "Maximum time (ms) to wait for a response from the destination before retrying.",
  },
  {
    key: "maxAttempts", rsKey: "maxAttempts", label: "Retry Attempts",
    type: "select", scope: "all",
    options: ["0", "1", "3", "5", "10"],
    optionLabels: ["No retry", "1 attempt", "3 attempts (default)", "5 attempts", "10 attempts"],
    hint: "Number of times to retry a failed event delivery. Uses exponential backoff.",
  },
  {
    key: "noOfWorkers", rsKey: "noOfWorkers", label: "Parallel Workers",
    type: "select", scope: "all",
    options: ["1", "2", "4", "8", "16", "32"],
    optionLabels: ["1 worker", "2 workers", "4 workers (default)", "8 workers", "16 workers", "32 workers"],
    hint: "Number of concurrent workers sending events to this destination.",
  },
  {
    key: "maxBatchSize", rsKey: "maxBatchSize", label: "Max Batch Size",
    type: "select", scope: "streaming",
    options: ["100", "500", "1000", "5000", "10000"],
    optionLabels: ["100 events", "500 events", "1,000 events (default)", "5,000 events", "10,000 events"],
    hint: "Maximum number of events sent in a single batch request.",
  },
  {
    key: "uploadFreq", rsKey: "uploadFreq", label: "Upload Frequency",
    type: "select", scope: "warehouse",
    options: ["1800", "3600", "7200", "21600", "86400"],
    optionLabels: ["Every 30 min", "Every 1 hour (default)", "Every 2 hours", "Every 6 hours", "Every 24 hours"],
    hint: "How often to upload batched events to the data warehouse.",
  },
  {
    key: "warehouseSyncFreq", rsKey: "warehouseSyncFreq", label: "Warehouse Sync Frequency",
    type: "select", scope: "warehouse",
    options: ["30", "60", "180", "360", "720", "1440"],
    optionLabels: ["30 minutes", "1 hour (default)", "3 hours", "6 hours", "12 hours", "24 hours"],
    hint: "Frequency (in minutes) for syncing data from staging to warehouse tables.",
  },
  {
    key: "enableDedup", rsKey: "enableDedup", label: "Event Deduplication",
    type: "toggle", scope: "all",
    hint: "Deduplicate events by messageId before sending to avoid double-processing.",
  },
  {
    key: "skipTracksTable", rsKey: "skipTracksTable", label: "Skip Tracks Table",
    type: "toggle", scope: "warehouse",
    hint: "Do not write to the generic 'tracks' table — only write to event-specific tables.",
  },
  {
    key: "skipUsersTable", rsKey: "skipUsersTable", label: "Skip Users Table",
    type: "toggle", scope: "warehouse",
    hint: "Do not maintain a users/profiles table in the warehouse.",
  },
];

/** Map destinationDefinitionId → scope for filtering advanced fields */
export const DEST_ADVANCED_SCOPE = {
  POSTGRES:  "warehouse",
  BIGQUERY:  "warehouse",
  REDSHIFT:  "warehouse",
  SNOWFLAKE: "warehouse",
  MAUTIC:    "streaming",
  WEBHOOK:   "streaming",
  AMPLITUDE: "streaming",
  MIXPANEL:  "streaming",
};


// Connection field sets, one per "connection kind" — Webhook and HTTP
// API intentionally stay distinct (different concepts, section 9).
export const CONNECTION_KIND_FIELDS = {
  webhook: [
    { key: "webhookUrl", label: "Webhook URL", type: "url", required: true, placeholder: "https://example.com/webhooks/phs" },
    { key: "method", label: "HTTP Method", type: "select", options: HTTP_METHODS_WEBHOOK, required: true },
    { key: "headers", label: "Headers", type: "headers" },
    { key: "authType", label: "Authentication", type: "authType" },
  ],
  httpApi: [
    { key: "baseUrl", label: "Base URL", type: "url", required: true, placeholder: "https://api.example.com" },
    { key: "method", label: "HTTP Method", type: "select", options: HTTP_METHODS_API, required: true },
    { key: "authType", label: "Authentication", type: "authType" },
    { key: "headers", label: "Headers", type: "headers" },
  ],
  account: [
    { key: "account", label: "Account", type: "text", required: true, placeholder: "e.g. PHS Marketing Account" },
    { key: "authType", label: "Authentication", type: "authType" },
  ],
  accountUrl: [
    { key: "account", label: "Account", type: "text", required: true, placeholder: "e.g. PHS CRM Instance" },
    { key: "apiBaseUrl", label: "API Base URL", type: "url" },
    { key: "authType", label: "Authentication", type: "authType" },
  ],
  provider: [
    { key: "account", label: "Provider / Account", type: "text", required: true, placeholder: "e.g. Transactional Email Provider" },
    { key: "authType", label: "Authentication", type: "authType" },
  ],
};

// Which connection kind each catalog provider uses.
export const PROVIDER_CONNECTION_KIND = {
  "Meta Ads": "account",
  "Google Ads": "account",
  "Analytics Platform": "account",
  "Data Warehouse": "account",
  "PostgreSQL": "account",
  "BigQuery": "account",
  "Snowflake": "account",
  "Amazon S3": "account",
  "Amplitude": "account",
  "Google Analytics 4": "account",
  "Mixpanel": "account",
  "Mautic": "accountUrl",
  CRM: "accountUrl",
  "Slack": "accountUrl",
  n8n: "webhook",
  Webhook: "webhook",
  "HTTP API": "httpApi",
  "Custom API": "httpApi",
  Email: "provider",
  Push: "provider",
  "In-App": "provider",
  "Web Message": "provider",
  SMS: "provider",
  Zalo: "provider",
  "Consent Platform": "provider",
};

export function getConnectionKind(providerName) {
  return PROVIDER_CONNECTION_KIND[providerName] || "account";
}
export function getConnectionFields(providerName) {
  return CONNECTION_KIND_FIELDS[getConnectionKind(providerName)];
}

/* ---------------------------------------------------------------- */
/* Connector activity date range — shared by the Destinations and    */
/* Sources tables/detail pages. Presets resolve to a day count;       */
/* "Custom range" resolves from explicit from/to dates.               */
/* ---------------------------------------------------------------- */
export const DATE_RANGE_PRESETS = ["Today", "Yesterday", "Last 7 days", "Last 30 days", "Last 90 days", "Custom range"];
const PRESET_DAYS = { Today: 1, Yesterday: 1, "Last 7 days": 7, "Last 30 days": 30, "Last 90 days": 90 };
export const MOCK_TODAY = "23 Sep 2026";

export function resolveDateRangeDays(dateFilter) {
  if (!dateFilter) return 7;
  if (dateFilter.preset === "Custom range" && dateFilter.from && dateFilter.to) {
    const from = new Date(dateFilter.from);
    const to = new Date(dateFilter.to);
    const diff = Math.round((to - from) / 86400000) + 1;
    return Math.max(1, diff);
  }
  return PRESET_DAYS[dateFilter.preset] ?? 7;
}

function hashString(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) >>> 0;
  return h;
}

export const DELIVERY_MODE_INFO = {
  Batch: "Periodic audience/profile synchronization.",
  Stream: "Near-real-time event/profile forwarding.",
  Message: "Customer-facing communication.",
};

export const STATUS_META = {
  Connected: { dot: "status-dot--success", badge: "badge--success", indicator: "●" },
  Available: { dot: "", badge: "badge--neutral", indicator: "○" },
  Paused: { dot: "status-dot--warning", badge: "badge--warning", indicator: "●" },
  Error: { dot: "status-dot--danger", badge: "badge--danger", indicator: "●" },
  Draft: { dot: "", badge: "badge--neutral", indicator: "○" },
};

// Icons reused verbatim from js/data/dataflows.js's SYSTEM_ICONS where
// the same system name already has an established icon elsewhere in
// the app — a destination is the same real-world system, so it should
// look the same everywhere it appears. Keyed by PROVIDER name.
export const DESTINATION_ICONS = {
  Email: "mail",
  Push: "bell",
  "In-App": "message-square",
  "Web Message": "monitor",
  SMS: "phone",
  Zalo: "message-circle",
  "Meta Ads": "megaphone",
  "Google Ads": "search",
  CRM: "building-2",
  n8n: "workflow",
  Webhook: "webhook",
  "HTTP API": "server",
  "Analytics Platform": "bar-chart-3",
  "Data Warehouse": "database",
  "Mautic": "api",
  "Custom API": "braces",
  "Consent Platform": "shield-check",
};

// The technical capability matrix shown on a Connection Account's
// Overview panel — derived from its (single) dataStream and delivery
// mode, never hand-tagged, so it can never drift out of sync.
export const CAPABILITY_ROWS = ["Audience Sync", "Profile Sync", "Event Forwarding", "Consent Sync", "Message", "Batch", "Stream"];
const STREAM_TO_CAPABILITY = { Audience: "Audience Sync", Profile: "Profile Sync", Event: "Event Forwarding", Consent: "Consent Sync", Message: "Message" };
export function isCapabilitySupported(connectionAccount, row) {
  return STREAM_TO_CAPABILITY[connectionAccount.dataStream] === row || connectionAccount.deliveryConfig.mode === row;
}

/* ---------------------------------------------------------------- */
/* Data Mapping — depends on Data Stream, not on the individual        */
/* connection account, so it's never duplicated per instance.          */
/* ---------------------------------------------------------------- */
const MAPPING_AUDIENCE = [
  { cdp: "Audience ID", dest: "External Audience ID" },
  { cdp: "Membership", dest: "Audience Membership" },
  { cdp: "Customer ID", dest: "External ID" },
];
const MAPPING_PROFILE_BASE = [
  { cdp: "Customer Tier", dest: "customer_tier" },
  { cdp: "Lifecycle Stage", dest: "lifecycle_stage" },
  { cdp: "Location", dest: "location" },
  { cdp: "Birthday", dest: "birthday" },
];
const MAPPING_EVENT_BASE = [
  { cdp: "event_name", dest: "event_name" },
  { cdp: "timestamp", dest: "timestamp" },
];
const MAPPING_MESSAGE = [
  { cdp: "Template", dest: "Message Template" },
  { cdp: "Customer", dest: "Recipient" },
  { cdp: "Channel", dest: "Channel" },
];
const MAPPING_CONSENT = [
  { cdp: "Consent Type", dest: "Consent Type" },
  { cdp: "Status", dest: "Status" },
  { cdp: "Last Updated", dest: "Timestamp" },
];

/** Data Mapping rows for a Connection Account — keyed by its Data
 * Stream. Profile only shows the CDP fields the account actually
 * selected; Event includes the properties of whichever selected
 * event(s) define them (e.g. Place Order -> instrument/side/quantity),
 * never a second, hand-authored mapping table. */
export function mappingRowsForAccount(d) {
  if (d.dataStream === "Profile") {
    const selected = new Set(d.dataSelection.attributeIds || []);
    return MAPPING_PROFILE_BASE.filter((row) => {
      const attr = PROFILE_ATTRIBUTES.find((a) => a.label === row.cdp);
      return !attr || selected.has(attr.id);
    }).concat(
      PROFILE_ATTRIBUTES.filter((a) => selected.has(a.id) && !MAPPING_PROFILE_BASE.some((r) => r.cdp === a.label)).map((a) => ({
        cdp: a.label,
        dest: a.id,
      }))
    );
  }
  if (d.dataStream === "Event") {
    const rows = [...MAPPING_EVENT_BASE];
    const eventIds = d.dataSelection.mode === "all" ? Object.keys(EVENT_PROPERTIES) : d.dataSelection.eventIds || [];
    eventIds.forEach((eventName) => {
      const props = (d.dataSelection.eventProperties || {})[eventName] || (EVENT_PROPERTIES[eventName] || []).map((p) => p.key);
      (EVENT_PROPERTIES[eventName] || [])
        .filter((p) => props.includes(p.key))
        .forEach((p) => {
          if (!rows.some((r) => r.dest === p.key)) rows.push({ cdp: p.label, dest: p.key });
        });
    });
    return rows;
  }
  if (d.dataStream === "Audience") return MAPPING_AUDIENCE;
  if (d.dataStream === "Message") return MAPPING_MESSAGE;
  if (d.dataStream === "Consent") return MAPPING_CONSENT;
  return [];
}

function activity(entries) {
  return entries.map(([time, text]) => ({ time, text }));
}

/* ---------------------------------------------------------------- */
/* Destinations — one Connection Account per entry, each with exactly */
/* one Data Stream. Multiple entries may share the same `provider`.   */
/* ---------------------------------------------------------------- */
export const DESTINATIONS = [
  {
    id: "meta-ads",
    name: "PHS Meta Ads — Audience",
    provider: "Meta Ads",
    category: "Advertising",
    purpose: "Audience activation",
    status: "Connected",
    dataStream: "Audience",
    dataSelection: { mode: "selected", audienceIds: ["Dormant Investors", "High Value Customers", "High Engagement — No Recent Trade"], membershipMode: "Dynamic" },
    lastSync: "18 Sep 2026 · 09:42",
    configuration: [
      { label: "Account", value: "PHS Marketing Account" },
      { label: "Connection", value: "Connected" },
      { label: "Authentication", value: "Configured" },
      { label: "Access Token", value: "••••••••••••", masked: true },
    ],
    audiences: ["Dormant Investors", "High Value Customers", "High Engagement — No Recent Trade"],
    journeys: ["Dormant Investor Re-engagement", "High Value Investor Engagement"],
    dataFlowId: "flow-out-meta",
    activity: activity([
      ["18 Sep 2026 · 09:42", "Audience sync completed"],
      ["18 Sep 2026 · 09:30", "2,184 records activated"],
      ["17 Sep 2026 · 18:10", "Audience sync completed"],
      ["16 Sep 2026 · 09:15", "Audience sync completed"],
    ]),
  },
  {
    id: "google-ads",
    name: "PHS Google Ads — Audience",
    provider: "Google Ads",
    category: "Advertising",
    purpose: "Audience activation",
    status: "Error",
    dataStream: "Audience",
    dataSelection: { mode: "selected", audienceIds: ["High Value Customers"], membershipMode: "Dynamic" },
    lastSync: "6 hours ago",
    lastSuccessfulSync: "17 Sep 2026 · 18:10",
    error: "Authentication expired",
    configuration: [
      { label: "Account", value: "PHS Ads Account" },
      { label: "Connection", value: "Error — Authentication expired" },
      { label: "Authentication", value: "Expired" },
      { label: "OAuth Token", value: "••••••••••••", masked: true },
    ],
    audiences: ["High Value Customers"],
    journeys: [],
    dataFlowId: "flow-out-google",
    activity: activity([
      ["18 Sep 2026 · 03:00", "Sync failed — authentication expired"],
      ["17 Sep 2026 · 18:10", "Audience sync completed"],
      ["16 Sep 2026 · 18:04", "Audience sync completed"],
    ]),
  },
  {
    id: "crm",
    name: "PHS CRM — Profile",
    provider: "CRM",
    category: "CRM / Business",
    purpose: "Customer profile synchronization",
    status: "Connected",
    dataStream: "Profile",
    dataSelection: { attributeIds: ["accountId", "customerTier", "lifecycleStage", "location", "preferredChannel", "preferredLanguage", "birthday"] },
    lastSync: "18 Sep 2026 · 09:35",
    configuration: [
      { label: "Account", value: "PHS CRM Instance" },
      { label: "Connection", value: "Connected" },
      { label: "Authentication", value: "Configured" },
      { label: "API Key", value: "••••••••••••", masked: true },
    ],
    audiences: ["Active Mobile Investors", "Recently Registered"],
    journeys: ["New Investor Onboarding", "Post Trade Engagement"],
    dataFlowId: "flow-out-crm",
    activity: activity([
      ["18 Sep 2026 · 09:35", "Profile sync completed"],
      ["18 Sep 2026 · 06:00", "1,284,392 profiles synchronized"],
      ["17 Sep 2026 · 06:00", "Profile sync completed"],
    ]),
  },
  {
    id: "webhook",
    name: "PHS Webhook — Event",
    provider: "Webhook",
    category: "CRM / Business",
    purpose: "Event forwarding",
    status: "Connected",
    dataStream: "Event",
    dataSelection: { mode: "all", eventIds: [], eventProperties: {} },
    lastSync: "18 Sep 2026 · 09:31",
    configuration: [
      { label: "Endpoint", value: "https://partner.example.com/webhooks/cdp-events" },
      { label: "Connection", value: "Connected" },
      { label: "Webhook Secret", value: "••••••••••••", masked: true },
    ],
    audiences: [],
    journeys: [],
    dataFlowId: "flow-out-webhook",
    activity: activity([
      ["18 Sep 2026 · 09:31", "96,340 events forwarded"],
      ["18 Sep 2026 · 08:00", "Event stream healthy"],
      ["17 Sep 2026 · 09:12", "96,340 events forwarded"],
    ]),
  },
  {
    id: "email",
    name: "PHS Email — Marketing",
    provider: "Email",
    category: "Customer Engagement",
    purpose: "Customer communication",
    status: "Connected",
    dataStream: "Message",
    dataSelection: { channel: "Email", template: "Marketing Update", consentRequirement: "Marketing Consent" },
    consentRequired: "Marketing Consent",
    lastSync: "18 Sep 2026 · 09:28",
    configuration: [
      { label: "Provider", value: "Transactional Email Provider" },
      { label: "Connection", value: "Connected" },
      { label: "API Key", value: "••••••••••••", masked: true },
    ],
    audiences: ["Marketing Consent — Email", "Birthday — Next 30 Days"],
    journeys: ["Birthday Engagement", "Dormant Investor Re-engagement", "Email Consent Nurture", "Q2 Birthday Campaign"],
    dataFlowId: "flow-out-email",
    activity: activity([
      ["18 Sep 2026 · 09:28", "54,812 messages sent"],
      ["18 Sep 2026 · 08:00", "Campaign batch delivered"],
      ["17 Sep 2026 · 09:00", "54,812 messages sent"],
    ]),
  },
  {
    id: "push",
    name: "PHS Push — Engagement",
    provider: "Push",
    category: "Customer Engagement",
    purpose: "Customer communication",
    status: "Connected",
    dataStream: "Message",
    dataSelection: { channel: "Push", template: "Engagement Nudge", consentRequirement: "Marketing Consent" },
    consentRequired: "Marketing Consent",
    lastSync: "18 Sep 2026 · 09:15",
    configuration: [
      { label: "Provider", value: "Push Notification Provider" },
      { label: "Connection", value: "Connected" },
      { label: "Server Key", value: "••••••••••••", masked: true },
    ],
    audiences: [],
    journeys: ["Birthday Engagement", "High Value Investor Engagement", "Mobile Engagement Boost"],
    dataFlowId: "flow-out-push",
    activity: activity([
      ["18 Sep 2026 · 09:15", "214,600 notifications sent"],
      ["17 Sep 2026 · 09:15", "214,600 notifications sent"],
    ]),
  },
  {
    id: "in-app",
    name: "PHS In-App — Engagement",
    provider: "In-App",
    category: "Customer Engagement",
    purpose: "Customer communication",
    status: "Connected",
    dataStream: "Message",
    dataSelection: { channel: "In-App", template: "Engagement Nudge", consentRequirement: "Marketing Consent" },
    consentRequired: "Marketing Consent",
    lastSync: "18 Sep 2026 · 09:10",
    configuration: [
      { label: "Provider", value: "Mobile App SDK" },
      { label: "Connection", value: "Connected" },
    ],
    audiences: [],
    journeys: ["Birthday Engagement", "High Value Investor Engagement"],
    dataFlowId: null,
    activity: activity([
      ["18 Sep 2026 · 09:10", "In-app messages delivered"],
      ["17 Sep 2026 · 09:10", "In-app messages delivered"],
    ]),
  },
  {
    id: "web-message",
    name: "PHS Web Message — Engagement",
    provider: "Web Message",
    category: "Customer Engagement",
    purpose: "Customer communication",
    status: "Available",
    dataStream: "Message",
    dataSelection: { channel: "Web Message", template: "", consentRequirement: "Marketing Consent" },
    consentRequired: "Marketing Consent",
    lastSync: "—",
    configuration: [
      { label: "Provider", value: "Website Messaging Widget" },
      { label: "Connection", value: "Not yet connected" },
    ],
    audiences: [],
    journeys: ["Re-engage High Engagement Non-Traders"],
    dataFlowId: null,
    activity: [],
  },
  {
    id: "sms",
    name: "PHS SMS — Alerts",
    provider: "SMS",
    category: "Customer Engagement",
    purpose: "Customer communication",
    status: "Paused",
    dataStream: "Message",
    dataSelection: { channel: "SMS", template: "Account Alert", consentRequirement: "Marketing Consent" },
    consentRequired: "Marketing Consent",
    lastSync: "15 Sep 2026 · 09:00",
    configuration: [
      { label: "Provider", value: "SMS Gateway" },
      { label: "Connection", value: "Paused" },
      { label: "API Key", value: "••••••••••••", masked: true },
    ],
    audiences: [],
    journeys: ["Platinum Tier Upsell"],
    dataFlowId: null,
    activity: activity([
      ["15 Sep 2026 · 09:00", "Destination paused by CRM Team"],
      ["12 Sep 2026 · 09:00", "12,048 messages sent"],
    ]),
  },
  {
    id: "zalo",
    name: "PHS Zalo — Official Account",
    provider: "Zalo",
    category: "Customer Engagement",
    purpose: "Customer communication",
    status: "Connected",
    dataStream: "Message",
    dataSelection: { channel: "Zalo", template: "Reactivation Greeting", consentRequirement: "Marketing Consent" },
    consentRequired: "Marketing Consent",
    lastSync: "15 Sep 2026 · 09:00",
    configuration: [
      { label: "Account", value: "PHS Official Account" },
      { label: "Connection", value: "Connected" },
      { label: "OA Access Token", value: "••••••••••••", masked: true },
    ],
    audiences: [],
    journeys: ["Spring Reactivation"],
    dataFlowId: "flow-out-zalo",
    activity: activity([
      ["15 Sep 2026 · 09:00", "42,180 messages sent"],
      ["12 Sep 2026 · 09:00", "42,180 messages sent"],
    ]),
  },
  {
    id: "n8n",
    name: "PHS n8n — Event",
    provider: "n8n",
    category: "CRM / Business",
    purpose: "Workflow automation trigger",
    status: "Connected",
    dataStream: "Event",
    dataSelection: { mode: "all", eventIds: [], eventProperties: {} },
    lastSync: "18 Sep 2026 · 09:10",
    configuration: [
      { label: "Endpoint", value: "https://n8n.phs.example/webhook/cdp-trigger" },
      { label: "Connection", value: "Connected" },
      { label: "Webhook Secret", value: "••••••••••••", masked: true },
    ],
    audiences: [],
    journeys: [],
    dataFlowId: "flow-out-n8n",
    activity: activity([
      ["18 Sep 2026 · 09:10", "61,204 events forwarded"],
      ["17 Sep 2026 · 09:10", "61,204 events forwarded"],
    ]),
  },
  {
    id: "http-api",
    name: "PHS HTTP API — Event",
    provider: "HTTP API",
    category: "CRM / Business",
    purpose: "Custom API operation",
    status: "Available",
    dataStream: "Event",
    dataSelection: { mode: "all", eventIds: [], eventProperties: {} },
    lastSync: "—",
    configuration: [
      { label: "Endpoint", value: "https://api.example.com/customers" },
      { label: "Connection", value: "Not yet connected" },
      { label: "API Key", value: "••••••••••••", masked: true },
    ],
    audiences: [],
    journeys: [],
    dataFlowId: null,
    activity: [],
  },
  {
    id: "analytics-platform",
    name: "PHS Analytics Platform — Event",
    provider: "Analytics Platform",
    category: "Analytics / Data",
    purpose: "Behavioral analytics forwarding",
    status: "Connected",
    dataStream: "Event",
    dataSelection: { mode: "all", eventIds: [], eventProperties: {} },
    lastSync: "18 Sep 2026 · 09:05",
    configuration: [
      { label: "Property", value: "PHS CDP — Production" },
      { label: "Connection", value: "Connected" },
      { label: "API Secret", value: "••••••••••••", masked: true },
    ],
    audiences: [],
    journeys: [],
    dataFlowId: null,
    activity: activity([
      ["18 Sep 2026 · 09:05", "Event stream healthy"],
      ["17 Sep 2026 · 09:05", "Event stream healthy"],
    ]),
  },
  {
    id: "data-warehouse",
    name: "PHS Data Warehouse — Profile",
    provider: "Data Warehouse",
    category: "Analytics / Data",
    purpose: "Customer profile synchronization",
    status: "Available",
    dataStream: "Profile",
    dataSelection: { attributeIds: defaultProfileAttributeIds() },
    lastSync: "—",
    configuration: [
      { label: "Warehouse", value: "PHS Analytics Warehouse" },
      { label: "Connection", value: "Not yet connected" },
      { label: "Service Account Key", value: "••••••••••••", masked: true },
    ],
    audiences: [],
    journeys: [],
    dataFlowId: null,
    activity: [],
  },
  // A second, independent connection account for Data Warehouse — it
  // supports both Profile and Event (see PROVIDERS above); this Event
  // account is separate from the Profile one, per the 1-account-=-
  // 1-stream rule. Added for Phase 13.1's Event Streams module.
  {
    id: "data-warehouse-event",
    name: "PHS Data Warehouse — Event",
    provider: "Data Warehouse",
    category: "Analytics / Data",
    purpose: "Event archival",
    status: "Connected",
    dataStream: "Event",
    dataSelection: { mode: "all", eventIds: [], eventProperties: {} },
    lastSync: "24 Sep 2026 · 06:00",
    configuration: [
      { label: "Warehouse", value: "PHS Analytics Warehouse" },
      { label: "Connection", value: "Connected" },
      { label: "Service Account Key", value: "••••••••••••", masked: true },
    ],
    audiences: [],
    journeys: [],
    dataFlowId: null,
    activity: [],
  },
  {
    id: "custom-api",
    name: "PHS Custom API — Profile",
    provider: "Custom API",
    category: "Analytics / Data",
    purpose: "Custom API operation",
    status: "Draft",
    dataStream: "Profile",
    dataSelection: { attributeIds: defaultProfileAttributeIds() },
    lastSync: "—",
    configuration: [
      { label: "Endpoint", value: "" },
      { label: "Connection", value: "Draft — not configured" },
      { label: "API Key", value: "••••••••••••", masked: true },
    ],
    audiences: [],
    journeys: [],
    dataFlowId: null,
    activity: [],
  },
  {
    id: "consent-platform",
    name: "PHS Consent — Compliance",
    provider: "Consent Platform",
    category: "CRM / Business",
    purpose: "Consent state synchronization",
    status: "Available",
    dataStream: "Consent",
    dataSelection: { types: ["Marketing", "Analytics"], channels: ["Email", "Push"] },
    lastSync: "—",
    configuration: [
      { label: "Provider / Account", value: "PHS Consent Registry" },
      { label: "Connection", value: "Not yet connected" },
    ],
    audiences: [],
    journeys: [],
    dataFlowId: null,
    activity: [],
  },
  // ── Real RudderStack destinations (IDs match workspaceConfig.json) ──────────
  {
    id: "phs-mautic-dest",
    name: "Mautic Marketing",
    provider: "Mautic",
    category: "CRM / Business",
    purpose: "Marketing automation & audience activation",
    status: "Connected",
    dataStream: "Audience",
    dataSelection: { mode: "all", audienceIds: [], membershipMode: "Dynamic" },
    lastSync: "—",
    connection: { account: "http://100.117.24.87:8081", apiBaseUrl: "http://100.117.24.87:8081", authType: "API Key" },
    configuration: [
      { label: "URL", value: "http://100.117.24.87:8081" },
      { label: "Connection", value: "Connected" },
      { label: "Authentication", value: "Configured", masked: true },
    ],
    audiences: [],
    journeys: [],
    dataFlowId: null,
    deliveryConfig: { mode: "Stream", syncFrequency: null },
    connectionConfig: { account: "Mautic Marketing" },
    consentConfig: { required: false, activationPolicy: "Follows workspace data-use policy for audiences." },
    mappingConfig: { mappings: [] },
    activity: [
      { time: "22 Oct 2026 · 00:00", text: "Destination configured via RudderStack" },
    ],
  },
  {
    id: "phs-postgres-dest",
    name: "PHS Data Warehouse",
    provider: "Data Warehouse",
    category: "Analytics / Data",
    purpose: "Customer event & profile storage",
    status: "Connected",
    dataStream: "Event",
    dataSelection: { mode: "all", eventIds: [], eventProperties: {} },
    lastSync: "—",
    connection: { account: "rudder_warehouse @ 100.117.24.87", authType: "API Key" },
    configuration: [
      { label: "Host", value: "100.117.24.87" },
      { label: "Database", value: "rudder_warehouse" },
      { label: "Connection", value: "Connected" },
    ],
    audiences: [],
    journeys: [],
    dataFlowId: null,
    deliveryConfig: { mode: "Batch", syncFrequency: "Every hour" },
    connectionConfig: { account: "PHS Data Warehouse" },
    consentConfig: { required: false, activationPolicy: "Follows workspace data-use policy for events." },
    mappingConfig: { mappings: [] },
    activity: [
      { time: "22 Oct 2026 · 00:00", text: "Destination configured via RudderStack" },
    ],
  },
  {
    id: "phs-webhook-dest",
    name: "PHS Internal Webhook",
    provider: "Webhook",
    category: "Integration",
    purpose: "Internal event forwarding",
    status: "Disconnected",
    dataStream: "Event",
    dataSelection: { mode: "all", eventIds: [], eventProperties: {} },
    lastSync: "—",
    connection: { webhookUrl: "http://100.117.24.87:9000/webhook/events", method: "POST", headers: [], authType: "None" },
    configuration: [
      { label: "Endpoint", value: "http://100.117.24.87:9000/webhook/events" },
      { label: "Connection", value: "Not connected" },
    ],
    audiences: [],
    journeys: [],
    dataFlowId: null,
    deliveryConfig: { mode: "Stream", syncFrequency: null },
    connectionConfig: {},
    consentConfig: { required: false, activationPolicy: "Follows workspace data-use policy for events." },
    mappingConfig: { mappings: [] },
    activity: [],
  },
];

// Mock 7-day baseline user counts — the two flagship examples the spec
// gives exact numbers for are used verbatim; the rest are deterministic
// (hash-derived) so they never need hand-maintaining as destinations
// are added, but stay stable across renders/sessions.
const USERS_BASE_OVERRIDES = { "meta-ads": 231420, webhook: 84219 };
function baseUsersFor(id, status) {
  if (USERS_BASE_OVERRIDES[id] != null) return USERS_BASE_OVERRIDES[id];
  if (status === "Available" || status === "Draft") return 0;
  return 4000 + (hashString(id) % 60000);
}

// createdAt / lastEdit — deterministic mock dates, spread out so the
// table doesn't read as every connector having been set up on the
// same day.
// Fixed 3-letter month table — Intl's en-GB short month for September
// renders as "Sept" (4 letters) in some locale data, inconsistent with
// every other hand-authored date in the app ("18 Sep 2026").
const MONTHS_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
export function formatMockDate(d) {
  return `${String(d.getDate()).padStart(2, "0")} ${MONTHS_SHORT[d.getMonth()]} ${d.getFullYear()}`;
}
function mockDateOffset(id, minDays, maxDays) {
  const span = maxDays - minDays;
  const days = minDays + (hashString(id + "-date") % span);
  const d = new Date(2026, 8, 23); // 23 Sep 2026
  d.setDate(d.getDate() - days);
  return formatMockDate(d);
}

/* ---------------------------------------------------------------- */
/* Legacy -> structured configuration migration. Each connection      */
/* account already carries a flat `configuration` array (label/value  */
/* pairs) built for the old read-only display. Rather than hand-      */
/* author 16 new nested `connection` objects (a second source of      */
/* truth), this derives it from that existing data.                   */
/* ---------------------------------------------------------------- */
function legacyValue(d, label) {
  const row = (d.configuration || []).find((c) => c.label === label);
  return row ? row.value : "";
}
function legacyAuthType(d) {
  const hasSecret = (d.configuration || []).some((c) => c.masked);
  return hasSecret ? "API Key" : "None";
}

function buildConnectionFromLegacy(d) {
  const kind = getConnectionKind(d.provider);
  if (kind === "webhook") {
    return { webhookUrl: legacyValue(d, "Endpoint"), method: "POST", headers: [], authType: legacyAuthType(d) };
  }
  if (kind === "httpApi") {
    return { baseUrl: legacyValue(d, "Endpoint"), method: "POST", authType: legacyAuthType(d), headers: [] };
  }
  if (kind === "accountUrl") {
    return { account: legacyValue(d, "Account"), apiBaseUrl: "", authType: legacyAuthType(d) };
  }
  if (kind === "provider") {
    return { account: legacyValue(d, "Provider") || legacyValue(d, "Provider / Account") || legacyValue(d, "Account"), authType: legacyAuthType(d) };
  }
  // "account" kind — Meta/Google Ads, Analytics Platform, Data Warehouse
  return { account: legacyValue(d, "Account") || legacyValue(d, "Property") || legacyValue(d, "Warehouse"), authType: legacyAuthType(d) };
}

function buildDeliveryConfigFromLegacy(d) {
  const options = STREAM_DELIVERY_OPTIONS[d.dataStream] || ["Batch"];
  const mode = d.dataStream === "Message" ? "Message" : options[0];
  return { mode, syncFrequency: mode === "Batch" ? "Every hour" : null };
}

function buildConsentConfigFromLegacy(d) {
  if (d.consentRequired) return { required: true, policy: ["Marketing Consent"] };
  return { required: false, activationPolicy: "Follows workspace data-use policy for " + d.destinationType.toLowerCase() + "s." };
}

DESTINATIONS.forEach((d) => {
  d.destinationType = classifyDestinationType(d);
  d.usersBase7d = baseUsersFor(d.id, d.status);
  d.createdAt = mockDateOffset(d.id, 20, 220);
  d.lastEdit = mockDateOffset(d.id + "-edit", 1, 18);
  d.owner = JOURNEY_OWNERS[hashString(d.id + "-owner") % JOURNEY_OWNERS.length];

  // Shared configuration schema — same shape Add Destination writes
  // into for a brand-new connection account.
  // Preserve existing connection if it has real keys (not legacy config array);
  // otherwise derive from legacy configuration[] label/value pairs.
  const hasRealConnection = d.connection && Object.keys(d.connection).some(
    k => k !== "headers" && k !== "authType"
  );
  if (!hasRealConnection) d.connection = buildConnectionFromLegacy(d);
  // Normalize invalid dataStream values
  if (!DATA_STREAMS.includes(d.dataStream)) {
    d.dataStream = d.dataStream === "Events" ? "Event" : "Event";
  }
  d.deliveryConfig = buildDeliveryConfigFromLegacy(d);
  d.consentConfig = buildConsentConfigFromLegacy(d);
  d.advancedConfig = { requestTimeout: "10000", maxAttempts: "3", noOfWorkers: "4", maxBatchSize: "1000" };
});
// Warehouse-style Event archival is batch, not streamed — override the
// generic first-option default for this one connection account.
{
  const warehouseEvent = DESTINATIONS.find((d) => d.id === "data-warehouse-event");
  if (warehouseEvent) warehouseEvent.deliveryConfig = { mode: "Batch", syncFrequency: "Every hour" };
}

/** Compact "Data Selection" summary string for a Connection Account —
 * used by the Directory table, Detail header and Configuration tab. */
export function dataSelectionSummary(d) {
  const sel = d.dataSelection || {};
  switch (d.dataStream) {
    case "Profile":
      return `${(sel.attributeIds || []).length} attributes`;
    case "Event":
      return sel.mode === "all" ? "All events" : `${(sel.eventIds || []).length} selected events`;
    case "Audience":
      return sel.mode === "all" ? "All eligible audiences" : `${(sel.audienceIds || []).length} audiences`;
    case "Message":
      return `${sel.channel || "—"} · ${sel.template || "No template"}`;
    case "Consent":
      return `${(sel.types || []).length} consent types`;
    default:
      return "—";
  }
}

/** Users Through Connection — responds to the shared date-range
 * filter. Deterministic (hash-jittered), never randomized per render.
 * (Named "Through Connector" historically; one Provider can have many
 * Connection Accounts, so the Directory/Detail UI labels this "Users
 * Through Connection".) */
export function getUsersThroughConnector(destination, dateFilter) {
  const days = resolveDateRangeDays(dateFilter);
  const mult = days / 7;
  const jitter = 0.9 + (hashString(destination.id) % 21) / 100; // 0.90–1.10
  return Math.max(0, Math.round(destination.usersBase7d * mult * jitter));
}

export function getDestinationById(id) {
  return DESTINATIONS.find((d) => d.id === id);
}

/** All Connection Accounts belonging to one provider — used by "Create
 * another connection" (section 25) to show sibling accounts. */
export function connectionAccountsForProvider(providerName) {
  return DESTINATIONS.filter((d) => d.provider === providerName);
}

/** Resolves a destination's referenced audience names to their real
 * AUDIENCES records (member count, status) — never a second source of
 * truth for audience data. Unknown names are skipped rather than
 * fabricated. */
export function resolveAudiences(destination) {
  return destination.audiences.map((name) => AUDIENCES.find((a) => a.name === name)).filter(Boolean);
}

/** Resolves a destination's referenced journey names to their real
 * JOURNEYS records (status). */
export function resolveJourneys(destination) {
  return destination.journeys.map((name) => JOURNEYS.find((j) => j.name === name)).filter(Boolean);
}

/** Resolves a destination's referenced Data Flow to the real record
 * in js/data/dataflows.js. */
export function resolveDataFlow(destination) {
  return destination.dataFlowId ? getFlowById(destination.dataFlowId) : null;
}

/* ---------------------------------------------------------------- */
/* Add Destination — catalog offered in the guided setup (Step 1:      */
/* choose Provider), grouped by category exactly as the Node Library   */
/* groups journey node types.                                          */
/* ---------------------------------------------------------------- */
export const ADD_DESTINATION_CATALOG = [
  { category: "Customer Engagement", names: ["Email", "Push", "In-App", "Web Message", "SMS", "Zalo"] },
  { category: "Advertising", names: ["Meta Ads", "Google Ads"] },
  { category: "CRM / Business", names: ["CRM", "n8n", "Webhook", "HTTP API", "Consent Platform"] },
  { category: "Analytics / Data", names: ["Analytics Platform", "Data Warehouse", "Custom API"] },
];

/** The Provider definition for a catalog name — capabilities/category
 * used by Add Destination Step 1/3. Not a specific Connection Account
 * instance: a Provider can have zero, one or many of those. */
export function getDestinationTemplate(name) {
  return getProvider(name);
}

/* ---------------------------------------------------------------- */
/* Connector activity — one shared log the Destinations (and Sources) */
/* Activity tabs both read from, filtered by date range / trigger /   */
/* data type / status. Every entry belongs to one Connection Account   */
/* (`connectorId`), never just a provider, so operational history      */
/* stays scoped to the specific account it happened on. A handful of   */
/* recent entries are hand-authored per flagship account (matching     */
/* the spec's own examples, using real Audience/Journey names); older  */
/* days are deterministically generated so a 90-day range has depth.   */
/* ---------------------------------------------------------------- */
const RECENT_ACTIVITY_SEED = {
  "meta-ads": [
    { daysAgo: 0, hour: 10, minute: 42, trigger: "Dormant Investors", dataType: "Audience", users: 31420, records: 31420, status: "Completed" },
    { daysAgo: 0, hour: 9, minute: 30, trigger: "High Value Customers", dataType: "Audience", users: 18240, records: 18240, status: "Completed" },
    { daysAgo: 0, hour: 8, minute: 15, trigger: "Birthday Engagement", dataType: "Audience", users: 3182, records: 3182, status: "Completed" },
    { daysAgo: 1, hour: 9, minute: 40, trigger: "High Value Customers", dataType: "Audience", users: 12804, records: 12804, status: "Completed" },
  ],
  crm: [
    { daysAgo: 0, hour: 9, minute: 35, trigger: "Active Mobile Investors", dataType: "Profile", users: 48231, records: 48231, status: "Completed" },
    { daysAgo: 1, hour: 6, minute: 0, trigger: "Recently Registered", dataType: "Profile", users: 4218, records: 4218, status: "Completed" },
  ],
  webhook: [
    { daysAgo: 0, hour: 9, minute: 31, trigger: null, dataType: "Event", users: 8214, records: 18420, status: "Completed" },
    { daysAgo: 1, hour: 9, minute: 12, trigger: null, dataType: "Event", users: 7940, records: 17100, status: "Completed" },
  ],
  email: [
    { daysAgo: 0, hour: 9, minute: 28, trigger: "Marketing Consent — Email", dataType: "Message", users: 54812, records: 54812, status: "Completed" },
    { daysAgo: 1, hour: 9, minute: 0, trigger: "Birthday — Next 30 Days", dataType: "Message", users: 3182, records: 3182, status: "Completed" },
  ],
  "google-ads": [
    { daysAgo: 0, hour: 3, minute: 0, trigger: "High Value Customers", dataType: "Audience", users: 0, records: 0, status: "Failed" },
    { daysAgo: 1, hour: 18, minute: 10, trigger: "High Value Customers", dataType: "Audience", users: 12804, records: 12804, status: "Completed" },
  ],
};

function buildActivityFor(destination) {
  const seed = RECENT_ACTIVITY_SEED[destination.id] || [];
  const entries = seed.map((e, i) => ({ connectorId: destination.id, id: `${destination.id}-a${i}`, ...e }));
  if (destination.status === "Available" || destination.status === "Draft") return entries; // never-synced — no history to show

  const startDay = seed.length ? Math.max(...seed.map((e) => e.daysAgo)) + 1 : 0;
  for (let day = startDay; day < 90; day++) {
    const h = hashString(`${destination.id}-${day}`);
    if (h % 4 === 0) continue; // realistic gaps — not every day has a run
    const users = Math.max(20, Math.round(destination.usersBase7d * (0.08 + (h % 18) / 100)));
    const records = Math.round(users * (1 + (h % 5) / 20));
    entries.push({
      connectorId: destination.id,
      id: `${destination.id}-g${day}`,
      daysAgo: day,
      hour: 6 + (h % 14),
      minute: h % 60,
      trigger: null,
      dataType: destination.dataStream,
      users,
      records,
      status: h % 47 === 0 ? "Failed" : "Completed",
    });
  }
  return entries;
}

export const CONNECTOR_ACTIVITY = DESTINATIONS.flatMap(buildActivityFor);

export function formatActivityTimestamp(entry) {
  const d = new Date(2026, 8, 23 - entry.daysAgo);
  return `${formatMockDate(d)} · ${String(entry.hour).padStart(2, "0")}:${String(entry.minute).padStart(2, "0")}`;
}

/** Filtered connector activity for one connection account id, newest
 * first. `dataType` here means the account's own Data Stream. */
export function getConnectorActivity(connectorId, { dateFilter, audienceName, dataType, status } = {}) {
  const days = resolveDateRangeDays(dateFilter);
  return CONNECTOR_ACTIVITY.filter((e) => e.connectorId === connectorId)
    .filter((e) => e.daysAgo < days)
    .filter((e) => !audienceName || audienceName === "all" || e.trigger === audienceName)
    .filter((e) => !dataType || dataType === "all" || e.dataType === dataType)
    .filter((e) => !status || status === "all" || e.status === status)
    .sort((a, b) => a.daysAgo - b.daysAgo || b.hour * 60 + b.minute - (a.hour * 60 + a.minute));
}

export function summarizeActivity(entries) {
  const users = entries.reduce((s, e) => s + e.users, 0);
  const records = entries.reduce((s, e) => s + e.records, 0);
  const completed = entries.filter((e) => e.status === "Completed").length;
  const total = entries.length || 1;
  const successRate = (completed / total) * 100;
  return { users, records, successRate, failedRate: 100 - successRate, count: entries.length };
}
