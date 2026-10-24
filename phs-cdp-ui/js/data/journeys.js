/*
  PHS CDP — centralized Journey / Lifecycle Orchestration mock data.
  Single source of truth for the Journeys module (All Journeys list,
  Journey Builder canvas, Test Journey simulation).

  A Journey is a directed set of nodes + edges — not a copy of the
  Data Flow or Audience models. It REFERENCES them:
    - entry-audience nodes reference an id from js/data/audiences.js
    - entry-event / data-system nodes reference conceptual delivery
      metadata already defined in js/data/dataflows.js
  No new "how data moves" model is introduced here.

  Rendering model: each journey is a small tree, not a generic graph.
  A node has at most two outgoing edges (a "yes"/"no" branch from a
  Consent Check or Condition node); every other node has exactly one
  outgoing edge, or none if it terminates the journey. The builder's
  renderer walks `edges` recursively from `entry` — see
  js/pages/journey-builder.js.
*/

import { AUDIENCES } from "./audiences.js";
import { getFlowById } from "./dataflows.js";
import { CUSTOMERS } from "./customers.js";
import { EVENT_CATALOG } from "./events.js";

export const JOURNEY_STATUSES = ["Active", "Draft", "Paused", "Completed"];
export const JOURNEY_OWNERS = ["CRM Team", "Lifecycle Team", "Growth Team"];

// The only audiences a Journey entry may reference — deliberately a
// subset of AUDIENCES, matching the CDP's current activation scope.
export const JOURNEY_AUDIENCE_NAMES = [
  "Active Mobile Investors",
  "High Value Customers",
  "Dormant Investors",
  "Birthday — Next 30 Days",
  "Marketing Consent — Email",
  "Recently Registered",
  "High Engagement — No Recent Trade",
];

export const CONSENT_FIELDS = ["Marketing Consent", "Analytics Consent", "Personalization Consent"];

export const GOAL_TYPES = [
  "Customer opens message",
  "Customer places order",
  "Customer deposits",
  "Customer logs in",
  "Customer reaches engagement score",
  "Customer enters audience",
];

export const EXIT_REASONS = ["Goal achieved", "Consent revoked", "Customer enters another lifecycle stage", "Timeout reached", "Manual exit"];

// The event trigger list — derived from the canonical Event Catalog
// (js/data/events.js, Phase 13) rather than a second hardcoded list.
// Journey Builder itself is untouched; only where its dropdowns pull
// their options from changes.
export const EVENT_OPTIONS = EVENT_CATALOG.map((e) => e.name);

export const WAIT_UNITS = ["minutes", "hours", "days", "weeks"];

export const HTTP_METHODS = ["POST", "PATCH", "PUT"];
export const PAYLOAD_TYPES = ["Profile", "Event", "Audience"];
export const MOCK_MASKED_AUTH = "API Key: ••••••••••";

export const ENTRY_TYPE_OPTIONS = [
  { type: "entry-audience", label: "Audience", icon: "users-round", description: "Enter when a customer joins an audience." },
  { type: "entry-event", label: "Event", icon: "zap", description: "Enter when a customer triggers a specific event." },
  { type: "entry-attribute", label: "Attribute", icon: "sliders-horizontal", description: "Enter when a profile attribute matches a condition." },
];

/* ---------------------------------------------------------------- */
/* Node type catalog — drives the Node Library palette and the       */
/* config panel. Every node's `type` key must exist here.            */
/* ---------------------------------------------------------------- */
export const NODE_TYPE_META = {
  "entry-placeholder": { label: "Choose Entry Trigger", icon: "circle-play", category: "entry" },
  "entry-audience": { label: "Audience Entry", icon: "users-round", category: "entry" },
  "entry-event": { label: "Event Trigger", icon: "zap", category: "entry" },
  "entry-attribute": { label: "Attribute Trigger", icon: "sliders-horizontal", category: "entry" },

  "consent-check": { label: "Consent Check", icon: "shield-check", category: "logic" },
  condition: { label: "Condition", icon: "git-branch", category: "logic" },
  wait: { label: "Wait", icon: "clock", category: "logic" },

  "comm-email": { label: "Send Email", icon: "mail", category: "communication", channel: "Email" },
  "comm-push": { label: "Send Push", icon: "bell", category: "communication", channel: "Push" },
  "comm-inapp": { label: "Send In-App Message", icon: "message-square", category: "communication", channel: "In-App" },
  "comm-webmessage": { label: "Send Web Message", icon: "monitor", category: "communication", channel: "Web Message" },
  "comm-sms": { label: "Send SMS", icon: "phone", category: "communication", channel: "SMS" },
  "comm-zalo": { label: "Send Zalo Message", icon: "message-circle", category: "communication", channel: "Zalo" },

  "activation-meta": { label: "Sync Audience → Meta Ads", icon: "megaphone", category: "audienceActivation", destination: "Meta Ads" },
  "activation-google": { label: "Sync Audience → Google Ads", icon: "search", category: "audienceActivation", destination: "Google Ads" },
  "activation-crm": { label: "Sync Audience → CRM", icon: "building-2", category: "audienceActivation", destination: "CRM" },
  "activation-zalo": { label: "Sync Audience → Zalo", icon: "message-circle", category: "audienceActivation", destination: "Zalo" },

  "ds-webhook": { label: "Webhook", icon: "webhook", category: "dataSystem", systemAction: "Event notification" },
  "ds-http": { label: "HTTP API Request", icon: "server", category: "dataSystem", systemAction: "API operation" },
  "ds-n8n": { label: "Forward Event → n8n", icon: "workflow", category: "dataSystem" },
  "ds-crm-sync": { label: "Forward Profile → CRM", icon: "building-2", category: "dataSystem" },
  "ds-update-attr": { label: "Update Customer Attribute", icon: "sliders-horizontal", category: "dataSystem" },
  "ds-add-audience": { label: "Add to Audience", icon: "user-check", category: "dataSystem" },
  "ds-remove-audience": { label: "Remove from Audience", icon: "ban", category: "dataSystem" },

  goal: { label: "Goal", icon: "flag", category: "goal" },
  exit: { label: "Exit", icon: "log-out", category: "exit" },
};

// Node library grouping, in the exact order the palette shows them.
export const NODE_LIBRARY = [
  { category: "entry", label: "Entry", types: ["entry-audience", "entry-event", "entry-attribute"] },
  { category: "logic", label: "Logic", types: ["consent-check", "condition", "wait"] },
  { category: "communication", label: "Communication", types: ["comm-email", "comm-push", "comm-inapp", "comm-webmessage", "comm-sms", "comm-zalo"] },
  { category: "audienceActivation", label: "Audience Activation", types: ["activation-meta", "activation-google", "activation-crm", "activation-zalo"] },
  { category: "dataSystem", label: "Data / System", types: ["ds-webhook", "ds-http", "ds-n8n", "ds-crm-sync", "ds-update-attr", "ds-add-audience", "ds-remove-audience"] },
  { category: "goal", label: "Goal", types: ["goal"] },
  { category: "exit", label: "Exit", types: ["exit"] },
];

// Communication templates offered per channel — mock content only.
export const TEMPLATES_BY_CHANNEL = {
  Email: ["Birthday Greeting", "Post Trade Insight", "Welcome Email"],
  Push: ["Market Morning Brief", "Trade Confirmation", "Re-engagement Nudge"],
  "In-App": ["Birthday Greeting", "Welcome Message", "Investment Insight"],
  "Web Message": ["Investment Insight", "Account Notice"],
  SMS: ["Account Notification", "OTP Reminder"],
  Zalo: ["Customer Message", "Promotion Notice"],
};

/* ---------------------------------------------------------------- */
/* Conceptual Data Flow references — reuses js/data/dataflows.js,    */
/* never a second "how data moves" model.                            */
/* ---------------------------------------------------------------- */
const EVENT_FLOW_MAP = {
  "Place Order": "flow-in-trading",
  Buy: "flow-in-trading",
  Sell: "flow-in-trading",
  Deposit: "flow-in-trading",
  "App Open": "flow-in-mobile",
  Login: "flow-in-mobile",
  "Email Open": "flow-in-webhook",
};

export function describeEventSource(eventName) {
  const flow = getFlowById(EVENT_FLOW_MAP[eventName] || "flow-in-mobile");
  return { source: flow.systemName, dataTypes: flow.dataTypes, delivery: flow.deliveryMode };
}

export function describeForwardTarget(nodeType) {
  const map = { "ds-n8n": "flow-out-n8n", "ds-crm-sync": "flow-out-crm" };
  const flow = getFlowById(map[nodeType] || "flow-out-n8n");
  return { destination: flow.systemName, dataTypes: flow.dataTypes, delivery: flow.deliveryMode };
}

/* ---------------------------------------------------------------- */
/* Journey flow builders — keep the 12 mock journeys concise         */
/* ---------------------------------------------------------------- */
let seq = 0;
function nid(journeyId) {
  seq += 1;
  return `${journeyId}-n${seq}`;
}

function node(journeyId, type, config = {}) {
  const meta = NODE_TYPE_META[type];
  return { id: nid(journeyId), type, category: meta.category, name: meta.label, config };
}

/** Entry -> Consent Check -> single Communication -> Wait -> Goal / Exit. Used for the simpler, non-flagship journeys. */
function buildSimpleFlow(journeyId, { entryNode, consentField = "Marketing Consent", commType, template, waitDays, goalType }) {
  const entry = entryNode;
  const consent = node(journeyId, "consent-check", { field: consentField, operator: "equals", value: "Granted" });
  const comm = node(journeyId, commType, { channel: NODE_TYPE_META[commType].channel, template, consentRequired: consentField, status: "Prototype" });
  const wait = node(journeyId, "wait", { mode: "duration", amount: waitDays, unit: "days" });
  const goalN = node(journeyId, "goal", { goalType, measurementWindowDays: 7 });
  const exitN = node(journeyId, "exit", { reason: "Consent revoked" });

  const nodes = [entry, consent, comm, wait, goalN, exitN];
  const edges = [
    { from: entry.id, to: consent.id, branch: null },
    { from: consent.id, to: comm.id, branch: "yes" },
    { from: consent.id, to: exitN.id, branch: "no" },
    { from: comm.id, to: wait.id, branch: null },
    { from: wait.id, to: goalN.id, branch: null },
  ];
  return { nodes, edges, entryId: entry.id };
}

function entryAudienceNode(journeyId, audienceName) {
  const aud = AUDIENCES.find((a) => a.name === audienceName);
  return node(journeyId, "entry-audience", { audienceId: aud?.id, audienceName });
}

function entryEventNode(journeyId, eventName) {
  return node(journeyId, "entry-event", { eventName, ...describeEventSource(eventName) });
}

/* ---- Birthday Engagement — the flagship consent + branch example ---- */
function buildBirthdayFlow(journeyId) {
  const entry = entryAudienceNode(journeyId, "Birthday — Next 30 Days");
  const consent = node(journeyId, "consent-check", { field: "Marketing Consent", operator: "equals", value: "Granted" });
  const sendInApp = node(journeyId, "comm-inapp", { channel: "In-App", template: "Birthday Greeting", consentRequired: "Marketing Consent", status: "Prototype" });
  const exitConsent = node(journeyId, "exit", { reason: "Consent revoked" });
  const wait2d = node(journeyId, "wait", { mode: "duration", amount: 2, unit: "days" });
  const sendEmail = node(journeyId, "comm-email", { channel: "Email", template: "Birthday Greeting", consentRequired: "Marketing Consent", status: "Prototype" });
  const emailOpened = node(journeyId, "condition", { field: "Email Open", operator: "occurred", params: {}, label: "Email Opened?" });
  const goalN = node(journeyId, "goal", { goalType: "Customer opens message", measurementWindowDays: 7 });
  const sendPush = node(journeyId, "comm-push", { channel: "Push", template: "Market Morning Brief", consentRequired: "Marketing Consent", status: "Prototype" });
  const exitTimeout = node(journeyId, "exit", { reason: "Timeout reached" });

  const nodes = [entry, consent, sendInApp, exitConsent, wait2d, sendEmail, emailOpened, goalN, sendPush, exitTimeout];
  const edges = [
    { from: entry.id, to: consent.id, branch: null },
    { from: consent.id, to: sendInApp.id, branch: "yes" },
    { from: consent.id, to: exitConsent.id, branch: "no" },
    { from: sendInApp.id, to: wait2d.id, branch: null },
    { from: wait2d.id, to: sendEmail.id, branch: null },
    { from: sendEmail.id, to: emailOpened.id, branch: null },
    { from: emailOpened.id, to: goalN.id, branch: "yes" },
    { from: emailOpened.id, to: sendPush.id, branch: "no" },
    { from: sendPush.id, to: exitTimeout.id, branch: null },
  ];
  return { nodes, edges, entryId: entry.id };
}

/* ---- Dormant Investor Re-engagement — Email -> Meta Ads example ---- */
function buildDormantFlow(journeyId) {
  const entry = entryAudienceNode(journeyId, "Dormant Investors");
  const consent = node(journeyId, "consent-check", { field: "Marketing Consent", operator: "equals", value: "Granted" });
  const sendEmail = node(journeyId, "comm-email", { channel: "Email", template: "Post Trade Insight", consentRequired: "Marketing Consent", status: "Prototype" });
  const exitConsent = node(journeyId, "exit", { reason: "Consent revoked" });
  const wait3d = node(journeyId, "wait", { mode: "duration", amount: 3, unit: "days" });
  const emailOpened = node(journeyId, "condition", { field: "Email Open", operator: "occurred", params: {}, label: "Email Opened?" });
  const goalN = node(journeyId, "goal", { goalType: "Customer opens message", measurementWindowDays: 7 });
  const syncMeta = node(journeyId, "activation-meta", { destination: "Meta Ads", audienceName: "Dormant Investor Re-engagement", mode: "Batch", status: "Prototype" });
  const exitGoal = node(journeyId, "exit", { reason: "Goal achieved" });

  const nodes = [entry, consent, sendEmail, exitConsent, wait3d, emailOpened, goalN, syncMeta, exitGoal];
  const edges = [
    { from: entry.id, to: consent.id, branch: null },
    { from: consent.id, to: sendEmail.id, branch: "yes" },
    { from: consent.id, to: exitConsent.id, branch: "no" },
    { from: sendEmail.id, to: wait3d.id, branch: null },
    { from: wait3d.id, to: emailOpened.id, branch: null },
    { from: emailOpened.id, to: goalN.id, branch: "yes" },
    { from: emailOpened.id, to: syncMeta.id, branch: "no" },
    { from: syncMeta.id, to: exitGoal.id, branch: null },
  ];
  return { nodes, edges, entryId: entry.id };
}

/* ---- High Value Investor Engagement — multi-channel example ---- */
function buildHighValueFlow(journeyId) {
  const entry = entryAudienceNode(journeyId, "High Value Customers");
  const consent = node(journeyId, "consent-check", { field: "Marketing Consent", operator: "equals", value: "Granted" });
  const sendInApp = node(journeyId, "comm-inapp", { channel: "In-App", template: "Investment Insight", consentRequired: "Marketing Consent", status: "Prototype" });
  const exitConsent = node(journeyId, "exit", { reason: "Consent revoked" });
  const wait2d = node(journeyId, "wait", { mode: "duration", amount: 2, unit: "days" });
  const appOpened = node(journeyId, "condition", { field: "App Open", operator: "occurred", params: {}, label: "App Open?" });
  const goalN = node(journeyId, "goal", { goalType: "Customer logs in", measurementWindowDays: 7 });
  const sendPush = node(journeyId, "comm-push", { channel: "Push", template: "Re-engagement Nudge", consentRequired: "Marketing Consent", status: "Prototype" });
  const wait3d = node(journeyId, "wait", { mode: "duration", amount: 3, unit: "days" });
  const syncMeta = node(journeyId, "activation-meta", { destination: "Meta Ads", audienceName: "High Value Investor Engagement", mode: "Batch", status: "Prototype" });
  const exitN = node(journeyId, "exit", { reason: "Timeout reached" });

  const nodes = [entry, consent, sendInApp, exitConsent, wait2d, appOpened, goalN, sendPush, wait3d, syncMeta, exitN];
  const edges = [
    { from: entry.id, to: consent.id, branch: null },
    { from: consent.id, to: sendInApp.id, branch: "yes" },
    { from: consent.id, to: exitConsent.id, branch: "no" },
    { from: sendInApp.id, to: wait2d.id, branch: null },
    { from: wait2d.id, to: appOpened.id, branch: null },
    { from: appOpened.id, to: goalN.id, branch: "yes" },
    { from: appOpened.id, to: sendPush.id, branch: "no" },
    { from: sendPush.id, to: wait3d.id, branch: null },
    { from: wait3d.id, to: syncMeta.id, branch: null },
    { from: syncMeta.id, to: exitN.id, branch: null },
  ];
  return { nodes, edges, entryId: entry.id };
}

/* ---- New Investor Onboarding ---- */
function buildNewInvestorFlow(journeyId) {
  const flow = buildSimpleFlow(journeyId, {
    entryNode: entryAudienceNode(journeyId, "Recently Registered"),
    commType: "comm-inapp",
    template: "Welcome Message",
    waitDays: 3,
    goalType: "Customer places order",
  });
  return flow;
}

/* ---- Post Trade Engagement — event-based entry ---- */
function buildPostTradeFlow(journeyId) {
  const flow = buildSimpleFlow(journeyId, {
    entryNode: entryEventNode(journeyId, "Place Order"),
    commType: "comm-push",
    template: "Trade Confirmation",
    waitDays: 1,
    goalType: "Customer places order",
  });
  return flow;
}

/* ---- Remaining lightweight journeys (same simple shape, varied channel) ---- */
function buildMobileEngagementFlow(journeyId) {
  return buildSimpleFlow(journeyId, {
    entryNode: entryAudienceNode(journeyId, "Active Mobile Investors"),
    commType: "comm-push",
    template: "Market Morning Brief",
    waitDays: 2,
    goalType: "Customer logs in",
  });
}
function buildEmailConsentFlow(journeyId) {
  return buildSimpleFlow(journeyId, {
    entryNode: entryAudienceNode(journeyId, "Marketing Consent — Email"),
    commType: "comm-email",
    template: "Welcome Email",
    waitDays: 3,
    goalType: "Customer opens message",
  });
}
function buildReEngageHighEngagementFlow(journeyId) {
  return buildSimpleFlow(journeyId, {
    entryNode: entryAudienceNode(journeyId, "High Engagement — No Recent Trade"),
    commType: "comm-webmessage",
    template: "Investment Insight",
    waitDays: 2,
    goalType: "Customer places order",
  });
}
function buildPlatinumUpsellFlow(journeyId) {
  return buildSimpleFlow(journeyId, {
    entryNode: entryAudienceNode(journeyId, "High Value Customers"),
    commType: "comm-sms",
    template: "Account Notification",
    waitDays: 2,
    goalType: "Customer reaches engagement score",
  });
}
function buildReOnboardingFlow(journeyId) {
  return buildSimpleFlow(journeyId, {
    entryNode: entryAudienceNode(journeyId, "Recently Registered"),
    commType: "comm-email",
    template: "Welcome Email",
    waitDays: 5,
    goalType: "Customer logs in",
  });
}
function buildQ2BirthdayFlow(journeyId) {
  return buildSimpleFlow(journeyId, {
    entryNode: entryAudienceNode(journeyId, "Birthday — Next 30 Days"),
    commType: "comm-email",
    template: "Birthday Greeting",
    waitDays: 2,
    goalType: "Customer opens message",
  });
}
function buildSpringReactivationFlow(journeyId) {
  return buildSimpleFlow(journeyId, {
    entryNode: entryAudienceNode(journeyId, "Dormant Investors"),
    commType: "comm-zalo",
    template: "Promotion Notice",
    waitDays: 3,
    goalType: "Customer logs in",
  });
}

/* ---------------------------------------------------------------- */
/* Journeys                                                           */
/* ---------------------------------------------------------------- */
function makeJourney({ id, name, description, status, owner, createdAt, updatedAt, audienceLabel, flow, metrics }) {
  return {
    id,
    name,
    description,
    status,
    owner,
    createdAt,
    updatedAt,
    entry: flow.nodes[0],
    audienceLabel,
    goal: flow.nodes.find((n) => n.type === "goal")?.config.goalType || "—",
    nodes: flow.nodes,
    edges: flow.edges,
    entryId: flow.entryId,
    metrics: metrics || { entered: 0, active: 0, completed: 0, exited: 0, goalRate: 0 },
  };
}

export const JOURNEYS = [
  makeJourney({
    id: "jr-birthday",
    name: "Birthday Engagement",
    description: "Sends a birthday greeting across channels and measures message engagement.",
    status: "Active",
    owner: "CRM Team",
    createdAt: "14 Feb 2023",
    updatedAt: "18 Sep 2026",
    audienceLabel: "3,182",
    flow: buildBirthdayFlow("jr-birthday"),
    metrics: { entered: 3182, active: 421, completed: 2184, exited: 577, goalRate: 68.6 },
  }),
  makeJourney({
    id: "jr-new-investor",
    name: "New Investor Onboarding",
    description: "Welcomes newly registered customers and nudges toward a first trade.",
    status: "Active",
    owner: "Lifecycle Team",
    createdAt: "01 Mar 2025",
    updatedAt: "18 Sep 2026",
    audienceLabel: "4,218",
    flow: buildNewInvestorFlow("jr-new-investor"),
    metrics: { entered: 4218, active: 892, completed: 2940, exited: 386, goalRate: 54.2 },
  }),
  makeJourney({
    id: "jr-dormant",
    name: "Dormant Investor Re-engagement",
    description: "Re-engages dormant investors by email, escalating to a Meta Ads audience sync if unopened.",
    status: "Draft",
    owner: "Lifecycle Team",
    createdAt: "20 Jun 2026",
    updatedAt: "15 Sep 2026",
    audienceLabel: "31,420",
    flow: buildDormantFlow("jr-dormant"),
    metrics: { entered: 0, active: 0, completed: 0, exited: 0, goalRate: 0 },
  }),
  makeJourney({
    id: "jr-high-value",
    name: "High Value Investor Engagement",
    description: "Multi-channel engagement for high value customers, escalating to advertising audience sync.",
    status: "Active",
    owner: "CRM Team",
    createdAt: "03 Jul 2026",
    updatedAt: "17 Sep 2026",
    audienceLabel: "12,804",
    flow: buildHighValueFlow("jr-high-value"),
    metrics: { entered: 12804, active: 2140, completed: 9021, exited: 1643, goalRate: 70.4 },
  }),
  makeJourney({
    id: "jr-post-trade",
    name: "Post Trade Engagement",
    description: "Confirms a trade and follows up with an educational insight.",
    status: "Active",
    owner: "CRM Team",
    createdAt: "12 Aug 2026",
    updatedAt: "18 Sep 2026",
    audienceLabel: "Event-based",
    flow: buildPostTradeFlow("jr-post-trade"),
    metrics: { entered: 58940, active: 6204, completed: 49812, exited: 2924, goalRate: 84.5 },
  }),
  makeJourney({
    id: "jr-mobile-engagement",
    name: "Mobile Engagement Boost",
    description: "Prompts active mobile investors with a morning market brief.",
    status: "Active",
    owner: "Growth Team",
    createdAt: "10 Jan 2026",
    updatedAt: "16 Sep 2026",
    audienceLabel: "48,231",
    flow: buildMobileEngagementFlow("jr-mobile-engagement"),
    metrics: { entered: 48231, active: 5210, completed: 39820, exited: 3201, goalRate: 61.8 },
  }),
  makeJourney({
    id: "jr-email-consent",
    name: "Email Consent Nurture",
    description: "Welcomes customers who granted email marketing consent.",
    status: "Active",
    owner: "Growth Team",
    createdAt: "10 Jan 2022",
    updatedAt: "18 Sep 2026",
    audienceLabel: "54,812",
    flow: buildEmailConsentFlow("jr-email-consent"),
    metrics: { entered: 54812, active: 4920, completed: 46102, exited: 3790, goalRate: 58.3 },
  }),
  makeJourney({
    id: "jr-reengage-high-engagement",
    name: "Re-engage High Engagement Non-Traders",
    description: "Nudges highly engaged customers who have not traded recently toward placing an order.",
    status: "Active",
    owner: "Lifecycle Team",
    createdAt: "15 Aug 2026",
    updatedAt: "17 Sep 2026",
    audienceLabel: "8,642",
    flow: buildReEngageHighEngagementFlow("jr-reengage-high-engagement"),
    metrics: { entered: 8642, active: 1024, completed: 6890, exited: 728, goalRate: 49.1 },
  }),
  makeJourney({
    id: "jr-platinum-upsell",
    name: "Platinum Tier Upsell",
    description: "Draft concept for encouraging high-value customers toward platinum-tier engagement.",
    status: "Draft",
    owner: "CRM Team",
    createdAt: "05 Sep 2026",
    updatedAt: "12 Sep 2026",
    audienceLabel: "12,804",
    flow: buildPlatinumUpsellFlow("jr-platinum-upsell"),
    metrics: { entered: 0, active: 0, completed: 0, exited: 0, goalRate: 0 },
  }),
  makeJourney({
    id: "jr-reonboarding",
    name: "Re-onboarding Experiment",
    description: "Draft experiment testing a longer onboarding nurture window.",
    status: "Draft",
    owner: "Growth Team",
    createdAt: "08 Sep 2026",
    updatedAt: "14 Sep 2026",
    audienceLabel: "4,218",
    flow: buildReOnboardingFlow("jr-reonboarding"),
    metrics: { entered: 0, active: 0, completed: 0, exited: 0, goalRate: 0 },
  }),
  makeJourney({
    id: "jr-q2-birthday",
    name: "Q2 Birthday Campaign",
    description: "Prior quarter's birthday campaign — completed run, kept for reference.",
    status: "Completed",
    owner: "CRM Team",
    createdAt: "01 Apr 2026",
    updatedAt: "30 Jun 2026",
    audienceLabel: "2,940",
    flow: buildQ2BirthdayFlow("jr-q2-birthday"),
    metrics: { entered: 2940, active: 0, completed: 2412, exited: 528, goalRate: 82.0 },
  }),
  makeJourney({
    id: "jr-spring-reactivation",
    name: "Spring Reactivation",
    description: "Completed spring re-engagement push for dormant investors.",
    status: "Completed",
    owner: "Lifecycle Team",
    createdAt: "01 Mar 2026",
    updatedAt: "31 May 2026",
    audienceLabel: "28,104",
    flow: buildSpringReactivationFlow("jr-spring-reactivation"),
    metrics: { entered: 28104, active: 0, completed: 19842, exited: 8262, goalRate: 70.6 },
  }),
];

export function getJourneyById(id) {
  return JOURNEYS.find((j) => j.id === id);
}

/* ---------------------------------------------------------------- */
/* Cross-page persistence (session-only)                             */
/* All Journeys and Journey Builder are separate pages/files, each   */
/* with its own JS module instance — a plain in-memory array (the    */
/* pattern used on the single-page Audiences module) can't survive a */
/* real navigation between them. sessionStorage is the lightest way  */
/* to make "Save" in the builder actually show up back on the list,  */
/* without implying any real backend — it's gone once the tab closes.*/
/* ---------------------------------------------------------------- */
const STORAGE_KEY = "phs-cdp-journey-overrides";

function readOverrides() {
  try {
    return JSON.parse(sessionStorage.getItem(STORAGE_KEY) || "{}");
  } catch {
    return {};
  }
}

function writeOverrides(overrides) {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(overrides));
  } catch {
    /* storage unavailable — edits just won't carry over to the other page this session */
  }
}

/** Base mock journeys merged with any edits/new journeys saved this session. */
export function loadJourneys() {
  const overrides = readOverrides();
  const merged = JOURNEYS.map((j) => overrides[j.id] || j);
  const newOnes = Object.keys(overrides)
    .filter((id) => !JOURNEYS.some((j) => j.id === id))
    .map((id) => overrides[id]);
  return [...merged, ...newOnes];
}

export function saveJourneyOverride(journey) {
  const overrides = readOverrides();
  overrides[journey.id] = journey;
  writeOverrides(overrides);
}

export function getNodeById(journey, nodeId) {
  return journey.nodes.find((n) => n.id === nodeId);
}

/** Always resolves the live entry node via entryId — `journey.entry` is
 * kept only as the spec's top-level field and can go stale after a
 * deep clone (edit mode); never read it directly for display or logic. */
export function getEntryNode(journey) {
  return getNodeById(journey, journey.entryId);
}

export function outgoingEdges(journey, nodeId) {
  return journey.edges.filter((e) => e.from === nodeId);
}

/* ---------------------------------------------------------------- */
/* Test Journey — simulation only, no real actions ever execute      */
/* ---------------------------------------------------------------- */
export const TEST_CUSTOMERS = CUSTOMERS.map((c) => ({ id: c.id, crmId: c.crmId, name: c.name, tier: c.tier, lifecycle: c.lifecycle, location: c.location }));

/**
 * Deterministic mock simulation — walks the journey's first branch
 * path (always following "yes") and reports a plausible outcome per
 * step. Not a real rules engine; just enough to demonstrate the
 * concept safely. Never triggers a real send/sync.
 */
export function simulateJourney(journey, customer) {
  const steps = [];
  let current = getNodeById(journey, journey.entryId);
  let guard = 0;
  while (current && guard < 20) {
    guard += 1;
    steps.push(describeSimStep(current, customer));
    if (current.type === "exit" || current.type === "goal") break;
    const out = outgoingEdges(journey, current.id);
    if (!out.length) break;
    const next = out.find((e) => e.branch === "yes") || out[0];
    current = getNodeById(journey, next.to);
  }
  return steps;
}

function describeSimStep(nodeEntry, customer) {
  const base = { nodeId: nodeEntry.id, type: nodeEntry.type, name: nodeEntry.name };
  switch (nodeEntry.category) {
    case "entry":
      return { ...base, label: "Entry", result: "Matched", detail: `${customer.name} matches this journey's entry condition.` };
    case "logic":
      if (nodeEntry.type === "consent-check") return { ...base, label: "Consent Check", result: "Granted", detail: `${nodeEntry.config.field}: Granted (mock).` };
      if (nodeEntry.type === "wait") return { ...base, label: "Wait", result: `${nodeEntry.config.amount ?? "—"} ${nodeEntry.config.unit ?? "days"}`, detail: "Simulated wait — no real delay occurs." };
      return { ...base, label: "Condition", result: "Matched", detail: `${nodeEntry.config.label || nodeEntry.name}: condition matched (mock).` };
    case "communication":
    case "audienceActivation":
    case "dataSystem":
      return { ...base, label: "Action", result: "Would execute", detail: `${nodeEntry.name} — no real message or sync is sent in simulation.` };
    case "goal":
      return { ...base, label: "Goal", result: "Not reached", detail: "Goal outcome is not yet measurable in a point-in-time simulation." };
    case "exit":
      return { ...base, label: "Exit", result: nodeEntry.config.reason || "Exit", detail: "Simulation ends here." };
    default:
      return { ...base, label: nodeEntry.name, result: "—", detail: "" };
  }
}
