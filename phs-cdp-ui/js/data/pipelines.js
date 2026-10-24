/*
  PHS CDP — Pipelines mock data.

  Pipelines describes the FIXED, conceptual processing stages data
  passes through inside PHS CDP on its way from Sources to
  Destinations — a structural view of the architecture, not a live
  execution monitor. Individual flow records, their live status,
  volume and health live on Data Flows (js/data/dataflows.js) and are
  never re-shown here — this file does not duplicate that table.

  Each stage is cross-referenced to the EXISTING module that actually
  owns/enforces it — the same "reference the real module, don't build
  a second engine" principle already established by the Policy Control
  Center in js/data/data-governance.js. No transformation execution or
  live pipeline status is implemented or implied here.
*/
import { DATA_TYPES, INBOUND_FLOWS, OUTBOUND_FLOWS } from "./dataflows.js";

export const PIPELINE_STAGES = [
  {
    id: "ingestion",
    name: "Ingestion",
    icon: "arrow-down-to-line",
    description: "Raw events, profile updates and consent signals are received from connected Sources.",
    ownerModule: "Sources",
    ownerHref: "sources.html",
  },
  {
    id: "validation",
    name: "Validation & Schema Check",
    icon: "list-checks",
    description: "Incoming events are checked against their tracking plan definition and flagged when non-compliant.",
    ownerModule: "Tracking Plans",
    ownerHref: "tracking-plans.html",
  },
  {
    id: "identity",
    name: "Identity Resolution",
    icon: "network",
    description: "Identifiers observed across sources are stitched into a single canonical identity (rudderId).",
    ownerModule: "Identity Graph",
    ownerHref: "identity-graph.html",
  },
  {
    id: "enrichment",
    name: "Enrichment & Transformation",
    icon: "sparkles",
    description: "Profile and event records are normalized, enriched and transformed before forming the unified customer view.",
    ownerModule: "Transformations",
    ownerHref: "transformations.html",
  },
  {
    id: "consent",
    name: "Consent Enforcement",
    icon: "shield-check",
    description: "Marketing, analytics and personalization consent determine which records are eligible to leave PHS CDP.",
    ownerModule: "Consent & Preferences",
    ownerHref: "consent-preferences.html",
  },
  {
    id: "activation",
    name: "Activation Routing",
    icon: "share-2",
    description: "Eligible profiles, audiences and events are routed to their configured Destinations.",
    ownerModule: "Destinations",
    ownerHref: "destinations.html",
  },
];

export function pipelineSummary() {
  return {
    stageCount: PIPELINE_STAGES.length,
    dataTypeCount: DATA_TYPES.length,
    inboundFlowCount: INBOUND_FLOWS.length,
    outboundFlowCount: OUTBOUND_FLOWS.length,
  };
}
