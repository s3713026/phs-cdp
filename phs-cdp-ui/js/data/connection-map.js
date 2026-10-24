/*
  PHS CDP — Source-to-Destination connection map.

  This is an EXPLICIT, deterministic relationship dataset — stable
  sourceId/destinationId pairs, not an inference from matching names
  or data types. It exists specifically so the Data Flows connection
  map (js/pages/data-flows.js) has something real to draw instead of
  guessing: a source and a destination sharing a dataStream value
  does NOT by itself mean they are connected in this model.

  Deliberately NOT every Source/Destination appears here:
  - Audience destinations (Meta Ads, Google Ads) and Message
    destinations (Email, Push, In-App, Web Message, SMS, Zalo) are
    activated from audiences built *inside* PHS CDP, not fed directly
    by a raw Source — so they have no inbound link in this model. That
    is a correct "no configured sources" state, not a gap to fill.
  - Source "partner-api" (status: Available) has not been wired to
    anything yet — also a correct "no configured destinations" state,
    kept specifically to exercise that empty state.

  Relationship STATUS is deliberately not stored here — it is derived
  (see linkStatus()) from the current status of the real SOURCES/
  DESTINATIONS records, so it can never drift out of sync with the
  Sources/Destinations pages' own status column.
*/
import { SOURCES } from "./sources.js";
import { DESTINATIONS } from "./destinations.js";

// Live registries — data-flows.js overrides these after BFF load so
// linkStatus() / connectedDestinationsForSource() etc. always reflect
// real RudderStack data without needing a module re-import.
let _liveSources      = SOURCES;
let _liveDestinations = DESTINATIONS;
let _liveLinks        = null; // null = fall back to static list below

/** Called by data-flows.js after loading BFF data.
 *  sources      — live Source objects (from BFF)
 *  destinations — live Destination objects (from BFF)
 *  links        — [{ sourceId, destinationId, dataType }] from workspaceConfig
 */
export function setLiveData(sources, destinations, links) {
  _liveSources      = sources      || SOURCES;
  _liveDestinations = destinations || DESTINATIONS;
  _liveLinks        = links        || null;
}

export const SOURCE_DESTINATION_LINKS = [
  { sourceId: "phs-mobile-app", destinationId: "webhook", dataType: "Event" },
  { sourceId: "phs-mobile-app", destinationId: "analytics-platform", dataType: "Event" },
  { sourceId: "phs-website", destinationId: "webhook", dataType: "Event" },
  { sourceId: "phs-website", destinationId: "analytics-platform", dataType: "Event" },
  { sourceId: "appsflyer", destinationId: "analytics-platform", dataType: "Event" },
  { sourceId: "appsflyer", destinationId: "data-warehouse-event", dataType: "Event" },
  { sourceId: "webhook-source", destinationId: "n8n", dataType: "Event" },
  { sourceId: "webhook-source", destinationId: "http-api", dataType: "Event" },
  { sourceId: "trading-api", destinationId: "analytics-platform", dataType: "Event" },
  { sourceId: "trading-api", destinationId: "data-warehouse-event", dataType: "Event" },
  // Trade-execution alerts via SMS — the one plausible Message-channel
  // exception to "Message destinations only receive CDP-internal
  // audience activations" above; kept specifically because "sms" is
  // the only Paused-status connector in the mock data, so this is the
  // sole link that can demonstrate a Paused relationship end to end.
  { sourceId: "trading-api", destinationId: "sms", dataType: "Event" },
  { sourceId: "n8n-source", destinationId: "webhook", dataType: "Event" },
  { sourceId: "partner-api-events", destinationId: "analytics-platform", dataType: "Event" },
  { sourceId: "crm-source", destinationId: "crm", dataType: "Profile" },
  { sourceId: "crm-source", destinationId: "data-warehouse", dataType: "Profile" },
  { sourceId: "crm-source", destinationId: "consent-platform", dataType: "Consent" },
  { sourceId: "zalo-source", destinationId: "crm", dataType: "Profile" },
];

function findSource(id) {
  return _liveSources.find((s) => s.id === id) || SOURCES.find((s) => s.id === id);
}
function findDestination(id) {
  return _liveDestinations.find((d) => d.id === id) || DESTINATIONS.find((d) => d.id === id);
}

function activeLinks() {
  return _liveLinks || SOURCE_DESTINATION_LINKS;
}

/** Derived relationship status — never stored, always computed from
 * the two endpoints' own live status so it can't drift. "Active" only
 * when both ends are actually Connected; an Error on either end wins
 * (most severe); Paused next; everything else (Available/Draft) reads
 * as a configured-but-not-yet-live "Pending" link. */
export function linkStatus(link) {
  const s = findSource(link.sourceId);
  const d = findDestination(link.destinationId);
  if (!s || !d) return "Unknown";
  if (s.status === "Error" || d.status === "Error") return "Error";
  if (s.status === "Paused" || d.status === "Paused") return "Paused";
  if (s.status === "Connected" && d.status === "Connected") return "Active";
  return "Pending";
}

export function linksForSource(sourceId) {
  return activeLinks().filter((l) => l.sourceId === sourceId);
}
export function linksForDestination(destinationId) {
  return activeLinks().filter((l) => l.destinationId === destinationId);
}

export function connectedDestinationsForSource(sourceId) {
  return linksForSource(sourceId)
    .map((l) => ({ link: l, destination: findDestination(l.destinationId), status: linkStatus(l) }))
    .filter((x) => x.destination);
}
export function connectedSourcesForDestination(destinationId) {
  return linksForDestination(destinationId)
    .map((l) => ({ link: l, source: findSource(l.sourceId), status: linkStatus(l) }))
    .filter((x) => x.source);
}
