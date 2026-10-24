/*
  PHS CDP — RFM Grid chart primitive.

  A 5x5 Recency(x) x Frequency(y) grid, used by BOTH the RFM Analytics
  page and Customer 360's RFM view (via a highlighted cell) — kept
  shared, not Customer-360-local, since it's no longer scoped to that
  one module. Built the same dependency-free way as every other chart
  in this app (plain HTML/CSS, no charting library).

  COLOR SYSTEM (revised): each segment maps to a color FAMILY, same as
  before (SEGMENT_COLOR_VAR) — what changed is HOW a shade is chosen.
  The previous version blended a single mid-tone color at low opacity
  onto the page's near-white background, which read as uniformly pale
  regardless of magnitude. This version picks one of three SOLID,
  pre-defined token shades per family (light/mid/dark — all already
  defined in css/tokens.css, no new tokens) based on the cell's count
  relative to the grid's max, and flips text color (dark-on-light vs.
  light-on-dark) to match, so every populated cell stays legible at
  full contrast rather than fading into the background.

  Each cell always maps to exactly ONE segment (assignSegment(r,f) is
  a pure function of r,f alone) — `cell.segments` is still joined
  generically rather than hard-assuming length 1, so this degrades
  gracefully if that ever changes, but in practice there is never an
  ambiguous multi-segment cell to disambiguate.

  Populated cells are real, keyboard-operable buttons — `onCellSelect`
  is a plain callback the caller supplies (grid stays a pure rendering
  primitive with zero page-specific drawer/navigation logic baked in).
*/

export const SEGMENT_COLOR_VAR = {
  Champions: "--chart-green",
  "Loyal Customers": "--chart-green",
  "Potential Loyalists": "--chart-teal",
  "Recent Customers": "--chart-teal",
  Promising: "--chart-gold",
  "Need Attention": "--chart-gold",
  "About to Sleep": "--chart-neutral",
  "At Risk": "--chart-red",
  "Cannot Lose Them": "--chart-red",
  Hibernating: "--chart-neutral",
};

// Short in-cell labels — full names are long ("Potential Loyalists",
// "Cannot Lose Them") and would overflow a ~90px cell; the full name
// is always still available in the tooltip/aria-label.
const SEGMENT_SHORT_LABEL = {
  Champions: "Champions",
  "Loyal Customers": "Loyal",
  "Potential Loyalists": "Potential",
  "Recent Customers": "Recent",
  Promising: "Promising",
  "Need Attention": "Attention",
  "About to Sleep": "Sleepy",
  "At Risk": "At Risk",
  "Cannot Lose Them": "Can't Lose",
  Hibernating: "Hibernating",
};

// Three solid shade tiers per color family — light tier gets dark
// text, mid/dark tiers get light text. Reuses existing token ramps
// only (css/tokens.css), nothing new defined here.
const SHADE_TIERS = {
  "--chart-green": { light: "--color-primary-100", mid: "--color-primary-500", dark: "--color-primary-700" },
  "--chart-teal": { light: "--color-teal-300", mid: "--color-teal-500", dark: "--color-teal-700" },
  "--chart-gold": { light: "--color-gold-100", mid: "--color-gold-500", dark: "--color-gold-700" },
  "--chart-red": { light: "--color-danger-100", mid: "--color-danger-500", dark: "--color-danger-700" },
  "--chart-neutral": { light: "--color-ink-200", mid: "--color-ink-600", dark: "--color-ink-800" },
};

/** One consistent, solid color per segment (the family's "mid" shade)
 * — used by the Treemap, where color encodes segment identity and
 * rectangle AREA (not shade) encodes magnitude, so the two visual
 * channels are never conflated. */
export function segmentSolidColorVar(segment) {
  const colorVar = SEGMENT_COLOR_VAR[segment] || "--chart-neutral";
  return SHADE_TIERS[colorVar].mid;
}

export { SEGMENT_SHORT_LABEL, SHADE_TIERS };

function shadeTierFor(count, maxCount) {
  if (!count) return "empty";
  const ratio = count / maxCount;
  if (ratio >= 0.6) return "dark";
  if (ratio >= 0.25) return "mid";
  return "light";
}

function formatCompactVnd(n) {
  if (!n) return "₫0";
  if (n >= 1_000_000_000) return `₫${(n / 1_000_000_000).toFixed(n % 1_000_000_000 === 0 ? 0 : 1)}B`;
  if (n >= 1_000_000) return `₫${(n / 1_000_000).toFixed(n % 1_000_000 === 0 ? 0 : 1)}M`;
  return `₫${n.toLocaleString("en-US")}`;
}

/**
 * @param {object} config
 * @param {object[]} config.cells - from engine.getGridData(...).cells: {r,f,count,pct,aggregateM,segments}
 * @param {{r:number,f:number,customerId:string,segment:string}} [config.highlight] - Customer 360's selected customer
 * @param {(n:number)=>string} [config.formatM]
 * @param {boolean} [config.interactive] - when true, populated cells render as real buttons with a data-rfm-cell attribute for the caller to wire click/keydown on (see wireRfmGridInteractivity below)
 */
export function renderRfmGridHTML({ cells, highlight, formatM = formatCompactVnd, interactive = true }) {
  const byCoord = new Map(cells.map((c) => [`${c.r}-${c.f}`, c]));
  const maxCount = Math.max(1, ...cells.map((c) => c.count));

  const rows = [];
  for (let f = 5; f >= 1; f--) {
    const rowCells = [];
    for (let r = 1; r <= 5; r++) {
      const cell = byCoord.get(`${r}-${f}`) || { r, f, count: 0, pct: 0, aggregateM: 0, segments: [] };
      const isHighlighted = highlight && highlight.r === r && highlight.f === f;
      const primarySegment = cell.segments[0] || null;
      const colorVar = primarySegment ? SEGMENT_COLOR_VAR[primarySegment] || "--chart-neutral" : "--chart-neutral";
      const tier = shadeTierFor(cell.count, maxCount);
      const isEmpty = tier === "empty";
      const shadeVar = isEmpty ? null : SHADE_TIERS[colorVar][tier];
      const textColorVar = tier === "light" ? "--text-primary" : "--text-on-dark";
      const title = cell.count
        ? `R${r} × F${f} — ${cell.count} customer${cell.count === 1 ? "" : "s"} (${cell.pct}%) — ${cell.segments.join(", ") || "—"} — ${formatM(cell.aggregateM)}${isHighlighted ? ` — Selected Customer: ${highlight.customerId}` : ""}${interactive ? " — click for customer list" : ""}`
        : `R${r} × F${f} — no customers in this cell`;
      const shortLabel = primarySegment ? SEGMENT_SHORT_LABEL[primarySegment] || primarySegment : "";

      const cellStyle = isEmpty ? "" : `background: var(${shadeVar}); color: var(${textColorVar});`;
      const canClick = interactive && !isEmpty;
      const classes = ["rfm-grid__cell", isEmpty ? "rfm-grid__cell--empty" : `rfm-grid__cell--${tier}`, isHighlighted ? "rfm-grid__cell--highlight" : "", canClick ? "rfm-grid__cell--clickable" : ""]
        .filter(Boolean)
        .join(" ");
      const interactiveAttrs = canClick ? `role="button" tabindex="0" data-rfm-cell data-rfm-r="${r}" data-rfm-f="${f}"` : isEmpty ? "" : `tabindex="0"`;

      rowCells.push(`
        <div class="${classes}" style="${cellStyle}" title="${title}" aria-label="${title}" ${interactiveAttrs}>
          ${
            cell.count
              ? `<span class="rfm-grid__segment">${shortLabel}</span><span class="rfm-grid__count">${cell.count}</span><span class="rfm-grid__pct">${cell.pct}%</span><span class="rfm-grid__m">${formatM(cell.aggregateM)}</span>`
              : ""
          }
          ${isHighlighted ? `<span class="rfm-grid__marker" aria-hidden="true">★</span>` : ""}
        </div>`);
    }
    rows.push(`<div class="rfm-grid__row"><span class="rfm-grid__ylabel">F${f}</span><div class="rfm-grid__cells">${rowCells.join("")}</div></div>`);
  }

  const xAxis = `<div class="rfm-grid__row rfm-grid__row--axis"><span class="rfm-grid__ylabel"></span><div class="rfm-grid__cells">${[1, 2, 3, 4, 5].map((r) => `<span class="rfm-grid__xlabel">R${r}</span>`).join("")}</div></div>`;

  return `
    <div class="rfm-grid">
      <div class="rfm-grid__body">${rows.join("")}</div>
      ${xAxis}
      <div class="rfm-grid__axistitles">
        <span>Recency score (1 = least recent, 5 = most recent) →</span>
      </div>
    </div>`;
}

/**
 * Wires click + Enter/Space on every interactive cell inside `root`.
 * `onCellSelect(r, f)` is called with the cell's numeric coordinates —
 * what happens next (opening a drawer, fetching customers, etc.) is
 * entirely the caller's responsibility, keeping this file a pure
 * rendering + low-level interaction primitive.
 */
export function wireRfmGridInteractivity(root, onCellSelect) {
  root.querySelectorAll("[data-rfm-cell]").forEach((cell) => {
    const r = Number(cell.dataset.rfmR);
    const f = Number(cell.dataset.rfmF);
    cell.addEventListener("click", () => onCellSelect(r, f));
    cell.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        onCellSelect(r, f);
      }
    });
  });
}

export { formatCompactVnd };
