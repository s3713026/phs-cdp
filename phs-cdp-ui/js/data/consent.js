/*
  Consent & Preferences (Data) — operational consent STATE, preference
  STATE, consent history and activation eligibility. This is the state/
  audit lens on consent (closer to a RudderStack-style Preference Center
  or consent-state store): "what is granted right now, where did it
  come from, what changed." It is deliberately distinct from Governance
  → Consent Management, which is the policy/purpose-configuration lens
  (legal basis per purpose) — the two do not duplicate each other.

  Reuses, never duplicates:
    Category / Channel taxonomy -> js/data/destinations.js (CONSENT_TYPES, MESSAGE_CHANNELS)
    Consent change events       -> js/data/events.js (the canonical "Consent Updated" event,
                                    via the same Event Explorer activity log Live Events uses —
                                    never a second event log)
    Date range resolution       -> js/data/data-quality.js (resolveRangeDays, DATE_RANGE_PRESETS)
    Destination records         -> js/data/destinations.js (DESTINATIONS, by id) for Activation
                                    Eligibility — never invented destination names.
*/
import { CONSENT_TYPES, MESSAGE_CHANNELS, getDestinationById } from "./destinations.js";
import { getExplorerEvents, formatExplorerTimestamp } from "./events.js";
import { resolveRangeDays, DATE_RANGE_PRESETS } from "./data-quality.js";

function hashString(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) >>> 0;
  return h;
}

export { DATE_RANGE_PRESETS };
export const CONSENT_CATEGORIES = CONSENT_TYPES;
export const CONSENT_CHANNELS = MESSAGE_CHANNELS;
export const CONSENT_STATUSES = ["Granted", "Denied", "Withdrawn", "Not Set"];
export const STATUS_META = {
  Granted: { badge: "badge--success", color: "var(--chart-green)" },
  Denied: { badge: "badge--neutral", color: "var(--chart-neutral)" },
  Withdrawn: { badge: "badge--warning", color: "var(--chart-gold)" },
  "Not Set": { badge: "badge--neutral", color: "var(--color-ink-200)" },
};
export const CONSENT_SOURCES = ["Mobile App", "Web", "CRM", "Call Center", "Preference Center", "API", "Imported"];

/* ------------------------------------------------------------------ */
/* Overview (section 5) — descriptive snapshot metrics, not a score.   */
/* Current-state distribution, so not date-ranged (the Date Range      */
/* filter governs Consent History below, which is time-based by       */
/* nature — a "granted %" snapshot has no meaningful range).           */
/* ------------------------------------------------------------------ */
const TOTAL_RECORDS = 1284392;
export function consentOverview() {
  const byCategory = consentByCategory();
  const marketing = byCategory.find((c) => c.category === "Marketing");
  const analytics = byCategory.find((c) => c.category === "Analytics");
  const personalization = byCategory.find((c) => c.category === "Personalization");
  const withdrawnAvg = byCategory.reduce((sum, c) => sum + c.withdrawn, 0) / byCategory.length;
  return {
    totalRecords: TOTAL_RECORDS,
    marketingGranted: marketing.granted,
    analyticsGranted: analytics.granted,
    personalizationGranted: personalization.granted,
    withdrawnAvg: +withdrawnAvg.toFixed(1),
  };
}

/* ------------------------------------------------------------------ */
/* Consent by Category (section 6)                                     */
/* ------------------------------------------------------------------ */
export function consentByCategory() {
  return CONSENT_CATEGORIES.map((category) => {
    const h = hashString(category);
    const granted = 55 + (h % 30);
    const denied = 8 + (h % 18);
    const withdrawn = 2 + (h % 6);
    const notSet = Math.max(0, 100 - granted - denied - withdrawn);
    return { category, granted, denied, withdrawn, notSet };
  });
}

/* ------------------------------------------------------------------ */
/* Communication Preferences (section 7)                               */
/* ------------------------------------------------------------------ */
export function communicationPreferences() {
  return CONSENT_CHANNELS.map((channel) => {
    const h = hashString(channel + "-channel");
    const allowed = 45 + (h % 40);
    const denied = 8 + (h % 30);
    const notSet = Math.max(0, 100 - allowed - denied);
    const day = 2 + (h % 27);
    return {
      channel,
      allowed,
      denied,
      notSet,
      lastUpdated: `${String(day).padStart(2, "0")} Sep 2026`,
      coverage: allowed,
    };
  });
}

/* ------------------------------------------------------------------ */
/* Consent Sources (section 8)                                         */
/* ------------------------------------------------------------------ */
export function consentSourcesSummary() {
  return CONSENT_SOURCES.map((source) => {
    const h = hashString(source + "-source");
    const records = 8000 + (h % 240000);
    const grantedPct = 50 + (h % 35);
    const granted = Math.round(records * (grantedPct / 100));
    const denied = Math.round(records * ((100 - grantedPct) / 100) * 0.6);
    const hoursAgo = 1 + (h % 48);
    return {
      source,
      records,
      granted,
      denied,
      lastActivity: `${hoursAgo} hr${hoursAgo === 1 ? "" : "s"} ago`,
      status: h % 11 === 0 ? "Inactive" : "Active",
    };
  });
}

/* ------------------------------------------------------------------ */
/* Consent History (section 9) — wraps the canonical "Consent Updated" */
/* event stream (js/data/events.js Event Explorer activity), enriched  */
/* with the category/status/channel fields this page needs. Never a    */
/* second event log — same underlying per-occurrence records Live      */
/* Events reads.                                                       */
/* ------------------------------------------------------------------ */
function enrichHistoryEntry(e) {
  const h = hashString(e.id);
  const category = CONSENT_CATEGORIES[h % CONSENT_CATEGORIES.length];
  const statusesForTransition = CONSENT_STATUSES.filter((_, i) => i !== (h >> 3) % CONSENT_STATUSES.length);
  const previousState = statusesForTransition[h % statusesForTransition.length];
  const newState = CONSENT_STATUSES[(h >> 3) % CONSENT_STATUSES.length];
  const channel = CONSENT_CHANNELS[h % CONSENT_CHANNELS.length];
  return {
    id: e.id,
    recordId: `consent-${(h >>> 0).toString(16).padStart(8, "0")}`,
    timestamp: formatExplorerTimestamp(e),
    customerMasked: e.customerMasked,
    category,
    previousState,
    newState,
    source: e.source,
    channel,
  };
}

export function consentHistory(dateFilter) {
  return getExplorerEvents({ dateFilter, eventName: "Consent Updated" }).map(enrichHistoryEntry);
}

export function getConsentHistoryEntry(id, dateFilter) {
  return consentHistory(dateFilter || { preset: "Last 30 days" }).find((r) => r.id === id);
}

export function filterConsentHistory(list, filters = {}) {
  const q = (filters.query || "").trim().toLowerCase();
  return list
    .filter((r) => !q || r.customerMasked.toLowerCase().includes(q) || r.recordId.toLowerCase().includes(q))
    .filter((r) => !filters.category?.length || filters.category.includes(r.category))
    .filter((r) => !filters.status?.length || filters.status.includes(r.newState))
    .filter((r) => !filters.source?.length || filters.source.includes(r.source))
    .filter((r) => !filters.channel?.length || filters.channel.includes(r.channel));
}

/* ------------------------------------------------------------------ */
/* Consent Policy (section 14) — conceptual Category -> Channel ->      */
/* Activation Eligibility relationship. Prototype visualization only;  */
/* no audience filtering or journey execution is implemented here.     */
/* ------------------------------------------------------------------ */
export const CONSENT_POLICIES = [
  { category: "Marketing", channel: "Email", rule: "Eligible only when Marketing = Granted AND Email = Allowed" },
  { category: "Marketing", channel: "SMS", rule: "Eligible only when Marketing = Granted AND SMS = Allowed" },
  { category: "Marketing", channel: "Push", rule: "Eligible only when Marketing = Granted AND Push = Allowed" },
  { category: "Marketing", channel: "Zalo", rule: "Eligible only when Marketing = Granted AND Zalo = Allowed" },
  { category: "Personalization", channel: "In-App", rule: "Eligible only when Personalization = Granted AND In-App = Allowed" },
  { category: "Personalization", channel: "Web Message", rule: "Eligible only when Personalization = Granted AND Web Message = Allowed" },
  { category: "Analytics", channel: "—", rule: "Governs analytics instrumentation eligibility; not tied to a communication channel" },
];

/* ------------------------------------------------------------------ */
/* Activation Eligibility (section 15) — references real Destination   */
/* connection records (js/data/destinations.js) by id, never invented  */
/* destination names. Informational only — no real sync/blocking.      */
/* ------------------------------------------------------------------ */
const ACTIVATION_ELIGIBILITY_SEED = [
  { destinationId: "email", requirements: ["Marketing consent required", "Email preference required"] },
  { destinationId: "push", requirements: ["Marketing consent required", "Push preference required"] },
  { destinationId: "sms", requirements: ["Marketing consent required", "SMS preference required"] },
  { destinationId: "meta-ads", requirements: ["Marketing consent required"] },
  { destinationId: "google-ads", requirements: ["Marketing consent required"] },
  { destinationId: "crm", requirements: ["Based on configured consent policy"] },
];
export function activationEligibility() {
  return ACTIVATION_ELIGIBILITY_SEED.map((row) => ({
    ...row,
    destination: getDestinationById(row.destinationId),
  })).filter((row) => row.destination);
}
