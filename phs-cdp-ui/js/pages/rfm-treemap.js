/*
  PHS CDP — RFM Treemap chart primitive (Customer 360 only).

  CleverTap-style segment treemap: rectangle AREA is strictly
  proportional to each segment's real eligible-population count, from
  the same shared engine (js/data/rfm/engine.js's getSegmentList) the
  R/F Grid and segment table already use — no hardcoded or
  imitation-screenshot dimensions. Built the same dependency-free way
  as every other chart in this app: a standard squarified-treemap
  layout (Bruls/Huizing/van Wijk) computed in plain JS, rendered as
  absolutely-positioned HTML/CSS rectangles — no charting library.

  Color encodes segment identity (one consistent solid shade per
  segment, via rfm-grid.js's segmentSolidColorVar — the SAME
  segment→color mapping the Grid uses); area encodes magnitude. The
  two channels are never conflated, and identity/stats are always
  additionally conveyed as text (aria-label/title and, space
  permitting, inline label) — never color-only.
*/

import { segmentSolidColorVar, formatCompactVnd } from "./rfm-grid.js";

const VIEWBOX_WIDTH = 1000;
const VIEWBOX_HEIGHT = 380;

/**
 * Standard squarified treemap layout.
 * @param {{value:number}[]} items - must have value > 0; NOT mutated
 * @param {number} width
 * @param {number} height
 * @returns {object[]} items with added {x, y, w, h} in the same [0,width]x[0,height] space
 */
export function layoutTreemap(items, width, height) {
  const sorted = [...items].sort((a, b) => b.value - a.value);
  const totalValue = sorted.reduce((s, i) => s + i.value, 0);
  if (!totalValue || !width || !height) return [];

  const totalArea = width * height;
  const scale = totalArea / totalValue;
  const pool = sorted.map((item) => ({ ...item, area: item.value * scale }));

  function worst(row, sideLength) {
    const sum = row.reduce((a, b) => a + b.area, 0);
    const maxA = Math.max(...row.map((r) => r.area));
    const minA = Math.min(...row.map((r) => r.area));
    const s2 = sideLength * sideLength;
    return Math.max((s2 * maxA) / (sum * sum), (sum * sum) / (s2 * minA));
  }

  const result = [];
  let remaining = pool;
  let rx = 0;
  let ry = 0;
  let rw = width;
  let rh = height;

  while (remaining.length) {
    const sideLength = Math.min(rw, rh);
    let row = [remaining[0]];
    let idx = 1;
    while (idx < remaining.length) {
      const trial = row.concat(remaining[idx]);
      if (worst(trial, sideLength) <= worst(row, sideLength)) {
        row = trial;
        idx++;
      } else break;
    }
    remaining = remaining.slice(row.length);

    const rowArea = row.reduce((a, b) => a + b.area, 0);
    if (rw >= rh) {
      const stripWidth = rowArea / rh;
      let offsetY = ry;
      row.forEach((item) => {
        const itemHeight = item.area / stripWidth;
        result.push({ ...item, x: rx, y: offsetY, w: stripWidth, h: itemHeight });
        offsetY += itemHeight;
      });
      rx += stripWidth;
      rw -= stripWidth;
    } else {
      const stripHeight = rowArea / rw;
      let offsetX = rx;
      row.forEach((item) => {
        const itemWidth = item.area / stripHeight;
        result.push({ ...item, x: offsetX, y: ry, w: itemWidth, h: stripHeight });
        offsetX += itemWidth;
      });
      ry += stripHeight;
      rh -= stripHeight;
    }
  }
  return result;
}

/**
 * @param {object} config
 * @param {object[]} config.rows - from engine.getSegmentList(config).rows: {segment,description,count,pct,aggregateM}
 * @param {string|null} [config.highlightSegment] - Customer 360's current customer's segment, only when actually available
 * @param {(n:number)=>string} [config.formatM]
 */
export function renderRfmTreemapHTML({ rows, highlightSegment = null, formatM = formatCompactVnd }) {
  const populated = rows.filter((r) => r.count > 0);
  const empty = rows.filter((r) => r.count === 0);

  if (!populated.length) {
    return `<p class="table__empty">No eligible, scored customers to size a treemap from under the active configuration.</p>`;
  }

  const rects = layoutTreemap(populated.map((r) => ({ ...r, value: r.count })), VIEWBOX_WIDTH, VIEWBOX_HEIGHT);

  const cells = rects
    .map((rect) => {
      const isHighlighted = highlightSegment && rect.segment === highlightSegment;
      const colorVar = segmentSolidColorVar(rect.segment);
      const wPct = (rect.w / VIEWBOX_WIDTH) * 100;
      const hPct = (rect.h / VIEWBOX_HEIGHT) * 100;
      const xPct = (rect.x / VIEWBOX_WIDTH) * 100;
      const yPct = (rect.y / VIEWBOX_HEIGHT) * 100;

      const highlightNote = isHighlighted
        ? " — includes the currently viewed customer's segment (this segment contains many customers, not only this one)"
        : "";
      const label = `${rect.segment} — ${rect.count} customer${rect.count === 1 ? "" : "s"} (${rect.pct}%) — aggregate M ${formatM(rect.aggregateM)}${highlightNote}`;

      const showFull = rect.w >= 140 && rect.h >= 70;
      const showCompact = !showFull && rect.w >= 80 && rect.h >= 38;
      let inner = "";
      if (showFull) {
        inner = `<span class="rfm-treemap__label">${rect.segment}${isHighlighted ? ' <span class="rfm-treemap__badge">Current segment</span>' : ""}</span><span class="rfm-treemap__stats">${rect.count} · ${rect.pct}% · ${formatM(rect.aggregateM)}</span>`;
      } else if (showCompact) {
        inner = `<span class="rfm-treemap__label">${rect.segment}</span><span class="rfm-treemap__stats">${rect.count}</span>`;
      }

      const classes = ["rfm-treemap__rect", isHighlighted ? "rfm-treemap__rect--highlight" : ""].filter(Boolean).join(" ");

      return `
        <div class="${classes}"
          style="left:${xPct}%; top:${yPct}%; width:${wPct}%; height:${hPct}%; background: var(${colorVar});"
          role="button" tabindex="0" data-rfm-segment="${rect.segment}"
          title="${label}" aria-label="${label}">
          ${inner}
        </div>`;
    })
    .join("");

  const emptyNote = empty.length
    ? `<p class="rfm-treemap__empty-note">Not currently represented: ${empty.map((r) => r.segment).join(", ")} (0 customers under the active configuration).</p>`
    : "";

  return `<div class="rfm-treemap">${cells}</div>${emptyNote}`;
}

/**
 * Wires click + Enter/Space on every treemap rectangle inside `root`.
 * `onSegmentSelect(segmentName)` — what happens next (opening a
 * drawer) is entirely the caller's responsibility, keeping this file
 * a pure rendering + low-level interaction primitive, same shape as
 * rfm-grid.js's wireRfmGridInteractivity.
 */
export function wireRfmTreemapInteractivity(root, onSegmentSelect) {
  root.querySelectorAll("[data-rfm-segment]").forEach((rect) => {
    const segment = rect.dataset.rfmSegment;
    rect.addEventListener("click", () => onSegmentSelect(segment));
    rect.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        onSegmentSelect(segment);
      }
    });
  });
}
