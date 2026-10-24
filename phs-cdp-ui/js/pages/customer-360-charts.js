/*
  PHS CDP — Customer 360-only chart primitives.

  Covers the chart TYPES the shared, dependency-free chart system
  (js/components/chart.js's renderLineChart, css/components/chart.css's
  .chart-vbars/.chart-hbars) doesn't have: heatmap, donut, funnel, and
  a small generic chart-type-switch control. Same philosophy as the
  shared system — plain SVG/HTML/CSS, no charting library — kept in
  this Customer-360-local file (new CSS lives in profile.css under new
  class names) rather than edited into the shared chart.css/chart.js,
  so Dashboard / Data Quality / Audience Insights (the shared system's
  other consumers) are at zero risk from this work.

  Every render* function here returns an HTML string (same convention
  as every other render*HTML helper in js/pages/customer-360.js) —
  callers do `mount.innerHTML = renderXHTML(...)` and then wire any
  interactivity afterward, exactly like the rest of this page already
  does for tabs, drawers, and the customer switcher.
*/

/* ------------------------------------------------------------------ */
/* Chart-type switch — one small generic control, reused by every     */
/* switchable chart. Guarantees "switching preserves the same under-  */
/* lying data" by construction: callers pass one `render(viewId)`      */
/* closure that always reads from the same already-computed data, so  */
/* there is exactly one calculation per chart, never one per view.    */
/* ------------------------------------------------------------------ */
export function chartSwitchHTML(switchId, views, activeView) {
  return `<div class="c360-chart-switch" data-chart-switch="${switchId}" role="group" aria-label="Chart view">
    ${views
      .map(
        (v) => `<button type="button" class="c360-chart-switch__btn${v.id === activeView ? " is-active" : ""}" data-switch-view="${v.id}" aria-pressed="${v.id === activeView}">${v.label}</button>`
      )
      .join("")}
  </div>`;
}

/**
 * Wires a chart-switch group's buttons. `onChange(viewId)` is
 * responsible for re-rendering the chart's content slot and
 * refreshing icons — this function only manages button state.
 */
export function wireChartSwitch(root, switchId, onChange) {
  const group = root.querySelector(`[data-chart-switch="${switchId}"]`);
  if (!group) return;
  group.querySelectorAll("[data-switch-view]").forEach((btn) => {
    btn.addEventListener("click", () => {
      if (btn.classList.contains("is-active")) return;
      group.querySelectorAll("[data-switch-view]").forEach((b) => {
        b.classList.toggle("is-active", b === btn);
        b.setAttribute("aria-pressed", String(b === btn));
      });
      onChange(btn.dataset.switchView);
    });
  });
}

/* ------------------------------------------------------------------ */
/* Heatmap — generic rows × columns × intensity grid. Used for both   */
/* the Hour × Weekday chart and the Cohort Retention chart (one        */
/* implementation, two callers — never two separate heatmaps).        */
/* A cell value of `null` means "not yet observed / not applicable",  */
/* rendered distinctly from a real 0, never silently shown as 0.      */
/* ------------------------------------------------------------------ */
export function renderHeatmapHTML({ rowLabels, colLabels, matrix, cellTitle, formatCell, colorVar = "--chart-green" }) {
  const flat = matrix.flat().filter((v) => v !== null && v !== undefined);
  const max = Math.max(1, ...flat);
  const rows = rowLabels
    .map((rowLabel, r) => {
      const cells = colLabels
        .map((colLabel, c) => {
          const v = matrix[r][c];
          if (v === null || v === undefined) {
            return `<div class="c360-heatmap__cell c360-heatmap__cell--empty" title="${rowLabel} · ${colLabel}: not yet observed"></div>`;
          }
          const intensity = max > 0 ? v / max : 0;
          const title = cellTitle ? cellTitle(rowLabel, colLabel, v) : `${rowLabel} · ${colLabel}: ${v}`;
          const display = formatCell ? formatCell(v) : "";
          return `<div class="c360-heatmap__cell" style="background: var(${colorVar}); opacity: ${(0.1 + intensity * 0.8).toFixed(2)};" title="${title}">${display}</div>`;
        })
        .join("");
      return `<div class="c360-heatmap__row"><span class="c360-heatmap__rowlabel">${rowLabel}</span><div class="c360-heatmap__cells" style="grid-template-columns: repeat(${colLabels.length}, 1fr);">${cells}</div></div>`;
    })
    .join("");
  const header = `<div class="c360-heatmap__row c360-heatmap__row--header"><span class="c360-heatmap__rowlabel"></span><div class="c360-heatmap__cells" style="grid-template-columns: repeat(${colLabels.length}, 1fr);">${colLabels.map((l) => `<span class="c360-heatmap__collabel">${l}</span>`).join("")}</div></div>`;
  return `<div class="c360-heatmap">${header}${rows}</div>`;
}

/* ------------------------------------------------------------------ */
/* Donut chart — inline SVG, stroke-dasharray segments. Shows total   */
/* count + per-segment count/% in the legend, as required.            */
/* ------------------------------------------------------------------ */
export function renderDonutHTML({ segments, formatValue = String, centerLabel }) {
  const total = segments.reduce((s, x) => s + x.value, 0);
  // 200 (was 160) — a 25% diameter increase, same proportions.
  const size = 200;
  const radius = 70;
  const strokeWidth = 32;
  const circumference = 2 * Math.PI * radius;

  if (total === 0) {
    return `<div class="c360-donut"><svg viewBox="0 0 ${size} ${size}" role="img" aria-label="Donut chart, no data"><circle cx="${size / 2}" cy="${size / 2}" r="${radius}" fill="none" stroke="var(--color-ink-100)" stroke-width="${strokeWidth}"></circle></svg><p class="table__empty">No recorded events for this customer.</p></div>`;
  }

  let priorLength = 0;
  const arcs = segments
    .map((seg) => {
      const fraction = seg.value / total;
      const dash = fraction * circumference;
      const gap = circumference - dash;
      const offset = circumference - priorLength;
      priorLength += dash;
      const pct = Math.round(fraction * 100);
      return `<circle class="c360-donut__arc" cx="${size / 2}" cy="${size / 2}" r="${radius}" fill="none" stroke="${seg.color}" stroke-width="${strokeWidth}" stroke-dasharray="${dash.toFixed(2)} ${gap.toFixed(2)}" stroke-dashoffset="${offset.toFixed(2)}" transform="rotate(-90 ${size / 2} ${size / 2})"><title>${seg.label}: ${formatValue(seg.value)} (${pct}%)</title></circle>`;
    })
    .join("");

  const legend = `<div class="chart-legend">
    ${segments
      .map((seg) => {
        const pct = Math.round((seg.value / total) * 100);
        return `<span class="chart-legend__item"><span class="chart-legend__dot" style="background:${seg.color}"></span><span class="chart-legend__label">${seg.label}${seg.sublabel ? ` <span class="chart-hbar__sublabel">${seg.sublabel}</span>` : ""}</span><span class="chart-legend__value">${formatValue(seg.value)} (${pct}%)</span></span>`;
      })
      .join("")}
  </div>`;

  return `<div class="c360-donut"><svg viewBox="0 0 ${size} ${size}" role="img" aria-label="Donut chart">${arcs}<text x="${size / 2}" y="${size / 2 - 6}" text-anchor="middle" class="c360-donut__total">${formatValue(total)}</text><text x="${size / 2}" y="${size / 2 + 16}" text-anchor="middle" class="c360-donut__total-label">${centerLabel || "Total"}</text></svg>${legend}</div>`;
}

/* ------------------------------------------------------------------ */
/* Scatter — population points on Recency (x) × Frequency (y), with    */
/* one customer explicitly highlighted (larger, distinct color, its    */
/* own <title> tooltip). Recency is plotted INVERTED (higher x = more  */
/* recent) so "better" is visually up-and-right for both axes, with    */
/* axis labels stating the direction explicitly to avoid ambiguity.    */
/* ------------------------------------------------------------------ */
export function renderScatterHTML({ points, highlighted, xLabel, yLabel, xDomain, yDomain }) {
  const width = 640;
  const height = 320;
  const padding = { top: 16, right: 16, bottom: 40, left: 48 };
  const innerW = width - padding.left - padding.right;
  const innerH = height - padding.top - padding.bottom;

  const [xMin, xMax] = xDomain;
  const [yMin, yMax] = yDomain;
  const x = (v) => padding.left + ((v - xMin) / (xMax - xMin || 1)) * innerW;
  const y = (v) => padding.top + innerH - ((v - yMin) / (yMax - yMin || 1)) * innerH;

  const dots = points
    .map((p) => `<circle class="c360-scatter__dot" cx="${x(p.x).toFixed(1)}" cy="${y(p.y).toFixed(1)}" r="4" fill="var(--chart-neutral)" opacity="0.55"><title>${p.label}</title></circle>`)
    .join("");

  const highlightDot = highlighted
    ? `<circle class="c360-scatter__dot c360-scatter__dot--highlight" cx="${x(highlighted.x).toFixed(1)}" cy="${y(highlighted.y).toFixed(1)}" r="8" fill="var(--chart-gold)" stroke="var(--color-ink-0)" stroke-width="2"><title>${highlighted.label}</title></circle>`
    : "";

  const axisX = `<text x="${padding.left + innerW / 2}" y="${height - 6}" text-anchor="middle" class="c360-scatter__axis-label">${xLabel}</text>`;
  const axisY = `<text x="${14}" y="${padding.top + innerH / 2}" text-anchor="middle" transform="rotate(-90 14 ${padding.top + innerH / 2})" class="c360-scatter__axis-label">${yLabel}</text>`;

  const frame = `<rect x="${padding.left}" y="${padding.top}" width="${innerW}" height="${innerH}" fill="none" stroke="var(--color-ink-200)"></rect>`;

  return `
    <div class="c360-scatter">
      <svg viewBox="0 0 ${width} ${height}" role="img" aria-label="RFM scatter plot">
        ${frame}
        ${dots}
        ${highlightDot}
        ${axisX}
        ${axisY}
      </svg>
    </div>`;
}

/* ------------------------------------------------------------------ */
/* Funnel — centered, decreasing-width bars. The "Horizontal Bar"      */
/* switch variant is the EXACT same markup/data, just left-aligned —   */
/* one calculation, two renderings, per the chart-switch contract.    */
/* ------------------------------------------------------------------ */
export function renderFunnelHTML({ stages, centered = true, colorVar = "--chart-green" }) {
  const max = Math.max(1, ...stages.map((s) => s.count));
  const rows = stages
    .map((s) => {
      const pct = Math.round((s.count / max) * 100);
      return `
      <div class="c360-funnel__row${centered ? " c360-funnel__row--centered" : ""}" title="${s.stage}: ${s.count}">
        <span class="c360-funnel__label">${s.stage}</span>
        <div class="c360-funnel__track">
          <div class="c360-funnel__bar" style="width: ${pct}%; background: var(${colorVar});"></div>
        </div>
        <span class="c360-funnel__value">${s.count}</span>
      </div>`;
    })
    .join("");
  return `<div class="c360-funnel">${rows}</div>`;
}
