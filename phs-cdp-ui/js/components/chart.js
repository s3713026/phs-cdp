/**
 * Dependency-free multi-series line/area chart, rendered as one SVG
 * string. No charting library — this is the one place that needs
 * real geometry; everything else in the chart system is CSS bars.
 *
 * Includes a shared, point-level tooltip: hovering anywhere over an
 * x-axis column shows every series' exact value at that column (not
 * just whichever series the pointer happens to be closest to), via
 * invisible full-height hit columns rather than relying on native
 * SVG hover states (which only fire on the tiny dot itself and only
 * for one series at a time).
 *
 * @param {HTMLElement} container
 * @param {object} config
 * @param {{name:string, color:string, values:number[]}[]} config.series
 * @param {string[]} config.labels - x-axis tick labels, one per point
 * @param {(n:number) => string} [config.formatValue] - y-axis / legend / tooltip formatter
 * @param {number} [config.yTicks] - number of Y-axis gridlines (default 4,
 *   unchanged for every existing caller that doesn't pass it). Added so a
 *   caller with a small integer max (e.g. a handful of events/day) can pass
 *   a smaller tick count — with the default 4 steps, a small max rounds to
 *   visibly duplicated adjacent labels (e.g. "0, 1, 1, 2, 2").
 */
export function renderLineChart(container, { series, labels, formatValue = String, yTicks = 4 }) {
  const width = 680;
  const height = 240;
  const padding = { top: 12, right: 8, bottom: 26, left: 54 };
  const innerW = width - padding.left - padding.right;
  const innerH = height - padding.top - padding.bottom;

  const allValues = series.flatMap((s) => s.values);
  const maxRaw = Math.max(...allValues);
  const max = maxRaw * 1.12;
  const min = 0;
  const pointCount = labels.length;

  const x = (i) => padding.left + (pointCount === 1 ? 0 : (i / (pointCount - 1)) * innerW);
  const y = (v) => padding.top + innerH - ((v - min) / (max - min)) * innerH;

  const gridSteps = yTicks;
  const gridLines = Array.from({ length: gridSteps + 1 }, (_, i) => {
    const value = (max / gridSteps) * i;
    const gy = y(value);
    return `
      <line class="chart-line__grid-line" x1="${padding.left}" x2="${width - padding.right}" y1="${gy}" y2="${gy}"></line>
      <text x="${padding.left - 10}" y="${gy + 3}" text-anchor="end">${formatValue(value)}</text>`;
  }).join("");

  const axisLabels = labels
    .map((label, i) => `<text x="${x(i)}" y="${height - 4}" text-anchor="middle">${label}</text>`)
    .join("");

  // Area fill only under series that opt in (config.area:true) — with
  // three series, filling all of them stacks into a muddy blend, so by
  // default only the primary/headline series gets a soft area under
  // its line and the rest render as clean lines.
  const areas = series
    .filter((s) => s.area)
    .map((s) => {
      const linePoints = s.values.map((v, i) => `${x(i)},${y(v)}`).join(" L ");
      const areaPath = `M ${x(0)},${y(0)} L ${linePoints} L ${x(pointCount - 1)},${y(0)} Z`;
      return `<path class="chart-line__area" d="${areaPath}" fill="${s.color}"></path>`;
    })
    .join("");

  const lines = series
    .map((s) => {
      const linePoints = s.values.map((v, i) => `${x(i)},${y(v)}`).join(" L ");
      return `<path class="chart-line__line" d="M ${linePoints}" stroke="${s.color}"></path>`;
    })
    .join("");

  const dots = series
    .map((s, si) =>
      s.values
        .map((v, i) => `<circle class="chart-line__dot" data-point-index="${i}" data-series-index="${si}" cx="${x(i)}" cy="${y(v)}" r="3" fill="${s.color}"></circle>`)
        .join("")
    )
    .join("");

  // Invisible full-height hit columns, one per x position — this is
  // what actually receives the pointer, not the 3px dots, so hovering
  // anywhere in a column reliably shows that column's shared tooltip.
  const colWidth = pointCount > 1 ? innerW / (pointCount - 1) : innerW;
  const hitColumns = labels
    .map((_, i) => {
      const cx = x(i);
      const hitX = pointCount === 1 ? padding.left : cx - colWidth / 2;
      const hitW = pointCount === 1 ? innerW : colWidth;
      return `<rect class="chart-line__hit" data-point-index="${i}" x="${Math.max(padding.left, hitX)}" y="${padding.top}" width="${hitW}" height="${innerH}" fill="transparent"></rect>`;
    })
    .join("");

  const guideLine = `<line class="chart-line__guide" x1="0" x2="0" y1="${padding.top}" y2="${padding.top + innerH}" hidden></line>`;

  container.innerHTML = `
    <div class="chart-line">
      <svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Chart">
        <g class="chart-line__grid">${gridLines}</g>
        ${areas}
        ${lines}
        ${guideLine}
        ${dots}
        <g class="chart-line__axis">${axisLabels}</g>
        <g class="chart-line__hits">${hitColumns}</g>
      </svg>
      <div class="chart-line__tooltip" hidden></div>
      <div class="chart-legend">
        ${series
          .map(
            (s) => `
          <span class="chart-legend__item">
            <span class="chart-legend__dot" style="background:${s.color}"></span>
            <span class="chart-legend__label">${s.name}</span>
            <span class="chart-legend__value">${formatValue(s.values[s.values.length - 1])}</span>
          </span>`
          )
          .join("")}
      </div>
    </div>
  `;

  wireTooltip(container, { series, labels, formatValue, x });
}

function wireTooltip(container, { series, labels, formatValue, x }) {
  const wrap = container.querySelector(".chart-line");
  const svg = container.querySelector("svg");
  const tooltip = container.querySelector(".chart-line__tooltip");
  const guide = container.querySelector(".chart-line__guide");
  const hitEls = container.querySelectorAll(".chart-line__hit");

  function showAt(index) {
    // Highlight every series' dot at this column, not just one.
    container.querySelectorAll(".chart-line__dot").forEach((dot) => {
      dot.classList.toggle("is-active", Number(dot.dataset.pointIndex) === index);
    });

    guide.setAttribute("x1", x(index));
    guide.setAttribute("x2", x(index));
    guide.hidden = false;

    tooltip.innerHTML = `
      <div class="chart-line__tooltip-title">${labels[index]}</div>
      ${series
        .map(
          (s) => `<div class="chart-line__tooltip-row">
            <span class="chart-line__tooltip-dot" style="background:${s.color}"></span>
            <span class="chart-line__tooltip-label">${s.name}</span>
            <span class="chart-line__tooltip-value">${formatValue(s.values[index])}</span>
          </div>`
        )
        .join("")}`;
    tooltip.hidden = false;

    // Position in real (post-layout) pixels, since the SVG's viewBox
    // coordinates get scaled to whatever width the container actually
    // renders at — a plain viewBox->CSS-px conversion would drift.
    const wrapRect = wrap.getBoundingClientRect();
    const svgRect = svg.getBoundingClientRect();
    const scaleX = svgRect.width / 680;
    const pointPx = x(index) * scaleX;
    const tipWidth = tooltip.offsetWidth;
    let left = pointPx + 12;
    if (left + tipWidth > wrapRect.width) left = pointPx - tipWidth - 12;
    tooltip.style.left = `${Math.max(0, left)}px`;
    tooltip.style.top = `8px`;
  }

  function hide() {
    tooltip.hidden = true;
    guide.hidden = true;
    container.querySelectorAll(".chart-line__dot.is-active").forEach((dot) => dot.classList.remove("is-active"));
  }

  hitEls.forEach((rect) => {
    const index = Number(rect.dataset.pointIndex);
    rect.addEventListener("mouseenter", () => showAt(index));
    rect.addEventListener("mousemove", () => showAt(index));
  });
  svg.addEventListener("mouseleave", hide);
}
