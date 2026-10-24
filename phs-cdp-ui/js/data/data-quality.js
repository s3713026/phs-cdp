/*
  PHS CDP — Data Quality (Phase 14, patched v2 to a RudderStack-aligned
  scope). This is deliberately narrow: Tracking Plan compliance, event
  schema violations, event volume, source-level and Tracking-Plan-
  level quality, and destination delivery health. It does NOT cover
  identity/profile/trait completeness — that's out of scope by design
  so this page maps cleanly onto a future RudderStack-style API.

  Every reference resolves against existing canonical records by id:
    Source            -> js/data/sources.js        (SOURCES)
    Event Stream        -> js/data/event-streams.js  (EVENT_STREAMS, eventDestinationConnections)
    Tracking Plan        -> js/data/tracking-plans.js (TRACKING_PLANS)
    Event / Property       -> js/data/events.js          (EVENT_CATALOG)
  Nothing here duplicates those models — it only annotates them with
  an observed-compliance lens.
*/
import { SOURCES } from "./sources.js";
import { getStreamById, streamTrackingPlan, eventDestinationConnections } from "./event-streams.js";
import { TRACKING_PLANS, getPlanById } from "./tracking-plans.js";
import { EVENT_CATALOG, getEventById, getEventByName, EVENT_CATEGORY_META } from "./events.js";

function hashString(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) >>> 0;
  return h;
}
export const MOCK_TODAY = "24 Sep 2026";

/* ---------------------------------------------------------------- */
/* Date / time range — including a real Custom start/end picker.       */
/* ---------------------------------------------------------------- */
export const DATE_RANGE_PRESETS = ["Last 24 hours", "Last 7 days", "Last 30 days", "Custom"];
const RANGE_DAYS = { "Last 24 hours": 1, "Last 7 days": 7, "Last 30 days": 30 };
export function resolveRangeDays(dateFilter) {
  if (!dateFilter) return 1;
  if (dateFilter.preset === "Custom" && dateFilter.startDate && dateFilter.endDate) {
    const start = new Date(`${dateFilter.startDate}T${dateFilter.startTime || "00:00"}`);
    const end = new Date(`${dateFilter.endDate}T${dateFilter.endTime || "23:59"}`);
    const diff = (end - start) / 86400000;
    return Math.max(diff, 1 / 96);
  }
  return RANGE_DAYS[dateFilter.preset] ?? 1;
}

/* ---------------------------------------------------------------- */
/* RudderStack-aligned violation taxonomy (section 8) — five types,    */
/* nothing PHS-specific added.                                         */
/* ---------------------------------------------------------------- */
export const VIOLATION_TYPES = ["Unplanned Event", "Missing Required Property", "Datatype Mismatch", "Additional Property", "Unknown Violation"];
export const VIOLATION_TYPE_DESCRIPTIONS = {
  "Unplanned Event": "An event is received that is not defined in the Tracking Plan.",
  "Missing Required Property": "A required property is missing.",
  "Datatype Mismatch": "A property value does not match the expected datatype.",
  "Additional Property": "An event contains a property that is not defined by the Tracking Plan.",
  "Unknown Violation": "A violation that cannot be classified into the standard categories.",
};
export const SEVERITIES = ["High", "Medium", "Low"];
export const SEVERITY_META = {
  High: { badge: "badge--danger" },
  Medium: { badge: "badge--warning" },
  Low: { badge: "badge--neutral" },
};
export const ISSUE_STATUSES = ["Open", "Investigating", "Resolved", "Ignored"];
export const QUALITY_STATUSES = ["Healthy", "Warning", "Critical"];
export const QUALITY_STATUS_META = {
  Healthy: { badge: "badge--success", dot: "status-dot--success" },
  Warning: { badge: "badge--warning", dot: "status-dot--warning" },
  Critical: { badge: "badge--danger", dot: "status-dot--danger" },
};
export function qualityStatusFor(violationRatePct) {
  if (violationRatePct <= 2) return "Healthy";
  if (violationRatePct <= 5) return "Warning";
  return "Critical";
}

/* ---------------------------------------------------------------- */
/* Quality by Source (section 9) — references real SOURCES records.   */
/* Each source also references the Tracking Plan governing it.         */
/* ---------------------------------------------------------------- */
const SOURCE_QUALITY_SEED = [
  { sourceId: "phs-mobile-app", trackingPlanId: "tp-mobile", eventsValidatedBase: 1820000, violationRate: 0.4, droppedRate: 0.05 },
  { sourceId: "trading-api", trackingPlanId: "tp-trading", eventsValidatedBase: 620000, violationRate: 1.1, droppedRate: 0.1 },
  { sourceId: "phs-website", trackingPlanId: "tp-web", eventsValidatedBase: 280000, violationRate: 2.2, droppedRate: 0.2 },
  { sourceId: "webhook-source", trackingPlanId: null, eventsValidatedBase: 96000, violationRate: 3.4, droppedRate: 0.3 },
  { sourceId: "appsflyer", trackingPlanId: "tp-appsflyer", eventsValidatedBase: 84000, violationRate: 4.7, droppedRate: 0.6 },
  { sourceId: "crm-source", trackingPlanId: null, eventsValidatedBase: 12000, violationRate: 1.8, droppedRate: 0.1 },
  { sourceId: "partner-api-events", trackingPlanId: "tp-partner-api", eventsValidatedBase: 36000, violationRate: 11.7, droppedRate: 2.1 },
];
export const SOURCE_QUALITY = SOURCE_QUALITY_SEED.map((s) => ({
  ...s,
  status: qualityStatusFor(s.violationRate),
}));
export function getSourceRecord(id) {
  return SOURCES.find((s) => s.id === id);
}

/* ---------------------------------------------------------------- */
/* Quality by Tracking Plan (section 10) — aggregated by grouping the  */
/* Sources above by their real Tracking Plan reference. Never a         */
/* second Tracking Plan model — every plan here is a real TRACKING_PLANS*/
/* record, looked up by id.                                             */
/* ---------------------------------------------------------------- */
export function qualityByTrackingPlan() {
  return TRACKING_PLANS.map((plan) => {
    const sources = SOURCE_QUALITY.filter((s) => s.trackingPlanId === plan.id);
    const eventsValidatedBase = sources.reduce((sum, s) => sum + s.eventsValidatedBase, 0);
    const violationsBase = sources.reduce((sum, s) => sum + Math.round(s.eventsValidatedBase * (s.violationRate / 100)), 0);
    const droppedBase = sources.reduce((sum, s) => sum + Math.round(s.eventsValidatedBase * (s.droppedRate / 100)), 0);
    const violationRate = eventsValidatedBase ? +((violationsBase / eventsValidatedBase) * 100).toFixed(2) : 0;
    return {
      planId: plan.id,
      plan,
      sourceCount: sources.length,
      eventsValidatedBase,
      violationsBase,
      droppedBase,
      violationRate,
      status: sources.length ? qualityStatusFor(violationRate) : "Healthy",
    };
  });
}

/* ---------------------------------------------------------------- */
/* Destination Delivery Health (section 14) — deliberately separate    */
/* from schema/Tracking Plan quality. Reuses the SAME Event-stream       */
/* destination connections Event Streams already resolves — never a    */
/* second destination list.                                             */
/* ---------------------------------------------------------------- */
const DELIVERY_BASE = { "PHS Webhook — Event": 84000, "PHS n8n — Event": 61000, "PHS Analytics Platform — Event": 210000, "PHS Data Warehouse — Event": 45000, "PHS HTTP API — Event": 0 };
export function destinationDelivery() {
  return eventDestinationConnections().map((d) => {
    const h = hashString(d.id + "-delivery");
    const eventsSentBase = DELIVERY_BASE[d.name] ?? 20000 + (h % 40000);
    const failureRate = eventsSentBase > 0 ? +((h % 60) / 20).toFixed(2) : 0; // 0.00 - 3.00%
    return {
      destination: d,
      eventsSentBase,
      failureRate,
      lastDelivery: eventsSentBase > 0 ? `${5 + (h % 50)} sec ago` : "Not yet connected",
      status: eventsSentBase === 0 ? "Healthy" : failureRate <= 1 ? "Healthy" : failureRate <= 2 ? "Warning" : "Critical",
    };
  });
}

/* ---------------------------------------------------------------- */
/* Event Volume (section 15) — throughput over time.                    */
/* ---------------------------------------------------------------- */
export function eventVolumeSeries(dateFilter) {
  const points = resolveRangeDays(dateFilter) <= 1 ? 12 : 10;
  const labels = [];
  const received = [];
  const validated = [];
  const withViolations = [];
  const dropped = [];
  const totalBase = SOURCE_QUALITY.reduce((sum, s) => sum + s.eventsValidatedBase, 0) / 12;
  for (let i = 0; i < points; i++) {
    const h = hashString(`vol-${i}`);
    const r = Math.round(totalBase * (0.85 + (h % 30) / 100));
    const viol = Math.round(r * 0.014 * (0.6 + (h % 40) / 50));
    const drop = Math.round(r * 0.002 * (0.6 + (h % 20) / 30));
    labels.push(points === 12 ? `${i * 2}:00` : `Day ${i + 1}`);
    received.push(r);
    withViolations.push(viol);
    dropped.push(drop);
    validated.push(r - viol - drop);
  }
  return { labels, received, validated, withViolations, dropped };
}

/* ---------------------------------------------------------------- */
/* Violations Over Time (section 7) — one series per violation type.   */
/* ---------------------------------------------------------------- */
export function violationsOverTimeSeries(dateFilter) {
  const points = resolveRangeDays(dateFilter) <= 1 ? 12 : 10;
  const labels = Array.from({ length: points }, (_, i) => (points === 12 ? `${i * 2}:00` : `Day ${i + 1}`));
  const colors = { "Unplanned Event": "var(--color-primary-500)", "Missing Required Property": "var(--color-danger-500)", "Datatype Mismatch": "var(--color-gold-500)", "Additional Property": "var(--color-ink-400)", "Unknown Violation": "var(--text-tertiary)" };
  const series = VIOLATION_TYPES.map((type) => ({
    name: type,
    color: colors[type],
    values: Array.from({ length: points }, (_, i) => Math.round(15 + (hashString(`${type}-vt-${i}`) % 70))),
  }));
  return { labels, series };
}

/* ---------------------------------------------------------------- */
/* Top-line KPIs / Tracking Plan Compliance (sections 5-6) — the        */
/* PRIMARY metric block. Deliberately concrete counts, not an           */
/* arbitrary composite "quality score".                                 */
/* ---------------------------------------------------------------- */
export function trackingPlanCompliance(dateFilter) {
  const scale = resolveRangeDays(dateFilter);
  const eventsValidated = Math.round(SOURCE_QUALITY.reduce((sum, s) => sum + s.eventsValidatedBase, 0) * scale);
  const eventsWithViolations = Math.round(
    SOURCE_QUALITY.reduce((sum, s) => sum + s.eventsValidatedBase * (s.violationRate / 100), 0) * scale
  );
  const eventsDropped = Math.round(SOURCE_QUALITY.reduce((sum, s) => sum + s.eventsValidatedBase * (s.droppedRate / 100), 0) * scale);
  const violationRate = eventsValidated ? +((eventsWithViolations / eventsValidated) * 100).toFixed(2) : 0;
  return {
    eventsValidated,
    eventsWithViolations,
    eventsDropped,
    violationRate,
    activeSources: SOURCE_QUALITY.length,
    activeTrackingPlans: TRACKING_PLANS.filter((p) => p.status === "Live").length,
  };
}

/* ---------------------------------------------------------------- */
/* Violations table (section 11) — the detailed, actionable feed.      */
/* ---------------------------------------------------------------- */
function issue(partial) {
  const event = partial.eventName ? getEventByName(partial.eventName) : null;
  return {
    id: partial.id,
    sourceId: partial.sourceId,
    eventId: event?.id || null,
    eventName: event?.name || null,
    propertyKey: partial.propertyKey || null,
    trackingPlanId: partial.trackingPlanId || null,
    eventStreamId: partial.streamId || null,
    type: partial.type,
    severity: partial.severity,
    status: partial.status || "Open",
    expectedType: partial.expectedType || null,
    receivedType: partial.receivedType || null,
    occurrences: partial.occurrences,
    firstSeen: partial.firstSeen,
    lastSeen: partial.lastSeen,
    time: partial.time,
    handlingPolicy: partial.handlingPolicy || "keep",
  };
}

export const VIOLATIONS = [
  issue({
    id: "v-1",
    sourceId: "phs-mobile-app",
    eventName: "Place Order",
    propertyKey: "quantity",
    trackingPlanId: "tp-mobile",
    streamId: "es-mobile",
    type: "Datatype Mismatch",
    severity: "Medium",
    expectedType: "Number",
    receivedType: "String",
    occurrences: 182,
    firstSeen: "24 Sep 2026 · 10:21:04",
    lastSeen: "24 Sep 2026 · 10:42:31",
    time: "10:42:31",
    handlingPolicy: "keep",
  }),
  issue({
    id: "v-2",
    sourceId: "trading-api",
    eventName: "Sell",
    propertyKey: "trading_account",
    trackingPlanId: "tp-trading",
    streamId: "es-trading",
    type: "Missing Required Property",
    severity: "High",
    expectedType: "string (required)",
    receivedType: "missing",
    occurrences: 723,
    firstSeen: "24 Sep 2026 · 08:05:12",
    lastSeen: "24 Sep 2026 · 10:41:08",
    time: "10:41:08",
    handlingPolicy: "drop",
  }),
  issue({
    id: "v-3",
    sourceId: "phs-website",
    eventName: "View Stock",
    propertyKey: "market",
    trackingPlanId: "tp-web",
    streamId: "es-website",
    type: "Unknown Violation",
    severity: "Medium",
    expectedType: "enum(HOSE, HNX, UPCOM)",
    receivedType: "XYZ",
    occurrences: 46,
    firstSeen: "24 Sep 2026 · 09:50:00",
    lastSeen: "24 Sep 2026 · 10:38:47",
    time: "10:38:47",
    handlingPolicy: "keep",
  }),
  issue({
    id: "v-4",
    sourceId: "phs-website",
    eventName: "View Stock",
    propertyKey: "watchlisted",
    trackingPlanId: "tp-web",
    streamId: "es-website",
    type: "Additional Property",
    severity: "Low",
    expectedType: "not in schema",
    receivedType: "boolean",
    occurrences: 92,
    firstSeen: "23 Sep 2026 · 14:10:00",
    lastSeen: "24 Sep 2026 · 09:12:19",
    time: "09:12:19",
    handlingPolicy: "keep",
  }),
  issue({
    id: "v-5",
    sourceId: "appsflyer",
    eventName: "App Open",
    propertyKey: "platform",
    trackingPlanId: "tp-appsflyer",
    streamId: "es-appsflyer",
    type: "Unknown Violation",
    severity: "Medium",
    expectedType: "enum(iOS, Android, Web)",
    receivedType: "unknown",
    occurrences: 74,
    firstSeen: "23 Sep 2026 · 11:00:00",
    lastSeen: "24 Sep 2026 · 09:20:55",
    time: "09:20:55",
    handlingPolicy: "keep",
  }),
  issue({
    id: "v-6",
    sourceId: "partner-api-events",
    eventName: "Deposit",
    propertyKey: "trading_account",
    trackingPlanId: "tp-partner-api",
    streamId: "es-partner",
    type: "Missing Required Property",
    severity: "High",
    expectedType: "string (required)",
    receivedType: "missing",
    occurrences: 211,
    firstSeen: "24 Sep 2026 · 09:40:02",
    lastSeen: "24 Sep 2026 · 09:58:00",
    time: "09:58:00",
    handlingPolicy: "drop",
  }),
  issue({
    id: "v-7",
    sourceId: "trading-api",
    eventName: "Withdrawal",
    propertyKey: "trading_account",
    trackingPlanId: "tp-trading",
    streamId: "es-trading",
    type: "Datatype Mismatch",
    severity: "Medium",
    expectedType: "string, pattern TA-######",
    receivedType: "TA_12x9",
    occurrences: 19,
    firstSeen: "22 Sep 2026 · 16:00:00",
    lastSeen: "23 Sep 2026 · 18:04:00",
    time: "18:04:00",
    status: "Resolved",
    handlingPolicy: "keep",
  }),
  issue({
    id: "v-8",
    sourceId: "phs-website",
    eventName: "Watchlist Add",
    propertyKey: null,
    trackingPlanId: "tp-web",
    streamId: "es-website",
    type: "Unplanned Event",
    severity: "Low",
    expectedType: "not in Tracking Plan",
    receivedType: "Watchlist Add",
    occurrences: 12,
    firstSeen: "21 Sep 2026 · 09:00:00",
    lastSeen: "21 Sep 2026 · 09:00:00",
    time: "09:00:00",
    status: "Ignored",
    handlingPolicy: "keep",
  }),
];

export function getViolationById(id) {
  return VIOLATIONS.find((i) => i.id === id);
}

export function filterViolations(list, filters) {
  const q = (filters.query || "").trim().toLowerCase();
  return list.filter((i) => {
    if (filters.source?.length && !filters.source.includes(getSourceRecord(i.sourceId)?.provider)) return false;
    if (filters.trackingPlan?.length && !filters.trackingPlan.includes(getPlanById(i.trackingPlanId)?.name)) return false;
    if (filters.type?.length && !filters.type.includes(i.type)) return false;
    if (filters.severity?.length && !filters.severity.includes(i.severity)) return false;
    if (filters.status?.length && !filters.status.includes(i.status)) return false;
    if (q) {
      const haystack = [i.eventName, i.propertyKey, getSourceRecord(i.sourceId)?.provider, getPlanById(i.trackingPlanId)?.name, i.type].filter(Boolean).join(" ").toLowerCase();
      if (!haystack.includes(q)) return false;
    }
    return true;
  });
}

export { EVENT_CATEGORY_META };
