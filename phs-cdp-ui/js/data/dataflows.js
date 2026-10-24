/*
  PHS CDP — centralized Data Flows mock data.
  Single source of truth for the Data Flows module: the flow map and
  the "All Data Flows" table both read from FLOWS, so they can never
  drift apart. Everything here is fictional — endpoints use ".example"
  domains and credentials are never shown, only a masked placeholder.

  This module is intentionally self-contained. A later phase could
  have Event Definitions, Customer 360, Audiences, Journeys or
  Activation reference a flow by id (e.g. "this audience activates via
  the Meta Ads flow"), but no such relationship is wired up yet.
*/

export const DIRECTIONS = ["Inbound", "Outbound"];

export const DATA_TYPE_META = {
  Profile: { icon: "user-round", label: "PROFILE" },
  Behavior: { icon: "activity", label: "BEHAVIOR" },
  Consent: { icon: "shield-check", label: "CONSENT" },
  Audience: { icon: "users-round", label: "AUDIENCE" },
};
export const DATA_TYPES = Object.keys(DATA_TYPE_META);

export const DELIVERY_MODE_META = {
  Stream: { icon: "zap", label: "STREAM" },
  Batch: { icon: "database", label: "BATCH" },
};
export const DELIVERY_MODES = Object.keys(DELIVERY_MODE_META);

export const STATUS_META = {
  Connected: { dot: "status-dot--success", badge: "badge--success" },
  Ready: { dot: "status-dot--primary", badge: "badge--primary" },
  Warning: { dot: "status-dot--warning", badge: "badge--warning" },
  Paused: { dot: "", badge: "badge--neutral" }, // base .status-dot is already neutral gray
  Error: { dot: "status-dot--danger", badge: "badge--danger" },
};
export const STATUSES = Object.keys(STATUS_META);

export const SYSTEM_TYPES = [
  "Digital Channel",
  "Attribution",
  "Customer System",
  "Messaging",
  "Integration",
  "Advertising",
  "Workflow",
  "Core System",
];

export const SYSTEM_ICONS = {
  Web: "globe-2",
  "Mobile App": "smartphone",
  AppsFlyer: "radar",
  API: "braces",
  Webhook: "webhook",
  CRM: "building-2",
  Zalo: "message-circle",
  "Trading Platform": "landmark",
  n8n: "workflow",
  Email: "mail",
  Push: "bell",
  "Meta Ads": "megaphone",
  "Google Ads": "search",
};

export const SYSTEM_TYPE_BY_NAME = {
  Web: "Digital Channel",
  "Mobile App": "Digital Channel",
  AppsFlyer: "Attribution",
  API: "Integration",
  Webhook: "Integration",
  CRM: "Customer System",
  Zalo: "Messaging",
  "Trading Platform": "Core System",
  n8n: "Workflow",
  Email: "Messaging",
  Push: "Messaging",
  "Meta Ads": "Advertising",
  "Google Ads": "Advertising",
};

export const INGESTION_TYPES = ["Event Ingestion", "Profile Ingestion", "API Ingestion", "Webhook Ingestion", "Batch Import"];
export const ACTIVATION_TYPES = ["Audience Activation", "Profile Sync", "Event Forwarding", "Workflow Trigger"];

// Systems available when creating a new flow — no credential fields
// anywhere in this list or the Add Data Flow form itself.
export const ADD_FLOW_SYSTEMS = [
  "Web", "Mobile App", "AppsFlyer", "API", "Webhook", "CRM", "Zalo",
  "Trading Platform", "n8n", "Email", "Push", "Meta Ads", "Google Ads",
];

/*
  Flow shape:
  {
    id, name, direction, systemType, systemName, dataTypes[],
    deliveryMode, status, lastSync, recordCount, recordLabel,
    ingestionType | activationType, description,
    endpoint, credentialLabel   // connection info — always masked in the UI
  }
*/
export const FLOWS = [
  // -------------------------------------------------------------- //
  // INBOUND — sources sending data into the PHS CDP                 //
  // -------------------------------------------------------------- //
  {
    id: "flow-in-web",
    name: "Web",
    direction: "Inbound",
    systemType: "Digital Channel",
    systemName: "Web",
    dataTypes: ["Profile", "Behavior"],
    deliveryMode: "Stream",
    status: "Connected",
    lastSync: "1 min ago",
    recordCount: 312480,
    recordLabel: "events",
    ingestionType: "Event Ingestion",
    description: "Page views, sign-ups and on-site behavior captured from phs.com.vn.",
    endpoint: "https://collect.phs-cdp.example/web/v1/events",
    credentialLabel: "Site Token",
  },
  {
    id: "flow-in-mobile",
    name: "Mobile App",
    direction: "Inbound",
    systemType: "Digital Channel",
    systemName: "Mobile App",
    dataTypes: ["Profile", "Behavior", "Consent"],
    deliveryMode: "Stream",
    status: "Connected",
    lastSync: "1 min ago",
    recordCount: 892104,
    recordLabel: "events",
    ingestionType: "Event Ingestion",
    description: "App opens, trading activity and in-app consent capture from the PHS mobile app.",
    endpoint: "https://collect.phs-cdp.example/mobile/v1/events",
    credentialLabel: "SDK Key",
  },
  {
    id: "flow-in-appsflyer",
    name: "AppsFlyer",
    direction: "Inbound",
    systemType: "Attribution",
    systemName: "AppsFlyer",
    dataTypes: ["Behavior"],
    deliveryMode: "Stream",
    status: "Connected",
    lastSync: "2 min ago",
    recordCount: 124820,
    recordLabel: "events",
    ingestionType: "Event Ingestion",
    description: "Install and campaign attribution events for the mobile app.",
    endpoint: "https://hq1.appsflyer.example/api/pull/v1/events",
    credentialLabel: "Pull API Key",
  },
  {
    id: "flow-in-api",
    name: "API",
    direction: "Inbound",
    systemType: "Integration",
    systemName: "API",
    dataTypes: ["Profile", "Behavior"],
    deliveryMode: "Stream",
    status: "Connected",
    lastSync: "3 min ago",
    recordCount: 58940,
    recordLabel: "events",
    ingestionType: "API Ingestion",
    description: "General-purpose ingestion endpoint for internal and partner systems.",
    endpoint: "https://api.phs-cdp.example/ingest/v1/profiles",
    credentialLabel: "API Key",
  },
  {
    id: "flow-in-webhook",
    name: "Webhook",
    direction: "Inbound",
    systemType: "Integration",
    systemName: "Webhook",
    dataTypes: ["Behavior"],
    deliveryMode: "Stream",
    status: "Connected",
    lastSync: "4 min ago",
    recordCount: 96340,
    recordLabel: "events",
    ingestionType: "Webhook Ingestion",
    description: "Inbound push notifications of behavioral events from connected systems.",
    endpoint: "https://hooks.phs-cdp.example/in/behavior-events",
    credentialLabel: "Webhook Secret",
  },
  {
    id: "flow-in-crm",
    name: "CRM",
    direction: "Inbound",
    systemType: "Customer System",
    systemName: "CRM",
    dataTypes: ["Profile"],
    deliveryMode: "Batch",
    status: "Connected",
    lastSync: "Today · 06:00",
    recordCount: 1284392,
    recordLabel: "records",
    ingestionType: "Batch Import",
    description: "Nightly full-profile export from the customer relationship management system.",
    endpoint: "https://crm.phs.example/export/customers.csv",
    credentialLabel: "Service Account Key",
  },
  {
    id: "flow-in-zalo",
    name: "Zalo",
    direction: "Inbound",
    systemType: "Messaging",
    systemName: "Zalo",
    dataTypes: ["Profile"],
    deliveryMode: "Batch",
    status: "Warning",
    lastSync: "42 min ago",
    recordCount: 71204,
    recordLabel: "records",
    ingestionType: "Batch Import",
    description: "Zalo Official Account follower profiles — periodic sync running behind schedule.",
    endpoint: "https://openapi.zalo.example/oa/v3/profiles",
    credentialLabel: "OA Access Token",
  },
  {
    id: "flow-in-trading",
    name: "Trading Platform",
    direction: "Inbound",
    systemType: "Core System",
    systemName: "Trading Platform",
    dataTypes: ["Profile", "Behavior"],
    deliveryMode: "Stream",
    status: "Connected",
    lastSync: "1 min ago",
    recordCount: 214600,
    recordLabel: "events",
    ingestionType: "Event Ingestion",
    description: "Order placement, execution and account activity from the core trading system.",
    endpoint: "https://core.trading.phs.example/stream/v1/activity",
    credentialLabel: "Internal Service Token",
  },

  // -------------------------------------------------------------- //
  // OUTBOUND — destinations the PHS CDP sends data to                //
  // -------------------------------------------------------------- //
  {
    id: "flow-out-crm",
    name: "CRM",
    direction: "Outbound",
    systemType: "Customer System",
    systemName: "CRM",
    dataTypes: ["Profile"],
    deliveryMode: "Batch",
    status: "Ready",
    lastSync: "Today · 06:00",
    recordCount: 1284392,
    recordLabel: "profiles",
    activationType: "Profile Sync",
    description: "Unified profile sync back into the CRM for relationship-manager visibility.",
    endpoint: "https://crm.phs.example/import/profiles",
    credentialLabel: "Service Account Key",
  },
  {
    id: "flow-out-n8n",
    name: "n8n",
    direction: "Outbound",
    systemType: "Workflow",
    systemName: "n8n",
    dataTypes: ["Profile", "Behavior"],
    deliveryMode: "Stream",
    status: "Connected",
    lastSync: "Today · 09:10",
    recordCount: 61204,
    recordLabel: "events",
    activationType: "Workflow Trigger",
    description: "Triggers downstream automation workflows on qualifying profile and behavior changes.",
    endpoint: "https://n8n.phs.example/webhook/cdp-trigger",
    credentialLabel: "Webhook Secret",
  },
  {
    id: "flow-out-webhook",
    name: "Webhook",
    direction: "Outbound",
    systemType: "Integration",
    systemName: "Webhook",
    dataTypes: ["Behavior"],
    deliveryMode: "Stream",
    status: "Ready",
    lastSync: "Today · 09:12",
    recordCount: 96340,
    recordLabel: "events",
    activationType: "Event Forwarding",
    description: "Forwards qualifying behavioral events to a partner-owned endpoint.",
    endpoint: "https://partner.example.com/webhooks/cdp-events",
    credentialLabel: "Signing Secret",
  },
  {
    id: "flow-out-email",
    name: "Email",
    direction: "Outbound",
    systemType: "Messaging",
    systemName: "Email",
    dataTypes: ["Audience"],
    deliveryMode: "Batch",
    status: "Ready",
    lastSync: "Today · 08:00",
    recordCount: 54812,
    recordLabel: "profiles",
    activationType: "Audience Activation",
    description: "Audience-based email campaign delivery via the transactional email provider.",
    endpoint: "https://api.email-provider.example/v3/send",
    credentialLabel: "API Key",
  },
  {
    id: "flow-out-push",
    name: "Push",
    direction: "Outbound",
    systemType: "Messaging",
    systemName: "Push",
    dataTypes: ["Audience", "Behavior"],
    deliveryMode: "Stream",
    status: "Ready",
    lastSync: "Today · 09:15",
    recordCount: 214600,
    recordLabel: "events",
    activationType: "Audience Activation",
    description: "Real-time push notification delivery triggered by audience membership and behavior.",
    endpoint: "https://api.push-provider.example/v1/notify",
    credentialLabel: "Server Key",
  },
  {
    id: "flow-out-zalo",
    name: "Zalo",
    direction: "Outbound",
    systemType: "Messaging",
    systemName: "Zalo",
    dataTypes: ["Audience"],
    deliveryMode: "Batch",
    status: "Paused",
    lastSync: "3 days ago",
    recordCount: 42180,
    recordLabel: "profiles",
    activationType: "Audience Activation",
    description: "Zalo OA broadcast campaigns — currently paused pending message template review.",
    endpoint: "https://openapi.zalo.example/oa/v3/broadcast",
    credentialLabel: "OA Access Token",
  },
  {
    id: "flow-out-meta",
    name: "Meta Ads",
    direction: "Outbound",
    systemType: "Advertising",
    systemName: "Meta Ads",
    dataTypes: ["Audience"],
    deliveryMode: "Batch",
    status: "Ready",
    lastSync: "Today · 09:15",
    recordCount: 48231,
    recordLabel: "profiles",
    activationType: "Audience Activation",
    description: "Custom Audience sync for retargeting and lookalike campaigns.",
    endpoint: "https://graph.meta-ads.example/v18/custom-audiences",
    credentialLabel: "Access Token",
  },
  {
    id: "flow-out-google",
    name: "Google Ads",
    direction: "Outbound",
    systemType: "Advertising",
    systemName: "Google Ads",
    dataTypes: ["Audience"],
    deliveryMode: "Batch",
    status: "Error",
    lastSync: "6 hours ago",
    recordCount: 0,
    recordLabel: "profiles",
    activationType: "Audience Activation",
    description: "Customer Match audience sync — last run failed authentication.",
    endpoint: "https://googleads.example.com/v14/customerMatch",
    credentialLabel: "OAuth Refresh Token",
  },
  {
    id: "flow-out-api",
    name: "API",
    direction: "Outbound",
    systemType: "Integration",
    systemName: "API",
    dataTypes: ["Profile", "Behavior"],
    deliveryMode: "Stream",
    status: "Ready",
    lastSync: "Today · 09:14",
    recordCount: 38920,
    recordLabel: "events",
    activationType: "Event Forwarding",
    description: "General-purpose outbound endpoint for internal and partner systems.",
    endpoint: "https://partner.example.com/api/v1/profiles",
    credentialLabel: "API Key",
  },
];

export const INBOUND_FLOWS = FLOWS.filter((f) => f.direction === "Inbound");
export const OUTBOUND_FLOWS = FLOWS.filter((f) => f.direction === "Outbound");

export function getFlowById(id) {
  return FLOWS.find((f) => f.id === id);
}
