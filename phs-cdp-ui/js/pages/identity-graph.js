import { IDENTITY_CLUSTERS, CANVAS_VIEWBOX, identityGraphSummary } from "../data/identity-graph.js";

// Node-kind → fill/stroke, reusing the same semantic colors as the
// .badge component (primary = canonical, gold = PHS business
// identifier, neutral = linked identifier) so the graph legend reads
// the same as everywhere else in the system.
const NODE_STYLE = {
  canonical: { fill: "var(--color-primary-50)", stroke: "var(--color-primary-500)", text: "var(--color-primary-700)" },
  business: { fill: "var(--color-gold-50)", stroke: "var(--color-gold-700)", text: "var(--color-gold-700)" },
  identifier: { fill: "var(--surface-panel)", stroke: "var(--border-default)", text: "var(--text-primary)" },
};
const NODE_STYLE_SELECTED = {
  canonical: "var(--color-primary-700)",
  business: "var(--color-gold-700)",
  identifier: "var(--color-primary-500)",
};

function normalize(str) {
  return str.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
}

let currentCluster = IDENTITY_CLUSTERS[0];
let selectedNodeId = "canonical";

function refreshIcons() {
  if (window.lucide) window.lucide.createIcons();
}

/* ------------------------------------------------------------------ */
/* Summary metrics                                                     */
/* ------------------------------------------------------------------ */
function renderSummary() {
  const mount = document.querySelector("[data-ig-summary]");
  if (!mount) return;
  const s = identityGraphSummary();
  mount.innerHTML = `
    <div class="metric-row">
      <div class="metric metric--primary">
        <span class="metric__label">Identity Clusters</span>
        <div class="metric__value-row"><span class="metric__value tabular-nums" style="font-size: var(--text-xl);">${s.clusterCount}</span></div>
      </div>
      <div class="metric">
        <span class="metric__label">Identifiers Mapped</span>
        <div class="metric__value-row"><span class="metric__value tabular-nums" style="font-size: var(--text-xl);">${s.identifierCount}</span></div>
      </div>
      <div class="metric">
        <span class="metric__label">Canonical Identities</span>
        <div class="metric__value-row"><span class="metric__value tabular-nums" style="font-size: var(--text-xl);">${s.clusterCount}</span></div>
      </div>
      <div class="metric">
        <span class="metric__label">Sources Represented</span>
        <div class="metric__value-row"><span class="metric__value tabular-nums" style="font-size: var(--text-xl);">${s.sourceCount}</span></div>
      </div>
    </div>`;
}

/* ------------------------------------------------------------------ */
/* Cluster switcher — same search + dropdown__menu pattern as Customer  */
/* 360's customer switcher, reused rather than reinvented.              */
/* ------------------------------------------------------------------ */
function renderClusterLabel() {
  const label = document.querySelector("[data-ig-cluster-label]");
  if (label) {
    label.innerHTML = `
      <span style="font-weight: var(--weight-medium); color: var(--text-primary);">${currentCluster.customerName}</span>
      <span class="font-mono" style="font-size: 11px; color: var(--text-tertiary); margin-left: var(--space-2);">${currentCluster.maskedCrmId}</span>`;
  }
}

function initClusterSwitcher() {
  const wrapper = document.querySelector("[data-ig-switcher]");
  const input = document.querySelector("[data-ig-switcher-search]");
  const results = document.querySelector("[data-ig-switcher-results]");
  if (!wrapper || !input || !results) return;

  function showResults(list) {
    results.innerHTML = list.length
      ? list
          .map(
            (cl) => `
        <button class="dropdown__item" role="menuitem" data-ig-result="${cl.customerId}" style="flex-direction: column; align-items: flex-start; gap: 0;">
          <span style="font-weight: var(--weight-medium); color: var(--text-primary);">${cl.customerName}</span>
          <span class="font-mono" style="font-size: 11px; color: var(--text-tertiary);">${cl.maskedCrmId} · ${cl.lifecycle}</span>
        </button>`
          )
          .join("")
      : `<div class="dropdown__label">No clusters found</div>`;
    results.querySelectorAll("[data-ig-result]").forEach((btn) => {
      btn.addEventListener("click", () => {
        selectCluster(btn.dataset.igResult);
        wrapper.classList.remove("is-open");
        input.value = "";
      });
    });
  }

  function search(query) {
    const q = normalize(query || "");
    const matches = q
      ? IDENTITY_CLUSTERS.filter((cl) => normalize(cl.customerName).includes(q) || normalize(cl.maskedCrmId).includes(q))
      : IDENTITY_CLUSTERS;
    showResults(matches);
  }

  input.addEventListener("focus", () => {
    search(input.value);
    wrapper.classList.add("is-open");
  });
  input.addEventListener("input", () => search(input.value));
  document.addEventListener("click", (e) => {
    if (!wrapper.contains(e.target)) wrapper.classList.remove("is-open");
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") wrapper.classList.remove("is-open");
  });
}

function selectCluster(customerId) {
  const cluster = IDENTITY_CLUSTERS.find((cl) => cl.customerId === customerId);
  if (!cluster) return;
  currentCluster = cluster;
  selectedNodeId = "canonical";
  renderClusterLabel();
  renderGraph();
  renderDetails();
}

/* ------------------------------------------------------------------ */
/* Graph canvas — inline SVG, same rect+line approach already used by  */
/* the Data Governance identity diagram, generalized to N identifier    */
/* nodes positioned around a canonical center.                         */
/* ------------------------------------------------------------------ */
function renderGraph() {
  const mount = document.querySelector("[data-ig-graph]");
  if (!mount) return;
  const nodeById = Object.fromEntries(currentCluster.nodes.map((n) => [n.id, n]));

  const lines = currentCluster.edges
    .map(([a, b]) => {
      const na = nodeById[a];
      const nb = nodeById[b];
      return `<line x1="${na.x}" y1="${na.y}" x2="${nb.x}" y2="${nb.y}" stroke="var(--color-ink-300)" stroke-width="1.5"></line>`;
    })
    .join("");

  const nodes = currentCluster.nodes
    .map((n) => {
      const style = NODE_STYLE[n.kind];
      const selected = n.id === selectedNodeId;
      const w = Math.max(104, n.label.length * 7 + 28);
      const h = n.kind === "canonical" ? 40 : 34;
      return `
      <g data-ig-node="${n.id}" style="cursor:pointer;" tabindex="0" role="button" aria-label="${n.label}">
        <rect x="${n.x - w / 2}" y="${n.y - h / 2}" width="${w}" height="${h}" rx="7"
          fill="${style.fill}" stroke="${selected ? NODE_STYLE_SELECTED[n.kind] : style.stroke}"
          stroke-width="${selected ? 2.5 : n.kind === "canonical" ? 1.5 : 1}"></rect>
        <text x="${n.x}" y="${n.y - (n.kind === "canonical" ? 3 : 2)}" text-anchor="middle" font-size="11"
          font-weight="${n.kind === "canonical" ? 600 : 500}" fill="${style.text}">${n.label}</text>
        <text x="${n.x}" y="${n.y + 12}" text-anchor="middle" font-size="9" font-family="var(--font-mono)" fill="var(--text-tertiary)">${n.kind === "canonical" ? n.sublabel : truncate(n.sublabel, 20)}</text>
      </g>`;
    })
    .join("");

  mount.innerHTML = `<svg viewBox="${CANVAS_VIEWBOX}" role="img" aria-label="Identity graph for ${currentCluster.customerName}" style="width:100%; height:auto; display:block;">${lines}${nodes}</svg>`;

  mount.querySelectorAll("[data-ig-node]").forEach((g) => {
    const activate = () => {
      selectedNodeId = g.dataset.igNode;
      renderGraph();
      renderDetails();
    };
    g.addEventListener("click", activate);
    g.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        activate();
      }
    });
  });
}

function truncate(str, max) {
  return str.length > max ? str.slice(0, max - 1) + "…" : str;
}

/* ------------------------------------------------------------------ */
/* Identity Details panel — reuses .identity-row, the same primitive    */
/* Customer 360 uses for its own identity rows.                        */
/* ------------------------------------------------------------------ */
function detailRow(label, value) {
  return `
    <div class="identity-row">
      <div class="identity-row__main">
        <span class="identity-row__label">${label}</span>
        <span style="font-size: var(--text-sm); color: var(--text-primary);">${value}</span>
      </div>
    </div>`;
}

function renderDetails() {
  const mount = document.querySelector("[data-ig-details]");
  if (!mount) return;
  const node = currentCluster.nodes.find((n) => n.id === selectedNodeId) || currentCluster.nodes[0];

  let rows;
  if (node.kind === "canonical") {
    rows = [
      detailRow("Identifier Type", `<span class="badge badge--primary">Canonical Identity (rudderId)</span>`),
      detailRow("Value", `<span class="font-mono">${node.sublabel}</span>`),
      detailRow("Relationship", `Unifies ${currentCluster.nodes.length - 1} connected identifier${currentCluster.nodes.length - 1 === 1 ? "" : "s"} for this profile`),
      detailRow("Source", "RudderStack-aligned identity resolution (conceptual — not a live connection)"),
    ];
  } else {
    const relationship =
      node.kind === "business"
        ? `PHS business identifier linked to canonical identity <span class="font-mono">${currentCluster.rudderId}</span>`
        : `Linked identifier of canonical identity <span class="font-mono">${currentCluster.rudderId}</span>`;
    rows = [
      detailRow(
        "Identifier Type",
        node.kind === "business" ? `<span class="badge badge--gold">PHS Account ID (business identifier)</span>` : `<span class="badge badge--neutral">${node.label}</span>`
      ),
      detailRow("Value", `<span class="font-mono">${node.sublabel}</span>`),
      detailRow("Relationship", relationship),
      detailRow("Source System", `${node.source} · ${node.status} · last seen ${node.lastSeen}`),
    ];
  }

  mount.innerHTML = `
    <div class="section__title" style="font-size: var(--text-sm); margin-bottom: var(--space-1);">
      ${node.kind === "canonical" ? "Canonical Identity" : node.label}
    </div>
    <div style="margin-bottom: var(--space-4);">${rows.join("")}</div>
    <a class="btn btn--outline btn--sm" href="customer-360.html?id=${currentCluster.accountId}">
      <i data-lucide="circle-user-round"></i>
      Open Customer 360
    </a>`;
  refreshIcons();
}

/* ------------------------------------------------------------------ */
/* Legend                                                               */
/* ------------------------------------------------------------------ */
function renderLegend() {
  const mount = document.querySelector("[data-ig-legend]");
  if (!mount) return;
  mount.innerHTML = `
    <span class="graph-legend__item"><span class="graph-legend__swatch" style="background: var(--color-primary-500);"></span>Canonical identity (rudderId)</span>
    <span class="graph-legend__item"><span class="graph-legend__swatch" style="background: var(--color-gold-700);"></span>PHS Account ID (business identifier)</span>
    <span class="graph-legend__item"><span class="graph-legend__swatch" style="background: var(--color-ink-300);"></span>Linked identifier</span>`;
}

export function initIdentityGraph() {
  renderSummary();
  renderLegend();
  initClusterSwitcher();
  renderClusterLabel();
  renderGraph();
  renderDetails();
}
