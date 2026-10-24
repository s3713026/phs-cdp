/*
  PHS CDP — RFM segment/cell aggregate detail panel.

  Shared by rfm-analytics.js and customer-360.js — both open this
  content inside their own existing drawer (Customer 360's
  #c360-detail-drawer, Analytics' #rfm-cell-drawer), so there is one
  implementation of "what a segment/cell's detail looks like", not
  two.

  PRIVACY: this panel is strictly aggregate-only. It never receives,
  renders, or exports a customer ID, name, email, phone number, or any
  other row-level record — only counts, percentages, aggregate
  monetary totals, and a tier-count breakdown, all computed by
  js/data/rfm/engine.js's getCellAggregateDetail/getSegmentAggregateDetail
  (which themselves never return member rows). This app has no
  backend authorization or audit system, so identifiable-data export
  is not offered here — export is limited to the same aggregate
  fields already shown on screen. A previous version of this file
  rendered a searchable/sortable per-customer table; that table has
  been removed entirely, not just hidden.
*/

function formatCompactVnd(n) {
  if (!n) return "₫0";
  if (n >= 1_000_000_000) return `₫${(n / 1_000_000_000).toFixed(n % 1_000_000_000 === 0 ? 0 : 1)}B`;
  if (n >= 1_000_000) return `₫${(n / 1_000_000).toFixed(n % 1_000_000 === 0 ? 0 : 1)}M`;
  return `₫${n.toLocaleString("en-US")}`;
}

function exportAggregateCsv(meta) {
  const header = ["Field", "Value"];
  const body = [
    ["Kind", meta.kind],
    meta.kind === "cell" ? ["R Score", meta.r] : null,
    meta.kind === "cell" ? ["F Score", meta.f] : null,
    ["Segment", meta.segment || "—"],
    meta.description ? ["Description", meta.description] : null,
    ["Customers", meta.count],
    ["Percent of eligible population", `${meta.pct}%`],
    ["Aggregate Monetary", meta.aggregateM],
    ["Monetary definition", meta.monetaryLabel || "—"],
    ...(meta.tierDistribution ? Object.entries(meta.tierDistribution).map(([tier, count]) => [`Tier — ${tier}`, count]) : []),
    ["Reference date", meta.referenceDate || "—"],
    ["Lookback window (days)", meta.lookbackDays ?? "—"],
  ].filter(Boolean);
  const csvBody = [header, ...body].map((r) => r.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(",")).join("\n");
  const disclosure = `"SYNTHETIC DEMO DATA — for UI demonstration and validation only, not real PHS customer data. Aggregate statistics only — no individual customer records."\n`;
  const blob = new Blob([disclosure + csvBody], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  const nameBit = meta.kind === "cell" ? `r${meta.r}-f${meta.f}` : (meta.segment || "segment").toLowerCase().replace(/\s+/g, "-");
  a.download = `rfm-${meta.kind}-${nameBit}-summary.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/**
 * @param {object} meta - the object returned by engine.getCellAggregateDetail
 *   or engine.getSegmentAggregateDetail, plus: { referenceDate, lookbackDays,
 *   rMetricLabel, mMetricLabel, formatM, includesCurrentCustomer }
 */
export function renderRfmAggregateDetailHTML(meta) {
  const { kind, r, f, segment, description, count, pct, aggregateM, tierDistribution, monetaryLabel, referenceDate, lookbackDays, rMetricLabel, mMetricLabel, formatM = formatCompactVnd, includesCurrentCustomer } = meta;

  const scoreRow = kind === "cell" ? `<div class="attr-item"><span class="attr-item__label">R / F Score</span><span class="attr-item__value">R${r}/5 · F${f}/5</span></div>` : "";

  const descriptionBlock = kind === "segment" && description ? `<p style="font-size: var(--text-sm); color: var(--text-primary); margin: 0 0 var(--space-3);">${description}</p>` : "";

  const summary = `
    ${descriptionBlock}
    <div class="attr-grid" style="margin-bottom: var(--space-3);">
      <div class="attr-item"><span class="attr-item__label">Segment</span><span class="attr-item__value">${segment || "—"}</span></div>
      ${scoreRow}
      <div class="attr-item"><span class="attr-item__label">Customers</span><span class="attr-item__value">${count} (${pct}%)</span></div>
      <div class="attr-item"><span class="attr-item__label">Aggregate M</span><span class="attr-item__value">${formatM(aggregateM)}</span></div>
      <div class="attr-item"><span class="attr-item__label">Reference Date</span><span class="attr-item__value">${referenceDate || "—"}</span></div>
      <div class="attr-item"><span class="attr-item__label">Lookback Window</span><span class="attr-item__value">${lookbackDays != null ? `${lookbackDays} days` : "—"}</span></div>
    </div>
    ${rMetricLabel || mMetricLabel ? `<p style="font-size: var(--text-xs); color: var(--text-secondary); margin: 0 0 var(--space-3);"><strong>R / M Metric:</strong> ${rMetricLabel || "—"} / ${mMetricLabel || "—"}</p>` : ""}`;

  const tierRows = tierDistribution
    ? `
    <p class="subhead" style="margin: var(--space-3) 0 var(--space-2);">Asset tier distribution</p>
    <div class="rfm-aggregate-detail__tier-row">
      ${Object.entries(tierDistribution)
        .map(([tier, tierCount]) => `<span class="badge badge--neutral">${tier}: ${tierCount}</span>`)
        .join("")}
    </div>`
    : "";

  const currentCustomerNote =
    includesCurrentCustomer === true
      ? `<p class="rfm-aggregate-detail__current-note"><i data-lucide="user-check"></i>Includes the customer currently being viewed — this ${kind === "cell" ? "cell" : "segment"} contains multiple customers, not only this one.</p>`
      : "";

  const emptyState = !count ? `<p class="table__empty" style="margin: var(--space-3) 0;">No customers currently in this ${kind === "cell" ? "cell" : "segment"} under the active configuration.</p>` : "";

  const footer = `
    <div class="cluster gap-2" style="margin-top: var(--space-4);">
      <button type="button" class="btn btn--outline btn--sm" data-rfm-aggregate-export><i data-lucide="download"></i>Export summary (CSV)</button>
    </div>
    <p class="rfm-aggregate-detail__note">${monetaryLabel ? `${monetaryLabel} ` : ""}Aggregate statistics only. This prototype has no backend authorization or audit system, so individual customer records are never shown or exported here.</p>`;

  return `${summary}${currentCustomerNote}${emptyState}${tierRows}${footer}`;
}

/**
 * @param {HTMLElement} container - the element renderRfmAggregateDetailHTML's output was written into
 * @param {object} meta - same object passed to renderRfmAggregateDetailHTML
 */
export function wireRfmAggregateDetailInteractivity(container, meta) {
  container.querySelector("[data-rfm-aggregate-export]")?.addEventListener("click", () => exportAggregateCsv(meta));
}
