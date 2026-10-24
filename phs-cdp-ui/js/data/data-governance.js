/*
  Data Governance (Governance) — a governance MAP, not a second platform.
  It explains and cross-references the identity, classification, and
  policy concepts that already live in other modules; it never
  duplicates their data or responsibilities.

  PATCHED (Phase 16 patch): the identity model is now described as a
  RudderStack Profiles-style identity graph / identity stitching /
  canonical identity — NOT a priority ladder. The underlying source of
  truth for an actual customer's identities is unchanged and still
  lives in js/data/customers.js (identities[]); this file only adds the
  conceptual identity-graph framing plus editable governance metadata
  (classification, governed data, PII controls, rules) as frontend-only
  mock state, with every edit logged to GOVERNANCE_ACTIVITY.

  This prototype does not connect to a live RudderStack Profiles
  project — "rudder-*" / "resolved entity" content below is an
  illustrative representation only.

  PATCHED (Phase 16 patch 2): Governance Rules is now a Policy /
  Enforcement control center — each policy names which EXISTING CDP
  capability enforces it (Tracking Plan, Consent Management,
  Transformation, Destination Controls, Profiles, Data Classification)
  rather than acting as a second rules engine. Two real figures are
  pulled live from the modules that actually own them, never
  duplicated: the Tracking policy's violation rate from data-quality.js
  trackingPlanCompliance(), and its source count from sources.js
  SOURCES — so this page can never drift out of sync with the real
  compliance numbers shown on Data Quality.
*/
import { SOURCES } from "./sources.js";
import { trackingPlanCompliance } from "./data-quality.js";

function pad2(n) {
  return String(n).padStart(2, "0");
}
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
function nowLabel() {
  const d = new Date();
  return `${pad2(d.getDate())} ${MONTHS[d.getMonth()]} ${d.getFullYear()} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}
function today() {
  const d = new Date();
  return `${pad2(d.getDate())} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

/* ------------------------------------------------------------------ */
/* Governance Activity — mock audit log. logActivity() is called by     */
/* every mutation function below; the page never writes to this array  */
/* directly.                                                            */
/* ------------------------------------------------------------------ */
export const GOVERNANCE_ACTIVITY = [
  { timestamp: "05 Oct 2026 14:22", actor: "Admin", object: "Email Classification", action: "Updated", previousValue: "Confidential", newValue: "Sensitive / PII" },
  { timestamp: "05 Oct 2026 13:58", actor: "Admin", object: "Identity Configuration", action: "Updated", previousValue: "appsflyer_id disabled", newValue: "appsflyer_id enabled" },
  { timestamp: "02 Oct 2026 09:15", actor: "Admin", object: "Transaction Data — PII Control", action: "Reviewed", previousValue: "—", newValue: "Prohibited (unchanged)" },
];
function logActivity(object, action, previousValue, newValue) {
  GOVERNANCE_ACTIVITY.unshift({ timestamp: nowLabel(), actor: "Admin", object, action, previousValue, newValue });
}

/* ------------------------------------------------------------------ */
/* Identity Graph + Resolved Entity + Canonical Identity (final patch). */
/* Conceptual model: RudderStack Identity Graph -> Resolved Entity ->   */
/* PHS Account ID (business identifier) -> Customer 360. The graph's    */
/* center node is the RESOLVED ENTITY itself ("PHS Entity") — never an  */
/* identifier — so Account ID is never presented as the canonical/      */
/* highest-priority node, only as one connected identifier among        */
/* several, consistent with RudderStack Profiles.                       */
/* ------------------------------------------------------------------ */
export const IDENTITY_GRAPH_NODES = [
  { id: "email", label: "Email", x: 320, y: 44 },
  { id: "mobile", label: "Mobile", x: 96, y: 172 },
  { id: "entity", label: "PHS Entity", x: 320, y: 172, primary: true },
  { id: "account", label: "Account ID", x: 544, y: 172 },
  { id: "appsflyer", label: "AppsFlyer ID", x: 320, y: 270 },
  { id: "anonymous", label: "Anonymous ID", x: 320, y: 344 },
];
export const IDENTITY_GRAPH_EDGES = [
  ["email", "entity"],
  ["mobile", "entity"],
  ["entity", "account"],
  ["entity", "appsflyer"],
  ["appsflyer", "anonymous"],
];

export const RESOLVED_ENTITY = {
  canonicalId: "rudder_8f92a1",
  businessIdentifier: "PHS001234",
  identifierCount: 5,
  resolution: "Deterministic",
  sources: ["CRM", "Website", "Mobile App", "AppsFlyer"],
  lastUpdated: "05 Oct 2026, 14:42",
  status: "Resolved",
};
export const CONNECTED_IDENTIFIERS = [
  { label: "Email", value: "xxx@xxx.com" },
  { label: "Mobile", value: "+84 ••• ••• 123" },
  { label: "Anonymous ID", value: "anon_••••91" },
  { label: "AppsFlyer ID", value: "af_••••82" },
  { label: "Account ID", value: "PHS001234" },
];

export const CANONICAL_IDENTITY = {
  canonicalId: "rudder_8f92a1",
  businessIdentifier: "PHS001234",
};

export const RUDDERSTACK_NOTE =
  "Conceptual model aligned with RudderStack Profiles: identity graph, connected identifiers, identity stitching and canonical identity. This prototype does not connect to a live RudderStack Profiles project.";

/* ------------------------------------------------------------------ */
/* Identity Stitching                                                   */
/* ------------------------------------------------------------------ */
export const IDENTITY_STITCHING_FLOW = ["Source Data", "Identity Signals", "Identity Graph", "Resolved Entity"];
export const IDENTITY_STITCHING_DESC =
  "Identity stitching connects identifiers observed across trusted data sources and groups them into a resolved customer entity.";

/* ------------------------------------------------------------------ */
/* Customer 360 integration — explains the relationship only; no        */
/* duplicate Customer 360 functionality lives here.                    */
/* ------------------------------------------------------------------ */
export const CUSTOMER_360_FLOW = ["Identity Graph", "Resolved Entity", "Customer 360"];
export const CUSTOMER_360_DESC =
  "Resolved identities provide the identity foundation for Customer 360, audience building, journey orchestration and downstream activation.";

/* ------------------------------------------------------------------ */
/* Identifiers — deliberately no priority / rank field.                 */
/* ------------------------------------------------------------------ */
export const IDENTIFIERS = [
  { identifier: "anonymous_id", identifierType: "Anonymous Identifier", source: "Website", role: "Identity Signal", pii: false, status: "Active" },
  { identifier: "user_id", identifierType: "User Identifier", source: "Mobile App", role: "Identity Signal", pii: false, status: "Active" },
  { identifier: "email", identifierType: "Email Address", source: "CRM / Website", role: "Identity Identifier", pii: true, status: "Active" },
  { identifier: "mobile", identifierType: "Mobile Number", source: "CRM", role: "Identity Identifier", pii: true, status: "Active" },
  { identifier: "appsflyer_id", identifierType: "AppsFlyer Identifier", source: "AppsFlyer", role: "Identity Identifier", pii: false, status: "Active" },
  { identifier: "account_id", identifierType: "PHS Account ID", source: "CRM", role: "Business Identifier", pii: false, status: "Active" },
];

/* ------------------------------------------------------------------ */
/* Identity Edge Sources — which sources can contribute identity        */
/* relationships to the graph. Not every source is live.                */
/* ------------------------------------------------------------------ */
export const IDENTITY_EDGE_SOURCES = [
  { source: "CRM", type: "Customer Data", signals: "Account ID, Email, Mobile", status: "Connected", lastUpdated: "05 Oct 2026" },
  { source: "Website", type: "Event Stream", signals: "Anonymous ID, Email, User ID", status: "Connected", lastUpdated: "05 Oct 2026" },
  { source: "Mobile App", type: "Event Stream", signals: "Anonymous ID, User ID, Device ID", status: "Connected", lastUpdated: "05 Oct 2026" },
  { source: "AppsFlyer", type: "Attribution Data", signals: "AppsFlyer ID", status: "Connected", lastUpdated: "05 Oct 2026" },
  { source: "Warehouse", type: "Batch Data", signals: "Account ID, Email", status: "Planned", lastUpdated: "—" },
  { source: "API", type: "Server-to-Server", signals: "Account ID, Custom Traits", status: "Planned", lastUpdated: "—" },
];

/* ------------------------------------------------------------------ */
/* Identity Health — lightweight summary metrics only.                  */
/* ------------------------------------------------------------------ */
export const IDENTITY_HEALTH = {
  resolvedEntities: 124582,
  identifiersLinked: 481920,
  identitySignals: 1240000,
  unresolvedIdentifiers: 8421,
  resolutionCoverage: 93.4,
};

/* ------------------------------------------------------------------ */
/* Identity Configuration — RudderStack Profiles-style entity config    */
/* (enable/disable identifiers and edge sources, canonical identifier,  */
/* entity name) instead of a CRM-style Left/Right rule builder.         */
/* Editable as frontend-only mock state via Edit Configuration.         */
/* ------------------------------------------------------------------ */
export const IDENTITY_CONFIGURATION = {
  entity: "Customer",
  canonicalIdentifier: "rudderId",
  status: "Active",
  identifiers: [
    { id: "anonymous_id", label: "anonymous_id", enabled: true },
    { id: "user_id", label: "user_id", enabled: true },
    { id: "email", label: "email", enabled: true },
    { id: "mobile", label: "mobile", enabled: true },
    { id: "account_id", label: "account_id", enabled: true },
    { id: "appsflyer_id", label: "appsflyer_id", enabled: true },
  ],
  edgeSources: [
    { id: "crm", label: "CRM", enabled: true },
    { id: "website", label: "Website", enabled: true },
    { id: "mobile-app", label: "Mobile App", enabled: true },
    { id: "appsflyer", label: "AppsFlyer", enabled: true },
  ],
};
function configSummary(cfg) {
  const idCount = cfg.identifiers.filter((i) => i.enabled).length;
  const srcCount = cfg.edgeSources.filter((s) => s.enabled).length;
  return `${cfg.entity} · ${idCount} identifiers · ${srcCount} edge sources`;
}
export function updateIdentityConfiguration(patch) {
  const before = configSummary(IDENTITY_CONFIGURATION);
  Object.assign(IDENTITY_CONFIGURATION, patch);
  logActivity("Identity Configuration", "Updated", before, configSummary(IDENTITY_CONFIGURATION));
  return IDENTITY_CONFIGURATION;
}

/* ------------------------------------------------------------------ */
/* Data Classification (section 17) — editable.                         */
/* ------------------------------------------------------------------ */
export const DATA_CLASSIFICATIONS = ["Public", "Internal", "Confidential", "Sensitive / PII", "Financial / Transaction"];
export const CLASSIFICATION_META = {
  Public: { badge: "badge--neutral" },
  Internal: { badge: "badge--info" },
  Confidential: { badge: "badge--gold" },
  "Sensitive / PII": { badge: "badge--danger" },
  "Financial / Transaction": { badge: "badge--primary" },
};
export const DATA_OWNERS = ["CRM", "Marketing", "Product", "Data", "IT", "Trading"];
export const EXTERNAL_TRANSFER_LEVELS = ["Controlled", "Restricted", "Prohibited"];
export const ROW_STATUSES = ["Active", "Inactive"];

export const DATA_CLASSIFICATION_ROWS = [
  { id: "cls-1", field: "Customer Name", classification: "Sensitive / PII", owner: "CRM", allowedUsage: "Customer 360", externalTransfer: "Restricted", status: "Active" },
  { id: "cls-2", field: "Phone Number", classification: "Sensitive / PII", owner: "CRM", allowedUsage: "Restricted Activation", externalTransfer: "Restricted", status: "Active" },
  { id: "cls-3", field: "Email", classification: "Sensitive / PII", owner: "CRM", allowedUsage: "Restricted Activation", externalTransfer: "Controlled", status: "Active" },
  { id: "cls-4", field: "Trading Account", classification: "Sensitive / PII", owner: "Trading", allowedUsage: "Internal Only", externalTransfer: "Prohibited", status: "Active" },
  { id: "cls-5", field: "Transaction History", classification: "Financial / Transaction", owner: "Trading", allowedUsage: "Segmentation / Analytics", externalTransfer: "Prohibited", status: "Active" },
  { id: "cls-6", field: "Product Interest", classification: "Confidential", owner: "Marketing", allowedUsage: "Segmentation", externalTransfer: "Controlled", status: "Active" },
  { id: "cls-7", field: "Anonymous Event ID", classification: "Internal", owner: "Data", allowedUsage: "Analytics", externalTransfer: "Restricted", status: "Active" },
];
export function updateClassificationRow(id, patch) {
  const row = DATA_CLASSIFICATION_ROWS.find((r) => r.id === id);
  if (!row) return;
  const before = row.classification;
  Object.assign(row, patch);
  if (before !== row.classification) logActivity(`${row.field} Classification`, "Updated", before, row.classification);
  else logActivity(`${row.field} Classification`, "Updated", "—", "Details updated");
  return row;
}

/* ------------------------------------------------------------------ */
/* Governed Data (sections 9-10 original, 18 patch) — editable.         */
/* ------------------------------------------------------------------ */
export const GOVERNED_DATA_CATEGORIES = ["Identity", "Behavior", "Transaction", "Consent"];
export const UPDATE_FREQUENCIES = ["Real-time", "Batch"];
export const GOVERNED_DATA = [
  { id: "gd-1", field: "Customer ID", category: "Identity", classification: "Internal", source: "CRM", owner: "CRM", updateFrequency: "Real-time", allowedUsage: "Customer 360 / Activation" },
  { id: "gd-2", field: "Email", category: "Identity", classification: "Sensitive / PII", source: "CRM", owner: "CRM", updateFrequency: "Batch", allowedUsage: "Restricted Activation" },
  { id: "gd-3", field: "Mobile Number", category: "Identity", classification: "Sensitive / PII", source: "CRM / App", owner: "CRM", updateFrequency: "Batch", allowedUsage: "Restricted Activation" },
  { id: "gd-4", field: "National ID", category: "Identity", classification: "Sensitive / PII", source: "CRM", owner: "CRM", updateFrequency: "Batch", allowedUsage: "Internal Only" },
  { id: "gd-5", field: "Trading Account", category: "Identity", classification: "Sensitive / PII", source: "Trading API", owner: "Trading", updateFrequency: "Real-time", allowedUsage: "Internal Only" },
  { id: "gd-6", field: "Product Interest", category: "Behavior", classification: "Confidential", source: "PHS Website / Mobile App", owner: "Marketing", updateFrequency: "Real-time", allowedUsage: "Segmentation" },
  { id: "gd-7", field: "Transaction Activity", category: "Transaction", classification: "Financial / Transaction", source: "Trading API", owner: "Trading", updateFrequency: "Batch", allowedUsage: "Segmentation / Analytics" },
  { id: "gd-8", field: "Marketing Consent", category: "Consent", classification: "Internal", source: "CRM / Preference Center", owner: "Data", updateFrequency: "Real-time", allowedUsage: "Activation Eligibility" },
  { id: "gd-9", field: "Anonymous Event ID", category: "Behavior", classification: "Internal", source: "PHS Website", owner: "Data", updateFrequency: "Real-time", allowedUsage: "Analytics" },
];
export function updateGovernedDataRow(id, patch) {
  const row = GOVERNED_DATA.find((r) => r.id === id);
  if (!row) return;
  const before = row.classification;
  Object.assign(row, patch);
  logActivity(`${row.field} (Governed Data)`, "Updated", before, row.classification);
  return row;
}

/* ------------------------------------------------------------------ */
/* Source -> Data -> Governance -> Destination (section 11, unpatched)  */
/* ------------------------------------------------------------------ */
export const GOVERNANCE_FLOW = [
  { source: "Mobile App", data: "Behavioral Events", governance: "Tracking Plan", destination: "CDP / Analytics" },
  { source: "CRM", data: "Customer Attributes", governance: "PII Policy", destination: "Customer 360" },
  { source: "Trading API", data: "Transaction Data", governance: "Financial Data Policy", destination: "Segmentation (internal)" },
];

/* ------------------------------------------------------------------ */
/* PII Handling flow (kept) + PII Controls table (section 19, editable) */
/* ------------------------------------------------------------------ */
export const PII_HANDLING_FLOW = ["Internal Systems", "Raw Sensitive Data", "Masking / Hashing", "CDP / Activation Layer", "External Destination"];
export const PII_DISCLAIMER =
  "Masking / hashing according to approved security policy. This is a prototype architecture representation, not legal advice — hashing does not automatically remove personal-data status.";

export const PII_CONTROLS = [
  { id: "pii-1", field: "Phone Number", classification: "Sensitive / PII", externalTransfer: "Restricted", handling: "Mask / Hash according to approved security policy", status: "Active" },
  { id: "pii-2", field: "Email", classification: "Sensitive / PII", externalTransfer: "Controlled", handling: "Controlled transfer to approved channels only", status: "Active" },
  { id: "pii-3", field: "National ID", classification: "Sensitive / PII", externalTransfer: "Prohibited", handling: "Internal Only", status: "Active" },
  { id: "pii-4", field: "Transaction Data", classification: "Financial / Transaction", externalTransfer: "Prohibited", handling: "Internal Only", status: "Active" },
];
export function updatePiiControl(id, patch) {
  const row = PII_CONTROLS.find((r) => r.id === id);
  if (!row) return;
  const before = row.externalTransfer;
  Object.assign(row, patch);
  logActivity(`${row.field} (PII Control)`, "Updated", before, row.externalTransfer);
  return row;
}

/* ------------------------------------------------------------------ */
/* Data Access Level (kept)                                             */
/* ------------------------------------------------------------------ */
export const ACCESS_LEVELS = [
  { classification: "Public", accessLevel: "General", exampleUse: "Public product information" },
  { classification: "Internal", accessLevel: "Employees / approved systems", exampleUse: "Internal reporting, non-sensitive identifiers" },
  { classification: "Confidential", accessLevel: "Authorized teams", exampleUse: "Segmentation, product interest" },
  { classification: "Sensitive / PII", accessLevel: "Restricted access", exampleUse: "Identity resolution, masked activation" },
  { classification: "Financial / Transaction", accessLevel: "Highly restricted", exampleUse: "Trading, compliance, risk" },
];

/* ------------------------------------------------------------------ */
/* Governance Rules -> Policy / Enforcement control center.             */
/*                                                                       */
/*   Governance Rules                                                   */
/*         |                                                            */
/*   Policy / Control Layer                                             */
/*         |                                                            */
/*   Existing CDP enforcement capability                                */
/*     (Tracking Plan / Consent Management / Transformation /           */
/*      Destination Controls / Profiles / Data Classification)          */
/*                                                                       */
/* "Policy defines what is allowed. Enforcement controls where and how  */
/* it is applied." This is a PHS CDP control-plane abstraction inspired */
/* by RudderStack's governance-as-code model — not a claim that         */
/* RudderStack ships this exact screen, and not a second engine: every  */
/* policy only REFERENCES the real module that enforces it.             */
/* ------------------------------------------------------------------ */
export const POLICY_TYPES = ["Privacy", "Data Quality", "Consent", "Identity", "Routing", "Data Classification"];
export const ENFORCEMENT_TYPES = ["Tracking Plan", "Consent Management", "Transformation", "Destination Controls", "Profiles", "Data Classification"];
export const POLICY_STATUSES = ["Active", "Draft", "Disabled"];
export const PII_ACTIONS = ["Mask", "Hash", "Drop"];
const POLICY_ACTOR = "CRM Automation Admin";

const compliance = trackingPlanCompliance({ preset: "Last 7 days" });

export const GOVERNANCE_POLICIES = [
  {
    id: "pol-pii",
    policy: "PII Protection",
    type: "Privacy",
    enforcement: "Transformation",
    scope: "External Destinations",
    status: "Active",
    lastUpdated: "24 Sep 2026",
    updatedBy: POLICY_ACTOR,
    description: "Sensitive identifiers must be protected before external activation.",
    warning: "Changes may affect which customer attributes are delivered to external destinations.",
    relationshipFlow: ["Governance Policy", "Transformation", "Destinations"],
    impact: { modules: ["Transformations", "Destinations"], affectedDestinations: 3, dataTypes: ["Email", "Mobile", "National ID"] },
    config: {
      protectedFields: [
        { field: "Email", action: "Mask" },
        { field: "Mobile Number", action: "Mask" },
        { field: "National ID", action: "Drop" },
        { field: "Date of Birth", action: "Mask / Day-Month only" },
      ],
      appliesTo: ["Meta Ads", "Google Ads", "Email Provider"],
      linkedEnforcement: "Transformation: PII Masking — External Activation",
    },
  },
  {
    id: "pol-tracking",
    policy: "Tracking",
    type: "Data Quality",
    enforcement: "Tracking Plan",
    scope: "Event Sources",
    status: "Active",
    lastUpdated: "24 Sep 2026",
    updatedBy: POLICY_ACTOR,
    description: "Behavioral events must conform to the linked Tracking Plan before being considered valid.",
    relationshipFlow: ["Governance Policy", "Tracking Plan", "Event Validation", "Destination"],
    impact: { modules: ["Tracking Plans", "Data Quality"], affectedSources: SOURCES.length, dataTypes: ["Event Schema"] },
    config: {
      trackingPlanLabel: "PHS Core Events v3",
      trackingPlanHref: "tracking-plans.html",
      validationMode: "Enforce",
      onViolation: "Forward With Violation Metadata",
      eventsCovered: 42,
      requiredProperties: 128,
      violationRate: compliance.violationRate,
    },
  },
  {
    id: "pol-consent",
    policy: "Consent",
    type: "Consent",
    enforcement: "Consent Management",
    scope: "Activation",
    status: "Active",
    lastUpdated: "24 Sep 2026",
    updatedBy: POLICY_ACTOR,
    description: "Marketing activation must respect customer consent and channel preferences.",
    warning: "Changes may affect which customers are eligible for activation.",
    relationshipFlow: ["Governance Policy", "Consent Management", "Destination Eligibility", "Activation"],
    impact: { modules: ["Consent & Preferences", "Destinations"], affectedDestinations: 5, dataTypes: ["Consent State"] },
    config: {
      requiredCategories: ["Marketing", "Analytics", "Personalization"],
      destinationScope: ["Email", "SMS", "Push", "Meta Ads", "Google Ads"],
      logic: "AND",
      rules: [
        { destination: "Marketing activation", requires: "Marketing consent = Granted" },
        { destination: "Analytics destination", requires: "Analytics consent = Granted" },
      ],
      consentHref: "consent-preferences.html",
    },
  },
  {
    id: "pol-identity",
    policy: "Identity",
    type: "Identity",
    enforcement: "Profiles",
    scope: "Customer Identity",
    status: "Active",
    lastUpdated: "24 Sep 2026",
    updatedBy: POLICY_ACTOR,
    description: "Customer identity must resolve using the approved Identity Graph configuration.",
    warning: "Changes may affect Customer 360 identity resolution and audience membership.",
    relationshipFlow: ["Governance Policy", "Profiles", "Identity Graph", "Customer 360"],
    impact: { modules: ["Customer 360", "Audiences"], affectedSources: 4, dataTypes: ["Identity"] },
    config: {
      identityModel: "Identity Graph",
      canonicalIdentity: "rudderId",
      businessIdentifier: "PHS Account ID",
      identitySources: ["CRM", "Website", "Mobile App", "AppsFlyer"],
      identityHref: "data-governance.html#identity",
    },
  },
  {
    id: "pol-activation",
    policy: "External Activation",
    type: "Routing",
    enforcement: "Destination Controls",
    scope: "External Destinations",
    status: "Active",
    lastUpdated: "24 Sep 2026",
    updatedBy: POLICY_ACTOR,
    description: "Only approved attributes/segments can be sent to external destinations.",
    warning: "Changes may affect which customer attributes are delivered to external destinations.",
    relationshipFlow: ["Governance Policy", "Destination Controls", "Activation"],
    impact: { modules: ["Destinations"], affectedDestinations: 3, dataTypes: ["Profile Attributes", "Transaction Data"] },
    config: {
      allowedDataClasses: ["Profile Attributes", "Audience Membership", "Behavioral Events"],
      restrictedData: ["Transaction Data", "National ID", "Full Mobile Number", "Full Email"],
      destinations: ["Meta Ads", "Google Ads", "Email Provider"],
      destinationsHref: "destinations.html",
    },
  },
  {
    id: "pol-transaction",
    policy: "Transaction Data",
    type: "Data Classification",
    enforcement: "Destination Controls",
    scope: "Internal Systems",
    status: "Active",
    lastUpdated: "24 Sep 2026",
    updatedBy: POLICY_ACTOR,
    description: "Detailed financial transaction data remains within approved internal systems.",
    relationshipFlow: ["Governance Policy", "Data Classification", "Destination Controls", "Internal Systems"],
    impact: { modules: ["Data Warehouse", "CRM", "Analytics"], affectedDestinations: 0, dataTypes: ["Transaction Data"] },
    config: {
      classification: "Restricted",
      allowedDestinations: ["Internal Warehouse", "CRM", "Analytics"],
      externalDestinations: "Blocked",
      examples: [
        { item: "Detailed transaction amount", rule: "Internal only" },
        { item: "Transaction history", rule: "Internal only" },
        { item: "Aggregated transaction segment", rule: "External activation allowed" },
      ],
    },
  },
];
export function getPolicyById(id) {
  return GOVERNANCE_POLICIES.find((p) => p.id === id);
}
function logPolicyActivity(policy, action, previousValue, newValue) {
  GOVERNANCE_ACTIVITY.unshift({ timestamp: nowLabel(), actor: POLICY_ACTOR, object: policy.policy, action, previousValue, newValue });
}
export function updatePolicy(id, patch, activityNote) {
  const policy = GOVERNANCE_POLICIES.find((p) => p.id === id);
  if (!policy) return;
  const beforeStatus = policy.status;
  Object.assign(policy, patch, { lastUpdated: today(), updatedBy: POLICY_ACTOR });
  if (activityNote) {
    logPolicyActivity(policy, activityNote.action, activityNote.previousValue, activityNote.newValue);
  } else if (patch.status && patch.status !== beforeStatus) {
    logPolicyActivity(policy, "Status Changed", beforeStatus, patch.status);
  } else {
    logPolicyActivity(policy, "Updated", "—", "Configuration updated");
  }
  return policy;
}

/* ------------------------------------------------------------------ */
/* Governance Coverage (section 15, patched) — a map, not a duplicate.  */
/* Every href below is an existing route; none are invented.           */
/* ------------------------------------------------------------------ */
export const GOVERNANCE_COVERAGE = [
  { concept: "Identity Graph", module: "Customer 360", href: "customer-360.html", icon: "circle-user-round", description: "Resolved identifiers and customer attributes are surfaced in Customer 360." },
  { concept: "Data Definitions", module: "Data Catalog", href: "data-catalog.html", icon: "folder-tree" },
  { concept: "Event Schema", module: "Tracking Plans", href: "tracking-plans.html", icon: "clipboard-check" },
  { concept: "Event Compliance", module: "Data Quality", href: "data-quality.html", icon: "badge-check" },
  { concept: "Consent", module: "Consent & Preferences", href: "consent-preferences.html", icon: "shield-check" },
  { concept: "Audience Activation", module: "Destinations", href: "destinations.html", icon: "share-2" },
];

/* ------------------------------------------------------------------ */
/* Overview architecture note (section 24) — conceptual only.          */
/* ------------------------------------------------------------------ */
export const ARCHITECTURE_LAYERS = [
  { label: "PHS Sources", items: ["Mobile App", "Website", "CRM", "Trading API", "AppsFlyer"] },
  { label: "Identity Edges", items: ["Deterministic identity relationships"] },
  { label: "Identity Graph", items: ["Connected identifiers"] },
  { label: "Resolved Entity", items: ["PHS Account ID", "Customer Traits"] },
  { label: "Customer 360", items: ["Unified customer view"] },
  { label: "Audiences / Journeys / Analytics", items: ["Downstream usage"] },
];
