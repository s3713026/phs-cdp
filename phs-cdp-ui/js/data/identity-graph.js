/*
  PHS CDP — Identity Graph mock data.

  Derives one identity CLUSTER per demo customer in js/data/customers.js
  — the canonical rudderId at the center, a handful of that customer's
  own identifiers (already masked/synthetic at the data layer) arranged
  around it. This file does not duplicate js/data/data-governance.js's
  illustrative single-example graph (IDENTITY_GRAPH_NODES etc.) — that
  one is a conceptual diagram with no real profile behind it; these
  clusters are tied to actual demo profiles so a node can link to its
  real Customer 360 detail.

  Conceptual model (see CLAUDE.md / Data Governance "Identity" policy):
    rudderId        — canonical identity (RudderStack-Profiles-style)
    PHS Account ID   — PHS business identifier (= customer.id here)
  The two are deliberately kept visually and textually distinct.
*/
import { CUSTOMERS } from "./customers.js";

// Which identity types are shown on the canvas, in this order, and at
// most how many — Identity Graph is an explanatory diagram, not an
// exhaustive identity dump (Customer 360 → Identity & Attributes is
// the place for that). "Account ID" is always included separately as
// the business-identifier node.
const GRAPH_IDENTIFIER_TYPES = ["Account ID", "Mobile Number", "Email Address", "AppsFlyer ID", "Anonymous ID", "Zalo ID"];
const MAX_IDENTIFIER_NODES = 5;

const CANVAS = { width: 640, height: 380 };
const CENTER = { x: CANVAS.width / 2, y: CANVAS.height / 2 };
const RADIUS = 140;

function maskCrmId(crmId) {
  return `CRM-••••${crmId.slice(-3)}`;
}

function layoutAround(center, count, i) {
  const angle = (2 * Math.PI * i) / count - Math.PI / 2;
  return {
    x: Math.round(center.x + RADIUS * Math.cos(angle)),
    y: Math.round(center.y + RADIUS * Math.sin(angle)),
  };
}

function buildCluster(c) {
  const picks = GRAPH_IDENTIFIER_TYPES.map((type) => c.identities.find((i) => i.type === type))
    .filter(Boolean)
    .slice(0, MAX_IDENTIFIER_NODES);

  const canonicalNode = {
    id: "canonical",
    kind: "canonical",
    label: "rudderId",
    sublabel: c.rudderId,
    x: CENTER.x,
    y: CENTER.y,
  };

  const identifierNodes = picks.map((p, i) => {
    const v = p.values[0];
    return {
      id: `id-${i}`,
      kind: p.type === "Account ID" ? "business" : "identifier",
      label: p.type,
      sublabel: v.value,
      source: v.source,
      status: v.status,
      lastSeen: v.lastSeen,
      ...layoutAround(CENTER, picks.length, i),
    };
  });

  const edges = identifierNodes.map((n) => ["canonical", n.id]);
  const sources = Array.from(new Set(identifierNodes.map((n) => n.source)));

  return {
    customerId: c.id,
    customerName: c.name,
    maskedCrmId: maskCrmId(c.crmId),
    lifecycle: c.lifecycle,
    status: c.status,
    rudderId: c.rudderId,
    accountId: c.id,
    nodes: [canonicalNode, ...identifierNodes],
    edges,
    sources,
  };
}

export const CANVAS_VIEWBOX = `0 0 ${CANVAS.width} ${CANVAS.height}`;
export const IDENTITY_CLUSTERS = CUSTOMERS.map(buildCluster);

export function getClusterByCustomerId(id) {
  return IDENTITY_CLUSTERS.find((cl) => cl.customerId === id);
}

export function identityGraphSummary() {
  const clusterCount = IDENTITY_CLUSTERS.length;
  const identifierCount = IDENTITY_CLUSTERS.reduce((sum, cl) => sum + (cl.nodes.length - 1), 0);
  const sourceCount = new Set(IDENTITY_CLUSTERS.flatMap((cl) => cl.sources)).size;
  return { clusterCount, identifierCount, sourceCount };
}
