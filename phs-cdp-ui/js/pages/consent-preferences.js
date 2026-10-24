/*
  Consent & Preferences (Data) — operational consent state, preference
  state, consent history and activation eligibility. See js/data/
  consent.js for the data model and why this is a distinct lens from
  Governance → Consent Management (policy/purpose configuration).
*/
import {
  DATE_RANGE_PRESETS,
  CONSENT_CATEGORIES,
  CONSENT_CHANNELS,
  CONSENT_STATUSES,
  STATUS_META,
  CONSENT_SOURCES,
  consentOverview,
  consentByCategory,
  communicationPreferences,
  consentSourcesSummary,
  consentHistory,
  filterConsentHistory,
  CONSENT_POLICIES,
  activationEligibility,
} from "../data/consent.js";
import { DESTINATION_ICONS, STATUS_META as DEST_STATUS_META } from "../data/destinations.js";
import { initFilterPanel, countActiveFilters } from "../components/connector-directory.js";

let dateFilter = { preset: "Last 7 days" };
let historyFilterState = { query: "", category: [], status: [], source: [], channel: [] };
let currentHistory = [];

function refreshIcons() {
  if (window.lucide) window.lucide.createIcons();
}
function fmt(n) {
  return Math.round(n).toLocaleString();
}
function statusBadge(status) {
  const meta = STATUS_META[status] || STATUS_META["Not Set"];
  return `<span class="badge ${meta.badge}">${status}</span>`;
}

/* ================================================================ */
/* Header — date range with the same Custom popover pattern as Data   */
/* Quality (js/pages/data-quality.js).                                 */
/* ================================================================ */
function renderCustomRangePanel() {
  const panel = document.querySelector("[data-cp-custom-range-panel]");
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
    document.querySelector("[data-cp-daterange]").value = dateFilter.preset;
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
    renderHistorySection();
  });
}
function openCustomRangePanel() {
  renderCustomRangePanel();
  document.querySelector("[data-cp-custom-range-panel]").classList.add("is-open");
}
function closeCustomRangePanel() {
  document.querySelector("[data-cp-custom-range-panel]").classList.remove("is-open");
}

function initHeaderControls() {
  const select = document.querySelector("[data-cp-daterange]");
  select.innerHTML = DATE_RANGE_PRESETS.map((p) => `<option value="${p}"${p === dateFilter.preset ? " selected" : ""}>${p}</option>`).join("");
  select.addEventListener("change", (e) => {
    if (e.target.value === "Custom") {
      openCustomRangePanel();
      return;
    }
    dateFilter = { preset: e.target.value };
    renderHistorySection();
  });

  document.addEventListener("click", (e) => {
    const panel = document.querySelector("[data-cp-custom-range-panel]");
    const anchor = panel?.closest(".col-manager-anchor");
    if (panel?.classList.contains("is-open") && anchor && !anchor.contains(e.target)) closeCustomRangePanel();
  });
}

/* ================================================================ */
/* Overview (section 5)                                               */
/* ================================================================ */
function renderOverview() {
  const o = consentOverview();
  document.querySelector("[data-cp-overview]").innerHTML = `
    <div class="metric metric--primary"><span class="metric__label">Consent Records</span><div class="metric__value-row"><span class="metric__value tabular-nums" style="font-size: var(--text-xl);">${fmt(o.totalRecords)}</span></div></div>
    <div class="metric metric--success"><span class="metric__label">Marketing Granted</span><div class="metric__value-row"><span class="metric__value tabular-nums" style="font-size: var(--text-xl);">${o.marketingGranted.toFixed(1)}%</span></div></div>
    <div class="metric metric--success"><span class="metric__label">Analytics Granted</span><div class="metric__value-row"><span class="metric__value tabular-nums" style="font-size: var(--text-xl);">${o.analyticsGranted.toFixed(1)}%</span></div></div>
    <div class="metric metric--success"><span class="metric__label">Personalization Granted</span><div class="metric__value-row"><span class="metric__value tabular-nums" style="font-size: var(--text-xl);">${o.personalizationGranted.toFixed(1)}%</span></div></div>
    <div class="metric"><span class="metric__label">Withdrawn</span><div class="metric__value-row"><span class="metric__value tabular-nums" style="font-size: var(--text-xl);">${o.withdrawnAvg}%</span></div></div>`;
}

/* ================================================================ */
/* Consent by Category (section 6) — segmented proportion bars.       */
/* ================================================================ */
const CATEGORY_SEGMENT_COLOR = { Granted: "var(--chart-green)", Denied: "var(--chart-neutral)", Withdrawn: "var(--chart-gold)", "Not Set": "var(--color-ink-200)" };
function renderCategorySection() {
  const rows = consentByCategory();
  document.querySelector("[data-cp-category]").innerHTML = rows
    .map(
      (r) => `
    <div>
      <div class="cluster" style="justify-content: space-between; margin-bottom: var(--space-2);">
        <span style="font-size: var(--text-sm); font-weight: var(--weight-semibold); color: var(--text-primary);">${r.category}</span>
      </div>
      <div class="chart-bar-segmented">
        <div class="chart-bar-segmented__seg" style="width:${r.granted}%; background:${CATEGORY_SEGMENT_COLOR.Granted};"></div>
        <div class="chart-bar-segmented__seg" style="width:${r.denied}%; background:${CATEGORY_SEGMENT_COLOR.Denied};"></div>
        <div class="chart-bar-segmented__seg" style="width:${r.withdrawn}%; background:${CATEGORY_SEGMENT_COLOR.Withdrawn};"></div>
        <div class="chart-bar-segmented__seg" style="width:${r["notSet"]}%; background:${CATEGORY_SEGMENT_COLOR["Not Set"]};"></div>
      </div>
      <div class="chart-legend">
        <span class="chart-legend__item"><span class="chart-legend__dot" style="background:${CATEGORY_SEGMENT_COLOR.Granted}"></span><span class="chart-legend__label">Granted</span><span class="chart-legend__value">${r.granted.toFixed(1)}%</span></span>
        <span class="chart-legend__item"><span class="chart-legend__dot" style="background:${CATEGORY_SEGMENT_COLOR.Denied}"></span><span class="chart-legend__label">Denied</span><span class="chart-legend__value">${r.denied.toFixed(1)}%</span></span>
        <span class="chart-legend__item"><span class="chart-legend__dot" style="background:${CATEGORY_SEGMENT_COLOR.Withdrawn}"></span><span class="chart-legend__label">Withdrawn</span><span class="chart-legend__value">${r.withdrawn.toFixed(1)}%</span></span>
        <span class="chart-legend__item"><span class="chart-legend__dot" style="background:${CATEGORY_SEGMENT_COLOR["Not Set"]}"></span><span class="chart-legend__label">Not Set</span><span class="chart-legend__value">${r["notSet"].toFixed(1)}%</span></span>
      </div>
    </div>`
    )
    .join("");
}

/* ================================================================ */
/* Communication Preferences (section 7)                              */
/* ================================================================ */
function renderChannelTable() {
  const tbody = document.querySelector("[data-cp-channel-table] tbody");
  tbody.innerHTML = communicationPreferences()
    .map(
      (r) => `<tr>
      <td class="cell-primary">${r.channel}</td>
      <td class="num tabular-nums">${r.allowed.toFixed(1)}%</td>
      <td class="num tabular-nums">${r.denied.toFixed(1)}%</td>
      <td class="num tabular-nums">${r.notSet.toFixed(1)}%</td>
      <td class="cell-muted tabular-nums">${r.lastUpdated}</td>
      <td><div class="mini-bar"><span class="mini-bar__track"><span class="mini-bar__fill" style="width:${r.coverage}%;"></span></span><span class="tabular-nums cell-muted" style="font-size: var(--text-xs);">${r.coverage.toFixed(1)}%</span></div></td>
    </tr>`
    )
    .join("");
}

/* ================================================================ */
/* Consent Sources (section 8)                                        */
/* ================================================================ */
function renderSourceTable() {
  const tbody = document.querySelector("[data-cp-source-table] tbody");
  tbody.innerHTML = consentSourcesSummary()
    .map(
      (r) => `<tr>
      <td class="cell-primary">${r.source}</td>
      <td class="num tabular-nums">${fmt(r.records)}</td>
      <td class="num tabular-nums">${fmt(r.granted)}</td>
      <td class="num tabular-nums">${fmt(r.denied)}</td>
      <td class="cell-muted">${r.lastActivity}</td>
      <td><span class="badge ${r.status === "Active" ? "badge--success" : "badge--neutral"}">${r.status}</span></td>
    </tr>`
    )
    .join("");
}

/* ================================================================ */
/* Consent Policy (section 14)                                        */
/* ================================================================ */
function renderPolicyTable() {
  const tbody = document.querySelector("[data-cp-policy-table] tbody");
  tbody.innerHTML = CONSENT_POLICIES.map(
    (p) => `<tr>
      <td class="cell-primary">${p.category}</td>
      <td class="cell-muted">${p.channel}</td>
      <td class="cell-muted">${p.rule}</td>
    </tr>`
  ).join("");
}

/* ================================================================ */
/* Activation Eligibility (section 15)                                */
/* ================================================================ */
function renderEligibility() {
  const mount = document.querySelector("[data-cp-eligibility]");
  mount.innerHTML = activationEligibility()
    .map((row) => {
      const d = row.destination;
      const icon = DESTINATION_ICONS[d.provider] || "share-2";
      const statusMeta = DEST_STATUS_META[d.status] || DEST_STATUS_META.Available;
      return `
      <div class="event-stream-card" data-eligibility-link="${d.id}" style="cursor: pointer;">
        <div class="event-stream-card__head">
          <span class="event-stream-card__icon"><i data-lucide="${icon}"></i></span>
          <div>
            <div class="event-stream-card__name">${d.provider}</div>
            <div class="event-stream-card__today">${d.name}</div>
          </div>
        </div>
        <ul style="margin: 0; padding-left: var(--space-4); font-size: var(--text-xs); color: var(--text-secondary); display: flex; flex-direction: column; gap: 4px;">
          ${row.requirements.map((req) => `<li>${req}</li>`).join("")}
        </ul>
        <span class="badge ${statusMeta.badge}" style="align-self: flex-start;">${d.status}</span>
      </div>`;
    })
    .join("");
  refreshIcons();
  mount.querySelectorAll("[data-eligibility-link]").forEach((card) => {
    card.addEventListener("click", () => (window.location.href = `destinations.html?open=${card.dataset.eligibilityLink}`));
  });
}

/* ================================================================ */
/* Consent History (section 9) — search, filter, drawer.              */
/* ================================================================ */
function renderHistoryTable() {
  const tbody = document.querySelector("[data-cp-history-table] tbody");
  const filtered = filterConsentHistory(currentHistory, historyFilterState);
  tbody.innerHTML = filtered.length
    ? filtered
        .map(
          (r) => `<tr data-history-row="${r.id}" style="cursor: pointer;">
      <td class="cell-muted tabular-nums">${r.timestamp}</td>
      <td class="cell-primary font-mono">${r.customerMasked}</td>
      <td class="cell-muted">${r.category}</td>
      <td>${statusBadge(r.previousState)}</td>
      <td>${statusBadge(r.newState)}</td>
      <td class="cell-muted">${r.source}</td>
      <td class="cell-muted">${r.channel}</td>
    </tr>`
        )
        .join("")
    : `<tr><td colspan="7" class="table__empty">No consent history for the selected range/filters.</td></tr>`;
  refreshIcons();
  tbody.querySelectorAll("[data-history-row]").forEach((row) => {
    row.addEventListener("click", () => openHistoryDrawer(row.dataset.historyRow));
  });
}

function renderHistorySection() {
  currentHistory = consentHistory(dateFilter);
  renderHistoryTable();
}

function initSearchAndFilter() {
  const search = document.querySelector("[data-cp-search]");
  search.addEventListener("input", (e) => {
    historyFilterState.query = e.target.value;
    renderHistoryTable();
  });

  const trigger = document.querySelector("[data-cp-filter-trigger]");
  const panel = document.querySelector("[data-cp-filter-panel]");
  const countBadge = document.querySelector("[data-cp-filter-count]");
  const fields = [
    { key: "category", label: "Consent Category", type: "multiselect", options: CONSENT_CATEGORIES },
    { key: "status", label: "Status", type: "multiselect", options: CONSENT_STATUSES },
    { key: "source", label: "Source", type: "multiselect", options: CONSENT_SOURCES },
    { key: "channel", label: "Channel", type: "multiselect", options: CONSENT_CHANNELS },
  ];
  function updateBadge() {
    const n = countActiveFilters(historyFilterState, fields);
    countBadge.hidden = n === 0;
    countBadge.textContent = n;
  }
  initFilterPanel({
    triggerEl: trigger,
    panelEl: panel,
    fields,
    getState: () => historyFilterState,
    onApply: (state) => {
      historyFilterState = { ...historyFilterState, ...state };
      updateBadge();
      renderHistoryTable();
    },
    onClear: () => {
      historyFilterState = { query: historyFilterState.query, category: [], status: [], source: [], channel: [] };
      updateBadge();
      renderHistoryTable();
    },
  });
  updateBadge();
}

/* ================================================================ */
/* Consent record detail drawer (sections 10 + 11 combined — one       */
/* history row, one drawer: current state + the change that produced   */
/* it). Technical identifiers in monospace.                            */
/* ================================================================ */
function openHistoryDrawer(id) {
  const record = currentHistory.find((r) => r.id === id);
  if (!record) return;
  document.querySelector("[data-consent-drawer-title]").textContent = `${record.category} · ${record.customerMasked}`;
  document.querySelector("[data-consent-drawer-body]").innerHTML = `
    <div class="stack gap-4">
      <div class="identity-row">
        <div class="identity-row__main">
          <span class="identity-row__label">Customer</span>
          <span class="font-mono" style="font-size: var(--text-sm); color: var(--text-primary);">${record.customerMasked}</span>
        </div>
      </div>
      <div class="identity-row">
        <div class="identity-row__main">
          <span class="identity-row__label">Consent Category</span>
          <span style="font-size: var(--text-sm); color: var(--text-primary);">${record.category}</span>
        </div>
      </div>
      <div class="identity-row">
        <div class="identity-row__main">
          <span class="identity-row__label">Status</span>
          ${statusBadge(record.newState)}
        </div>
      </div>
      <div class="identity-row">
        <div class="identity-row__main">
          <span class="identity-row__label">Source</span>
          <span style="font-size: var(--text-sm); color: var(--text-primary);">${record.source}</span>
        </div>
      </div>
      <div class="identity-row">
        <div class="identity-row__main">
          <span class="identity-row__label">Channel</span>
          <span style="font-size: var(--text-sm); color: var(--text-primary);">${record.channel}</span>
        </div>
      </div>
      <div class="identity-row">
        <div class="identity-row__main">
          <span class="identity-row__label">Last Updated</span>
          <span class="tabular-nums" style="font-size: var(--text-sm); color: var(--text-primary);">${record.timestamp}</span>
        </div>
      </div>
    </div>

    <div class="section__header" style="padding: 0; margin: var(--space-6) 0 var(--space-3);"><h3 class="section__title" style="font-size: var(--text-sm);">Change</h3></div>
    <div class="stack gap-4">
      <div class="identity-row">
        <div class="identity-row__main">
          <span class="identity-row__label">Previous State</span>
          ${statusBadge(record.previousState)}
        </div>
      </div>
      <div class="identity-row">
        <div class="identity-row__main">
          <span class="identity-row__label">New State</span>
          ${statusBadge(record.newState)}
        </div>
      </div>
      <div class="identity-row">
        <div class="identity-row__main">
          <span class="identity-row__label">Changed At</span>
          <span class="tabular-nums" style="font-size: var(--text-sm); color: var(--text-primary);">${record.timestamp}</span>
        </div>
      </div>
      <div class="identity-row">
        <div class="identity-row__main">
          <span class="identity-row__label">Consent Record ID</span>
          <span class="font-mono" style="font-size: var(--text-sm); color: var(--text-secondary);">${record.recordId}</span>
        </div>
      </div>
    </div>`;
  document.getElementById("consent-detail-drawer").classList.add("is-open");
  refreshIcons();
}

export function initConsentPreferences() {
  initHeaderControls();
  renderOverview();
  renderCategorySection();
  renderChannelTable();
  renderSourceTable();
  renderPolicyTable();
  renderEligibility();
  initSearchAndFilter();
  renderHistorySection();
  refreshIcons();
}
