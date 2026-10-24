/*
  Data Governance (Governance) — explains and cross-references identity,
  classification, and policy concepts that already live in Customer 360,
  Data Catalog, Tracking Plans, Data Quality, Consent & Preferences, and
  Destinations. See js/data/data-governance.js for the RudderStack-
  aligned identity graph model and why nothing here is a second
  identity system, a second data catalog, or a second consent model.
*/
import {
  IDENTITY_GRAPH_NODES,
  IDENTITY_GRAPH_EDGES,
  RESOLVED_ENTITY,
  CONNECTED_IDENTIFIERS,
  CANONICAL_IDENTITY,
  RUDDERSTACK_NOTE,
  IDENTITY_STITCHING_FLOW,
  IDENTITY_STITCHING_DESC,
  CUSTOMER_360_FLOW,
  CUSTOMER_360_DESC,
  IDENTIFIERS,
  IDENTITY_EDGE_SOURCES,
  IDENTITY_HEALTH,
  IDENTITY_CONFIGURATION,
  updateIdentityConfiguration,
  CLASSIFICATION_META,
  DATA_CLASSIFICATIONS,
  DATA_OWNERS,
  EXTERNAL_TRANSFER_LEVELS,
  ROW_STATUSES,
  DATA_CLASSIFICATION_ROWS,
  updateClassificationRow,
  GOVERNED_DATA_CATEGORIES,
  UPDATE_FREQUENCIES,
  GOVERNED_DATA,
  updateGovernedDataRow,
  PII_HANDLING_FLOW,
  PII_DISCLAIMER,
  PII_CONTROLS,
  updatePiiControl,
  ACCESS_LEVELS,
  POLICY_STATUSES,
  PII_ACTIONS,
  GOVERNANCE_POLICIES,
  getPolicyById,
  updatePolicy,
  GOVERNANCE_COVERAGE,
  GOVERNANCE_ACTIVITY,
  ARCHITECTURE_LAYERS,
} from "../data/data-governance.js";

function refreshIcons() {
  if (window.lucide) window.lucide.createIcons();
}
function classificationBadge(classification) {
  const meta = CLASSIFICATION_META[classification] || CLASSIFICATION_META.Internal;
  return `<span class="badge ${meta.badge}">${classification}</span>`;
}
function transferBadge(level) {
  const map = { Controlled: "badge--info", Restricted: "badge--warning", Prohibited: "badge--danger" };
  return `<span class="badge ${map[level] || "badge--neutral"}">${level}</span>`;
}
function statusBadge(status) {
  return `<span class="badge ${status === "Active" ? "badge--success" : "badge--neutral"}">${status}</span>`;
}

/* ================================================================ */
/* Tabs — reuses the existing .tabs component (already wired by       */
/* initAllTabs() in bootstrapPage); this only adds hash-fragment sync  */
/* on top so data-governance.html#identity etc. works on direct nav    */
/* and refresh, without a second routing system.                      */
/* ================================================================ */
function initTabsWithHash() {
  const tabButtons = Array.from(document.querySelectorAll("[data-dg-tabs] [role='tab']"));
  function activateByHash(hash) {
    const target = tabButtons.find((t) => t.dataset.hash === hash) || tabButtons[0];
    target.click();
  }
  tabButtons.forEach((btn) => {
    btn.addEventListener("click", () => {
      history.replaceState(null, "", `#${btn.dataset.hash}`);
    });
  });
  const initialHash = location.hash.replace("#", "");
  if (initialHash) activateByHash(initialHash);

  window.addEventListener("hashchange", () => {
    activateByHash(location.hash.replace("#", ""));
  });
}

/* ================================================================ */
/* Generic governance edit drawer — reused for every editable table.  */
/* ================================================================ */
function fieldHTML(f, values) {
  const val = values[f.key] ?? "";
  if (f.type === "readonly") {
    return `<div class="field"><label class="field__label">${f.label}</label><div class="event-form-readonly">${val}</div></div>`;
  }
  if (f.type === "select") {
    return `<div class="field"><label class="field__label">${f.label}</label>
      <div class="select select--sm">
        <select data-edit-field="${f.key}">${f.options.map((o) => `<option value="${o}" ${o === val ? "selected" : ""}>${o}</option>`).join("")}</select>
        <i class="select__chevron" data-lucide="chevron-down"></i>
      </div></div>`;
  }
  return `<div class="field"><label class="field__label">${f.label}</label><input class="input" type="text" data-edit-field="${f.key}" value="${val}" /></div>`;
}
function openEditDrawer({ eyebrow, title, fields, values, warning, validate, onSave }) {
  document.querySelector("[data-dg-edit-eyebrow]").textContent = eyebrow;
  document.querySelector("[data-dg-edit-title]").textContent = title;
  const body = document.querySelector("[data-dg-edit-body]");
  body.innerHTML = `
    ${
      warning
        ? `<div class="stream-state-banner stream-state-banner--warning" style="margin-bottom: var(--space-5);"><i data-lucide="alert-triangle"></i><div>${warning}</div></div>`
        : ""
    }
    <div class="stack gap-4">${fields.map((f) => fieldHTML(f, values)).join("")}</div>
    <div class="event-form-error" data-edit-error hidden></div>
    <div class="cluster gap-2" style="justify-content: flex-end; margin-top: var(--space-6);">
      <button type="button" class="btn btn--ghost btn--sm" data-edit-cancel>Cancel</button>
      <button type="button" class="btn btn--primary btn--sm" data-edit-save>Save Changes</button>
    </div>`;
  refreshIcons();

  body.querySelector("[data-edit-cancel]").addEventListener("click", closeEditDrawer);
  body.querySelector("[data-edit-save]").addEventListener("click", () => {
    const newValues = { ...values };
    fields.forEach((f) => {
      if (f.type === "readonly") return;
      const el = body.querySelector(`[data-edit-field="${f.key}"]`);
      newValues[f.key] = el.value;
    });
    const error = validate ? validate(newValues) : null;
    const errorEl = body.querySelector("[data-edit-error]");
    if (error) {
      errorEl.textContent = error;
      errorEl.hidden = false;
      return;
    }
    onSave(newValues);
    closeEditDrawer();
  });
  document.getElementById("governance-edit-drawer").classList.add("is-open");
}
function closeEditDrawer() {
  document.getElementById("governance-edit-drawer").classList.remove("is-open");
}

/* ================================================================ */
/* Overview — architecture + coverage                                 */
/* ================================================================ */
function renderArchitecture() {
  const mount = document.querySelector("[data-dg-architecture]");
  mount.innerHTML = ARCHITECTURE_LAYERS.map((layer, i) => {
    const node = `
      <div class="stream-pipeline__node${i === 3 ? " stream-pipeline__node--primary" : ""}" style="min-width: 420px;">
        <div style="font-weight: var(--weight-semibold);">${layer.label}</div>
        <div style="font-size: var(--text-xs); font-weight: var(--weight-regular); color: var(--text-tertiary); margin-top: 2px;">${layer.items.join(" · ")}</div>
      </div>`;
    const arrow = i < ARCHITECTURE_LAYERS.length - 1 ? `<span class="stream-pipeline__arrow"><i data-lucide="arrow-down"></i></span>` : "";
    return node + arrow;
  }).join("");
  refreshIcons();
}
function renderCoverage() {
  const mount = document.querySelector("[data-dg-coverage]");
  mount.innerHTML = GOVERNANCE_COVERAGE.map(
    (c) => `
    <a class="event-stream-card" href="${c.href}" style="text-decoration: none;">
      <div class="event-stream-card__head">
        <span class="event-stream-card__icon"><i data-lucide="${c.icon}"></i></span>
        <div>
          <div class="event-stream-card__name">${c.module}</div>
          <div class="event-stream-card__today">${c.description || c.concept}</div>
        </div>
      </div>
    </a>`
  ).join("");
  refreshIcons();
}

/* ================================================================ */
/* Identity Health — lightweight summary metrics only.                */
/* ================================================================ */
function renderIdentityHealth() {
  const h = IDENTITY_HEALTH;
  const fmtM = (n) => `${(n / 1000000).toFixed(2)}M`;
  document.querySelector("[data-dg-identity-health]").innerHTML = `
    <div class="metric metric--primary"><span class="metric__label">Resolved Entities</span><div class="metric__value-row"><span class="metric__value tabular-nums" style="font-size: var(--text-xl);">${h.resolvedEntities.toLocaleString()}</span></div></div>
    <div class="metric"><span class="metric__label">Identifiers Linked</span><div class="metric__value-row"><span class="metric__value tabular-nums" style="font-size: var(--text-xl);">${h.identifiersLinked.toLocaleString()}</span></div></div>
    <div class="metric"><span class="metric__label">Identity Signals</span><div class="metric__value-row"><span class="metric__value tabular-nums" style="font-size: var(--text-xl);">${fmtM(h.identitySignals)}</span></div></div>
    <div class="metric metric--danger"><span class="metric__label">Unresolved Identifiers</span><div class="metric__value-row"><span class="metric__value tabular-nums" style="font-size: var(--text-xl);">${h.unresolvedIdentifiers.toLocaleString()}</span></div></div>
    <div class="metric metric--success"><span class="metric__label">Resolution Coverage</span><div class="metric__value-row"><span class="metric__value tabular-nums" style="font-size: var(--text-xl);">${h.resolutionCoverage}%</span></div></div>`;
}

/* ================================================================ */
/* Identity Graph — small static SVG. Neutral connector lines only,   */
/* no arrowheads (edges indicate connection, not priority/ranking).   */
/* The center node is the resolved entity itself, never an identifier */
/* — Account ID is just one connected peer node, same weight as the   */
/* others. Any node opens the Identity Graph Detail drawer.           */
/* ================================================================ */
function renderGraph() {
  const mount = document.querySelector("[data-dg-graph]");
  const nodeById = Object.fromEntries(IDENTITY_GRAPH_NODES.map((n) => [n.id, n]));
  const lines = IDENTITY_GRAPH_EDGES.map(([a, b]) => {
    const na = nodeById[a];
    const nb = nodeById[b];
    return `<line x1="${na.x}" y1="${na.y}" x2="${nb.x}" y2="${nb.y}" stroke="var(--color-ink-300)" stroke-width="1.5"></line>`;
  }).join("");
  const nodes = IDENTITY_GRAPH_NODES.map((n) => {
    const w = Math.max(96, n.label.length * 7.5 + 24);
    const primary = n.primary;
    return `
      <g data-graph-node="${n.id}" style="cursor:pointer;">
        <rect x="${n.x - w / 2}" y="${n.y - 16}" width="${w}" height="32" rx="6"
          fill="${primary ? "var(--color-primary-50)" : "var(--surface-panel)"}"
          stroke="${primary ? "var(--color-primary-500)" : "var(--border-subtle)"}" stroke-width="${primary ? 1.5 : 1}"></rect>
        <text x="${n.x}" y="${n.y + 4}" text-anchor="middle" font-size="11" font-weight="${primary ? 600 : 500}"
          fill="${primary ? "var(--color-primary-700)" : "var(--text-primary)"}">${n.label}</text>
      </g>`;
  }).join("");
  mount.innerHTML = `<svg viewBox="0 0 640 380" role="img" aria-label="Identity graph" style="width:100%; height:auto; display:block;">${lines}${nodes}</svg>`;
  mount.querySelectorAll("[data-graph-node]").forEach((g) => {
    g.addEventListener("click", openGraphDetailDrawer);
  });
}

/* ================================================================ */
/* Resolved Entity panel (static summary) + Identity Graph Detail      */
/* drawer (opened from any graph node) — same underlying example       */
/* entity, shown at two levels of detail.                              */
/* ================================================================ */
function renderResolvedEntity() {
  const e = RESOLVED_ENTITY;
  const rows = [
    ["Canonical Identity", `<span class="font-mono">${e.canonicalId}</span>`],
    ["PHS Account ID", `<span class="font-mono">${e.businessIdentifier}</span>`],
    ["Connected Identifiers", `<span class="tabular-nums">${e.identifierCount}</span>`],
    ["Identity Resolution", e.resolution],
    ["Status", `<span class="badge badge--success">${e.status}</span>`],
    ["Last Updated", `<span class="tabular-nums">${e.lastUpdated}</span>`],
  ];
  document.querySelector("[data-dg-resolved-entity]").innerHTML = `
    <div class="section__title" style="font-size: var(--text-sm); margin-bottom: var(--space-1);">Resolved Entity</div>
    ${rows
      .map(
        ([label, value]) => `
      <div class="identity-row">
        <div class="identity-row__main">
          <span class="identity-row__label">${label}</span>
          <span style="font-size: var(--text-sm); color: var(--text-primary);">${value}</span>
        </div>
      </div>`
      )
      .join("")}`;
}
function connectedIdentifierRows() {
  return CONNECTED_IDENTIFIERS.map(
    (c) => `
    <div class="identity-row">
      <div class="identity-row__main">
        <span class="identity-row__label">${c.label}</span>
        <span class="font-mono" style="font-size: var(--text-sm); color: var(--text-primary);">${c.value}</span>
      </div>
    </div>`
  ).join("");
}
function openGraphDetailDrawer() {
  const e = RESOLVED_ENTITY;
  document.querySelector("[data-dg-graph-detail-body]").innerHTML = `
    <div class="stack gap-3">
      <div class="identity-row"><div class="identity-row__main"><span class="identity-row__label">Canonical Identity</span><span class="font-mono" style="font-size: var(--text-sm);">${e.canonicalId}</span></div></div>
      <div class="identity-row"><div class="identity-row__main"><span class="identity-row__label">Business Identifier</span><span class="font-mono" style="font-size: var(--text-sm);">${e.businessIdentifier}</span></div></div>
    </div>
    <div class="section__header" style="padding: 0; margin: var(--space-6) 0 var(--space-3);"><h3 class="section__title" style="font-size: var(--text-sm);">Identifiers</h3></div>
    <div class="stack gap-3">${connectedIdentifierRows()}</div>
    <div class="section__header" style="padding: 0; margin: var(--space-6) 0 var(--space-3);"><h3 class="section__title" style="font-size: var(--text-sm);">Sources</h3></div>
    <div class="cluster gap-2" style="flex-wrap: wrap;">${e.sources.map((s) => `<span class="badge badge--neutral">${s}</span>`).join("")}</div>
    <div class="stack gap-3" style="margin-top: var(--space-6);">
      <div class="identity-row"><div class="identity-row__main"><span class="identity-row__label">Resolution</span><span style="font-size: var(--text-sm);">${e.resolution}</span></div></div>
      <div class="identity-row"><div class="identity-row__main"><span class="identity-row__label">Status</span><span class="badge badge--success">${e.status}</span></div></div>
      <div class="identity-row"><div class="identity-row__main"><span class="identity-row__label">Last Updated</span><span class="tabular-nums" style="font-size: var(--text-sm);">${e.lastUpdated}</span></div></div>
    </div>`;
  document.getElementById("identity-graph-detail-drawer").classList.add("is-open");
}
function renderRudderstackNote() {
  document.querySelector("[data-dg-rudderstack-note]").textContent = RUDDERSTACK_NOTE;
}

/* ================================================================ */
/* Identity Stitching                                                 */
/* ================================================================ */
function renderStitching() {
  document.querySelector("[data-dg-stitching-desc]").textContent = IDENTITY_STITCHING_DESC;
  const mount = document.querySelector("[data-dg-stitching-flow]");
  mount.innerHTML = IDENTITY_STITCHING_FLOW.map((step, i) => {
    const node = `<div class="stream-pipeline__node${step === "Resolved Entity" ? " stream-pipeline__node--primary" : ""}" style="min-width: 260px;">${step}</div>`;
    const arrow = i < IDENTITY_STITCHING_FLOW.length - 1 ? `<span class="stream-pipeline__arrow"><i data-lucide="arrow-down"></i></span>` : "";
    return node + arrow;
  }).join("");
  refreshIcons();
}

/* ================================================================ */
/* Customer 360 Integration — relationship only, no duplicate 360     */
/* functionality.                                                     */
/* ================================================================ */
function renderC360Flow() {
  document.querySelector("[data-dg-c360-desc]").textContent = CUSTOMER_360_DESC;
  const mount = document.querySelector("[data-dg-c360-flow]");
  mount.innerHTML = CUSTOMER_360_FLOW.map((step, i) => {
    const node = `<div class="stream-pipeline__node${step === "Customer 360" ? " stream-pipeline__node--primary" : ""}" style="min-width: 220px;">${step}</div>`;
    const arrow = i < CUSTOMER_360_FLOW.length - 1 ? `<span class="stream-pipeline__arrow"><i data-lucide="arrow-right"></i></span>` : "";
    return node + arrow;
  }).join("");
  refreshIcons();
}

/* ================================================================ */
/* Identifiers table (no priority / rank column)                      */
/* ================================================================ */
function renderIdentifiersTable() {
  const tbody = document.querySelector("[data-dg-identifiers-table] tbody");
  tbody.innerHTML = IDENTIFIERS.map(
    (t) => `<tr>
      <td class="cell-primary font-mono">${t.identifier}</td>
      <td class="cell-muted">${t.identifierType}</td>
      <td class="cell-muted">${t.source}</td>
      <td class="cell-muted">${t.role}</td>
      <td>${t.pii ? '<span class="badge badge--warning">Yes</span>' : "No"}</td>
      <td><span class="badge badge--success">${t.status}</span></td>
    </tr>`
  ).join("");
}

/* ================================================================ */
/* Identity Edge Sources                                              */
/* ================================================================ */
function renderEdgeSources() {
  const tbody = document.querySelector("[data-dg-edge-sources-table] tbody");
  tbody.innerHTML = IDENTITY_EDGE_SOURCES.map(
    (s) => `<tr>
      <td class="cell-primary">${s.source}</td>
      <td class="cell-muted">${s.type}</td>
      <td class="cell-muted">${s.signals}</td>
      <td><span class="badge ${s.status === "Connected" ? "badge--success" : "badge--neutral"}">${s.status}</span></td>
      <td class="cell-muted tabular-nums">${s.lastUpdated}</td>
    </tr>`
  ).join("");
}

/* ================================================================ */
/* Identity Configuration — RudderStack Profiles-style entity config:  */
/* enable/disable identifiers + edge sources, canonical identifier,    */
/* entity name. NOT a Left/Right identifier rule builder.              */
/* ================================================================ */
function renderConfig() {
  const c = IDENTITY_CONFIGURATION;
  document.querySelector("[data-dg-config]").innerHTML = `
    <div class="stack gap-4">
      <div class="identity-row"><div class="identity-row__main"><span class="identity-row__label">Entity</span><span style="font-size: var(--text-sm);">${c.entity}</span></div></div>
      <div class="identity-row"><div class="identity-row__main"><span class="identity-row__label">Identifiers</span><span style="font-size: var(--text-sm);">${c.identifiers.filter((i) => i.enabled).map((i) => `<span class="font-mono">${i.label}</span>`).join(", ")}</span></div></div>
      <div class="identity-row"><div class="identity-row__main"><span class="identity-row__label">Edge Sources</span><span style="font-size: var(--text-sm);">${c.edgeSources.filter((s) => s.enabled).map((s) => s.label).join(", ")}</span></div></div>
      <div class="identity-row"><div class="identity-row__main"><span class="identity-row__label">Canonical Identifier</span><span class="font-mono" style="font-size: var(--text-sm);">${c.canonicalIdentifier}</span></div></div>
      <div class="identity-row"><div class="identity-row__main"><span class="identity-row__label">Status</span><span class="badge badge--success">${c.status}</span></div></div>
    </div>`;
}
function checklistHTML(groupKey, label, items) {
  return `
    <div class="field">
      <label class="field__label">${label}</label>
      <div class="event-checklist">
        ${items
          .map(
            (item) => `<label><input type="checkbox" data-config-item="${groupKey}" value="${item.id}" ${item.enabled ? "checked" : ""} /> <span class="font-mono">${item.label}</span></label>`
          )
          .join("")}
      </div>
    </div>`;
}
function openConfigDrawer() {
  const c = IDENTITY_CONFIGURATION;
  document.querySelector("[data-dg-edit-eyebrow]").textContent = "Identity Configuration";
  document.querySelector("[data-dg-edit-title]").textContent = "Edit Configuration";
  const body = document.querySelector("[data-dg-edit-body]");
  body.innerHTML = `
    <div class="stack gap-4">
      <div class="field"><label class="field__label">Entity Name</label><input class="input" type="text" data-config-entity value="${c.entity}" /></div>
      ${checklistHTML("identifiers", "Identifiers", c.identifiers)}
      ${checklistHTML("edgeSources", "Edge Sources", c.edgeSources)}
      <div class="field"><label class="field__label">Canonical Identifier</label><div class="event-form-readonly font-mono">${c.canonicalIdentifier}</div></div>
    </div>
    <div class="event-form-error" data-edit-error hidden></div>
    <div class="cluster gap-2" style="justify-content: flex-end; margin-top: var(--space-6);">
      <button type="button" class="btn btn--ghost btn--sm" data-edit-cancel>Cancel</button>
      <button type="button" class="btn btn--primary btn--sm" data-edit-save>Save Changes</button>
    </div>`;
  refreshIcons();

  body.querySelector("[data-edit-cancel]").addEventListener("click", closeEditDrawer);
  body.querySelector("[data-edit-save]").addEventListener("click", () => {
    const entity = body.querySelector("[data-config-entity]").value.trim();
    const errorEl = body.querySelector("[data-edit-error]");
    if (!entity) {
      errorEl.textContent = "Entity name is required.";
      errorEl.hidden = false;
      return;
    }
    const identifiers = c.identifiers.map((i) => ({ ...i, enabled: body.querySelector(`[data-config-item="identifiers"][value="${i.id}"]`).checked }));
    const edgeSources = c.edgeSources.map((s) => ({ ...s, enabled: body.querySelector(`[data-config-item="edgeSources"][value="${s.id}"]`).checked }));
    if (!identifiers.some((i) => i.enabled)) {
      errorEl.textContent = "At least one identifier must remain enabled.";
      errorEl.hidden = false;
      return;
    }
    if (!edgeSources.some((s) => s.enabled)) {
      errorEl.textContent = "At least one edge source must remain enabled.";
      errorEl.hidden = false;
      return;
    }
    updateIdentityConfiguration({ entity, identifiers, edgeSources });
    renderConfig();
    renderActivity();
    closeEditDrawer();
  });
  document.getElementById("governance-edit-drawer").classList.add("is-open");
}

/* ================================================================ */
/* Canonical Identity                                                 */
/* ================================================================ */
function renderCanonical() {
  const c = CANONICAL_IDENTITY;
  document.querySelector("[data-dg-canonical]").innerHTML = `
    <div class="metric"><span class="metric__label">Canonical Identity (rudderId)</span><div class="metric__value-row"><span class="metric__value font-mono" style="font-size: var(--text-md);">${c.canonicalId}</span></div></div>
    <div class="metric metric--primary"><span class="metric__label">Business Identifier (PHS Account ID)</span><div class="metric__value-row"><span class="metric__value font-mono" style="font-size: var(--text-md);">${c.businessIdentifier}</span></div></div>`;
}

/* ================================================================ */
/* Data Classification — editable                                     */
/* ================================================================ */
function classificationFields(values) {
  return [
    { key: "field", label: "Data Field", type: "readonly" },
    { key: "classification", label: "Classification", type: "select", options: DATA_CLASSIFICATIONS },
    { key: "owner", label: "Owner", type: "select", options: DATA_OWNERS },
    { key: "allowedUsage", label: "Allowed Usage", type: "text" },
    { key: "externalTransfer", label: "External Transfer", type: "select", options: EXTERNAL_TRANSFER_LEVELS },
    { key: "status", label: "Status", type: "select", options: ROW_STATUSES },
  ];
}
function renderClassificationTable() {
  const tbody = document.querySelector("[data-dg-classification-table] tbody");
  tbody.innerHTML = DATA_CLASSIFICATION_ROWS.map(
    (r) => `<tr>
      <td class="cell-primary">${r.field}</td>
      <td>${classificationBadge(r.classification)}</td>
      <td><span class="badge badge--neutral">${r.owner}</span></td>
      <td class="cell-muted">${r.allowedUsage}</td>
      <td>${transferBadge(r.externalTransfer)}</td>
      <td>${statusBadge(r.status)}</td>
      <td><button class="btn btn--ghost btn--sm" data-edit-classification="${r.id}">Edit</button></td>
    </tr>`
  ).join("");
  tbody.querySelectorAll("[data-edit-classification]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const row = DATA_CLASSIFICATION_ROWS.find((r) => r.id === btn.dataset.editClassification);
      openEditDrawer({
        eyebrow: "Data Classification",
        title: row.field,
        fields: classificationFields(row),
        values: row,
        onSave: (values) => {
          updateClassificationRow(row.id, values);
          renderClassificationTable();
          renderActivity();
        },
      });
    });
  });
}

/* ================================================================ */
/* Governed Data — editable                                           */
/* ================================================================ */
function governedDataFields(values) {
  return [
    { key: "field", label: "Data Field", type: "readonly" },
    { key: "category", label: "Category", type: "select", options: GOVERNED_DATA_CATEGORIES },
    { key: "classification", label: "Classification", type: "select", options: DATA_CLASSIFICATIONS },
    { key: "source", label: "Source", type: "text" },
    { key: "owner", label: "Owner", type: "select", options: DATA_OWNERS },
    { key: "updateFrequency", label: "Update Frequency", type: "select", options: UPDATE_FREQUENCIES },
    { key: "allowedUsage", label: "Allowed Usage", type: "text" },
  ];
}
function renderGovernedTable() {
  const tbody = document.querySelector("[data-dg-governed-table] tbody");
  tbody.innerHTML = GOVERNED_DATA.map(
    (g) => `<tr>
      <td class="cell-primary">${g.field}</td>
      <td class="cell-muted">${g.category}</td>
      <td>${classificationBadge(g.classification)}</td>
      <td class="cell-muted">${g.source}</td>
      <td><span class="badge badge--neutral">${g.owner}</span></td>
      <td class="cell-muted">${g.updateFrequency}</td>
      <td class="cell-muted">${g.allowedUsage}</td>
      <td><button class="btn btn--ghost btn--sm" data-edit-governed="${g.id}">Edit</button></td>
    </tr>`
  ).join("");
  tbody.querySelectorAll("[data-edit-governed]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const row = GOVERNED_DATA.find((r) => r.id === btn.dataset.editGoverned);
      openEditDrawer({
        eyebrow: "Governed Data",
        title: row.field,
        fields: governedDataFields(row),
        values: row,
        onSave: (values) => {
          updateGovernedDataRow(row.id, values);
          renderGovernedTable();
          renderActivity();
        },
      });
    });
  });
}

/* ================================================================ */
/* Governance Rules -> Policy Control Center. Every policy only        */
/* REFERENCES the existing module that actually enforces it — no       */
/* second Tracking Plan / Consent / Identity / Transformation engine   */
/* is implemented here. See js/data/data-governance.js for the policy  */
/* records and why PII protections and tracking-plan compliance link   */
/* to real modules rather than duplicating their configuration.        */
/* ================================================================ */
function policyStatusBadge(status) {
  const map = { Active: "badge--success", Draft: "badge--neutral", Disabled: "badge--danger" };
  return `<span class="badge ${map[status] || "badge--neutral"}">${status}</span>`;
}
function renderPolicyTable() {
  const tbody = document.querySelector("[data-dg-policy-table] tbody");
  tbody.innerHTML = GOVERNANCE_POLICIES.map(
    (p) => `<tr data-policy-row="${p.id}" style="cursor: pointer;">
      <td class="cell-primary">${p.policy}</td>
      <td class="cell-muted">${p.type}</td>
      <td class="cell-muted">${p.enforcement}</td>
      <td class="cell-muted">${p.scope}</td>
      <td>${policyStatusBadge(p.status)}</td>
      <td class="cell-muted tabular-nums">${p.lastUpdated}</td>
    </tr>`
  ).join("");
  tbody.querySelectorAll("[data-policy-row]").forEach((row) => {
    row.addEventListener("click", () => openPolicyDrawer(row.dataset.policyRow));
  });
}

/* ---- Policy detail / edit drawer — one shell, per-type body ---- */
function relationshipFlowHTML(flow) {
  return flow
    .map((step, i) => {
      const node = `<div class="stream-pipeline__node${i === 0 || i === flow.length - 1 ? "" : " stream-pipeline__node--primary"}" style="min-width: 180px;">${step}</div>`;
      const arrow = i < flow.length - 1 ? `<span class="stream-pipeline__arrow"><i data-lucide="arrow-right"></i></span>` : "";
      return node + arrow;
    })
    .join("");
}
function impactHTML(impact) {
  const rows = [];
  if (impact.modules) rows.push(["Affected Module" + (impact.modules.length > 1 ? "s" : ""), impact.modules.join(", ")]);
  if (impact.affectedSources !== undefined) rows.push(["Affected Sources", `<span class="tabular-nums">${impact.affectedSources}</span>`]);
  if (impact.affectedDestinations !== undefined) rows.push(["Affected Destinations", `<span class="tabular-nums">${impact.affectedDestinations}</span>`]);
  if (impact.dataTypes) rows.push(["Affected Data Types", impact.dataTypes.join(", ")]);
  return rows.map(([label, value]) => `<div class="identity-row"><div class="identity-row__main"><span class="identity-row__label">${label}</span><span style="font-size: var(--text-sm); color: var(--text-primary);">${value}</span></div></div>`).join("");
}
function policyConfigHTML(p) {
  const c = p.config;
  if (p.id === "pol-pii") {
    return `
      <div class="field"><label class="field__label">Protected Fields</label>
        <div class="table-wrap"><table class="table table--dense">
          <thead><tr><th>Field</th><th>Action</th></tr></thead>
          <tbody>${c.protectedFields
            .map(
              (f, i) => `<tr><td class="cell-muted">${f.field}</td><td>
              <div class="select select--sm"><select data-pii-action="${i}">${PII_ACTIONS.map((a) => `<option value="${a}" ${a === f.action ? "selected" : ""}>${a}</option>`).join("")}${
                !PII_ACTIONS.includes(f.action) ? `<option value="${f.action}" selected>${f.action}</option>` : ""
              }</select><i class="select__chevron" data-lucide="chevron-down"></i></div>
            </td></tr>`
            )
            .join("")}</tbody>
        </table></div>
      </div>
      <div class="identity-row"><div class="identity-row__main"><span class="identity-row__label">Applies To</span><span style="font-size: var(--text-sm);">${c.appliesTo.join(", ")}</span></div></div>
      <div class="identity-row"><div class="identity-row__main"><span class="identity-row__label">Linked Enforcement</span><span style="font-size: var(--text-sm);">${c.linkedEnforcement}</span></div></div>`;
  }
  if (p.id === "pol-tracking") {
    return `
      <div class="identity-row"><div class="identity-row__main"><span class="identity-row__label">Linked Tracking Plan</span><a href="${c.trackingPlanHref}" style="font-size: var(--text-sm);">${c.trackingPlanLabel} <i data-lucide="arrow-up-right" style="width:11px;height:11px;"></i></a></div></div>
      <div class="field"><label class="field__label">Validation Mode</label>
        <div class="select select--sm"><select data-tracking-mode>${["Enforce", "Monitor"].map((m) => `<option value="${m}" ${m === c.validationMode ? "selected" : ""}>${m}</option>`).join("")}</select><i class="select__chevron" data-lucide="chevron-down"></i></div>
      </div>
      <div class="field"><label class="field__label">On Violation</label>
        <div class="select select--sm"><select data-tracking-violation>${["Drop Event", "Forward With Violation Metadata", "Route To Review Destination"].map((o) => `<option value="${o}" ${o === c.onViolation ? "selected" : ""}>${o}</option>`).join("")}</select><i class="select__chevron" data-lucide="chevron-down"></i></div>
      </div>
      <div class="identity-row"><div class="identity-row__main"><span class="identity-row__label">Events Covered</span><span class="tabular-nums" style="font-size: var(--text-sm);">${c.eventsCovered}</span></div></div>
      <div class="identity-row"><div class="identity-row__main"><span class="identity-row__label">Required Properties</span><span class="tabular-nums" style="font-size: var(--text-sm);">${c.requiredProperties}</span></div></div>
      <div class="identity-row"><div class="identity-row__main"><span class="identity-row__label">Current Violation Rate</span><span class="tabular-nums" style="font-size: var(--text-sm);">${c.violationRate}%</span></div></div>`;
  }
  if (p.id === "pol-consent") {
    return `
      <div class="identity-row"><div class="identity-row__main"><span class="identity-row__label">Required Consent Categories</span><span style="font-size: var(--text-sm);">${c.requiredCategories.join(" " + c.logic + " ")}</span></div></div>
      <div class="field"><label class="field__label">Destination Scope</label>
        <div class="event-checklist">${c.destinationScope
          .concat(["Email", "SMS", "Push", "Meta Ads", "Google Ads"].filter((d) => !c.destinationScope.includes(d)))
          .map((d) => `<label><input type="checkbox" data-consent-dest value="${d}" ${c.destinationScope.includes(d) ? "checked" : ""} /> <span>${d}</span></label>`)
          .join("")}</div>
      </div>
      ${c.rules.map((r) => `<div class="identity-row"><div class="identity-row__main"><span class="identity-row__label">${r.destination} requires</span><span style="font-size: var(--text-sm);">${r.requires}</span></div></div>`).join("")}
      <div class="identity-row"><div class="identity-row__main"><span class="identity-row__label">Managed In</span><a href="${c.consentHref}" style="font-size: var(--text-sm);">Consent & Preferences <i data-lucide="arrow-up-right" style="width:11px;height:11px;"></i></a></div></div>`;
  }
  if (p.id === "pol-identity") {
    return `
      <div class="identity-row"><div class="identity-row__main"><span class="identity-row__label">Identity Model</span><span style="font-size: var(--text-sm);">${c.identityModel}</span></div></div>
      <div class="identity-row"><div class="identity-row__main"><span class="identity-row__label">Canonical Identity</span><span class="font-mono" style="font-size: var(--text-sm);">${c.canonicalIdentity}</span></div></div>
      <div class="identity-row"><div class="identity-row__main"><span class="identity-row__label">Business Identifier</span><span class="font-mono" style="font-size: var(--text-sm);">${c.businessIdentifier}</span></div></div>
      <div class="identity-row"><div class="identity-row__main"><span class="identity-row__label">Identity Sources</span><span style="font-size: var(--text-sm);">${c.identitySources.join(", ")}</span></div></div>
      <div class="identity-row"><div class="identity-row__main"><a href="${c.identityHref}" style="font-size: var(--text-sm);">View Identity Configuration <i data-lucide="arrow-up-right" style="width:11px;height:11px;"></i></a></div></div>`;
  }
  if (p.id === "pol-activation") {
    return `
      <div class="identity-row"><div class="identity-row__main"><span class="identity-row__label">Allowed Data Classes</span><span style="font-size: var(--text-sm);">${c.allowedDataClasses.join(", ")}</span></div></div>
      <div class="identity-row"><div class="identity-row__main"><span class="identity-row__label">Restricted Data</span><span style="font-size: var(--text-sm);">${c.restrictedData.join(", ")}</span></div></div>
      <div class="identity-row"><div class="identity-row__main"><span class="identity-row__label">Destinations</span><a href="${c.destinationsHref}" style="font-size: var(--text-sm);">${c.destinations.join(", ")} <i data-lucide="arrow-up-right" style="width:11px;height:11px;"></i></a></div></div>`;
  }
  if (p.id === "pol-transaction") {
    return `
      <div class="identity-row"><div class="identity-row__main"><span class="identity-row__label">Classification</span><span class="badge badge--danger">${c.classification}</span></div></div>
      <div class="identity-row"><div class="identity-row__main"><span class="identity-row__label">Allowed Destinations</span><span style="font-size: var(--text-sm);">${c.allowedDestinations.join(", ")}</span></div></div>
      <div class="identity-row"><div class="identity-row__main"><span class="identity-row__label">External Destinations</span><span class="badge badge--danger">${c.externalDestinations}</span></div></div>
      <div class="table-wrap" style="margin-top: var(--space-2);"><table class="table table--dense">
        <thead><tr><th>Data</th><th>Rule</th></tr></thead>
        <tbody>${c.examples.map((e) => `<tr><td class="cell-muted">${e.item}</td><td class="cell-muted">${e.rule}</td></tr>`).join("")}</tbody>
      </table></div>`;
  }
  return "";
}
function collectConfigPatch(p, body) {
  const c = { ...p.config };
  const changes = [];
  if (p.id === "pol-pii") {
    c.protectedFields = c.protectedFields.map((f, i) => {
      const newAction = body.querySelector(`[data-pii-action="${i}"]`).value;
      if (newAction !== f.action) changes.push({ action: "Updated protected field", previousValue: `${f.field}: ${f.action}`, newValue: `${f.field}: ${newAction}` });
      return { ...f, action: newAction };
    });
  }
  if (p.id === "pol-tracking") {
    const newMode = body.querySelector("[data-tracking-mode]").value;
    const newViolation = body.querySelector("[data-tracking-violation]").value;
    if (newMode !== c.validationMode) changes.push({ action: "Changed validation mode", previousValue: c.validationMode, newValue: newMode });
    if (newViolation !== c.onViolation) changes.push({ action: "Changed on-violation handling", previousValue: c.onViolation, newValue: newViolation });
    c.validationMode = newMode;
    c.onViolation = newViolation;
  }
  if (p.id === "pol-consent") {
    const checked = [...body.querySelectorAll("[data-consent-dest]:checked")].map((el) => el.value);
    const added = checked.filter((d) => !c.destinationScope.includes(d));
    const removed = c.destinationScope.filter((d) => !checked.includes(d));
    added.forEach((d) => changes.push({ action: "Changed destination scope", previousValue: d, newValue: "Added" }));
    removed.forEach((d) => changes.push({ action: "Changed destination scope", previousValue: d, newValue: "Removed" }));
    c.destinationScope = checked;
  }
  return { config: c, changes };
}

function openPolicyDrawer(id) {
  const p = getPolicyById(id);
  renderPolicyDrawerBody(p, { confirmingDisable: false });
  document.getElementById("governance-edit-drawer").classList.add("is-open");
}
function renderPolicyDrawerBody(p, { confirmingDisable, pendingStatus }) {
  document.querySelector("[data-dg-edit-eyebrow]").textContent = `${p.type} Policy`;
  document.querySelector("[data-dg-edit-title]").textContent = p.policy;
  const body = document.querySelector("[data-dg-edit-body]");
  body.innerHTML = `
    ${p.warning ? `<div class="stream-state-banner stream-state-banner--warning" style="margin-bottom: var(--space-5);"><i data-lucide="alert-triangle"></i><div>${p.warning}</div></div>` : ""}
    <div class="stack gap-3">
      <div class="identity-row"><div class="identity-row__main"><span class="identity-row__label">Policy Type</span><span style="font-size: var(--text-sm);">${p.type}</span></div></div>
      <div class="field"><label class="field__label">Status</label>
        <div class="select select--sm"><select data-policy-status>${POLICY_STATUSES.map((s) => `<option value="${s}" ${s === p.status ? "selected" : ""}>${s}</option>`).join("")}</select><i class="select__chevron" data-lucide="chevron-down"></i></div>
      </div>
      <div class="identity-row"><div class="identity-row__main"><span class="identity-row__label">Enforcement</span><span style="font-size: var(--text-sm);">${p.enforcement}</span></div></div>
      <div class="identity-row"><div class="identity-row__main"><span class="identity-row__label">Scope</span><span style="font-size: var(--text-sm);">${p.scope}</span></div></div>
      <div class="identity-row"><div class="identity-row__main"><span class="identity-row__label">Description</span><span style="font-size: var(--text-sm);">${p.description}</span></div></div>
    </div>

    <div class="section__header" style="padding: 0; margin: var(--space-6) 0 var(--space-3);"><h3 class="section__title" style="font-size: var(--text-sm);">Configuration</h3></div>
    <div class="stack gap-3">${policyConfigHTML(p)}</div>

    <div class="section__header" style="padding: 0; margin: var(--space-6) 0 var(--space-3);"><h3 class="section__title" style="font-size: var(--text-sm);">Policy Enforcement</h3></div>
    <div class="stream-pipeline" style="flex-direction: row; flex-wrap: wrap;">${relationshipFlowHTML(p.relationshipFlow)}</div>

    <div class="section__header" style="padding: 0; margin: var(--space-6) 0 var(--space-3);"><h3 class="section__title" style="font-size: var(--text-sm);">Impact</h3></div>
    <div class="stack gap-3">${impactHTML(p.impact)}</div>

    <div class="stack gap-3" style="margin-top: var(--space-6);">
      <div class="identity-row"><div class="identity-row__main"><span class="identity-row__label">Last Updated</span><span class="tabular-nums" style="font-size: var(--text-sm);">${p.lastUpdated}</span></div></div>
      <div class="identity-row"><div class="identity-row__main"><span class="identity-row__label">Updated By</span><span style="font-size: var(--text-sm);">${p.updatedBy}</span></div></div>
    </div>

    ${
      confirmingDisable
        ? `<div class="stream-state-banner stream-state-banner--warning" style="margin-top: var(--space-6);"><i data-lucide="alert-triangle"></i><div>Disabling this policy may affect downstream data handling.</div></div>
           <div class="cluster gap-2" style="justify-content: flex-end; margin-top: var(--space-4);">
             <button type="button" class="btn btn--ghost btn--sm" data-policy-cancel-disable>Cancel</button>
             <button type="button" class="btn btn--danger btn--sm" data-policy-confirm-disable>Disable Policy</button>
           </div>`
        : `<div class="cluster gap-2" style="justify-content: flex-end; margin-top: var(--space-6);">
             <button type="button" class="btn btn--ghost btn--sm" data-policy-cancel>Cancel</button>
             <button type="button" class="btn btn--primary btn--sm" data-policy-save>Save Policy</button>
           </div>`
    }`;
  refreshIcons();

  body.querySelector("[data-policy-cancel]")?.addEventListener("click", closeEditDrawer);
  body.querySelector("[data-policy-cancel-disable]")?.addEventListener("click", () => renderPolicyDrawerBody(p, { confirmingDisable: false }));
  body.querySelector("[data-policy-confirm-disable]")?.addEventListener("click", () => {
    commitPolicySave(p, pendingStatus, body);
  });
  body.querySelector("[data-policy-save]")?.addEventListener("click", () => {
    const newStatus = body.querySelector("[data-policy-status]").value;
    if (newStatus === "Disabled" && p.status !== "Disabled") {
      renderPolicyDrawerBody(p, { confirmingDisable: true, pendingStatus: newStatus });
      return;
    }
    commitPolicySave(p, newStatus, body);
  });
  // "View X" links navigate elsewhere in the app (including an in-page
  // tab switch for Identity) — close the drawer first so it doesn't sit
  // open over whichever view the link lands on.
  body.querySelectorAll("a[href]").forEach((a) => a.addEventListener("click", closeEditDrawer));
}
function commitPolicySave(p, newStatus, body) {
  const { config, changes } = collectConfigPatch(p, body);
  const previousStatus = p.status; // capture before any mutation below
  const statusChanged = newStatus !== previousStatus;

  if (changes.length) {
    changes.forEach((ch, i) => updatePolicy(p.id, i === 0 ? { config } : {}, ch));
  } else if (!statusChanged) {
    updatePolicy(p.id, { config });
  }
  if (statusChanged) {
    updatePolicy(p.id, { status: newStatus }, { action: "Status Changed", previousValue: previousStatus, newValue: newStatus });
  }

  renderPolicyTable();
  renderActivity();
  closeEditDrawer();
}

/* ================================================================ */
/* PII Handling + PII Controls — editable + Access Level               */
/* ================================================================ */
function renderPiiFlow() {
  document.querySelector("[data-dg-pii-disclaimer]").textContent = PII_DISCLAIMER;
  const mount = document.querySelector("[data-dg-pii-flow]");
  mount.innerHTML = PII_HANDLING_FLOW.map((step, i) => {
    const node = `<div class="stream-pipeline__node${step === "Masking / Hashing" ? " stream-pipeline__node--primary" : ""}" style="min-width: 160px;">${step}</div>`;
    const arrow = i < PII_HANDLING_FLOW.length - 1 ? `<span class="stream-pipeline__arrow"><i data-lucide="arrow-right"></i></span>` : "";
    return node + arrow;
  }).join("");
  refreshIcons();
}
function piiControlFields(values) {
  return [
    { key: "field", label: "Field", type: "readonly" },
    { key: "classification", label: "Classification", type: "select", options: DATA_CLASSIFICATIONS },
    { key: "externalTransfer", label: "External Transfer", type: "select", options: EXTERNAL_TRANSFER_LEVELS },
    { key: "handling", label: "Handling", type: "text" },
    { key: "status", label: "Status", type: "select", options: ROW_STATUSES },
  ];
}
function renderPiiControlsTable() {
  const tbody = document.querySelector("[data-dg-pii-controls-table] tbody");
  tbody.innerHTML = PII_CONTROLS.map(
    (p) => `<tr>
      <td class="cell-primary">${p.field}</td>
      <td>${classificationBadge(p.classification)}</td>
      <td>${transferBadge(p.externalTransfer)}</td>
      <td class="cell-muted">${p.handling}</td>
      <td>${statusBadge(p.status)}</td>
      <td><button class="btn btn--ghost btn--sm" data-edit-pii="${p.id}">Edit</button></td>
    </tr>`
  ).join("");
  tbody.querySelectorAll("[data-edit-pii]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const row = PII_CONTROLS.find((r) => r.id === btn.dataset.editPii);
      openEditDrawer({
        eyebrow: "PII Control",
        title: row.field,
        fields: piiControlFields(row),
        values: row,
        onSave: (values) => {
          updatePiiControl(row.id, values);
          renderPiiControlsTable();
          renderActivity();
        },
      });
    });
  });
}
function renderAccessTable() {
  const tbody = document.querySelector("[data-dg-access-table] tbody");
  tbody.innerHTML = ACCESS_LEVELS.map(
    (a) => `<tr>
      <td>${classificationBadge(a.classification)}</td>
      <td class="cell-muted">${a.accessLevel}</td>
      <td class="cell-muted">${a.exampleUse}</td>
    </tr>`
  ).join("");
}

/* ================================================================ */
/* Governance Activity                                                */
/* ================================================================ */
function renderActivity() {
  const tbody = document.querySelector("[data-dg-activity-table] tbody");
  tbody.innerHTML = GOVERNANCE_ACTIVITY.map(
    (a) => `<tr>
      <td class="cell-muted tabular-nums">${a.timestamp}</td>
      <td class="cell-muted">${a.actor}</td>
      <td class="cell-primary">${a.object}</td>
      <td class="cell-muted">${a.action}</td>
      <td class="cell-muted">${a.previousValue}</td>
      <td class="cell-muted">${a.newValue}</td>
    </tr>`
  ).join("");
}

export function initDataGovernance() {
  initTabsWithHash();

  renderArchitecture();
  renderCoverage();

  renderIdentityHealth();
  renderGraph();
  renderResolvedEntity();
  renderRudderstackNote();
  renderStitching();
  renderC360Flow();
  renderIdentifiersTable();
  renderEdgeSources();
  renderConfig();
  document.querySelector("[data-dg-edit-config]").addEventListener("click", openConfigDrawer);
  renderCanonical();

  renderClassificationTable();
  renderGovernedTable();
  renderPolicyTable();

  renderPiiFlow();
  renderPiiControlsTable();
  renderAccessTable();

  renderActivity();

  refreshIcons();
}
