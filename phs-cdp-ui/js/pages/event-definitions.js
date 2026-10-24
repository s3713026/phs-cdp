/*
  Event Definitions page — list, detail (Overview/Properties/Sources/
  Usage/Activity tabs) and a dedicated Create/Edit page. Reads from the
  ONE canonical Event Catalog (js/data/events.js) and resolves Usage
  against the real Audience/Journey/Destination records — never a
  second copy of any of them.
*/
import {
  EVENT_CATALOG,
  EVENT_CATEGORIES,
  EVENT_CATEGORY_META,
  EVENT_STATUSES,
  EVENT_STATUS_META,
  EVENT_SOURCES,
  PROPERTY_TYPES,
  MOCK_TODAY,
  getEventById,
  toCanonicalName,
  validateCanonicalName,
  isUnsafeFinancialProperty,
  qualitySplitForEvent,
  getExplorerEvents,
  formatExplorerTimestamp,
} from "../data/events.js";
import { AUDIENCES } from "../data/audiences.js";
import { JOURNEYS } from "../data/journeys.js";
import { DESTINATIONS } from "../data/destinations.js";
import { SYSTEM_ICONS, INBOUND_FLOWS } from "../data/dataflows.js";
import { initFilterPanel, countActiveFilters } from "../components/connector-directory.js";

let catalog = [...EVENT_CATALOG];
let currentDetailId = null;
const filterState = { query: "", category: [], status: [], source: [] };

function refreshIcons() {
  if (window.lucide) window.lucide.createIcons();
}
function normalize(str) {
  return String(str).toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
}
function fmt(n) {
  return n.toLocaleString();
}
function makeInteractive(el, onActivate) {
  el.setAttribute("tabindex", "0");
  el.setAttribute("role", "button");
  el.addEventListener("click", onActivate);
  el.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onActivate();
    }
  });
}
function findEvent(id) {
  return catalog.find((e) => e.id === id);
}
function sourceIcon(name) {
  return SYSTEM_ICONS[name] || "share-2";
}
function categoryBadge(category) {
  return `<span class="badge badge--neutral badge--dest-tag"><i data-lucide="${EVENT_CATEGORY_META[category]?.icon || "circle"}"></i>${category}</span>`;
}
function statusBadge(status) {
  const meta = EVENT_STATUS_META[status] || EVENT_STATUS_META.Draft;
  return `<span class="status-dot ${meta.dot}">${status}</span>`;
}
function usageBadgeText(event) {
  const parts = [];
  if (event.usage.audiences.length) parts.push("Audiences");
  if (event.usage.journeys.length) parts.push("Journeys");
  if (event.usage.destinations.length) parts.push("Destinations");
  return parts.length ? parts.join(" · ") : "—";
}
function resolveUsageAudiences(event) {
  return event.usage.audiences.map((name) => AUDIENCES.find((a) => a.name === name)).filter(Boolean);
}
function resolveUsageJourneys(event) {
  return event.usage.journeys.map((name) => JOURNEYS.find((j) => j.name === name)).filter(Boolean);
}
function resolveUsageDestinations(event) {
  return event.usage.destinations.map((name) => DESTINATIONS.find((d) => d.name === name)).filter(Boolean);
}
function configListHTML(rows) {
  return `<div class="event-config-list">${rows.map((r) => `<div class="event-config-row"><span class="event-config-row__label">${r.label}</span><span class="event-config-row__value${r.masked ? " event-config-row__value--masked" : ""}">${r.value ?? "—"}</span></div>`).join("")}</div>`;
}

/* ================================================================ */
/* LIST                                                                */
/* ================================================================ */
function passesFilters(e) {
  const q = normalize(filterState.query);
  const matchesSearch = !q || normalize(e.name).includes(q) || normalize(e.canonicalName).includes(q) || normalize(e.description).includes(q);
  const matchesCategory = !filterState.category.length || filterState.category.includes(e.category);
  const matchesStatus = !filterState.status.length || filterState.status.includes(e.status);
  const matchesSource = !filterState.source.length || e.sources.some((s) => filterState.source.includes(s));
  return matchesSearch && matchesCategory && matchesStatus && matchesSource;
}

function renderList() {
  const tbody = document.querySelector("[data-event-table] tbody");
  const filtered = catalog.filter(passesFilters);
  if (!filtered.length) {
    tbody.innerHTML = `<tr><td colspan="8" class="table__empty">No events match your search and filters.</td></tr>`;
    return;
  }
  tbody.innerHTML = filtered
    .map(
      (e) => `
    <tr data-event-row="${e.id}">
      <td><div class="event-cell"><span class="event-cell__icon"><i data-lucide="${EVENT_CATEGORY_META[e.category]?.icon || "zap"}"></i></span><div><div class="event-cell__name">${e.name}</div><div class="event-cell__meta">${e.canonicalName}</div></div></div></td>
      <td>${categoryBadge(e.category)}</td>
      <td class="cell-muted">${e.description}</td>
      <td class="cell-muted">${e.sources.length ? e.sources.join(", ") : "Internal"}</td>
      <td class="num tabular-nums">${e.properties.length}</td>
      <td>${statusBadge(e.status)}</td>
      <td class="cell-muted tabular-nums">${e.lastReceived}</td>
      <td class="cell-muted">${usageBadgeText(e)}</td>
    </tr>`
    )
    .join("");
  tbody.querySelectorAll("[data-event-row]").forEach((row) => {
    row.style.cursor = "pointer";
    makeInteractive(row, () => openDetail(row.dataset.eventRow));
  });
  refreshIcons();
}

function initFilters() {
  const search = document.querySelector("[data-event-search]");
  search.addEventListener("input", (e) => {
    filterState.query = e.target.value;
    renderList();
  });

  const fields = [
    { key: "category", label: "Category", type: "multiselect", options: EVENT_CATEGORIES },
    { key: "status", label: "Status", type: "multiselect", options: EVENT_STATUSES },
    { key: "source", label: "Source", type: "multiselect", options: EVENT_SOURCES },
  ];
  const filterCount = document.querySelector("[data-event-filter-count]");
  function updateCount() {
    const n = countActiveFilters(filterState, fields);
    filterCount.hidden = n === 0;
    filterCount.textContent = n;
  }
  initFilterPanel({
    triggerEl: document.querySelector("[data-event-filter-trigger]"),
    panelEl: document.querySelector("[data-event-filter-panel]"),
    fields,
    getState: () => filterState,
    onApply: (state) => {
      Object.assign(filterState, state);
      updateCount();
      renderList();
    },
    onClear: () => {
      fields.forEach((f) => (filterState[f.key] = []));
      updateCount();
      renderList();
    },
  });
  updateCount();
}

/* ================================================================ */
/* DETAIL                                                             */
/* ================================================================ */
function showView(view) {
  document.querySelector("[data-view-list]").hidden = view !== "list";
  document.querySelector("[data-view-detail]").hidden = view !== "detail";
  document.querySelector("[data-view-form]").hidden = view !== "form";
  window.scrollTo({ top: 0 });
}

function openDetail(id) {
  const e = findEvent(id);
  if (!e) return;
  currentDetailId = id;
  renderDetailHeader(e);
  renderOverviewTab(e);
  renderPropertiesTab(e);
  renderSourcesTab(e);
  renderUsageTab(e);
  renderActivityTab(e);
  showView("detail");
  document.getElementById("event-tab-overview")?.click();
  refreshIcons();
}

function renderDetailHeader(e) {
  const header = document.querySelector("[data-detail-header]");
  header.innerHTML = `
    <div class="dest-detail__header">
      <span class="dest-detail__icon"><i data-lucide="${EVENT_CATEGORY_META[e.category]?.icon || "zap"}"></i></span>
      <div>
        <div class="page-header__eyebrow"><i data-lucide="list-tree" style="width:13px;height:13px;"></i> ${e.category} · ${e.status}</div>
        <h1 class="page-header__title">${e.name}</h1>
        <div class="cluster gap-2" style="margin-top: var(--space-2);">${statusBadge(e.status)}<span class="cell-muted font-mono" style="font-size:12px;">${e.canonicalName}</span></div>
      </div>
    </div>`;
  const actions = document.querySelector("[data-detail-actions]");
  actions.innerHTML = `<button class="btn btn--outline btn--sm" data-edit-event><i data-lucide="pencil"></i> Edit</button>`;
  actions.querySelector("[data-edit-event]").addEventListener("click", () => openForm("edit", e));
  refreshIcons();
}

function renderOverviewTab(e) {
  const mount = document.querySelector("[data-tab-overview]");
  mount.innerHTML = `
    <section class="section">
      <div class="section__body event-attr-grid">
        <div class="attr-item"><span class="attr-item__label">Event Name</span><span class="attr-item__value">${e.name}</span></div>
        <div class="attr-item"><span class="attr-item__label">Category</span><span class="attr-item__value">${categoryBadge(e.category)}</span></div>
        <div class="attr-item"><span class="attr-item__label">Canonical Name</span><span class="attr-item__value font-mono">${e.canonicalName}</span></div>
        <div class="attr-item"><span class="attr-item__label">Status</span><span class="attr-item__value">${statusBadge(e.status)}</span></div>
        <div class="attr-item"><span class="attr-item__label">Primary Source</span><span class="attr-item__value">${e.primarySource || "Internal"}</span></div>
        <div class="attr-item"><span class="attr-item__label">Available Sources</span><span class="attr-item__value">${e.sources.length ? e.sources.join(", ") : "Generated internally"}</span></div>
        <div class="attr-item"><span class="attr-item__label">Version</span><span class="attr-item__value">${e.version}</span></div>
        <div class="attr-item"><span class="attr-item__label">Created</span><span class="attr-item__value tabular-nums">${e.createdAt}</span></div>
        <div class="attr-item"><span class="attr-item__label">Last Updated</span><span class="attr-item__value tabular-nums">${e.updatedAt}</span></div>
        <div class="attr-item"><span class="attr-item__label">Last Received</span><span class="attr-item__value tabular-nums">${e.lastReceived}</span></div>
        <div class="attr-item"><span class="attr-item__label">Events Today</span><span class="attr-item__value tabular-nums">${fmt(e.stats.eventsToday)}</span></div>
        <div class="attr-item"><span class="attr-item__label">Unique Customers Today</span><span class="attr-item__value tabular-nums">${fmt(e.stats.uniqueCustomersToday)}</span></div>
      </div>
      <div class="section__body" style="padding-top: var(--space-5); border-top: 1px solid var(--border-subtle); margin-top: var(--space-5);">
        <p class="subhead" style="margin-bottom: var(--space-2);">Description</p>
        <p class="cell-muted" style="font-size: var(--text-sm); margin: 0;">${e.description}</p>
      </div>
    </section>
    <section class="section" style="margin-bottom: 0;">
      <div class="section__header"><div><h2 class="section__title">Event Quality</h2><p class="section__subtitle">Event-level observability — not a full Data Quality system.</p></div></div>
      <div class="section__body">
        ${(() => {
          const q = qualitySplitForEvent(e);
          return `<div class="event-quality-row">
            <div class="event-quality-item"><span class="event-quality-item__label">Received</span><span class="event-quality-item__value event-quality-item__value--received">${q.received}%</span></div>
            <div class="event-quality-item"><span class="event-quality-item__label">Warning</span><span class="event-quality-item__value event-quality-item__value--warning">${q.warning}%</span></div>
            <div class="event-quality-item"><span class="event-quality-item__label">Rejected</span><span class="event-quality-item__value event-quality-item__value--rejected">${q.rejected}%</span></div>
          </div>`;
        })()}
      </div>
    </section>`;
  refreshIcons();
}

function renderPropertiesTab(e) {
  const mount = document.querySelector("[data-tab-properties]");
  mount.innerHTML = `
    <section class="section" style="margin-bottom: 0;">
      <div class="section__header"><div><h2 class="section__title">Properties</h2><p class="section__subtitle">Sensitive examples are always masked. Financial properties use privacy-aware value bands.</p></div></div>
      <div class="section__body">
        <div class="table-wrap">
          <table class="table">
            <thead><tr><th>Property</th><th>Type</th><th>Required</th><th>Sensitive</th><th>Description</th><th>Example</th></tr></thead>
            <tbody>
              ${e.properties
                .map(
                  (p) => `<tr>
                <td class="cell-primary font-mono">${p.key}</td>
                <td><span class="badge badge--neutral badge--dest-tag">${p.type}</span></td>
                <td>${p.required ? "Yes" : "No"}</td>
                <td>${p.sensitive ? '<span class="badge badge--warning">Sensitive</span>' : "No"}</td>
                <td class="cell-muted">${p.description || "—"}</td>
                <td class="cell-muted font-mono">${p.sensitive ? maskExample(p.example) : p.example || "—"}</td>
              </tr>`
                )
                .join("")}
            </tbody>
          </table>
        </div>
      </div>
    </section>`;
  refreshIcons();
}
function maskExample(example) {
  if (!example) return "••••••";
  const str = String(example);
  if (str.includes("@")) {
    const [user, domain] = str.split("@");
    return `${user.slice(0, 2)}****@${domain}`;
  }
  return `${str.slice(0, 2)}${"*".repeat(Math.max(4, str.length - 2))}`;
}

function renderSourcesTab(e) {
  const mount = document.querySelector("[data-tab-sources]");
  if (!e.sources.length) {
    mount.innerHTML = `
      <section class="section" style="margin-bottom: 0;">
        <div class="section__header"><div><h2 class="section__title">Sources</h2></div></div>
        <div class="section__body"><p class="event-empty-note">Generated internally by the PHS CDP audience/consent engine — not received from an external source.</p></div>
      </section>`;
    refreshIcons();
    return;
  }
  mount.innerHTML = `
    <section class="section" style="margin-bottom: 0;">
      <div class="section__header"><div><h2 class="section__title">Sources</h2><p class="section__subtitle">Conceptually references the existing Data Flow for each system — see Data Flows for the full map.</p></div></div>
      <div class="section__body">
        ${e.sources
          .map((name) => {
            const flow = INBOUND_FLOWS.find((f) => f.systemName === name);
            return `<div class="event-source-row">
              <span class="event-source-row__icon"><i data-lucide="${sourceIcon(name)}"></i></span>
              <span class="event-source-row__name">${name}${name === e.primarySource ? ' <span class="badge badge--neutral badge--dest-tag">Primary</span>' : ""}</span>
              <span class="badge ${flow ? "badge--success" : "badge--neutral"}">${flow ? flow.status : "Connected"}</span>
              <span class="badge badge--neutral badge--dest-tag">Stream</span>
            </div>`;
          })
          .join("")}
      </div>
    </section>`;
  refreshIcons();
}

function renderUsageTab(e) {
  const mount = document.querySelector("[data-tab-usage]");
  const audiences = resolveUsageAudiences(e);
  const journeys = resolveUsageJourneys(e);
  const destinations = resolveUsageDestinations(e);
  mount.innerHTML = `
    <section class="section" style="margin-bottom: 0;">
      <div class="section__header"><div><h2 class="section__title">Usage</h2><p class="section__subtitle">Where this event is used across the CDP — reuses the real Audience, Journey and Destination records.</p></div></div>
      <div class="section__body">
        <div class="event-usage-group">
          <p class="event-usage-group__title">Audiences</p>
          ${audiences.length ? audiences.map((a) => `<div class="event-usage-row"><span class="event-usage-row__name">${a.name}</span><span class="badge ${a.status === "Active" ? "badge--success" : "badge--neutral"}">${a.status}</span></div>`).join("") : `<p class="event-empty-note">Not currently used by any audience.</p>`}
        </div>
        <div class="event-usage-group">
          <p class="event-usage-group__title">Journeys</p>
          ${journeys.length ? journeys.map((j) => `<div class="event-usage-row"><span class="event-usage-row__name">${j.name}</span><span class="badge ${j.status === "Active" ? "badge--success" : "badge--neutral"}">${j.status}</span></div>`).join("") : `<p class="event-empty-note">Not currently used by any journey.</p>`}
        </div>
        <div class="event-usage-group">
          <p class="event-usage-group__title">Destinations</p>
          ${destinations.length ? destinations.map((d) => `<div class="event-usage-row"><span class="event-usage-row__name">${d.name}</span><span class="badge ${d.status === "Connected" ? "badge--success" : "badge--neutral"}">${d.status}</span></div>`).join("") : `<p class="event-empty-note">Not currently used by any destination.</p>`}
        </div>
      </div>
    </section>`;
  refreshIcons();
}

function renderActivityTab(e) {
  const mount = document.querySelector("[data-tab-activity]");
  const entries = getExplorerEvents({ dateFilter: { preset: "Last 30 days" }, eventName: e.name }).slice(0, 25);
  mount.innerHTML = `
    <section class="section" style="margin-bottom: 0;">
      <div class="section__header"><div><h2 class="section__title">Activity</h2><p class="section__subtitle">Mock event activity — recent occurrences of this event.</p></div></div>
      <div class="section__body">
        <div class="table-wrap">
          <table class="table table--dense">
            <thead><tr><th>Timestamp</th><th>Source</th><th>Customer</th><th>Properties</th><th>Status</th></tr></thead>
            <tbody>
              ${
                entries.length
                  ? entries
                      .map(
                        (a) => `<tr>
                <td class="cell-muted tabular-nums">${formatExplorerTimestamp(a)}</td>
                <td class="cell-muted">${a.source}</td>
                <td class="cell-primary font-mono">${a.customerMasked}</td>
                <td class="cell-muted">${a.properties}</td>
                <td><span class="badge badge--success">${a.status}</span></td>
              </tr>`
                      )
                      .join("")
                  : `<tr><td colspan="5" class="table__empty">No recent activity.</td></tr>`
              }
            </tbody>
          </table>
        </div>
      </div>
    </section>`;
  refreshIcons();
}

/* ================================================================ */
/* CREATE / EDIT                                                      */
/* ================================================================ */
function blankProperty() {
  return { key: "", label: "", type: "String", required: false, sensitive: false, description: "", example: "", enumValues: [] };
}
function blankDraft() {
  return { id: null, name: "", canonicalName: "", category: "Behavior", description: "", properties: [blankProperty()], sources: [], status: "Draft" };
}
function draftFromEvent(e) {
  return {
    id: e.id,
    name: e.name,
    canonicalName: e.canonicalName,
    category: e.category,
    description: e.description,
    properties: e.properties.map((p) => ({ ...p, enumValues: p.enumValues ? [...p.enumValues] : [] })),
    sources: [...e.sources],
    status: e.status,
  };
}

function openForm(mode, event) {
  const draft = mode === "edit" ? draftFromEvent(event) : blankDraft();
  let errors = {};
  let canonicalTouched = mode === "edit";

  document.querySelector("[data-form-title]").textContent = mode === "edit" ? `Edit Event Definition — ${event.name}` : "Create Event Definition";

  function render() {
    const body = document.querySelector("[data-form-body]");
    body.innerHTML = `
      <div class="event-form-section">
        <p class="event-form-section__title">Event Details</p>
        <div class="event-form-grid">
          <div class="field"><label class="field__label">Event Name <span style="color:var(--color-danger-600);">*</span></label><div class="field__control"><input class="input" data-f-name value="${draft.name}" placeholder="e.g. App Open" /></div>${errors.name ? `<p class="event-form-error">${errors.name}</p>` : ""}</div>
          <div class="field">
            <label class="field__label">Canonical Name</label>
            ${mode === "edit" ? `<div class="event-form-readonly">${draft.canonicalName}</div><p class="event-form-section__hint" style="margin:var(--space-1) 0 0;">Read-only after creation.</p>` : `<div class="field__control"><input class="input font-mono" data-f-canonical value="${draft.canonicalName}" placeholder="auto-generated" /></div>`}
            ${errors.canonicalName ? `<p class="event-form-error">${errors.canonicalName}</p>` : ""}
          </div>
          <div class="field">
            <label class="field__label">Category</label>
            <div class="select select--sm"><select data-f-category>${EVENT_CATEGORIES.map((c) => `<option value="${c}"${draft.category === c ? " selected" : ""}>${c}</option>`).join("")}</select><i class="select__chevron" data-lucide="chevron-down"></i></div>
          </div>
          <div class="field">
            <label class="field__label">Status</label>
            <div class="select select--sm"><select data-f-status>${EVENT_STATUSES.map((s) => `<option value="${s}"${draft.status === s ? " selected" : ""}>${s}</option>`).join("")}</select><i class="select__chevron" data-lucide="chevron-down"></i></div>
          </div>
          <div class="field field--full"><label class="field__label">Description <span style="color:var(--color-danger-600);">*</span></label><div class="field__control"><textarea class="input" data-f-description rows="2" placeholder="e.g. Customer submitted a trading order.">${draft.description}</textarea></div>${errors.description ? `<p class="event-form-error">${errors.description}</p>` : ""}</div>
        </div>
      </div>

      <div class="event-form-section">
        <p class="event-form-section__title">Properties</p>
        <p class="event-form-section__hint">Financial properties must use a privacy-aware *_band Enum, never an exact amount.</p>
        <div class="table-wrap">
          <table class="event-property-table">
            <thead><tr><th>Property Name</th><th>Type</th><th>Required</th><th>Sensitive</th><th>Description</th><th></th></tr></thead>
            <tbody>
              ${draft.properties
                .map(
                  (p, i) => `<tr data-prop-row="${i}">
                <td><input class="input" data-p-key value="${p.key}" placeholder="e.g. instrument" style="width:140px;" />${errors[`prop${i}`] ? `<p class="event-form-error">${errors[`prop${i}`]}</p>` : ""}</td>
                <td><div class="select select--sm"><select data-p-type>${PROPERTY_TYPES.map((t) => `<option value="${t}"${p.type === t ? " selected" : ""}>${t}</option>`).join("")}</select><i class="select__chevron" data-lucide="chevron-down"></i></div>
                  ${p.type === "Enum" ? `<input class="input" data-p-enum value="${(p.enumValues || []).join(", ")}" placeholder="value1, value2" style="margin-top:4px;width:180px;" />` : ""}
                </td>
                <td><input type="checkbox" data-p-required ${p.required ? "checked" : ""} /></td>
                <td><input type="checkbox" data-p-sensitive ${p.sensitive ? "checked" : ""} /></td>
                <td><input class="input" data-p-description value="${p.description}" placeholder="Optional" style="width:160px;" /></td>
                <td><button type="button" class="event-property-row__remove" data-p-remove aria-label="Remove property"><i data-lucide="x"></i></button></td>
              </tr>`
                )
                .join("")}
            </tbody>
          </table>
        </div>
        <button type="button" class="btn btn--outline btn--sm" data-add-property style="margin-top: var(--space-3);"><i data-lucide="plus"></i> Add Property</button>
      </div>

      <div class="event-form-section">
        <p class="event-form-section__title">Source Mapping</p>
        <p class="event-form-section__hint">Which systems can produce this event. References existing Data Flows — no new connection objects are created.</p>
        <div class="event-checklist">
          ${EVENT_SOURCES.map((s) => `<label><input type="checkbox" data-f-source value="${s}" ${draft.sources.includes(s) ? "checked" : ""} /> ${s}</label>`).join("")}
        </div>
        <div class="field" style="max-width:220px; margin-top: var(--space-4);"><label class="field__label">Delivery</label><div class="event-form-readonly">Stream</div></div>
      </div>

      <div class="event-form-footer">
        <button type="button" class="btn btn--ghost" data-cancel-form>Cancel</button>
      </div>`;
    refreshIcons();
    wire();
  }

  function wire() {
    const body = document.querySelector("[data-form-body]");
    body.querySelector("[data-f-name]").addEventListener("input", (e) => {
      draft.name = e.target.value;
      if (mode === "create" && !canonicalTouched) {
        draft.canonicalName = toCanonicalName(draft.name);
        const canonicalInput = body.querySelector("[data-f-canonical]");
        if (canonicalInput) canonicalInput.value = draft.canonicalName;
      }
    });
    body.querySelector("[data-f-canonical]")?.addEventListener("input", (e) => {
      canonicalTouched = true;
      draft.canonicalName = e.target.value;
    });
    body.querySelector("[data-f-category]").addEventListener("change", (e) => (draft.category = e.target.value));
    body.querySelector("[data-f-status]").addEventListener("change", (e) => (draft.status = e.target.value));
    body.querySelector("[data-f-description]").addEventListener("input", (e) => (draft.description = e.target.value));
    body.querySelectorAll("[data-prop-row]").forEach((row) => {
      const i = Number(row.dataset.propRow);
      row.querySelector("[data-p-key]").addEventListener("input", (e) => (draft.properties[i].key = e.target.value));
      row.querySelector("[data-p-type]").addEventListener("change", (e) => {
        draft.properties[i].type = e.target.value;
        render();
      });
      row.querySelector("[data-p-enum]")?.addEventListener("input", (e) => {
        draft.properties[i].enumValues = e.target.value.split(",").map((s) => s.trim()).filter(Boolean);
      });
      row.querySelector("[data-p-required]").addEventListener("change", (e) => (draft.properties[i].required = e.target.checked));
      row.querySelector("[data-p-sensitive]").addEventListener("change", (e) => (draft.properties[i].sensitive = e.target.checked));
      row.querySelector("[data-p-description]").addEventListener("input", (e) => (draft.properties[i].description = e.target.value));
      row.querySelector("[data-p-remove]").addEventListener("click", () => {
        draft.properties.splice(i, 1);
        render();
      });
    });
    body.querySelector("[data-add-property]").addEventListener("click", () => {
      draft.properties.push(blankProperty());
      render();
    });
    body.querySelectorAll("[data-f-source]").forEach((box) =>
      box.addEventListener("change", () => {
        draft.sources = [...body.querySelectorAll("[data-f-source]:checked")].map((b) => b.value);
      })
    );
    body.querySelector("[data-cancel-form]").addEventListener("click", () => {
      currentDetailId ? openDetail(currentDetailId) : showView("list");
    });
  }

  function validate() {
    const errs = {};
    if (!draft.name.trim()) errs.name = "Event name is required.";
    if (!draft.description.trim()) errs.description = "Description is required.";
    const canonical = draft.canonicalName || toCanonicalName(draft.name);
    const nameError = validateCanonicalName(canonical, draft.id);
    if (nameError) errs.canonicalName = nameError;
    const seenKeys = new Set();
    draft.properties.forEach((p, i) => {
      if (!p.key.trim()) {
        errs[`prop${i}`] = "Property name is required.";
        return;
      }
      if (!/^[a-z][a-z0-9_]*$/.test(p.key)) {
        errs[`prop${i}`] = "Use lowercase snake_case.";
        return;
      }
      if (seenKeys.has(p.key)) {
        errs[`prop${i}`] = "Duplicate property name.";
        return;
      }
      seenKeys.add(p.key);
      if (isUnsafeFinancialProperty(p)) errs[`prop${i}`] = `"${p.key}" looks financial — use a *_band Enum instead of an exact Number.`;
    });
    return errs;
  }

  document.querySelector("[data-save-definition]").onclick = () => {
    draft.canonicalName = draft.canonicalName || toCanonicalName(draft.name);
    errors = validate();
    if (Object.keys(errors).length) {
      render();
      return;
    }
    saveDefinition(mode, draft);
  };

  render();
  document.querySelector("[data-back-from-form]").onclick = () => {
    currentDetailId ? openDetail(currentDetailId) : showView("list");
  };
  showView("form");
  window.scrollTo({ top: 0 });
}

function saveDefinition(mode, draft) {
  const properties = draft.properties.map((p) => ({
    key: p.key,
    label: p.key,
    type: p.type,
    required: p.required,
    sensitive: p.sensitive,
    description: p.description,
    example: "",
    banded: /_band$/.test(p.key),
    enumValues: p.type === "Enum" ? p.enumValues : undefined,
  }));

  if (mode === "create") {
    const newEvent = {
      id: `ev-custom-${Date.now()}`,
      name: draft.name,
      canonicalName: draft.canonicalName,
      category: draft.category,
      description: draft.description,
      properties,
      sources: draft.sources,
      primarySource: draft.sources[0] || null,
      status: draft.status,
      version: "v1",
      createdAt: MOCK_TODAY,
      updatedAt: MOCK_TODAY,
      lastReceived: draft.sources.length ? "Not yet received" : "Generated internally",
      usage: { audiences: [], journeys: [], destinations: [] },
      stats: { eventsToday: 0, uniqueCustomersToday: 0, avgPerCustomer: 0 },
    };
    catalog.push(newEvent);
    renderList();
    openDetail(newEvent.id);
  } else {
    const e = findEvent(draft.id);
    e.name = draft.name;
    e.category = draft.category;
    e.description = draft.description;
    e.properties = properties;
    e.sources = draft.sources;
    e.primarySource = draft.sources[0] || e.primarySource;
    e.status = draft.status;
    e.updatedAt = MOCK_TODAY;
    renderList();
    openDetail(e.id);
  }
}

/* ================================================================ */
/* Init                                                                */
/* ================================================================ */
export function initEventDefinitions() {
  renderList();
  initFilters();

  document.querySelector("[data-back-to-list]").addEventListener("click", () => showView("list"));
  document.querySelector("[data-create-event]").addEventListener("click", () => {
    currentDetailId = null;
    openForm("create");
  });

  const openId = new URLSearchParams(location.search).get("open");
  if (openId && findEvent(openId)) openDetail(openId);
}
