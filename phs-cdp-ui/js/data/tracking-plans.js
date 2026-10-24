/*
  PHS CDP — Tracking Plans (Governance).
  A Tracking Plan is a schema-governance contract: which events a
  given source is EXPECTED to send, and how strictly. It references
  event names from the canonical Event Catalog (js/data/events.js)
  rather than redefining events — a plan can also reference a name
  that ISN'T in the catalog yet, which is the whole point: that's a
  governance gap (planned but not implemented) a Tracking Plan exists
  to surface.
*/
import { EVENT_CATALOG, getEventByName } from "./events.js";

export const TRACKING_PLAN_STATUSES = ["Live", "Draft", "Deprecated"];
export const ENFORCEMENT_LEVELS = ["Required", "Optional"];

function plan(entries) {
  return entries.map(([eventName, enforcement]) => ({ eventName, enforcement }));
}

export const TRACKING_PLANS = [
  {
    id: "tp-mobile",
    name: "Mobile App Tracking Plan",
    description: "Events the PHS mobile app is contractually expected to send.",
    sources: ["Mobile App"],
    status: "Live",
    owner: "Growth Team",
    createdAt: "14 Mar 2026",
    lastAudit: "20 Sep 2026",
    events: plan([
      ["App Open", "Required"],
      ["Login", "Required"],
      ["View Stock", "Required"],
      ["Search Stock", "Optional"],
      ["Watchlist Add", "Optional"],
      ["Place Order", "Required"],
      ["In-App Message Open", "Optional"],
      ["Portfolio Rebalance", "Required"],
    ]),
  },
  {
    id: "tp-trading",
    name: "Trading Platform Tracking Plan",
    description: "Core trade-execution events the trading platform must emit.",
    sources: ["Trading Platform"],
    status: "Live",
    owner: "Lifecycle Team",
    createdAt: "02 Feb 2026",
    lastAudit: "18 Sep 2026",
    events: plan([
      ["Place Order", "Required"],
      ["Buy", "Required"],
      ["Sell", "Required"],
      ["Deposit", "Required"],
      ["Withdrawal", "Required"],
    ]),
  },
  {
    id: "tp-web",
    name: "Web Tracking Plan",
    description: "Website behavioral events for personalization and audiences.",
    sources: ["Web"],
    status: "Live",
    owner: "Growth Team",
    createdAt: "28 Apr 2026",
    lastAudit: "12 Sep 2026",
    events: plan([
      ["Login", "Required"],
      ["View Stock", "Required"],
      ["Search Stock", "Optional"],
      ["Web Message Open", "Optional"],
    ]),
  },
  {
    id: "tp-lifecycle",
    name: "Lifecycle Messaging Tracking Plan",
    description: "Engagement events required to measure messaging effectiveness.",
    sources: ["Email", "Push"],
    status: "Draft",
    owner: "Lifecycle Team",
    createdAt: "05 Sep 2026",
    lastAudit: "—",
    events: plan([
      ["Email Open", "Required"],
      ["Push Open", "Required"],
      ["In-App Message Open", "Optional"],
    ]),
  },
  // Added for Phase 13.1 (Event Streams) — purely additive, no
  // existing plan above is changed.
  {
    id: "tp-partner-api",
    name: "Partner API Tracking Plan",
    description: "Financial events a partner integration is expected to forward.",
    sources: ["Partner API"],
    status: "Live",
    owner: "Growth Team",
    createdAt: "10 Aug 2026",
    lastAudit: "15 Sep 2026",
    events: plan([
      ["Deposit", "Required"],
      ["Withdrawal", "Required"],
    ]),
  },
  {
    id: "tp-appsflyer",
    name: "AppsFlyer Tracking Plan",
    description: "Attribution-relevant events AppsFlyer is expected to report.",
    sources: ["AppsFlyer"],
    status: "Live",
    owner: "Growth Team",
    createdAt: "22 Jun 2026",
    lastAudit: "09 Sep 2026",
    events: plan([
      ["App Open", "Required"],
      ["Login", "Optional"],
    ]),
  },
];

/** Whether a governed event is actually implemented in the canonical
 * catalog — the core governance signal a Tracking Plan surfaces. */
export function eventComplianceStatus(eventName) {
  const def = getEventByName(eventName);
  if (!def) return "Not Implemented";
  if (def.status !== "Active") return "Not Active";
  return "Implemented";
}

export function planCoverage(planRecord) {
  const required = planRecord.events.filter((e) => e.enforcement === "Required");
  if (!required.length) return 100;
  const implemented = required.filter((e) => eventComplianceStatus(e.eventName) === "Implemented").length;
  return Math.round((implemented / required.length) * 100);
}

export function getPlanById(id) {
  return TRACKING_PLANS.find((p) => p.id === id);
}
