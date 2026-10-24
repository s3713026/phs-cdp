/*
  PHS CDP — Event Streams (Monitor, Phase 13.1).
  An Event Stream is the OPERATIONAL processing pipeline for one
  Event-type Source Connection Account: how fast data is arriving, how
  much of it validates against its Tracking Plan, and where it's
  delivered. It references — never duplicates — the canonical models:

    Source Connection  -> js/data/sources.js        (SOURCES)
    Tracking Plan       -> js/data/tracking-plans.js (TRACKING_PLANS)
    Events               -> js/data/events.js         (EVENT_CATALOG)
    Destinations         -> js/data/destinations.js   (DESTINATIONS)

  Event Stream is event-only: Profile / Audience / Message / Consent
  connection accounts never appear here.
*/
import { SOURCES } from "./sources.js";
import { DESTINATIONS } from "./destinations.js";
import { TRACKING_PLANS, getPlanById, eventComplianceStatus } from "./tracking-plans.js";
import { EVENT_CATALOG, EVENT_CATEGORY_META, getEventByName, MOCK_TODAY } from "./events.js";

export const STREAM_STATUSES = ["Healthy", "Warning", "Paused", "Error", "Provisioning"];
export const STREAM_STATUS_META = {
  Healthy: { dot: "status-dot--success", badge: "badge--success" },
  Warning: { dot: "status-dot--warning", badge: "badge--warning" },
  Paused: { dot: "", badge: "badge--neutral" },
  Error: { dot: "status-dot--danger", badge: "badge--danger" },
  Provisioning: { dot: "", badge: "badge--neutral" },
};
export const VIOLATION_TYPES = ["Unplanned Event", "Missing Property", "Type Mismatch"];
export const TIME_RANGE_PRESETS = ["Last 15 minutes", "Last 1 hour", "Last 6 hours", "Today", "Last 7 days"];
const RANGE_MINUTES = { "Last 15 minutes": 15, "Last 1 hour": 60, "Last 6 hours": 360, Today: 1440, "Last 7 days": 10080 };
export function resolveRangeMinutes(preset) {
  return RANGE_MINUTES[preset] ?? 60;
}

function hashString(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) >>> 0;
  return h;
}

export function getSourceConnection(id) {
  return SOURCES.find((s) => s.id === id);
}
export function getDestinationConnection(id) {
  return DESTINATIONS.find((d) => d.id === id);
}
function eventIdsForNames(names) {
  return names.map((n) => getEventByName(n)?.id).filter(Boolean);
}

function activity(entries) {
  return entries.map(([time, act, details, status]) => ({ time, activity: act, details, status }));
}

/* ---------------------------------------------------------------- */
/* The Event Streams                                                   */
/* ---------------------------------------------------------------- */
export const EVENT_STREAMS = [
  {
    id: "es-mobile",
    name: "PHS Mobile App — Events",
    connectionId: "phs-mobile-app",
    trackingPlanId: "tp-mobile",
    trackingPlanVersion: "v3",
    eventIds: eventIdsForNames(["App Open", "Login", "View Stock", "Search Stock", "Watchlist Add", "Place Order", "In-App Message Open"]),
    destinationConnectionIds: ["analytics-platform", "webhook", "n8n", "data-warehouse-event"],
    status: "Healthy",
    metrics: { eventsPerMinuteBase: 842, eventsTodayBase: 1824291, latencyAvg: 1.2, latencyP95: 2.8, latencyP99: 4.1, validationRate: 99.6 },
    lastReceivedSec: 10,
    createdAt: "14 Mar 2026",
    updatedAt: "20 Sep 2026",
    activity: activity([
      ["10:42", "Event received", "Place Order", "Processed"],
      ["10:38", "Validation warning", "View Stock — missing property: screen", "Warning"],
      ["10:15", "Tracking Plan updated", "v3", "Completed"],
      ["09:42", "Destination connection changed", "PHS Webhook — Event", "Completed"],
    ]),
  },
  {
    id: "es-trading",
    name: "Trading Platform — Events",
    connectionId: "trading-api",
    trackingPlanId: "tp-trading",
    trackingPlanVersion: "v2",
    eventIds: eventIdsForNames(["Place Order", "Buy", "Sell", "Deposit", "Withdrawal"]),
    destinationConnectionIds: ["webhook", "n8n", "analytics-platform"],
    status: "Warning",
    warningReason: "Validation rate below threshold",
    metrics: { eventsPerMinuteBase: 420, eventsTodayBase: 420000, latencyAvg: 2.1, latencyP95: 4.6, latencyP99: 6.8, validationRate: 94.1 },
    lastReceivedSec: 8,
    createdAt: "02 Feb 2026",
    updatedAt: "24 Sep 2026",
    activity: activity([
      ["10:40", "Validation warning", "Place Order — type mismatch: quantity", "Warning"],
      ["10:20", "Event received", "Deposit", "Processed"],
      ["08:05", "Validation rate degraded", "94.1% (below 98% threshold)", "Warning"],
      ["18 Sep 2026", "Tracking Plan updated", "v2", "Completed"],
    ]),
  },
  {
    id: "es-partner",
    name: "Partner API — Events",
    connectionId: "partner-api-events",
    trackingPlanId: "tp-partner-api",
    trackingPlanVersion: "v1",
    eventIds: eventIdsForNames(["Deposit", "Withdrawal"]),
    destinationConnectionIds: ["webhook", "n8n"],
    status: "Error",
    errorReason: "Tracking Plan validation service unavailable",
    lastSuccessfulEvent: "24 Sep 2026 · 09:58",
    metrics: { eventsPerMinuteBase: 0, eventsTodayBase: 84000, latencyAvg: 8.4, latencyP95: 15.2, latencyP99: 22.0, validationRate: 94.1 },
    lastReceivedSec: 120,
    createdAt: "10 Aug 2026",
    updatedAt: "24 Sep 2026",
    activity: activity([
      ["09:58", "Stream error", "Tracking Plan validation service unavailable", "Error"],
      ["09:40", "Event received", "Withdrawal", "Processed"],
      ["09:12", "Event received", "Deposit", "Processed"],
      ["15 Sep 2026", "Tracking Plan attached", "Partner API Tracking Plan", "Completed"],
    ]),
  },
  {
    id: "es-website",
    name: "PHS Website — Events",
    connectionId: "phs-website",
    trackingPlanId: "tp-web",
    trackingPlanVersion: "v1",
    eventIds: eventIdsForNames(["Login", "View Stock", "Search Stock", "Web Message Open"]),
    destinationConnectionIds: ["analytics-platform", "webhook"],
    status: "Healthy",
    metrics: { eventsPerMinuteBase: 338, eventsTodayBase: 486000, latencyAvg: 1.5, latencyP95: 3.1, latencyP99: 4.7, validationRate: 99.5 },
    lastReceivedSec: 14,
    createdAt: "28 Apr 2026",
    updatedAt: "12 Sep 2026",
    activity: activity([
      ["10:41", "Event received", "View Stock", "Processed"],
      ["09:30", "Event received", "Login", "Processed"],
      ["12 Sep 2026", "Tracking Plan updated", "v1", "Completed"],
    ]),
  },
  {
    id: "es-appsflyer",
    name: "PHS AppsFlyer — Events",
    connectionId: "appsflyer",
    trackingPlanId: "tp-appsflyer",
    trackingPlanVersion: "v1",
    eventIds: eventIdsForNames(["App Open", "Login"]),
    destinationConnectionIds: ["analytics-platform"],
    status: "Healthy",
    metrics: { eventsPerMinuteBase: 125, eventsTodayBase: 180000, latencyAvg: 2.0, latencyP95: 3.9, latencyP99: 5.5, validationRate: 99.0 },
    lastReceivedSec: 14,
    createdAt: "22 Jun 2026",
    updatedAt: "09 Sep 2026",
    activity: activity([
      ["10:20", "Event received", "App Open", "Processed"],
      ["09 Sep 2026", "Tracking Plan attached", "AppsFlyer Tracking Plan", "Completed"],
    ]),
  },
  {
    id: "es-webhook-intake",
    name: "Webhook Intake — Events",
    connectionId: "webhook-source",
    trackingPlanId: null,
    trackingPlanVersion: null,
    eventIds: eventIdsForNames(["Place Order", "Deposit"]),
    destinationConnectionIds: ["n8n"],
    status: "Paused",
    metrics: { eventsPerMinuteBase: 0, eventsTodayBase: 21000, latencyAvg: 3.4, latencyP95: 6.1, latencyP99: 8.0, validationRate: 98.0 },
    lastReceivedSec: 7200,
    createdAt: "19 Jun 2026",
    updatedAt: "23 Sep 2026",
    activity: activity([
      ["23 Sep 2026", "Stream paused", "Paused by Growth Team", "Completed"],
      ["22 Sep 2026", "Event received", "Place Order", "Processed"],
    ]),
  },
];

export function getStreamById(id) {
  return EVENT_STREAMS.find((s) => s.id === id);
}

/* ---------------------------------------------------------------- */
/* Derived display helpers                                            */
/* ---------------------------------------------------------------- */
export function streamSourceName(stream) {
  return getSourceConnection(stream.connectionId)?.provider || "—";
}
export function streamConnectionName(stream) {
  return getSourceConnection(stream.connectionId)?.name || "—";
}
export function streamTrackingPlan(stream) {
  return stream.trackingPlanId ? getPlanById(stream.trackingPlanId) : null;
}
export function streamEvents(stream) {
  return stream.eventIds.map((id) => EVENT_CATALOG.find((e) => e.id === id)).filter(Boolean);
}
export function streamDestinations(stream) {
  return stream.destinationConnectionIds.map((id) => getDestinationConnection(id)).filter(Boolean);
}

/** Range-scaled metrics — same deterministic hash-jitter model used
 * throughout the app (see getUsersThroughConnector). */
export function metricsForRange(stream, preset) {
  const minutes = resolveRangeMinutes(preset);
  const days = minutes / 1440;
  const jitter = 0.92 + (hashString(stream.id + preset) % 16) / 100;
  return {
    eventsPerMinute: stream.status === "Paused" || stream.status === "Error" ? 0 : Math.round(stream.metrics.eventsPerMinuteBase * jitter),
    eventsToday: Math.max(0, Math.round(stream.metrics.eventsTodayBase * Math.max(days, 1 / 96) * jitter)),
    latencyAvg: stream.metrics.latencyAvg,
    latencyP95: stream.metrics.latencyP95,
    latencyP99: stream.metrics.latencyP99,
    validationRate: stream.metrics.validationRate,
  };
}

export function lastReceivedLabel(stream) {
  const sec = stream.lastReceivedSec;
  if (sec < 60) return `${sec} sec ago`;
  if (sec < 3600) return `${Math.round(sec / 60)} min ago`;
  if (sec < 86400) return `${Math.round(sec / 3600)} hr ago`;
  return `${Math.round(sec / 86400)}d ago`;
}
export function lastReceivedTimestamp(stream) {
  const d = new Date(2026, 8, 24, 10, 42, 18);
  d.setSeconds(d.getSeconds() - stream.lastReceivedSec);
  const pad = (n) => String(n).padStart(2, "0");
  return `${MOCK_TODAY} · ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

/** Violation breakdown — deterministic, always sums to (100 -
 * validationRate). Referenced by the Tracking Plan tab / view
 * violations flow (section 17/54). */
export function violationBreakdown(stream) {
  const total = +(100 - stream.metrics.validationRate).toFixed(1);
  const h = hashString(stream.id + "-violations");
  const unplanned = +Math.min(total, (total * (0.2 + (h % 30) / 100)).toFixed(2));
  const missing = +Math.min(total - unplanned, (total * (0.3 + ((h >> 2) % 30) / 100)).toFixed(2));
  const typeMismatch = +Math.max(0, (total - unplanned - missing).toFixed(2));
  return [
    { type: "Unplanned Event", pct: unplanned },
    { type: "Missing Property", pct: missing },
    { type: "Type Mismatch", pct: typeMismatch },
  ];
}

/** Mock schema violations shown under "View Violations" (section 54). */
export function violationsForStream(stream) {
  const h = hashString(stream.id + "-detail-violations");
  const events = streamEvents(stream);
  if (!events.length) return [];
  const picks = [];
  events.forEach((ev, i) => {
    const eh = hashString(stream.id + ev.id);
    if (eh % 3 === 0) {
      picks.push(
        eh % 2 === 0
          ? { event: ev.name, kind: "Type Mismatch", detail: `${ev.properties[i % ev.properties.length]?.key || "quantity"} — expected ${ev.properties[i % ev.properties.length]?.type || "Number"}, received String` }
          : { event: ev.name, kind: "Unplanned Property", detail: "order_status" }
      );
    }
  });
  return picks.length ? picks : [{ event: events[h % events.length].name, kind: "Missing Property", detail: "screen" }];
}

/** Per-event stats shown in the Events tab (section 11) — reuses the
 * catalog event's own stats, scaled slightly per stream so numbers
 * don't look identical across streams sharing an event. */
export function eventStatsForStream(stream) {
  return streamEvents(stream).map((ev) => {
    const h = hashString(stream.id + ev.id);
    const jitter = 0.85 + (h % 30) / 100;
    return {
      event: ev,
      eventsToday: Math.round(ev.stats.eventsToday * jitter),
      uniqueCustomers: Math.round(ev.stats.uniqueCustomersToday * jitter),
      lastReceived: `${5 + (h % 50)} sec ago`,
      validation: +(100 - (h % 8) / 10).toFixed(1),
    };
  });
}

/** Per-destination delivery health shown in the Destinations tab
 * (section 55). */
export function destinationHealthForStream(stream) {
  const dests = streamDestinations(stream);
  const per = dests.length ? Math.round(stream.metrics.eventsPerMinuteBase / dests.length) : 0;
  return dests.map((d) => {
    const h = hashString(stream.id + d.id);
    return {
      destination: d,
      eventsPerMinute: per + (h % 40),
      latency: +((0.8 + (h % 20) / 10)).toFixed(1),
      success: +(97 + (h % 30) / 10).toFixed(1),
      status: h % 23 === 0 ? "Warning" : "Healthy",
    };
  });
}

/** Deterministic events/min series for the last N minutes — a small
 * sparkline, not a dashboard chart (section 15). */
export function eventsPerMinuteSeries(stream, points = 6) {
  const base = stream.metrics.eventsPerMinuteBase;
  const series = [];
  for (let i = points - 1; i >= 0; i--) {
    const h = hashString(`${stream.id}-min-${i}`);
    const jitter = base === 0 ? 0 : Math.round(base * (0.85 + (h % 30) / 100));
    series.push(jitter);
  }
  return series;
}

/* ---------------------------------------------------------------- */
/* Create Event Stream — catalog helpers (section 24-30)              */
/* ---------------------------------------------------------------- */
export function eventSourceConnections() {
  return SOURCES.filter((s) => s.dataStream === "Event");
}
export function eventDestinationConnections() {
  return DESTINATIONS.filter((d) => d.dataStream === "Event");
}
export function availableTrackingPlans() {
  return TRACKING_PLANS;
}
export function availableCatalogEvents() {
  return EVENT_CATALOG;
}

export { EVENT_CATEGORY_META, eventComplianceStatus };
