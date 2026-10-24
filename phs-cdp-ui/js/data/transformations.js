/*
  PHS CDP — Transformations mock data.

  Transformations configure data-transformation LOGIC applied before
  events reach a destination (RudderStack concept: a named JS/Python
  function, attached to one or more destination connections). This is
  UI-only mock data — no code here is ever executed. Destination names
  reference real js/data/destinations.js providers so this stays
  grounded rather than inventing unrelated connectors.

  Status is intentionally a simple two-value label (Published/Draft),
  and version a plain display string (not a real version-control or
  deployment history) — this prototype does not implement testing,
  deployment or a transformation runtime.
*/

export const TRANSFORMATION_LANGUAGES = ["JavaScript", "Python"];
export const TRANSFORMATION_STATUSES = ["Published", "Draft"];

export const TRANSFORMATIONS = [
  {
    id: "trf-pii-mask-ads",
    name: "Mask PII before ads activation",
    destinations: ["Meta Ads", "Google Ads"],
    language: "JavaScript",
    version: "v2",
    status: "Published",
    lastModified: "15 Sep 2026",
    owner: "Data Platform Team",
    description: "Strips email and phone fields from the event payload before it reaches advertising destinations.",
  },
  {
    id: "trf-normalize-events",
    name: "Normalize event names for warehouse",
    destinations: ["Data Warehouse"],
    language: "JavaScript",
    version: "v1",
    status: "Published",
    lastModified: "02 Sep 2026",
    owner: "Data Platform Team",
    description: "Converts legacy mobile event names to the current tracking-plan naming convention.",
  },
  {
    id: "trf-consent-enrich",
    name: "Enrich consent flags before CRM sync",
    destinations: ["CRM"],
    language: "Python",
    version: "v1",
    status: "Draft",
    lastModified: "28 Aug 2026",
    owner: "CRM Team",
    description: "Attaches current marketing/analytics consent state to profile records synced to the CRM.",
  },
  {
    id: "trf-trim-test-accounts",
    name: "Trim test accounts from webhook payloads",
    destinations: ["Webhook", "Custom API"],
    language: "JavaScript",
    version: "v1",
    status: "Draft",
    lastModified: "20 Aug 2026",
    owner: "Platform Engineering",
    description: "Filters out internal QA / test accounts so they never reach downstream webhook integrations.",
  },
  {
    id: "trf-dedupe-push-tokens",
    name: "De-duplicate push tokens",
    destinations: ["Push"],
    language: "JavaScript",
    version: "v3",
    status: "Published",
    lastModified: "05 Sep 2026",
    owner: "Growth",
    description: "Removes duplicate device tokens for a user before a push campaign send, keeping only the most recent.",
  },
];

export function getTransformationById(id) {
  return TRANSFORMATIONS.find((t) => t.id === id);
}

export function transformationsSummary() {
  return {
    total: TRANSFORMATIONS.length,
    published: TRANSFORMATIONS.filter((t) => t.status === "Published").length,
    draft: TRANSFORMATIONS.filter((t) => t.status === "Draft").length,
    languages: new Set(TRANSFORMATIONS.map((t) => t.language)).size,
  };
}
