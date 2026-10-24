/*
  Data Quality (Data) — RudderStack-aligned operational scope: Tracking
  Plan compliance, event/schema violations, event volume, source- and
  Tracking-Plan-level quality, and destination delivery health. Every
  row resolves against the existing canonical records (sources.js,
  event-streams.js, tracking-plans.js, events.js) — this page only
  adds an observed-compliance lens. Deliberately excludes identity /
  profile / trait completeness — out of scope by design.
*/
import {
  DATE_RANGE_PRESETS,
  VIOLATION_TYPES,
  SEVERITIES,
  SEVERITY_META,
  ISSUE_STATUSES,
  QUALITY_STATUS_META,
  SOURCE_QUALITY,
  getSourceRecord,
  qualityByTrackingPlan,
  destinationDelivery,
  eventVolumeSeries,
  violationsOverTimeSeries,
  trackingPlanCompliance,
  VIOLATIONS,
  getViolationById,
  filterViolations,
  EVENT_CATEGORY_META,
} from "../data/data-quality.js";
import { getEventById } from "../data/events.js";
import { getPlanById } from "../data/tracking-plans.js";
import { getStreamById } from "../data/event-streams.js";
import { initFilterPanel, countActiveFilters } from "../components/connector-directory.js";
import { renderLineChart } from "../components/chart.js";

let violations = [...VIOLATIONS];

// ── BFF integration ───────────────────────────────────────────────────────
async function loadDataQualityFromBFF() {
  if (typeof PHSAPI === 'undefined') return;
  try {
    const [overview, issues] = await Promise.all([
      PHSAPI.dataQuality.overview(),
      PHSAPI.dataQuality.issues(),
    ]);
    // Surface the overall quality score in the header if available
    if (overview && overview.score != null) {
      const scoreEl = document.querySelector('[data-dq-overall-score]');
      if (scoreEl) scoreEl.textContent = overview.score + '%';
    }
    // Replace violation list with BFF issues when provided
    if (issues && Array.isArray(issues.data || issues.issues)) {
      const bffIssues = issues.data || issues.issues;
      if (bffIssues.length) {
        violations.length = 0;
        bffIssues.forEach(i => violations.push(i));
      }
    }
  } catch (e) {
    console.warn('[DataQuality] BFF unavailable, using inline data:', e.message);
  }
}
let dateFilter = { preset: "Last 24 hours" };
let violationFilterState = { query: "", source: [], trackingPlan: [], type: [], severity: [], status: [] };

function refreshIcons() {
  if (window.lucide) window.lucide.createIcons();
}
function fmt(n) {
  return Math.round(n).toLocaleString();
}
function pct(n) {
  return `${n.toFixed(2)}%`;
}
function statusBadge(status) {
  const meta = QUALITY_STATUS_META[status] || QUALITY_STATUS_META.Healthy;
  return `<span class="status-dot ${meta.dot}">${status}</span>`;
}
function severityBadge(sev) {
  const meta = SEVERITY_META[sev] || SEVERITY_META.Low;
  return `<span class="badge ${meta.badge}">${sev}</span>`;
}
function issueStatusBadge(status) {
  const map = { Open: "badge--danger", Investigating: "badge--warning", Resolved: "badge--success", Ignored: "badge--neutral" };
  return `<span class="badge ${map[status] || "badge--neutral"}">${status}</span>`;
}
function dateRangeLabel() {
  if (dateFilter.preset === "Custom" && dateFilter.startDate && dateFilter.endDate) {
    return `${dateFilter.startDate} ${dateFilter.startTime || "00:00"} → ${dateFilter.endDate} ${dateFilter.endTime || "23:59"}`;
  }
  return dateFilter.preset;
}

/* ================================================================ */
/* Header — date range (with working Custom popover), Refresh, Export */
/* ================================================================ */
function renderCustomRangePanel() {
  const panel = document.querySelector("[data-dq-custom-range-panel]");
  panel.innerHTML = `
    <div style="padding: var(--space-4);">
      <p class="field__label" style="margin-bottom: var(--space-3);">Custom Range</p>
      <div class="stack gap-3">
        <div class="field">
          <label class="field__label">Start</label>
          <div class="cluster gap-2">
            <input type="date" class="input" data-range-start-date value="${dateFilter.startDate || "2026-09-01"}" />
            <input type="time" class="input" data-range-start-time value="${dateFilter.startTime || "00:00"}" style="max-width: 110px;" />
          </div>
        </div>
        <div class="field">
          <label class="field__label">End</label>
          <div class="cluster gap-2">
            <input type="date" class="input" data-range-end-date value="${dateFilter.endDate || "2026-09-30"}" />
            <input type="time" class="input" data-range-end-time value="${dateFilter.endTime || "23:59"}" style="max-width: 110px;" />
          </div>
        </div>
      </div>
      <div class="cluster gap-2" style="justify-content: flex-end; margin-top: var(--space-4);">
        <button type="button" class="btn btn--ghost btn--sm" data-range-cancel>Cancel</button>
        <button type="button" class="btn btn--primary btn--sm" data-range-apply>Apply</button>
      </div>
    </div>`;

  panel.querySelector("[data-range-cancel]").addEventListener("click", () => {
    closeCustomRangePanel();
    // Revert the select back to whatever preset is actually active.
    document.querySelector("[data-dq-daterange]").value = dateFilter.preset;
  });
  panel.querySelector("[data-range-apply]").addEventListener("click", () => {
    dateFilter = {
      preset: "Custom",
      startDate: panel.querySelector("[data-range-start-date]").value,
      startTime: panel.querySelector("[data-range-start-time]").value,
      endDate: panel.querySelector("[data-range-end-date]").value,
      endTime: panel.querySelector("[data-range-end-time]").value,
    };
    closeCustomRangePanel();
    renderAll();
  });
}

function openCustomRangePanel() {
  renderCustomRangePanel();
  document.querySelector("[data-dq-custom-range-panel]").classList.add("is-open");
}
function closeCustomRangePanel() {
  document.querySelector("[data-dq-custom-range-panel]").classList.remove("is-open");
}

function initHeaderControls() {
  const select = document.querySelector("[data-dq-daterange]");
  select.innerHTML = DATE_RANGE_PRESETS.map((p) => `<option value="${p}"${p === dateFilter.preset ? " selected" : ""}>${p}</option>`).join("");
  select.addEventListener("change", (e) => {
    if (e.target.value === "Custom") {
      openCustomRangePanel();
      return;
    }
    dateFilter = { preset: e.target.value };
    renderAll();
  });

  document.addEventListener("click", (e) => {
    const anchor = document.querySelector("[data-dq-custom-range-panel]").closest(".col-manager-anchor");
    if (!anchor.contains(e.target)) closeCustomRangePanel();
  });

  const refreshBtn = document.querySelector("[data-dq-refresh]");
  refreshBtn.addEventListener("click", () => {
    // Lucide replaces the <i data-lucide> with an inline <svg> after
    // the first render, so the icon element must be re-queried each
    // time rather than assumed to still be an <i>.
    const icon = refreshBtn.querySelector("svg, i");
    if (icon) {
      icon.style.transition = "transform 0.6s linear";
      icon.style.transform = "rotate(360deg)";
    }
    refreshBtn.disabled = true;
    renderAll();
    setTimeout(() => {
      if (icon) icon.style.transform = "rotate(0deg)";
      refreshBtn.disabled = false;
    }, 600);
  });

  document.querySelector("[data-dq-export]").addEventListener("click", exportViolationsCsv);
}

function exportViolationsCsv() {
  const rows = [["Timestamp", "Source", "Event", "Violation Type", "Property", "Tracking Plan", "Severity", "Status"]];
  filterViolations(violations, violationFilterState).forEach((i) => {
    rows.push([i.lastSeen, getSourceRecord(i.sourceId)?.provider || "", i.eventName || "", i.type, i.propertyKey || "", getPlanById(i.trackingPlanId)?.name || "", i.severity, i.status]);
  });
  const csv = rows.map((r) => r.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "data-quality-violations.csv";
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/* ================================================================ */
/* KPIs + Tracking Plan Compliance                                     */
/* ================================================================ */
function renderKpis() {
  const c = trackingPlanCompliance(dateFilter);
  document.querySelector("[data-kpi-validated]").textContent = fmt(c.eventsValidated);
  document.querySelector("[data-kpi-violations]").textContent = fmt(c.eventsWithViolations);
  document.querySelector("[data-kpi-dropped]").textContent = fmt(c.eventsDropped);
  document.querySelector("[data-kpi-rate]").textContent = pct(c.violationRate);
  document.querySelector("[data-kpi-sources]").textContent = c.activeSources;
  document.querySelector("[data-kpi-plans]").textContent = c.activeTrackingPlans;
}

function renderTrackingPlanCompliance() {
  const c = trackingPlanCompliance(dateFilter);
  const validPct = 100 - c.violationRate - (c.eventsDropped / c.eventsValidated) * 100;
  const violPct = c.violationRate;
  const dropPct = (c.eventsDropped / c.eventsValidated) * 100;
  document.querySelector("[data-tp-compliance]").innerHTML = `
    <div class="event-attr-grid" style="margin-bottom: var(--space-5);">
      <div class="attr-item"><span class="attr-item__label">Events Validated</span><span class="attr-item__value tabular-nums">${fmt(c.eventsValidated)}</span></div>
      <div class="attr-item"><span class="attr-item__label">Events With Violations</span><span class="attr-item__value tabular-nums">${fmt(c.eventsWithViolations)}</span></div>
      <div class="attr-item"><span class="attr-item__label">Events Dropped</span><span class="attr-item__value tabular-nums">${fmt(c.eventsDropped)}</span></div>
      <div class="attr-item"><span class="attr-item__label">Violation Rate</span><span class="attr-item__value tabular-nums">${pct(c.violationRate)}</span></div>
    </div>
    <div style="display:flex; height:10px; border-radius:4px; overflow:hidden; border:1px solid var(--border-subtle);">
      <div style="width:${validPct}%; background: var(--color-primary-500);" title="Valid ${validPct.toFixed(2)}%"></div>
      <div style="width:${violPct}%; background: var(--color-gold-500);" title="With Violations ${violPct.toFixed(2)}%"></div>
      <div style="width:${dropPct}%; background: var(--color-danger-500);" title="Dropped ${dropPct.toFixed(2)}%"></div>
    </div>
    <p class="event-form-section__hint" style="margin-top: var(--space-2);">Prototype metrics, derived directly from the counts above — not an arbitrary composite score.</p>`;
}

/* ================================================================ */
/* Charts                                                              */
/* ================================================================ */
function renderViolationsChart() {
  document.querySelector("[data-violations-range]").textContent = dateRangeLabel();
  const { labels, series } = violationsOverTimeSeries(dateFilter);
  renderLineChart(document.querySelector("[data-violations-chart]"), { series, labels, formatValue: (n) => fmt(n) });
}

function renderVolumeChart() {
  const v = eventVolumeSeries(dateFilter);
  renderLineChart(document.querySelector("[data-volume-chart]"), {
    series: [
      { name: "Events Received", color: "var(--color-ink-400)", values: v.received, area: true },
      { name: "Events Validated", color: "var(--color-primary-500)", values: v.validated },
      { name: "With Violations", color: "var(--color-gold-500)", values: v.withViolations },
      { name: "Dropped", color: "var(--color-danger-500)", values: v.dropped },
    ],
    labels: v.labels,
    formatValue: (n) => fmt(n),
  });
}

/* ================================================================ */
/* Quality by Source / Tracking Plan / Destination Delivery            */
/* ================================================================ */
function renderSourceQualityTable() {
  const scale = trackingPlanCompliance(dateFilter).eventsValidated / trackingPlanCompliance({ preset: "Last 24 hours" }).eventsValidated;
  const tbody = document.querySelector("[data-source-quality-table] tbody");
  tbody.innerHTML = SOURCE_QUALITY.map((s) => {
    const record = getSourceRecord(s.sourceId);
    const plan = s.trackingPlanId ? getPlanById(s.trackingPlanId) : null;
    const validated = Math.round(s.eventsValidatedBase * scale);
    const withViolations = Math.round(validated * (s.violationRate / 100));
    const dropped = Math.round(validated * (s.droppedRate / 100));
    return `<tr>
      <td class="cell-primary">${record?.provider || s.sourceId}</td>
      <td class="num tabular-nums">${fmt(validated)}</td>
      <td class="num tabular-nums">${fmt(withViolations)}</td>
      <td class="num tabular-nums">${pct(s.violationRate)}</td>
      <td class="num tabular-nums">${fmt(dropped)}</td>
      <td class="cell-muted">${plan ? plan.name : "—"}</td>
      <td>${statusBadge(s.status)}</td>
    </tr>`;
  }).join("");
}

function renderPlanQualityTable() {
  const scale = trackingPlanCompliance(dateFilter).eventsValidated / trackingPlanCompliance({ preset: "Last 24 hours" }).eventsValidated;
  const tbody = document.querySelector("[data-plan-quality-table] tbody");
  tbody.innerHTML = qualityByTrackingPlan()
    .map((p) => {
      const validated = Math.round(p.eventsValidatedBase * scale);
      const viol = Math.round(p.violationsBase * scale);
      const dropped = Math.round(p.droppedBase * scale);
      return `<tr data-plan-row="${p.planId}" style="cursor:pointer;">
      <td class="cell-primary">${p.plan.name}</td>
      <td class="cell-muted font-mono">v${p.plan.id === "tp-lifecycle" ? "0.9" : "1"}</td>
      <td class="num tabular-nums">${p.sourceCount}</td>
      <td class="num tabular-nums">${fmt(validated)}</td>
      <td class="num tabular-nums">${fmt(viol)}</td>
      <td class="num tabular-nums">${pct(p.violationRate)}</td>
      <td class="num tabular-nums">${fmt(dropped)}</td>
      <td>${statusBadge(p.status)}</td>
    </tr>`;
    })
    .join("");
  tbody.querySelectorAll("[data-plan-row]").forEach((row) => {
    row.addEventListener("click", () => (window.location.href = `tracking-plans.html?open=${row.dataset.planRow}`));
  });
}

function renderDeliveryTable() {
  const tbody = document.querySelector("[data-delivery-table] tbody");
  tbody.innerHTML = destinationDelivery()
    .map((d) => {
      const failures = Math.round(d.eventsSentBase * (d.failureRate / 100));
      return `<tr data-delivery-row="${d.destination.id}" style="cursor:pointer;">
      <td class="cell-primary">${d.destination.name}</td>
      <td class="cell-muted">${d.destination.deliveryConfig.mode}</td>
      <td class="num tabular-nums">${fmt(d.eventsSentBase)}</td>
      <td class="num tabular-nums">${fmt(failures)}</td>
      <td class="num tabular-nums">${pct(d.failureRate)}</td>
      <td class="cell-muted">${d.lastDelivery}</td>
      <td>${statusBadge(d.status)}</td>
    </tr>`;
    })
    .join("");
  tbody.querySelectorAll("[data-delivery-row]").forEach((row) => {
    row.addEventListener("click", () => (window.location.href = `destinations.html?open=${row.dataset.deliveryRow}`));
  });
}

/* ================================================================ */
/* Violations table + filters + drawer                                 */
/* ================================================================ */
function violationRowHTML(i) {
  return `<tr data-violation-row="${i.id}" style="cursor:pointer;">
    <td class="cell-muted tabular-nums font-mono">${i.time}</td>
    <td class="cell-muted">${getSourceRecord(i.sourceId)?.provider || "—"}</td>
    <td class="cell-primary font-mono">${i.eventName || "—"}</td>
    <td class="cell-muted">${i.type}</td>
    <td class="cell-muted font-mono">${i.propertyKey || "—"}</td>
    <td class="cell-muted">${getPlanById(i.trackingPlanId)?.name || "—"}</td>
    <td>${severityBadge(i.severity)}</td>
    <td>${issueStatusBadge(i.status)}</td>
  </tr>`;
}

function renderViolationTable() {
  const tbody = document.querySelector("[data-violation-table] tbody");
  const filtered = filterViolations(violations, violationFilterState);
  tbody.innerHTML = filtered.length ? filtered.map(violationRowHTML).join("") : `<tr><td colspan="8" class="table__empty">No violations match your search and filters.</td></tr>`;
  tbody.querySelectorAll("[data-violation-row]").forEach((row) => {
    row.addEventListener("click", () => openViolationDrawer(row.dataset.violationRow));
  });
}

function initViolationFilters() {
  document.querySelector("[data-violation-search]").addEventListener("input", (e) => {
    violationFilterState.query = e.target.value;
    renderViolationTable();
  });

  const fields = [
    { key: "source", label: "Source", type: "multiselect", options: [...new Set(SOURCE_QUALITY.map((s) => getSourceRecord(s.sourceId)?.provider).filter(Boolean))] },
    { key: "trackingPlan", label: "Tracking Plan", type: "multiselect", options: [...new Set(violations.map((i) => getPlanById(i.trackingPlanId)?.name).filter(Boolean))] },
    { key: "type", label: "Violation Type", type: "multiselect", options: VIOLATION_TYPES },
    { key: "severity", label: "Severity", type: "multiselect", options: SEVERITIES },
    { key: "status", label: "Status", type: "multiselect", options: ISSUE_STATUSES },
  ];
  const filterCount = document.querySelector("[data-violation-filter-count]");
  function updateCount() {
    const n = countActiveFilters(violationFilterState, fields);
    filterCount.hidden = n === 0;
    filterCount.textContent = n;
  }
  initFilterPanel({
    triggerEl: document.querySelector("[data-violation-filter-trigger]"),
    panelEl: document.querySelector("[data-violation-filter-panel]"),
    fields,
    getState: () => violationFilterState,
    onApply: (state) => {
      Object.assign(violationFilterState, state);
      updateCount();
      renderViolationTable();
    },
    onClear: () => {
      fields.forEach((f) => (violationFilterState[f.key] = []));
      updateCount();
      renderViolationTable();
    },
  });
  updateCount();
}

function openViolationDrawer(id) {
  const i = violations.find((x) => x.id === id) || getViolationById(id);
  if (!i) return;
  const source = getSourceRecord(i.sourceId);
  const plan = i.trackingPlanId ? getPlanById(i.trackingPlanId) : null;
  const stream = i.eventStreamId ? getStreamById(i.eventStreamId) : null;
  const drawer = document.getElementById("violation-detail-drawer");
  document.querySelector("[data-violation-drawer-title]").textContent = i.type;

  drawer.querySelector("[data-violation-drawer-body]").innerHTML = `
    <div class="event-drawer-header">${severityBadge(i.severity)}${issueStatusBadge(i.status)}</div>
    <div class="event-config-list" style="margin-bottom: var(--space-5);">
      <div class="event-config-row"><span class="event-config-row__label">Source</span><span class="event-config-row__value">${source?.provider || "—"}</span></div>
      <div class="event-config-row"><span class="event-config-row__label">Event</span><span class="event-config-row__value font-mono">${i.eventName || "—"}</span></div>
      <div class="event-config-row"><span class="event-config-row__label">Timestamp</span><span class="event-config-row__value tabular-nums">${i.lastSeen}</span></div>
      <div class="event-config-row"><span class="event-config-row__label">Tracking Plan</span><span class="event-config-row__value">${plan ? plan.name : "—"}</span></div>
      <div class="event-config-row"><span class="event-config-row__label">Property</span><span class="event-config-row__value font-mono">${i.propertyKey || "—"}</span></div>
      <div class="event-config-row"><span class="event-config-row__label">Occurrences</span><span class="event-config-row__value tabular-nums">${fmt(i.occurrences)}</span></div>
      <div class="event-config-row"><span class="event-config-row__label">First Seen</span><span class="event-config-row__value tabular-nums">${i.firstSeen}</span></div>
    </div>

    ${
      i.expectedType || i.receivedType
        ? `<p class="subhead" style="margin-bottom: var(--space-2);">Expected vs. Received</p>
    <div class="event-config-list" style="margin-bottom: var(--space-5);">
      <div class="event-config-row"><span class="event-config-row__label">Expected</span><span class="event-config-row__value font-mono">${i.propertyKey || ""} → ${i.expectedType}</span></div>
      <div class="event-config-row"><span class="event-config-row__label">Received</span><span class="event-config-row__value font-mono">${i.propertyKey || ""} → ${i.receivedType}</span></div>
    </div>`
        : ""
    }

    <p class="subhead" style="margin-bottom: var(--space-2);">Event Handling</p>
    <div class="event-checklist" style="margin-bottom: var(--space-2);">
      <label><input type="radio" name="handling-${i.id}" disabled ${i.handlingPolicy === "keep" ? "checked" : ""} /> Keep Event + Propagate Violation</label>
      <label><input type="radio" name="handling-${i.id}" disabled ${i.handlingPolicy === "drop" ? "checked" : ""} /> Drop Event</label>
    </div>
    <p class="event-form-section__hint" style="margin-bottom: var(--space-5);">Prototype policy — configured handling shown for illustration only; the frontend does not drop real events.</p>

    <p class="subhead" style="margin-bottom: var(--space-2);">Actions</p>
    <div class="stack gap-2" style="margin-bottom: var(--space-5);">
      ${i.eventId ? `<a class="btn btn--outline btn--sm" href="event-definitions.html?open=${i.eventId}"><i data-lucide="list-tree"></i> View Event / Data Catalog</a>` : ""}
      ${plan ? `<a class="btn btn--outline btn--sm" href="tracking-plans.html?open=${plan.id}"><i data-lucide="clipboard-check"></i> View Tracking Plan</a>` : ""}
      ${stream ? `<a class="btn btn--outline btn--sm" href="event-streams.html?open=${stream.id}"><i data-lucide="cable"></i> View Event Stream</a>` : ""}
      ${source ? `<a class="btn btn--outline btn--sm" href="live-events.html?source=${encodeURIComponent(source.provider)}"><i data-lucide="radio"></i> View Live Events</a>` : ""}
    </div>

    <p class="subhead" style="margin-bottom: var(--space-2);">Update Status</p>
    <div class="cluster gap-2">
      <button type="button" class="btn btn--outline btn--sm" data-set-status="Investigating">Mark Investigating</button>
      <button type="button" class="btn btn--outline btn--sm" data-set-status="Resolved">Resolve</button>
      <button type="button" class="btn btn--outline btn--sm" data-set-status="Ignored">Ignore</button>
    </div>`;

  drawer.querySelectorAll("[data-set-status]").forEach((btn) =>
    btn.addEventListener("click", () => {
      i.status = btn.dataset.setStatus;
      openViolationDrawer(id);
      renderViolationTable();
    })
  );
  drawer.classList.add("is-open");
  document.body.style.overflow = "hidden";
  refreshIcons();
}

/* ================================================================ */
/* Init                                                                */
/* ================================================================ */
function renderAll() {
  renderKpis();
  renderTrackingPlanCompliance();
  renderViolationsChart();
  renderVolumeChart();
  renderSourceQualityTable();
  renderPlanQualityTable();
  renderViolationTable();
  refreshIcons();
}

export function initDataQuality() {
  // Try BFF first — it adds live quality scores and issues from the backend
  loadDataQualityFromBFF().then(() => {
    initHeaderControls();
    renderDeliveryTable();
    initViolationFilters();
    renderAll();
  });
}
