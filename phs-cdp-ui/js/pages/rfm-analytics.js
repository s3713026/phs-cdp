/*
  PHS CDP — RFM Analysis page controller.

  Every number on this page comes from js/data/rfm/engine.js — this
  file only builds the configuration form, renders what the engine
  returns, and handles the CSV export (reusing the exact Blob/
  download technique already proven in js/pages/data-quality.js's
  exportViolationsCsv, not a new export mechanism).
*/
import { loadRfmConfig, saveRfmConfig, resetRfmConfig } from "../data/rfm/config.js";
import { ASSET_TYPES, BRANCHES, BROKERS, MANAGEMENT_CHANNELS, REFERENCE_DATE, TIER_DEFINITION_LABEL, SEGMENT_TAXONOMY_LABEL, getGridData, getSegmentList, getCellAggregateDetail, getSegmentAggregateDetail } from "../data/rfm/engine.js";
import { renderRfmGridHTML, wireRfmGridInteractivity, formatCompactVnd, SEGMENT_COLOR_VAR } from "./rfm-grid.js";
import { renderRfmAggregateDetailHTML, wireRfmAggregateDetailInteractivity } from "./rfm-cell-detail.js";
import { chartSwitchHTML, wireChartSwitch } from "./customer-360-charts.js";

function refreshIcons() {
  if (window.lucide) window.lucide.createIcons();
}

const LOOKBACK_OPTIONS = [{ id: "30", label: "30 days" }, { id: "90", label: "90 days" }, { id: "180", label: "180 days" }];
const R_METRIC_OPTIONS = [
  { value: "lastOrder", label: "Most recent matched-order date" },
  { value: "lastLogin", label: "Most recent app login date" },
];
const M_METRIC_OPTIONS = [
  { value: "transactionValue", label: "Total Matched Transaction Value" },
  { value: "brokerageFee", label: "Total Brokerage Fee" },
  { value: "nav", label: "Net Asset Value (NAV)" },
];

let currentConfig = null;

function populateSelect(el, options, selectedValue) {
  el.innerHTML = options.map((o) => `<option value="${o.value}" ${o.value === selectedValue ? "selected" : ""}>${o.label}</option>`).join("");
}

function initForm(config) {
  document.querySelector("[data-rfm-asset-types]").innerHTML = ASSET_TYPES.map(
    (t) => `<label><input type="checkbox" value="${t}" ${config.assetTypes.includes(t) ? "checked" : ""} /> ${t}</label>`
  ).join("");

  populateSelect(
    document.querySelector("[data-rfm-management-channel]"),
    [{ value: "All", label: "All" }, ...MANAGEMENT_CHANNELS.map((c) => ({ value: c, label: c }))],
    config.managementChannel
  );
  populateSelect(
    document.querySelector("[data-rfm-branch]"),
    [{ value: "All", label: "All Branches" }, ...BRANCHES.map((b) => ({ value: b.id, label: b.name }))],
    config.branchId
  );
  populateSelect(
    document.querySelector("[data-rfm-broker]"),
    [{ value: "All", label: "All Brokers" }, ...BROKERS.map((b) => ({ value: b.id, label: `${b.id} (${b.team})` }))],
    config.brokerId
  );
  populateSelect(document.querySelector("[data-rfm-r-metric]"), R_METRIC_OPTIONS, config.rMetric);
  populateSelect(document.querySelector("[data-rfm-m-metric]"), M_METRIC_OPTIONS, config.mMetric);

  const lookbackMount = document.querySelector("[data-rfm-lookback-switch]");
  lookbackMount.innerHTML = chartSwitchHTML("rfm-lookback", LOOKBACK_OPTIONS, String(config.lookbackDays));
  // No-op callback — the lookback switch only updates its own visual
  // state here; the actual config change applies on "Apply" like every
  // other field, read from the DOM at submit time below.
  wireChartSwitch(document, "rfm-lookback", () => {});
}

function readFormConfig() {
  const assetTypes = [...document.querySelectorAll("[data-rfm-asset-types] input:checked")].map((i) => i.value);
  const activeLookbackBtn = document.querySelector('[data-chart-switch="rfm-lookback"] .is-active');
  return {
    lookbackDays: Number(activeLookbackBtn?.dataset.switchView || currentConfig.lookbackDays),
    assetTypes,
    managementChannel: document.querySelector("[data-rfm-management-channel]").value,
    branchId: document.querySelector("[data-rfm-branch]").value,
    brokerId: document.querySelector("[data-rfm-broker]").value,
    rMetric: document.querySelector("[data-rfm-r-metric]").value,
    mMetric: document.querySelector("[data-rfm-m-metric]").value,
  };
}

function branchName(branchId) {
  return branchId === "All" ? "All" : BRANCHES.find((b) => b.id === branchId)?.name || branchId;
}

function renderSummary(config) {
  const parts = [
    `Lookback: ${config.lookbackDays}d`,
    `Asset types: ${config.assetTypes.length ? config.assetTypes.join(", ") : "All"}`,
    `Channel: ${config.managementChannel}`,
    `Branch: ${branchName(config.branchId)}`,
    `Broker: ${config.brokerId}`,
    `R metric: ${R_METRIC_OPTIONS.find((o) => o.value === config.rMetric)?.label}`,
    `M metric: ${M_METRIC_OPTIONS.find((o) => o.value === config.mMetric)?.label}`,
  ];
  document.querySelector("[data-rfm-summary]").innerHTML = `<strong>Active filters</strong> — ${parts.join(" · ")} · <strong>Reference date:</strong> ${REFERENCE_DATE}. <span style="display:block; margin-top: var(--space-1);">Tiering: ${TIER_DEFINITION_LABEL} Segments: ${SEGMENT_TAXONOMY_LABEL}</span>`;
}

/** Aggregate-only export — this prototype has no backend authorization
 * or audit system, so per-customer export is not offered. Exports
 * exactly the same aggregate fields getSegmentAggregateDetail
 * computes, never a customer row. */
function exportSegmentCsv(segment, config) {
  const detail = getSegmentAggregateDetail(segment, config);
  if (detail.dataAvailabilityError) return;
  const header = ["Field", "Value"];
  const body = [
    ["Segment", detail.segment],
    ["Description", detail.description],
    ["Customers", detail.count],
    ["Percent of eligible population", `${detail.pct}%`],
    ["Aggregate Monetary", detail.aggregateM],
    ["Monetary definition", detail.monetaryLabel],
    ...Object.entries(detail.tierDistribution).map(([tier, count]) => [`Tier — ${tier}`, count]),
    ["Reference date", REFERENCE_DATE],
    ["Lookback window (days)", config.lookbackDays],
  ];
  const csvBody = [header, ...body].map((r) => r.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(",")).join("\n");
  const disclosure = `"SYNTHETIC DEMO DATA — for UI demonstration and validation only, not real PHS customer data. Aggregate statistics only — no individual customer records."\n`;
  const blob = new Blob([disclosure + csvBody], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `rfm-segment-${segment.toLowerCase().replace(/\s+/g, "-")}-summary.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/* ---- RFM cell drill-in drawer — same open/close shape as Customer   */
/* 360's #c360-detail-drawer (that overlay's own open/close logic      */
/* bypasses js/components/drawer.js's private functions the same way;  */
/* mirrored here rather than inventing a different mechanism). ------- */
let selectedCellCoord = null;

function openRfmCellDrawer(r, f, config) {
  const overlay = document.getElementById("rfm-cell-drawer");
  if (!overlay) return;
  const detail = getCellAggregateDetail(r, f, config);

  overlay.querySelector("[data-drawer-eyebrow]").textContent = `RFM Cell — R${r} × F${f}`;
  overlay.querySelector("[data-drawer-title]").textContent = detail.segment || "No segment";
  const body = overlay.querySelector("[data-drawer-body]");
  const meta = {
    ...detail,
    referenceDate: REFERENCE_DATE,
    lookbackDays: config.lookbackDays,
    rMetricLabel: R_METRIC_OPTIONS.find((o) => o.value === config.rMetric)?.label,
    mMetricLabel: M_METRIC_OPTIONS.find((o) => o.value === config.mMetric)?.label,
    formatM: formatCompactVnd,
  };
  body.innerHTML = renderRfmAggregateDetailHTML(meta);
  wireRfmAggregateDetailInteractivity(body, meta);

  selectedCellCoord = { r, f };
  document.querySelectorAll("[data-rfm-cell]").forEach((el) => {
    el.classList.toggle("rfm-grid__cell--selected", Number(el.dataset.rfmR) === r && Number(el.dataset.rfmF) === f);
  });

  overlay.classList.add("is-open");
  document.body.style.overflow = "hidden";
  refreshIcons();
}

function initRfmCellDrawer() {
  const overlay = document.getElementById("rfm-cell-drawer");
  if (!overlay) return;
  function close() {
    overlay.classList.remove("is-open");
    document.body.style.overflow = "";
    selectedCellCoord = null;
    document.querySelectorAll("[data-rfm-cell]").forEach((el) => el.classList.remove("rfm-grid__cell--selected"));
  }
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) close();
  });
  overlay.querySelectorAll("[data-drawer-close]").forEach((btn) => btn.addEventListener("click", close));
  // js/components/drawer.js's global Escape handler (registered
  // earlier, during bootstrapPage) also closes any open
  // .drawer-overlay — but it fires FIRST (listener registration
  // order) and only removes the "is-open" class, so by the time a
  // guard here checked "is the drawer still open" it would already
  // read false and skip this page's own cleanup (clearing the
  // selected-cell outline). close() is idempotent when already
  // closed, so this just always runs it rather than racing that check.
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") close();
  });
}

function renderResults(config) {
  const statusMount = document.querySelector("[data-rfm-status]");
  const gridSection = document.querySelector("[data-rfm-grid-section]");
  const segSection = document.querySelector("[data-rfm-segments-section]");

  const gridData = getGridData(config);
  if (gridData.dataAvailabilityError) {
    statusMount.innerHTML = `<div class="state-empty"><span class="state-empty__icon"><i data-lucide="alert-triangle"></i></span><h2 class="state-empty__title">Data not available</h2><p class="state-empty__description">${gridData.dataAvailabilityError}</p></div>`;
    gridSection.hidden = true;
    segSection.hidden = true;
    refreshIcons();
    return;
  }
  if (!gridData.total) {
    statusMount.innerHTML = `<div class="state-empty"><span class="state-empty__icon"><i data-lucide="search-x"></i></span><h2 class="state-empty__title">No eligible, scored customers</h2><p class="state-empty__description">No customers match the active filters with a known asset tier and a large enough tier population (minimum 10) to score reliably. Try widening the filters.</p></div>`;
    gridSection.hidden = true;
    segSection.hidden = true;
    refreshIcons();
    return;
  }

  statusMount.innerHTML = "";
  gridSection.hidden = false;
  segSection.hidden = false;

  const gridMount = document.querySelector("[data-rfm-grid]");
  gridMount.innerHTML = renderRfmGridHTML({ cells: gridData.cells, formatM: formatCompactVnd });
  wireRfmGridInteractivity(gridMount, (r, f) => openRfmCellDrawer(r, f, config));

  const segData = getSegmentList(config);
  const tbody = document.querySelector("[data-rfm-segments-table] tbody");
  tbody.innerHTML = segData.rows
    .map(
      (r) => `
    <tr>
      <td class="cell-primary"><span class="rfm-segment-row__swatch" style="background: var(${SEGMENT_COLOR_VAR[r.segment] || "--chart-neutral"});"></span>${r.segment}</td>
      <td class="cell-muted">${r.description}</td>
      <td class="num">${r.count}</td>
      <td class="num">${r.pct}%</td>
      <td class="num">${formatCompactVnd(r.aggregateM)}</td>
      <td><button type="button" class="btn btn--outline btn--sm" data-rfm-export="${r.segment}" ${r.count === 0 ? "disabled" : ""}>Export</button></td>
    </tr>`
    )
    .join("");

  tbody.querySelectorAll("[data-rfm-export]").forEach((btn) => {
    btn.addEventListener("click", () => exportSegmentCsv(btn.dataset.rfmExport, config));
  });

  refreshIcons();
}

export function initRfmAnalytics() {
  currentConfig = loadRfmConfig();
  initForm(currentConfig);
  renderSummary(currentConfig);
  renderResults(currentConfig);
  initRfmCellDrawer();

  document.querySelector("[data-rfm-config-form]").addEventListener("submit", (e) => {
    e.preventDefault();
    currentConfig = saveRfmConfig(readFormConfig());
    renderSummary(currentConfig);
    renderResults(currentConfig);
  });

  document.querySelector("[data-rfm-reset]").addEventListener("click", () => {
    currentConfig = resetRfmConfig();
    initForm(currentConfig);
    renderSummary(currentConfig);
    renderResults(currentConfig);
  });

  refreshIcons();
}
