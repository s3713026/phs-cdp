/*
  Data Catalog (Governance) — a single browsable inventory across the
  three field catalogs the CDP already maintains: events, profile
  attributes and sources. Purely an aggregation layer: every row here
  is read from js/data/events.js, js/data/destinations.js or
  js/data/dataflows.js — nothing is redefined or duplicated. Detail
  ownership stays with Event Definitions / Data Flows; this page is an
  index across all of them.
*/
import { EVENT_CATALOG, EVENT_CATEGORY_META, EVENT_SOURCES } from "../data/events.js";
import { PROFILE_ATTRIBUTE_GROUPS } from "../data/destinations.js";
import { SYSTEM_ICONS, INBOUND_FLOWS } from "../data/dataflows.js";

function refreshIcons() {
  if (window.lucide) window.lucide.createIcons();
}

function renderSummary() {
  const attributeCount = PROFILE_ATTRIBUTE_GROUPS.reduce((n, g) => n + g.attributes.length, 0);
  document.querySelector("[data-summary-events]").textContent = EVENT_CATALOG.length;
  document.querySelector("[data-summary-attributes]").textContent = attributeCount;
  document.querySelector("[data-summary-sources]").textContent = EVENT_SOURCES.length;
  document.querySelector("[data-summary-total]").textContent = EVENT_CATALOG.length + attributeCount + EVENT_SOURCES.length;
}

// ── Property type badge colour map ────────────────────────────────────────────
const PROP_TYPE_CLASS = {
  String:   "badge--primary",
  Number:   "badge--success",
  Boolean:  "badge--warning",
  DateTime: "badge--neutral",
  Enum:     "badge--neutral",
  Object:   "badge--neutral",
};

function propTypeBadge(type) {
  return `<span class="badge ${PROP_TYPE_CLASS[type] || "badge--neutral"} badge--dest-tag" style="font-size:10px;padding:1px 5px;">${type}</span>`;
}

// propChips removed — properties shown in drawer only

// ── Event definition slide-over panel ────────────────────────────────────────
let _drawerEl = null;

function ensureDrawer() {
  if (_drawerEl) return _drawerEl;
  _drawerEl = document.createElement("div");
  _drawerEl.className = "drawer-overlay";
  _drawerEl.id = "catalog-event-drawer";
  _drawerEl.innerHTML = `
    <aside class="drawer" role="dialog" aria-modal="true" aria-label="Event definition">
      <div class="drawer__header">
        <div>
          <div class="drawer__eyebrow">Event Definition</div>
          <div class="drawer__title" data-catalog-drawer-title></div>
        </div>
        <button class="btn btn--ghost btn--sm" aria-label="Close" data-catalog-drawer-close><i data-lucide="x"></i></button>
      </div>
      <div class="drawer__body" data-catalog-drawer-body></div>
    </aside>`;
  document.body.appendChild(_drawerEl);
  _drawerEl.querySelector("[data-catalog-drawer-close]").addEventListener("click", closeDrawer);
  _drawerEl.addEventListener("click", (e) => { if (e.target === _drawerEl) closeDrawer(); });
  return _drawerEl;
}

function closeDrawer() {
  if (_drawerEl) _drawerEl.classList.remove("is-open");
  document.body.style.overflow = "";
}

function openEventDrawer(eventId) {
  const ev = EVENT_CATALOG.find(e => e.id === eventId);
  if (!ev) return;
  const drawer = ensureDrawer();
  drawer.querySelector("[data-catalog-drawer-title]").textContent = ev.name;

  const requiredProps = ev.properties.filter(p => p.required);

  drawer.querySelector("[data-catalog-drawer-body]").innerHTML = `
    <div style="margin-bottom: var(--space-5);">
      <div style="display:flex;gap:var(--space-2);flex-wrap:wrap;margin-bottom:var(--space-3);">
        <span class="badge badge--neutral badge--dest-tag"><i data-lucide="${EVENT_CATEGORY_META[ev.category]?.icon || "zap"}"></i>${ev.category}</span>
        <span class="status-dot ${ev.status === "Active" ? "status-dot--success" : ""}">${ev.status}</span>
      </div>
      ${ev.description ? `<p style="font-size:var(--text-sm);color:var(--text-secondary);margin:0 0 var(--space-4);">${ev.description}</p>` : ""}
    </div>

    <div class="event-config-list" style="margin-bottom:var(--space-5);">
      <div class="event-config-row"><span class="event-config-row__label">Canonical Name</span><span class="event-config-row__value font-mono">${ev.canonicalName}</span></div>
      <div class="event-config-row"><span class="event-config-row__label">Sources</span><span class="event-config-row__value">${ev.sources.length ? ev.sources.join(", ") : "Internal"}</span></div>
      <div class="event-config-row"><span class="event-config-row__label">Properties</span><span class="event-config-row__value tabular-nums">${ev.properties.length} total · ${requiredProps.length} required</span></div>
    </div>

    ${ev.properties.length ? `
    <p class="subhead" style="margin-bottom:var(--space-2);">Properties</p>
    <div class="event-config-list" style="margin-bottom:var(--space-5);">
      ${ev.properties.map(p => `
        <div class="event-config-row" style="align-items:flex-start;">
          <span class="event-config-row__label font-mono" style="display:flex;align-items:center;gap:4px;flex-wrap:wrap;">
            ${p.key}
            ${p.required ? '<span style="color:var(--color-danger);font-size:10px;">required</span>' : ""}
            ${p.sensitive ? '<span style="color:var(--color-warning,#f59e0b);font-size:10px;">sensitive</span>' : ""}
            ${p.banded ? '<span style="color:#4f8ef7;font-size:10px;">banded</span>' : ""}
          </span>
          <span class="event-config-row__value" style="display:flex;flex-direction:column;gap:3px;align-items:flex-end;">
            ${propTypeBadge(p.type)}
            ${p.description ? `<span style="font-size:11px;color:var(--text-secondary);text-align:right;">${p.description}</span>` : ""}
            ${p.enumValues ? `<span style="font-size:10px;color:var(--text-secondary);">Values: ${p.enumValues.join(", ")}</span>` : ""}
          </span>
        </div>`).join("")}
    </div>` : ""}

    ${(ev.usage?.audiences?.length || ev.usage?.journeys?.length || ev.usage?.destinations?.length) ? `
    <p class="subhead" style="margin-bottom:var(--space-2);">Used By</p>
    <div class="event-config-list" style="margin-bottom:var(--space-5);">
      ${ev.usage.audiences?.length ? `<div class="event-config-row"><span class="event-config-row__label">Audiences</span><span class="event-config-row__value">${ev.usage.audiences.join(", ")}</span></div>` : ""}
      ${ev.usage.journeys?.length ? `<div class="event-config-row"><span class="event-config-row__label">Journeys</span><span class="event-config-row__value">${ev.usage.journeys.join(", ")}</span></div>` : ""}
      ${ev.usage.destinations?.length ? `<div class="event-config-row"><span class="event-config-row__label">Destinations</span><span class="event-config-row__value">${ev.usage.destinations.join(", ")}</span></div>` : ""}
    </div>` : ""}

    <a class="dest-setup-guide-link" href="event-definitions.html?open=${ev.id}" style="margin-top:var(--space-4);">
      <i data-lucide="list-tree"></i> Open full definition
    </a>`;

  drawer.classList.add("is-open");
  document.body.style.overflow = "hidden";
  refreshIcons();
}

// ── Events tab ────────────────────────────────────────────────────────────────
function renderEventsTab() {
  const mount = document.querySelector("[data-tab-events]");
  mount.innerHTML = `
    <section class="section" style="margin-bottom: 0;">
      <div class="section__header">
        <div>
          <h2 class="section__title">Events</h2>
          <p class="section__subtitle">The canonical Event Catalog — click a row to see its definition, or open in Event Definitions for full governance detail.</p>
        </div>
        <div class="page-header__actions">
          <div class="search-field" style="width:220px;">
            <i data-lucide="search"></i>
            <input class="input" type="text" placeholder="Search events…" data-catalog-event-search aria-label="Search events" />
          </div>
        </div>
      </div>
      <div class="section__body">
        <div class="table-wrap">
          <table class="table" data-catalog-events-table>
            <thead>
              <tr>
                <th>Event</th>
                <th>Category</th>
                <th>Description</th>
                <th>Canonical Name</th>
                <th>Source</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              ${EVENT_CATALOG.map(
                (e) => `<tr data-catalog-event-row="${e.id}" style="cursor:pointer;">
                <td>
                  <div class="event-cell">
                    <span class="event-cell__icon"><i data-lucide="${EVENT_CATEGORY_META[e.category]?.icon || "zap"}"></i></span>
                    <span class="event-cell__name">${e.name}</span>
                  </div>
                </td>
                <td><span class="badge badge--neutral badge--dest-tag">${e.category}</span></td>
                <td class="cell-muted" style="max-width:220px;white-space:normal;font-size:var(--text-xs);">${e.description || "—"}</td>
                <td class="cell-muted font-mono" style="font-size:var(--text-xs);">${e.canonicalName}</td>
                <td class="cell-muted" style="font-size:var(--text-xs);">${e.sources.length ? e.sources.join(", ") : "Internal"}</td>
                <td><span class="status-dot ${e.status === "Active" ? "status-dot--success" : ""}">${e.status}</span></td>
              </tr>`
              ).join("")}
            </tbody>
          </table>
        </div>
      </div>
    </section>`;

  mount.querySelectorAll("[data-catalog-event-row]").forEach((row) => {
    row.addEventListener("click", () => openEventDrawer(row.dataset.catalogEventRow));
  });

  // Search filter
  const searchEl = mount.querySelector("[data-catalog-event-search]");
  if (searchEl) {
    searchEl.addEventListener("input", () => {
      const q = searchEl.value.toLowerCase();
      mount.querySelectorAll("[data-catalog-event-row]").forEach((row) => {
        const eventId = row.dataset.catalogEventRow;
        const ev = EVENT_CATALOG.find(e => e.id === eventId);
        if (!ev) return;
        const match = !q
          || ev.name.toLowerCase().includes(q)
          || ev.canonicalName.toLowerCase().includes(q)
          || (ev.description || "").toLowerCase().includes(q)
          || ev.category.toLowerCase().includes(q)
          || ev.properties.some(p => p.key.toLowerCase().includes(q));
        row.style.display = match ? "" : "none";
      });
    });
  }

  refreshIcons();
}

// ── Attributes tab ────────────────────────────────────────────────────────────
function renderAttributesTab() {
  const mount = document.querySelector("[data-tab-attributes]");
  mount.innerHTML = PROFILE_ATTRIBUTE_GROUPS.map(
    (g) => `
    <section class="section" style="margin-bottom: var(--space-6);">
      <div class="section__header"><div><h2 class="section__title">${g.group}</h2></div></div>
      <div class="section__body">
        <div class="table-wrap">
          <table class="table">
            <thead><tr><th>Attribute</th><th>Sensitive</th><th>Banded</th><th>Notes</th></tr></thead>
            <tbody>
              ${g.attributes
                .map(
                  (a) => `<tr>
                <td class="cell-primary">${a.label}</td>
                <td>${a.sensitive ? '<span class="badge badge--warning">Sensitive</span>' : "No"}</td>
                <td>${a.banded ? '<span class="badge badge--neutral badge--dest-tag">Banded</span>' : "No"}</td>
                <td class="cell-muted">${a.note || "—"}</td>
              </tr>`
                )
                .join("")}
            </tbody>
          </table>
        </div>
      </div>
    </section>`
  ).join("");
  refreshIcons();
}

// ── Sources tab ───────────────────────────────────────────────────────────────
function renderSourcesTab() {
  const mount = document.querySelector("[data-tab-sources]");
  mount.innerHTML = `
    <section class="section" style="margin-bottom: 0;">
      <div class="section__header"><div><h2 class="section__title">Sources</h2><p class="section__subtitle">Systems that produce cataloged events — see Data Flows for the full connection map.</p></div></div>
      <div class="section__body">
        <div class="table-wrap">
          <table class="table">
            <thead><tr><th>Source</th><th>Status</th><th>Delivery</th><th class="num">Events Produced</th></tr></thead>
            <tbody>
              ${EVENT_SOURCES.map((s) => {
                const flow = INBOUND_FLOWS.find((f) => f.systemName === s);
                const eventCount = EVENT_CATALOG.filter((e) => e.sources.includes(s)).length;
                return `<tr>
                <td><div class="event-cell"><span class="event-cell__icon"><i data-lucide="${SYSTEM_ICONS[s] || "share-2"}"></i></span><span class="event-cell__name">${s}</span></div></td>
                <td><span class="badge ${flow ? "badge--success" : "badge--neutral"}">${flow ? flow.status : "Connected"}</span></td>
                <td><span class="badge badge--neutral badge--dest-tag">${flow ? flow.deliveryMode : "Stream"}</span></td>
                <td class="num tabular-nums">${eventCount}</td>
              </tr>`;
              }).join("")}
            </tbody>
          </table>
        </div>
      </div>
    </section>`;
  refreshIcons();
}

export function initDataCatalog() {
  renderSummary();
  renderEventsTab();
  renderAttributesTab();
  renderSourcesTab();
  refreshIcons();
}
