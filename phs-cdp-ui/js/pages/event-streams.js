/*
  Event Streams (Monitor) — operational stream health, validation and
  delivery. Distinct from Live Events (individual event feed), Data
  Catalog (what event data exists) and Tracking Plans (what schema is
  expected) — this page is purely about HOW the ingestion streams
  themselves are performing. Every reference (source, connection,
  tracking plan, event, destination) resolves against the existing
  canonical records; nothing is duplicated here.
*/
import {
  EVENT_STREAMS,
  STREAM_STATUSES,
  STREAM_STATUS_META,
  TIME_RANGE_PRESETS,
  getStreamById,
  streamSourceName,
  streamConnectionName,
  streamTrackingPlan,
  streamEvents,
  streamDestinations,
  metricsForRange,
  lastReceivedLabel,
  lastReceivedTimestamp,
  violationBreakdown,
  violationsForStream,
  eventStatsForStream,
  destinationHealthForStream,
  eventsPerMinuteSeries,
  eventSourceConnections,
  eventDestinationConnections,
  availableTrackingPlans,
  availableCatalogEvents,
  EVENT_CATEGORY_META,
} from "../data/event-streams.js";
import { getPlanById, eventComplianceStatus } from "../data/tracking-plans.js";
import { initColumnManager, initFilterPanel, countActiveFilters, getStoredColumns } from "../components/connector-directory.js";

let streams = [...EVENT_STREAMS];
let timeRange = "Last 1 hour";
let visibleColumns = [];
let currentDetailId = null;
const filterState = { query: "", source: [], trackingPlan: [], status: [], validation: [], delivery: [] };

function refreshIcons() {
  if (window.lucide) window.lucide.createIcons();
}
function fmt(n) {
  return Math.round(n).toLocaleString();
}
function findStream(id) {
  return streams.find((s) => s.id === id);
}
function statusBadge(status) {
  const meta = STREAM_STATUS_META[status] || STREAM_STATUS_META.Provisioning;
  return `<span class="status-dot ${meta.dot}">${status}</span>`;
}
function validationTier(rate) {
  return rate >= 98 ? "Healthy" : "Issues";
}

/* ================================================================ */
/* LIST                                                                */
/* ================================================================ */
const STREAM_COLUMNS = [
  { key: "stream", label: "Stream" },
  { key: "source", label: "Source" },
  { key: "connection", label: "Connection" },
  { key: "trackingPlan", label: "Tracking Plan" },
  { key: "epm", label: "Events / min" },
  { key: "eventsToday", label: "Events Today" },
  { key: "latency", label: "Latency" },
  { key: "validation", label: "Validation" },
  { key: "destinations", label: "Destinations" },
  { key: "status", label: "Status" },
  { key: "lastReceived", label: "Last Received" },
  { key: "created", label: "Created" },
  { key: "updated", label: "Last Updated" },
];
const STREAM_DEFAULT_COLUMNS = STREAM_COLUMNS.filter((c) => c.key !== "created" && c.key !== "updated").map((c) => c.key);
const STREAM_COLUMNS_KEY = "phs-cdp-event-stream-columns";

function streamCellHTML(key, s) {
  const m = metricsForRange(s, timeRange);
  switch (key) {
    case "stream":
      return `<div class="event-cell"><span class="event-cell__icon"><i data-lucide="cable"></i></span><span class="event-cell__name">${s.name}</span></div>`;
    case "source":
      return `<span class="cell-muted">${streamSourceName(s)}</span>`;
    case "connection":
      return `<span class="cell-muted">${streamConnectionName(s)}</span>`;
    case "trackingPlan": {
      const plan = streamTrackingPlan(s);
      return plan ? `<span class="cell-muted">${plan.name}${s.trackingPlanVersion ? ` ${s.trackingPlanVersion}` : ""}</span>` : `<span class="cell-muted">—</span>`;
    }
    case "epm":
      return `<span class="tabular-nums">${fmt(m.eventsPerMinute)}</span>`;
    case "eventsToday":
      return `<span class="tabular-nums">${fmt(m.eventsToday)}</span>`;
    case "latency":
      return `<span class="tabular-nums">${m.latencyAvg.toFixed(1)} sec</span>`;
    case "validation":
      return `<span class="tabular-nums">${m.validationRate.toFixed(1)}%</span>`;
    case "destinations":
      return `<span class="tabular-nums">${s.destinationConnectionIds.length}</span>`;
    case "status":
      return statusBadge(s.status);
    case "lastReceived":
      return `<span class="cell-muted tabular-nums">${lastReceivedLabel(s)}</span>`;
    case "created":
      return `<span class="cell-muted tabular-nums">${s.createdAt}</span>`;
    case "updated":
      return `<span class="cell-muted tabular-nums">${s.updatedAt}</span>`;
    default:
      return "";
  }
}
function renderTableHead() {
  const thead = document.querySelector("[data-stream-thead]");
  thead.innerHTML = `<tr>${STREAM_COLUMNS.filter((c) => visibleColumns.includes(c.key))
    .map((c) => `<th${["epm", "eventsToday", "latency", "validation", "destinations"].includes(c.key) ? ' class="num"' : ""}>${c.label}</th>`)
    .join("")}<th></th></tr>`;
}
function normalize(str) {
  return String(str).toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
}
function passesFilters(s) {
  const q = normalize(filterState.query);
  const matchesSearch = !q || [s.name, streamSourceName(s), streamConnectionName(s), streamTrackingPlan(s)?.name || ""].some((v) => normalize(v).includes(q));
  const matchesSource = !filterState.source.length || filterState.source.includes(streamSourceName(s));
  const matchesPlan = !filterState.trackingPlan.length || filterState.trackingPlan.includes(streamTrackingPlan(s)?.name);
  const matchesStatus = !filterState.status.length || filterState.status.includes(s.status);
  const matchesValidation = !filterState.validation.length || filterState.validation.includes(validationTier(s.metrics.validationRate));
  return matchesSearch && matchesSource && matchesPlan && matchesStatus && matchesValidation;
}

function renderSummary() {
  const active = streams.filter((s) => s.status !== "Paused").length;
  const epm = streams.reduce((sum, s) => sum + metricsForRange(s, timeRange).eventsPerMinute, 0);
  const healthy = streams.filter((s) => s.status === "Healthy").length;
  const issues = streams.filter((s) => s.status === "Warning" || s.status === "Error").length;
  document.querySelector("[data-summary-active]").textContent = active;
  document.querySelector("[data-summary-epm]").textContent = fmt(epm);
  document.querySelector("[data-summary-healthy]").textContent = healthy;
  document.querySelector("[data-summary-issues]").textContent = issues;
}

function renderTable() {
  renderTableHead();
  const tbody = document.querySelector("[data-stream-table] tbody");
  const filtered = streams.filter(passesFilters);
  if (!filtered.length) {
    tbody.innerHTML = `<tr><td colspan="${visibleColumns.length + 1}" class="table__empty">No event streams match your search and filters.</td></tr>`;
    return;
  }
  tbody.innerHTML = filtered
    .map(
      (s) => `<tr data-stream-row="${s.id}" style="cursor:pointer;">
      ${STREAM_COLUMNS.filter((c) => visibleColumns.includes(c.key))
        .map((c) => `<td>${streamCellHTML(c.key, s)}</td>`)
        .join("")}
      <td></td>
    </tr>`
    )
    .join("");
  tbody.querySelectorAll("[data-stream-row]").forEach((row) => {
    row.addEventListener("click", () => openDetail(row.dataset.streamRow));
  });
  refreshIcons();
}

function initFilters() {
  document.querySelector("[data-stream-search]").addEventListener("input", (e) => {
    filterState.query = e.target.value;
    renderTable();
  });

  const rangeSelect = document.querySelector("[data-stream-timerange]");
  rangeSelect.innerHTML = TIME_RANGE_PRESETS.map((p) => `<option value="${p}"${p === timeRange ? " selected" : ""}>${p}</option>`).join("");
  rangeSelect.addEventListener("change", (e) => {
    timeRange = e.target.value;
    renderSummary();
    renderTable();
  });

  visibleColumns = getStoredColumns(STREAM_COLUMNS_KEY, STREAM_DEFAULT_COLUMNS);
  initColumnManager({
    triggerEl: document.querySelector("[data-stream-columns-trigger]"),
    panelEl: document.querySelector("[data-stream-columns-panel]"),
    storageKey: STREAM_COLUMNS_KEY,
    columns: STREAM_COLUMNS,
    defaultKeys: STREAM_DEFAULT_COLUMNS,
    requiredKey: "stream",
    onApply: (keys) => {
      visibleColumns = keys;
      renderTable();
    },
  });

  const fields = [
    { key: "source", label: "Source", type: "multiselect", options: [...new Set(streams.map(streamSourceName))] },
    { key: "trackingPlan", label: "Tracking Plan", type: "multiselect", options: [...new Set(streams.map((s) => streamTrackingPlan(s)?.name).filter(Boolean))] },
    { key: "status", label: "Status", type: "multiselect", options: STREAM_STATUSES },
    { key: "validation", label: "Validation", type: "multiselect", options: ["Healthy", "Issues"] },
  ];
  const filterCount = document.querySelector("[data-stream-filter-count]");
  function updateCount() {
    const n = countActiveFilters(filterState, fields);
    filterCount.hidden = n === 0;
    filterCount.textContent = n;
  }
  initFilterPanel({
    triggerEl: document.querySelector("[data-stream-filter-trigger]"),
    panelEl: document.querySelector("[data-stream-filter-panel]"),
    fields,
    getState: () => filterState,
    onApply: (state) => {
      Object.assign(filterState, state);
      updateCount();
      renderTable();
    },
    onClear: () => {
      fields.forEach((f) => (filterState[f.key] = []));
      updateCount();
      renderTable();
    },
  });
  updateCount();
}

/* ================================================================ */
/* DETAIL                                                              */
/* ================================================================ */
function showView(view) {
  document.querySelector("[data-view-list]").hidden = view !== "list";
  document.querySelector("[data-view-detail]").hidden = view !== "detail";
  window.scrollTo({ top: 0 });
}

function openDetail(id) {
  const s = findStream(id);
  if (!s) return;
  currentDetailId = id;
  renderDetailHeader(s);
  renderOverviewTab(s);
  renderEventsTab(s);
  renderPlanTab(s);
  renderDestinationsTab(s);
  renderActivityTab(s);
  showView("detail");
  document.getElementById("stream-tab-overview")?.click();
  refreshIcons();
}

function renderDetailHeader(s) {
  document.querySelector("[data-detail-header]").innerHTML = `
    <div class="dest-detail__header">
      <span class="dest-detail__icon"><i data-lucide="cable"></i></span>
      <div>
        <div class="page-header__eyebrow"><i data-lucide="git-branch" style="width:13px;height:13px;"></i> ${streamSourceName(s)} · ${streamConnectionName(s)}</div>
        <h1 class="page-header__title">${s.name}</h1>
        <div class="cluster gap-2" style="margin-top: var(--space-2);">${statusBadge(s.status)}</div>
      </div>
    </div>`;

  const actions = document.querySelector("[data-detail-actions]");
  actions.innerHTML = `
    ${s.status === "Paused" ? `<button class="btn btn--outline btn--sm" data-resume-stream><i data-lucide="play"></i> Resume</button>` : `<button class="btn btn--outline btn--sm" data-pause-stream><i data-lucide="pause"></i> Pause</button>`}
    ${s.status === "Error" ? `<button class="btn btn--outline btn--sm" data-retry-stream><i data-lucide="refresh-cw"></i> Retry</button>` : `<button class="btn btn--outline btn--sm" data-restart-stream><i data-lucide="rotate-cw"></i> Restart</button>`}
  `;
  actions.querySelector("[data-pause-stream]")?.addEventListener("click", () => openPauseModal(s));
  actions.querySelector("[data-resume-stream]")?.addEventListener("click", () => {
    s.status = "Healthy";
    delete s.warningReason;
    delete s.errorReason;
    s.updatedAt = "25 Sep 2026";
    s.activity.unshift({ time: "now", activity: "Stream resumed", details: "Resumed by Growth Team", status: "Completed" });
    refreshAfterChange(s);
  });
  actions.querySelector("[data-retry-stream]")?.addEventListener("click", () => {
    s.status = "Provisioning";
    refreshAfterChange(s);
    setTimeout(() => {
      s.status = "Healthy";
      delete s.errorReason;
      s.lastReceivedSec = 5;
      s.activity.unshift({ time: "now", activity: "Stream retried", details: "Reconnected successfully", status: "Completed" });
      refreshAfterChange(s);
    }, 900);
  });
  actions.querySelector("[data-restart-stream]")?.addEventListener("click", () => {
    s.status = "Provisioning";
    refreshAfterChange(s);
    setTimeout(() => {
      s.status = "Healthy";
      s.activity.unshift({ time: "now", activity: "Stream restarted", details: "Manual restart", status: "Completed" });
      refreshAfterChange(s);
    }, 900);
  });
}

function refreshAfterChange(s) {
  renderSummary();
  renderTable();
  renderDetailHeader(s);
  renderOverviewTab(s);
  renderActivityTab(s);
}

function openPauseModal(s) {
  const modal = document.getElementById("stream-pause-modal");
  document.querySelector("[data-stream-pause-title]").textContent = `Pause ${s.name}?`;
  document.querySelector("[data-stream-pause-body]").textContent = "This will stop event processing for this stream in the prototype. No real system is affected.";
  modal.classList.add("is-open");
  document.body.style.overflow = "hidden";
  modal.querySelector("[data-stream-pause-confirm]").onclick = () => {
    s.status = "Paused";
    s.updatedAt = "25 Sep 2026";
    s.activity.unshift({ time: "now", activity: "Stream paused", details: "Paused by Growth Team", status: "Completed" });
    modal.classList.remove("is-open");
    document.body.style.overflow = "";
    refreshAfterChange(s);
  };
}

function renderOverviewTab(s) {
  const mount = document.querySelector("[data-tab-overview]");
  const m = metricsForRange(s, timeRange);
  const dests = streamDestinations(s);
  const plan = streamTrackingPlan(s);
  const series = eventsPerMinuteSeries(s);
  const maxVal = Math.max(...series, 1);

  mount.innerHTML = `
    ${
      s.status === "Error"
        ? `<section class="section"><div class="section__body">
      <div class="stream-state-banner stream-state-banner--error">
        <i data-lucide="alert-triangle"></i>
        <div><strong>${s.errorReason}</strong><br/><span style="font-size:12px;">Last successful event: ${s.lastSuccessfulEvent}</span></div>
      </div>
    </div></section>`
        : s.status === "Warning"
        ? `<section class="section"><div class="section__body">
      <div class="stream-state-banner stream-state-banner--warning">
        <i data-lucide="alert-triangle"></i>
        <div><strong>${s.warningReason}</strong><br/><span style="font-size:12px;">Validation: ${s.metrics.validationRate}%</span></div>
      </div>
    </div></section>`
        : ""
    }

    <section class="section">
      <div class="section__body event-attr-grid">
        <div class="attr-item"><span class="attr-item__label">Source</span><span class="attr-item__value">${streamSourceName(s)}</span></div>
        <div class="attr-item"><span class="attr-item__label">Connection</span><span class="attr-item__value">${streamConnectionName(s)}</span></div>
        <div class="attr-item"><span class="attr-item__label">Stream Type</span><span class="attr-item__value">Event Stream</span></div>
        <div class="attr-item"><span class="attr-item__label">Status</span><span class="attr-item__value">${statusBadge(s.status)}</span></div>
        <div class="attr-item"><span class="attr-item__label">Events / min</span><span class="attr-item__value tabular-nums">${fmt(m.eventsPerMinute)}</span></div>
        <div class="attr-item"><span class="attr-item__label">Events Today</span><span class="attr-item__value tabular-nums">${fmt(m.eventsToday)}</span></div>
        <div class="attr-item"><span class="attr-item__label">Latency</span><span class="attr-item__value tabular-nums">${m.latencyAvg.toFixed(1)} sec</span></div>
        <div class="attr-item"><span class="attr-item__label">Validation Rate</span><span class="attr-item__value tabular-nums">${m.validationRate.toFixed(1)}%</span></div>
        <div class="attr-item"><span class="attr-item__label">Last Received</span><span class="attr-item__value tabular-nums">${lastReceivedLabel(s)}</span></div>
        <div class="attr-item"><span class="attr-item__label">Created</span><span class="attr-item__value tabular-nums">${s.createdAt}</span></div>
        <div class="attr-item"><span class="attr-item__label">Last Updated</span><span class="attr-item__value tabular-nums">${s.updatedAt}</span></div>
      </div>
    </section>

    <section class="section">
      <div class="section__header"><div><h2 class="section__title">Pipeline</h2><p class="section__subtitle">Operational lineage — a conceptual view, not a data flow diagram.</p></div></div>
      <div class="section__body">
        <div class="stream-pipeline">
          <div class="stream-pipeline__node">${streamSourceName(s)}</div>
          <span class="stream-pipeline__arrow"><i data-lucide="arrow-down"></i></span>
          <div class="stream-pipeline__node stream-pipeline__node--primary">${s.name}</div>
          <span class="stream-pipeline__arrow"><i data-lucide="arrow-down"></i></span>
          <div class="stream-pipeline__node">${plan ? `${plan.name}${s.trackingPlanVersion ? " " + s.trackingPlanVersion : ""}` : "No Tracking Plan"}</div>
          <span class="stream-pipeline__arrow"><i data-lucide="arrow-down"></i></span>
          <div class="stream-pipeline__destinations">
            ${dests.length ? dests.map((d) => `<span class="stream-pipeline__dest-chip"><i data-lucide="share-2"></i>${d.name}</span>`).join("") : `<span class="event-empty-note">No destinations configured.</span>`}
          </div>
        </div>
      </div>
    </section>

    <section class="section">
      <div class="section__header"><div><h2 class="section__title">Flow Health</h2><p class="section__subtitle">Events / min — last 60 minutes. Mock operational data.</p></div></div>
      <div class="section__body">
        <div class="stream-sparkline">
          ${series
            .map((v, i) => {
              const h = Math.max(4, Math.round((v / maxVal) * 64));
              const minuteLabel = (i - (series.length - 1)) * 10;
              return `<div class="stream-sparkline__col"><div class="stream-sparkline__bar${i === series.length - 1 ? " stream-sparkline__bar--current" : ""}" style="height:${h}px;" title="${fmt(v)} events/min"></div><span class="stream-sparkline__label">${minuteLabel === 0 ? "now" : minuteLabel + "m"}</span></div>`;
            })
            .join("")}
        </div>
      </div>
    </section>

    <section class="section">
      <div class="section__header"><div><h2 class="section__title">Ingestion Latency</h2><p class="section__subtitle">Prototype metrics.</p></div></div>
      <div class="section__body">
        <div class="event-quality-row">
          <div class="event-quality-item"><span class="event-quality-item__label">Average</span><span class="event-quality-item__value">${m.latencyAvg.toFixed(1)} sec</span></div>
          <div class="event-quality-item"><span class="event-quality-item__label">P95</span><span class="event-quality-item__value">${m.latencyP95.toFixed(1)} sec</span></div>
          <div class="event-quality-item"><span class="event-quality-item__label">P99</span><span class="event-quality-item__value">${m.latencyP99.toFixed(1)} sec</span></div>
        </div>
      </div>
    </section>

    <section class="section" style="margin-bottom: 0;">
      <div class="section__header"><div><h2 class="section__title">Validation Health</h2><p class="section__subtitle">References this stream's Tracking Plan violations.</p></div></div>
      <div class="section__body">
        <div class="event-quality-row" style="margin-bottom: var(--space-4);">
          <div class="event-quality-item"><span class="event-quality-item__label">Valid</span><span class="event-quality-item__value event-quality-item__value--received">${m.validationRate.toFixed(1)}%</span></div>
          <div class="event-quality-item"><span class="event-quality-item__label">Violations</span><span class="event-quality-item__value event-quality-item__value--warning">${(100 - m.validationRate).toFixed(1)}%</span></div>
        </div>
        <p class="subhead" style="margin-bottom: var(--space-2);">Violation Breakdown</p>
        <div class="event-config-list">
          ${violationBreakdown(s)
            .map((v) => `<div class="event-config-row"><span class="event-config-row__label">${v.type}</span><span class="event-config-row__value">${v.pct}%</span></div>`)
            .join("")}
        </div>
      </div>
    </section>

    <section class="section" style="margin-top: var(--space-6); margin-bottom: 0;">
      <div class="section__body cluster gap-3" style="flex-wrap: wrap;">
        <a class="btn btn--outline btn--sm" href="live-events.html?source=${encodeURIComponent(streamSourceName(s))}"><i data-lucide="radio"></i> View Live Events</a>
        <a class="btn btn--outline btn--sm" href="data-catalog.html"><i data-lucide="folder-tree"></i> View Data Catalog</a>
        ${plan ? `<a class="btn btn--outline btn--sm" href="tracking-plans.html?open=${plan.id}"><i data-lucide="clipboard-check"></i> Open Tracking Plan</a>` : ""}
        <a class="btn btn--outline btn--sm" href="destinations.html?view=source"><i data-lucide="git-branch"></i> View Source</a>
        <a class="btn btn--outline btn--sm" href="destinations.html"><i data-lucide="share-2"></i> View Destinations</a>
      </div>
    </section>`;
  refreshIcons();
}

function renderEventsTab(s) {
  const mount = document.querySelector("[data-tab-events]");
  const rows = eventStatsForStream(s);
  mount.innerHTML = `
    <section class="section" style="margin-bottom: 0;">
      <div class="section__header"><div><h2 class="section__title">Events</h2><p class="section__subtitle">Event definitions observed through this stream — from the canonical Data Catalog.</p></div></div>
      <div class="section__body">
        <div class="table-wrap">
          <table class="table">
            <thead><tr><th>Event</th><th>Category</th><th class="num">Events Today</th><th class="num">Unique Customers</th><th>Last Received</th><th class="num">Validation</th></tr></thead>
            <tbody>
              ${rows.length ? rows.map((r) => `<tr data-catalog-link="${r.event.id}" style="cursor:pointer;">
                <td class="cell-primary">${r.event.name}</td>
                <td><span class="badge badge--neutral badge--dest-tag"><i data-lucide="${EVENT_CATEGORY_META[r.event.category]?.icon || "circle"}"></i>${r.event.category}</span></td>
                <td class="num tabular-nums">${fmt(r.eventsToday)}</td>
                <td class="num tabular-nums">${fmt(r.uniqueCustomers)}</td>
                <td class="cell-muted">${r.lastReceived}</td>
                <td class="num tabular-nums">${r.validation}%</td>
              </tr>`).join("") : `<tr><td colspan="6" class="table__empty">No events attached to this stream.</td></tr>`}
            </tbody>
          </table>
        </div>
      </div>
    </section>`;
  mount.querySelectorAll("[data-catalog-link]").forEach((row) => {
    row.addEventListener("click", () => (window.location.href = `event-definitions.html?open=${row.dataset.catalogLink}`));
  });
  refreshIcons();
}

function renderPlanTab(s) {
  const mount = document.querySelector("[data-tab-plan]");
  const plan = streamTrackingPlan(s);
  if (!plan) {
    mount.innerHTML = `
      <section class="section" style="margin-bottom: 0;">
        <div class="section__header"><div><h2 class="section__title">Tracking Plan</h2></div></div>
        <div class="section__body"><p class="event-empty-note">No Tracking Plan is attached to this stream — events are not validated against an expected schema.</p></div>
      </section>`;
    refreshIcons();
    return;
  }
  const events = streamEvents(s);
  const totalProperties = events.reduce((n, e) => n + e.properties.length, 0);
  const violations = violationsForStream(s);
  mount.innerHTML = `
    <section class="section">
      <div class="section__header"><div><h2 class="section__title">${plan.name}</h2><p class="section__subtitle">Version ${s.trackingPlanVersion || "v1"} · Validation ${s.status === "Error" ? "Unavailable" : "Enabled"}</p></div></div>
      <div class="section__body">
        <div class="event-attr-grid">
          <div class="attr-item"><span class="attr-item__label">Version</span><span class="attr-item__value">${s.trackingPlanVersion || "v1"}</span></div>
          <div class="attr-item"><span class="attr-item__label">Status</span><span class="attr-item__value">${plan.status === "Live" ? '<span class="badge badge--success">Connected</span>' : `<span class="badge badge--neutral">${plan.status}</span>`}</span></div>
          <div class="attr-item"><span class="attr-item__label">Events</span><span class="attr-item__value tabular-nums">${plan.events.length}</span></div>
          <div class="attr-item"><span class="attr-item__label">Properties</span><span class="attr-item__value tabular-nums">${totalProperties}</span></div>
          <div class="attr-item"><span class="attr-item__label">Violations</span><span class="attr-item__value tabular-nums">${violations.length}</span></div>
        </div>
      </div>
    </section>
    <section class="section" style="margin-bottom: 0;">
      <div class="section__header"><div><h2 class="section__title">Recent Validation Results</h2></div>
        <button class="btn btn--outline btn--sm" data-view-violations><i data-lucide="alert-triangle"></i> View Violations</button>
      </div>
      <div class="section__body">
        ${events
          .map((ev) => {
            const evViolations = violations.filter((v) => v.event === ev.name);
            return `<div class="compliance-row"><span>${ev.name}</span><span class="${evViolations.length ? "cell-muted" : "badge badge--success"}">${evViolations.length ? `${evViolations.length} violation${evViolations.length > 1 ? "s" : ""}` : "Compliant"}</span></div>`;
          })
          .join("")}
      </div>
    </section>`;
  mount.querySelector("[data-view-violations]")?.addEventListener("click", () => {
    window.location.href = `tracking-plans.html?open=${plan.id}`;
  });
  refreshIcons();
}

function renderDestinationsTab(s) {
  const mount = document.querySelector("[data-tab-destinations]");
  const rows = destinationHealthForStream(s);
  mount.innerHTML = `
    <section class="section" style="margin-bottom: 0;">
      <div class="section__header"><div><h2 class="section__title">Destinations</h2><p class="section__subtitle">Existing Destination connection accounts this stream delivers to.</p></div></div>
      <div class="section__body">
        <div class="table-wrap">
          <table class="table">
            <thead><tr><th>Destination</th><th class="num">Events / min</th><th class="num">Latency</th><th class="num">Success</th><th>Status</th></tr></thead>
            <tbody>
              ${rows.length ? rows.map((r) => `<tr data-dest-link="${r.destination.id}" style="cursor:pointer;">
                <td><div class="event-cell"><span class="event-cell__icon"><i data-lucide="share-2"></i></span><div><div class="event-cell__name">${r.destination.name}</div><div class="event-cell__meta">${r.destination.deliveryConfig.mode}</div></div></div></td>
                <td class="num tabular-nums">${fmt(r.eventsPerMinute)}/min</td>
                <td class="num tabular-nums">${r.latency.toFixed(1)} sec</td>
                <td class="num tabular-nums">${r.success.toFixed(1)}%</td>
                <td>${statusBadge(r.status)}</td>
              </tr>`).join("") : `<tr><td colspan="5" class="table__empty">No destinations configured.</td></tr>`}
            </tbody>
          </table>
        </div>
      </div>
    </section>`;
  mount.querySelectorAll("[data-dest-link]").forEach((row) => {
    row.addEventListener("click", () => (window.location.href = `destinations.html?open=${row.dataset.destLink}`));
  });
  refreshIcons();
}

function renderActivityTab(s) {
  const mount = document.querySelector("[data-tab-activity]");
  mount.innerHTML = `
    <section class="section" style="margin-bottom: 0;">
      <div class="section__header"><div><h2 class="section__title">Activity</h2><p class="section__subtitle">Operational history for this stream. Mock operational data.</p></div></div>
      <div class="section__body">
        <div class="table-wrap">
          <table class="table table--dense">
            <thead><tr><th>Timestamp</th><th>Activity</th><th>Details</th><th>Status</th></tr></thead>
            <tbody>
              ${s.activity.length ? s.activity.map((a) => `<tr>
                <td class="cell-muted tabular-nums">${a.time}</td>
                <td class="cell-primary">${a.activity}</td>
                <td class="cell-muted">${a.details}</td>
                <td><span class="badge ${a.status === "Completed" ? "badge--success" : a.status === "Warning" ? "badge--warning" : a.status === "Error" ? "badge--danger" : "badge--primary"}">${a.status}</span></td>
              </tr>`).join("") : `<tr><td colspan="4" class="table__empty">No activity yet.</td></tr>`}
            </tbody>
          </table>
        </div>
      </div>
    </section>`;
  refreshIcons();
}

/* ================================================================ */
/* CREATE EVENT STREAM — multi-step workspace                          */
/* ================================================================ */
let wizard = { step: 1, connectionId: null, trackingPlanId: null, eventMode: "all", eventIds: [], destinationConnectionIds: [] };

function openSetup() {
  wizard = { step: 1, connectionId: null, trackingPlanId: null, eventMode: "all", eventIds: [], destinationConnectionIds: [] };
  document.querySelector("[data-view-setup]").hidden = false;
  document.body.style.overflow = "hidden";
  renderWizard();
}
function closeSetup() {
  document.querySelector("[data-view-setup]").hidden = true;
  document.body.style.overflow = "";
}

function wizardStepsHTML() {
  const labels = ["Source", "Connection", "Tracking Plan", "Events", "Destinations", "Review"];
  return `<div class="dest-wizard-steps">${labels
    .map((label, i) => `<div class="dest-wizard-step${wizard.step === i + 1 ? " is-active" : ""}${wizard.step > i + 1 ? " is-done" : ""}"><span class="dest-wizard-step__dot">${wizard.step > i + 1 ? "✓" : i + 1}</span> ${label}</div>${i < labels.length - 1 ? '<div class="dest-wizard-step__sep"></div>' : ""}`)
    .join("")}</div>`;
}

function footerHTML(nextLabel, nextEnabled = true) {
  return `<div class="cluster gap-3" style="justify-content: flex-end; margin-top: var(--space-6); border-top: 1px solid var(--border-subtle); padding-top: var(--space-5);">
    ${wizard.step > 1 ? `<button type="button" class="btn btn--ghost" data-wizard-back>Back</button>` : `<button type="button" class="btn btn--ghost" data-wizard-cancel>Cancel</button>`}
    <button type="button" class="btn btn--primary" data-wizard-next ${nextEnabled ? "" : "disabled"}>${nextLabel}</button>
  </div>`;
}

function renderWizard() {
  const body = document.querySelector("[data-setup-body]");
  refreshIcons();

  if (wizard.step === 1) {
    const sources = eventSourceConnections();
    body.innerHTML = `
      ${wizardStepsHTML()}
      <p class="event-form-section__hint">Choose an existing Source. Event Streams only apply to Event-type connections.</p>
      <div class="dest-directory-grid">
        ${sources
          .map(
            (src) => `<button type="button" class="dest-directory-card" data-pick-connection="${src.id}">
          <span class="dest-directory-card__icon"><i data-lucide="plug"></i></span>
          <div><div class="dest-directory-card__name">${src.provider}</div><div class="dest-directory-card__desc">${src.name}</div></div>
        </button>`
          )
          .join("")}
      </div>
      <div class="cluster gap-3" style="justify-content: flex-end; margin-top: var(--space-6); border-top: 1px solid var(--border-subtle); padding-top: var(--space-5);">
        <button type="button" class="btn btn--ghost" data-wizard-cancel>Cancel</button>
      </div>`;
    body.querySelectorAll("[data-pick-connection]").forEach((btn) =>
      btn.addEventListener("click", () => {
        wizard.connectionId = btn.dataset.pickConnection;
        wizard.step = 2;
        renderWizard();
      })
    );
    body.querySelector("[data-wizard-cancel]").addEventListener("click", closeSetup);
  } else if (wizard.step === 2) {
    const conn = eventSourceConnections().find((c) => c.id === wizard.connectionId);
    body.innerHTML = `
      ${wizardStepsHTML()}
      <p class="event-form-section__hint">Confirm the Source Connection Account — one connection carries exactly one Data Stream (Event).</p>
      <div class="event-form-readonly" style="max-width:400px;"><i data-lucide="plug"></i> ${conn?.name}</div>
      ${footerHTML("Continue")}`;
    body.querySelector("[data-wizard-back]").addEventListener("click", () => {
      wizard.step = 1;
      renderWizard();
    });
    body.querySelector("[data-wizard-next]").addEventListener("click", () => {
      wizard.step = 3;
      renderWizard();
    });
  } else if (wizard.step === 3) {
    const plans = availableTrackingPlans();
    body.innerHTML = `
      ${wizardStepsHTML()}
      <p class="event-form-section__hint">Choose an existing Tracking Plan, or continue without one.</p>
      <div class="event-checklist">
        <label><input type="radio" name="wiz-plan" data-pick-plan value="" ${!wizard.trackingPlanId ? "checked" : ""} /> No Tracking Plan</label>
        ${plans.map((p) => `<label><input type="radio" name="wiz-plan" data-pick-plan value="${p.id}" ${wizard.trackingPlanId === p.id ? "checked" : ""} /> ${p.name}</label>`).join("")}
      </div>
      ${footerHTML("Continue")}`;
    body.querySelectorAll("[data-pick-plan]").forEach((r) => r.addEventListener("change", (e) => (wizard.trackingPlanId = e.target.value || null)));
    body.querySelector("[data-wizard-back]").addEventListener("click", () => {
      wizard.step = 2;
      renderWizard();
    });
    body.querySelector("[data-wizard-next]").addEventListener("click", () => {
      wizard.step = 4;
      renderWizard();
    });
  } else if (wizard.step === 4) {
    const events = availableCatalogEvents();
    body.innerHTML = `
      ${wizardStepsHTML()}
      <p class="event-form-section__hint">Choose events from the canonical Data Catalog.</p>
      <div class="event-checklist" style="margin-bottom: var(--space-4);">
        <label><input type="radio" name="wiz-event-mode" data-event-mode value="all" ${wizard.eventMode === "all" ? "checked" : ""} /> All Events</label>
        <label><input type="radio" name="wiz-event-mode" data-event-mode value="selected" ${wizard.eventMode === "selected" ? "checked" : ""} /> Selected Events</label>
      </div>
      ${wizard.eventMode === "selected" ? `<div class="event-checklist">${events.map((ev) => `<label><input type="checkbox" data-pick-event value="${ev.id}" ${wizard.eventIds.includes(ev.id) ? "checked" : ""} /> ${ev.name}</label>`).join("")}</div>` : ""}
      ${footerHTML("Continue")}`;
    body.querySelectorAll("[data-event-mode]").forEach((r) =>
      r.addEventListener("change", (e) => {
        wizard.eventMode = e.target.value;
        renderWizard();
      })
    );
    body.querySelectorAll("[data-pick-event]").forEach((box) =>
      box.addEventListener("change", () => {
        wizard.eventIds = [...body.querySelectorAll("[data-pick-event]:checked")].map((b) => b.value);
      })
    );
    body.querySelector("[data-wizard-back]").addEventListener("click", () => {
      wizard.step = 3;
      renderWizard();
    });
    body.querySelector("[data-wizard-next]").addEventListener("click", () => {
      wizard.step = 5;
      renderWizard();
    });
  } else if (wizard.step === 5) {
    const dests = eventDestinationConnections();
    body.innerHTML = `
      ${wizardStepsHTML()}
      <p class="event-form-section__hint">Choose existing Event destinations.</p>
      <div class="event-checklist">
        ${dests.map((d) => `<label><input type="checkbox" data-pick-dest value="${d.id}" ${wizard.destinationConnectionIds.includes(d.id) ? "checked" : ""} /> ${d.name}</label>`).join("")}
      </div>
      ${footerHTML("Continue")}`;
    body.querySelectorAll("[data-pick-dest]").forEach((box) =>
      box.addEventListener("change", () => {
        wizard.destinationConnectionIds = [...body.querySelectorAll("[data-pick-dest]:checked")].map((b) => b.value);
      })
    );
    body.querySelector("[data-wizard-back]").addEventListener("click", () => {
      wizard.step = 4;
      renderWizard();
    });
    body.querySelector("[data-wizard-next]").addEventListener("click", () => {
      wizard.step = 6;
      renderWizard();
    });
  } else {
    const conn = eventSourceConnections().find((c) => c.id === wizard.connectionId);
    const plan = wizard.trackingPlanId ? getPlanById(wizard.trackingPlanId) : null;
    const eventCount = wizard.eventMode === "all" ? availableCatalogEvents().length : wizard.eventIds.length;
    body.innerHTML = `
      ${wizardStepsHTML()}
      <div class="event-config-list" style="max-width:480px;">
        <div class="event-config-row"><span class="event-config-row__label">Source</span><span class="event-config-row__value">${conn?.provider}</span></div>
        <div class="event-config-row"><span class="event-config-row__label">Connection</span><span class="event-config-row__value">${conn?.name}</span></div>
        <div class="event-config-row"><span class="event-config-row__label">Tracking Plan</span><span class="event-config-row__value">${plan ? plan.name : "None"}</span></div>
        <div class="event-config-row"><span class="event-config-row__label">Events</span><span class="event-config-row__value">${eventCount} selected</span></div>
        <div class="event-config-row"><span class="event-config-row__label">Destinations</span><span class="event-config-row__value">${wizard.destinationConnectionIds.length}</span></div>
        <div class="event-config-row"><span class="event-config-row__label">Expected Delivery</span><span class="event-config-row__value">Stream</span></div>
        <div class="event-config-row"><span class="event-config-row__label">Status</span><span class="event-config-row__value">Ready to Create</span></div>
      </div>
      <div class="cluster gap-3" style="justify-content: flex-end; margin-top: var(--space-6); border-top: 1px solid var(--border-subtle); padding-top: var(--space-5);">
        <button type="button" class="btn btn--ghost" data-wizard-back>Back</button>
        <button type="button" class="btn btn--primary" data-wizard-create><i data-lucide="save"></i> Create Event Stream</button>
      </div>`;
    body.querySelector("[data-wizard-back]").addEventListener("click", () => {
      wizard.step = 5;
      renderWizard();
    });
    body.querySelector("[data-wizard-create]").addEventListener("click", createStream);
  }
}

function createStream() {
  const conn = eventSourceConnections().find((c) => c.id === wizard.connectionId);
  const eventIds = wizard.eventMode === "all" ? availableCatalogEvents().map((e) => e.id) : wizard.eventIds;
  const newStream = {
    id: `es-custom-${Date.now()}`,
    name: `${conn.name.replace(/ — .*/, "")} — Events`,
    connectionId: conn.id,
    trackingPlanId: wizard.trackingPlanId,
    trackingPlanVersion: wizard.trackingPlanId ? "v1" : null,
    eventIds,
    destinationConnectionIds: wizard.destinationConnectionIds,
    status: "Provisioning",
    metrics: { eventsPerMinuteBase: 0, eventsTodayBase: 0, latencyAvg: 1.0, latencyP95: 2.0, latencyP99: 3.0, validationRate: 100 },
    lastReceivedSec: 999999,
    createdAt: "25 Sep 2026",
    updatedAt: "25 Sep 2026",
    activity: [{ time: "now", activity: "Stream created", details: "Provisioning", status: "Completed" }],
  };
  streams.push(newStream);
  renderSummary();
  renderTable();
  closeSetup();
  openDetail(newStream.id);

  setTimeout(() => {
    newStream.status = "Healthy";
    newStream.metrics.eventsPerMinuteBase = 50;
    newStream.metrics.eventsTodayBase = 4000;
    newStream.lastReceivedSec = 5;
    newStream.activity.unshift({ time: "now", activity: "Stream healthy", details: "Ingestion started", status: "Completed" });
    if (currentDetailId === newStream.id) refreshAfterChange(newStream);
    renderSummary();
    renderTable();
  }, 1600);
}

/* ================================================================ */
/* BFF ENRICHMENT — Inject real RudderStack data into mock streams    */
/* ================================================================ */

// sourceId từ workspaceConfig → stream id trong mock EVENT_STREAMS
const SOURCE_ID_TO_STREAM = {
  'phs-web-source':    'es-001',
  'phs-mobile-source': 'es-002',
  'phs-server-source': 'es-003',
};

// source label → stream id (fallback dùng tên)
const SOURCE_NAME_TO_STREAM = {
  'Web App':    'es-001',
  'Mobile App': 'es-002',
  'Server Side':'es-003',
};

async function enrichStreamsFromBFF() {
  if (typeof PHSAPI === 'undefined') return;

  try {
    // Lấy events thực từ RudderStack
    const evRes = await PHSAPI.events.stream({ limit: 500 });
    const evData = evRes?.data || [];

    if (!evData.length) return;

    // Đếm events per sourceId & tìm latest timestamp per source
    const countBySource = {};
    const latestBySource = {};

    evData.forEach(ev => {
      const sid = ev.sourceId || 'unknown';
      countBySource[sid] = (countBySource[sid] || 0) + 1;

      const ts = ev.receivedAt ? new Date(ev.receivedAt) : null;
      if (ts && !isNaN(ts)) {
        if (!latestBySource[sid] || ts > latestBySource[sid]) {
          latestBySource[sid] = ts;
        }
      }
    });

    // Tổng event count & latest ts toàn bộ
    const totalEvents = evData.length;
    const latestTs = Object.values(latestBySource).sort((a, b) => b - a)[0];

    // Enrich từng mock stream với real data
    Object.entries(SOURCE_ID_TO_STREAM).forEach(([sourceId, streamId]) => {
      const s = streams.find(x => x.id === streamId);
      if (!s) return;

      const count = countBySource[sourceId] || 0;
      const latest = latestBySource[sourceId];

      if (count > 0) {
        // Cập nhật eventsToday với số thực (base * factor để EPM cũng hợp lý)
        s.metrics.eventsTodayBase = count;
        s.metrics.eventsPerMinuteBase = Math.max(1, Math.round(count / 60));
        s.status = 'Healthy';
      }

      if (latest) {
        // lastReceivedSec = số giây kể từ latest event
        const secAgo = Math.max(0, Math.floor((Date.now() - latest.getTime()) / 1000));
        s.lastReceivedSec = secAgo;
      }
    });

    // Update summary với total real events (override eventsToday trên summary)
    _bffTotalEvents = totalEvents;
    _bffLatestTs = latestTs;

    renderSummary();
    renderTable();

    console.log(`[EventStreams] BFF enrichment: ${totalEvents} events from ${Object.keys(countBySource).length} sources`);
  } catch (err) {
    console.warn('[EventStreams] BFF enrichment failed:', err.message);
    // Fall back to mock silently
  }
}

// Module-level BFF stats (used in renderSummary override)
let _bffTotalEvents = null;
let _bffLatestTs    = null;

// Override renderSummary khi có BFF data
function renderSummaryWithBFF() {
  const active  = streams.filter(s => s.status !== 'Paused').length;
  const healthy = streams.filter(s => s.status === 'Healthy').length;
  const issues  = streams.filter(s => s.status === 'Warning' || s.status === 'Error').length;

  // EPM: tính từ enriched streams
  const epm = streams.reduce((sum, s) => sum + metricsForRange(s, timeRange).eventsPerMinute, 0);

  document.querySelector('[data-summary-active]').textContent   = active;
  document.querySelector('[data-summary-epm]').textContent      = _bffTotalEvents !== null
    ? _bffTotalEvents.toLocaleString()   // show total events instead of epm when we have real data
    : fmt(epm);
  document.querySelector('[data-summary-healthy]').textContent  = healthy;
  document.querySelector('[data-summary-issues]').textContent   = issues;

  // Update the "Events / min" label to "Total Events" when we have real data
  const epmLabel = document.querySelector('[data-summary-epm]')?.closest('.metric')?.querySelector('.metric__label');
  if (epmLabel && _bffTotalEvents !== null) {
    epmLabel.textContent = 'Total Events (live)';
  }
}

/* ================================================================ */
/* Init                                                                */
/* ================================================================ */
export function initEventStreams() {
  renderSummary();
  initFilters();
  renderTable();

  document.querySelector("[data-back-to-list]").addEventListener("click", () => showView("list"));
  document.querySelector("[data-create-stream]").addEventListener("click", openSetup);
  document.querySelector("[data-setup-back]").addEventListener("click", closeSetup);

  const openId = new URLSearchParams(location.search).get("open");
  if (openId && findStream(openId)) openDetail(openId);

  // Enrich with real RudderStack data (non-blocking)
  enrichStreamsFromBFF().then(() => {
    renderSummaryWithBFF();
  });
}
