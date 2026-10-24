/*
  PHS CDP — the ONE canonical RFM calculation engine.

  Both the RFM Analytics page (js/pages/rfm-analytics.js) and Customer
  360's RFM view (js/pages/customer-360.js) import ONLY from this file
  for every RFM number they display. There is no second, independently
  written scoring implementation anywhere else in this app.

  Pipeline (matches the spec's Layer 3 steps exactly):
    1. Apply the active filters (branch/broker/management channel).
    2. Determine the eligible population.
    3. Apply the configured asset-value tiering (NAV-based).
    4. Calculate raw R, F, and M per customer.
    5. Calculate percentile-based 1–5 scores WITHIN each tier.
    6. Assign an RFM segment from the R/F score pair.
    7. Return compact customer-level results and segment aggregates.

  DOCUMENTED RULES (kept in one place, not re-derived per caller):
  - Population: customers whose CUSTOMER_DIMENSION row matches the
    active branch/broker/management-channel filters. Asset-type
    filtering happens at the per-order level (F/M only count orders of
    the selected type(s)), not at the population level.
  - Tiering: NAV-based — Whale >= 2B VND, Shark 200M–2B VND, Standard
    < 200M VND. Labeled everywhere as DEMO CONFIGURATION, not an
    approved PHS business definition. A customer with no NAV record is
    "Unknown" — NEVER folded into Standard.
  - Scoring population: quantile breakpoints (P20/P40/P60/P80) are
    computed WITHIN each tier, from that tier's own eligible members —
    a Whale and a Standard customer with the same raw Frequency can
    get different scores, because they're compared to their own peers,
    not the whole population. Minimum population per tier: 10 — below
    that, "insufficient population for reliable quintiles" is shown
    instead of a score (documented, not fabricated precision).
  - Score direction: Recency is INVERTED (fewer days since the
    qualifying event = higher score); Frequency and Monetary are not
    (higher = higher score).
  - Tie handling: ties fall into the same quantile bucket (standard
    "<= breakpoint" comparison) — ties never get artificially split.
  - Null handling: a customer with zero qualifying orders in the
    active window still gets Frequency = 0 and is scored normally
    (a real, low, non-fabricated result) — they are not excluded for
    that reason alone.
  - Recency metric: "Most recent matched-order date" (default) or
    "Most recent app login date". This prototype has NO login-event
    fixture, so selecting login-based Recency produces an explicit
    data-availability message for the WHOLE population — it never
    silently substitutes transaction recency instead.
  - Segments: 10 named segments mapped from the (R score, F score)
    pair via one ordered rule table (assignSegment, below), covering
    every one of the 25 possible combinations with an explicit
    fallback ("Hibernating") for whatever isn't named more
    specifically. Labeled as demo segment definitions, not an approved
    PHS taxonomy.
*/

import { CUSTOMER_DIMENSION, FACT_ORDER_MATCHED, ASSET_TYPES, BRANCHES, BROKERS, MANAGEMENT_CHANNELS, REFERENCE_DATE } from "./fixtures.js";
import { ordersInWindow, allOrdersForCustomer, latestNav, lastOrderDate, referenceDate } from "./aggregation.js";

export { ASSET_TYPES, BRANCHES, BROKERS, MANAGEMENT_CHANNELS, REFERENCE_DATE };

const MIN_TIER_POPULATION = 10;

const TIER_THRESHOLDS_VND = { whaleMin: 2_000_000_000, sharkMin: 200_000_000 };
export const TIER_DEFINITION_LABEL = "Demo configuration — not an approved PHS business definition.";
export function tierFor(navValue) {
  if (navValue == null) return "Unknown";
  if (navValue >= TIER_THRESHOLDS_VND.whaleMin) return "Whale";
  if (navValue >= TIER_THRESHOLDS_VND.sharkMin) return "Shark";
  return "Standard";
}
export const TIERS = ["Whale", "Shark", "Standard"];

export const SEGMENT_DEFINITIONS = [
  { name: "Champions", description: "Most recent and most frequent qualifying orders — your best current customers." },
  { name: "Loyal Customers", description: "Frequent qualifying orders, still reasonably recent." },
  { name: "Potential Loyalists", description: "Recent activity with a moderate order frequency — could become Loyal with more engagement." },
  { name: "Recent Customers", description: "Very recent activity but low order frequency so far." },
  { name: "Promising", description: "Below-average recency and frequency — early-stage, not yet established." },
  { name: "Need Attention", description: "Average recency and frequency — neither clearly engaged nor clearly lapsed." },
  { name: "About to Sleep", description: "Below-average recency with low frequency — engagement is fading." },
  { name: "At Risk", description: "Was frequent, but recency has dropped — a past-valuable customer going quiet." },
  { name: "Cannot Lose Them", description: "High historical frequency but very low recency — high-value customers who have gone quiet." },
  { name: "Hibernating", description: "Low recency and low frequency — minimal recent engagement (fallback bucket for any R/F combination not matched above)." },
];
export const SEGMENT_TAXONOMY_LABEL = "Demo segment definitions — not an approved PHS taxonomy.";

/** One ordered rule table, covers every (r,f) in 1..5 × 1..5. */
export function assignSegment(r, f) {
  if (r == null || f == null) return null;
  if (r >= 4 && f >= 4) return "Champions";
  if (r === 1 && f >= 4) return "Cannot Lose Them";
  if (r >= 3 && f >= 4) return "Loyal Customers";
  if (r >= 4 && f >= 2) return "Potential Loyalists";
  if (r >= 4) return "Recent Customers";
  if (r === 3 && f <= 1) return "Promising";
  if (r === 3) return "Need Attention";
  if (r <= 2 && f >= 3) return "At Risk";
  if (r === 2) return "About to Sleep";
  return "Hibernating";
}

function computeBreakpoints(values) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const at = (p) => sorted[Math.min(sorted.length - 1, Math.max(0, Math.floor(p * sorted.length)))];
  return { p20: at(0.2), p40: at(0.4), p60: at(0.6), p80: at(0.8) };
}
function scoreByQuantile(value, breakpoints, invert) {
  if (value == null || !breakpoints) return null;
  const { p20, p40, p60, p80 } = breakpoints;
  let rank;
  if (value <= p20) rank = 1;
  else if (value <= p40) rank = 2;
  else if (value <= p60) rank = 3;
  else if (value <= p80) rank = 4;
  else rank = 5;
  return invert ? 6 - rank : rank;
}

function monetaryLabel(mMetric, lookbackDays) {
  if (mMetric === "nav") return `Net Asset Value as of ${REFERENCE_DATE} (asset value — not transaction-period monetary activity)`;
  if (mMetric === "brokerageFee") return `Total matched-order brokerage fee, last ${lookbackDays}d`;
  return `Total matched transaction value, last ${lookbackDays}d`;
}

function rawMonetary(customerId, config) {
  if (config.mMetric === "nav") {
    const nav = latestNav(customerId);
    return nav ? nav.netAssetValue : null;
  }
  const orders = ordersInWindow(customerId, config.lookbackDays, config.assetTypes);
  if (config.mMetric === "brokerageFee") return orders.reduce((s, o) => s + o.brokerageFee, 0);
  return orders.reduce((s, o) => s + o.matchValue, 0); // transactionValue (default)
}

function customerPassesFilters(dim, config) {
  if (config.branchId && config.branchId !== "All" && dim.branchId !== config.branchId) return `Not in the selected branch (customer's branch: ${dim.branchId}).`;
  if (config.brokerId && config.brokerId !== "All" && dim.brokerId !== config.brokerId) return `Not assigned to the selected broker (customer's broker: ${dim.brokerId}).`;
  if (config.managementChannel && config.managementChannel !== "All" && dim.managementChannel !== config.managementChannel) {
    return `Management channel is "${dim.managementChannel}", not the selected "${config.managementChannel}".`;
  }
  return null;
}

/**
 * Builds the full scoring context for a configuration: the filtered
 * population, each member's tier, per-tier quantile breakpoints, and
 * every member's final score — computed ONCE and reused by
 * getGridData/getSegmentList/scoreCustomer so the grid, segment list,
 * and any single customer's result can never disagree with each
 * other for the same configuration.
 */
export function buildScoringContext(config) {
  if (config.rMetric === "lastLogin") {
    return {
      dataAvailabilityError: "Login-based Recency is not available in this prototype — no login-event fixture exists for this synthetic population. Select \"Most recent matched-order date\" instead.",
      members: [],
      excluded: [],
    };
  }

  const ref = referenceDate();
  const filtered = [];
  const excluded = [];

  CUSTOMER_DIMENSION.forEach((dim) => {
    const filterReason = customerPassesFilters(dim, config);
    if (filterReason) {
      excluded.push({ customerId: dim.customerId, reason: filterReason });
      return;
    }
    const nav = latestNav(dim.customerId);
    const tier = tierFor(nav ? nav.netAssetValue : null);
    const recentOrder = lastOrderDate(dim.customerId);
    const recencyDays = recentOrder ? Math.round((ref.getTime() - recentOrder.matchedTimestamp) / 86400000) : null;
    const frequency = ordersInWindow(dim.customerId, config.lookbackDays, config.assetTypes).length;
    const monetary = rawMonetary(dim.customerId, config);
    filtered.push({ customerId: dim.customerId, dim, tier, navValue: nav ? nav.netAssetValue : null, recencyDays, frequency, monetary });
  });

  // Per-tier quantile breakpoints, computed only from members WITH a
  // known tier — "Unknown" tier members are never scored (no peer
  // group to compare them against), tracked separately instead.
  const tierBreakpoints = {};
  const tierCounts = {};
  TIERS.forEach((tier) => {
    const members = filtered.filter((m) => m.tier === tier);
    tierCounts[tier] = members.length;
    if (members.length < MIN_TIER_POPULATION) return; // insufficient — handled per-member below
    tierBreakpoints[tier] = {
      recency: computeBreakpoints(members.filter((m) => m.recencyDays != null).map((m) => m.recencyDays)),
      frequency: computeBreakpoints(members.map((m) => m.frequency)),
      monetary: computeBreakpoints(members.filter((m) => m.monetary != null).map((m) => m.monetary)),
    };
  });

  const members = filtered.map((m) => {
    if (m.tier === "Unknown") {
      return { ...m, supported: false, reason: "NAV not available for this customer — cannot be tiered or scored." };
    }
    if (tierCounts[m.tier] < MIN_TIER_POPULATION) {
      return { ...m, supported: false, reason: `Insufficient population in tier "${m.tier}" (${tierCounts[m.tier]} customer(s), minimum ${MIN_TIER_POPULATION}) for reliable quintile scoring.` };
    }
    const bp = tierBreakpoints[m.tier];
    const rScore = scoreByQuantile(m.recencyDays, bp.recency, true);
    const fScore = scoreByQuantile(m.frequency, bp.frequency, false);
    const mScore = scoreByQuantile(m.monetary, bp.monetary, false);
    if (rScore == null) {
      // m.recencyDays is null only when this customer has NO qualifying
      // matched order on record at all (not just none in-window) — a
      // genuine null, not fabricated as "very old" or defaulted to a
      // score. ~5% of the fixture population deliberately has zero
      // orders to exercise exactly this state.
      return { ...m, supported: false, rScore: null, fScore, mScore, segment: null, reason: "No qualifying matched orders on record for this customer — Recency cannot be calculated." };
    }
    const segment = assignSegment(rScore, fScore);
    return { ...m, supported: true, rScore, fScore, mScore, segment };
  });

  return { dataAvailabilityError: null, members, excluded, tierCounts, monetaryLabel: monetaryLabel(config.mMetric, config.lookbackDays) };
}

/** The single entry point Customer 360 (and anything else needing one
 * customer's result) should call — never recomputes anything, just
 * looks the customer up inside the same shared context used for the
 * grid/segment list. */
export function scoreCustomer(customerId, config) {
  const ctx = buildScoringContext(config);
  if (ctx.dataAvailabilityError) return { supported: false, excluded: false, dataAvailabilityError: ctx.dataAvailabilityError };
  const excludedRow = ctx.excluded.find((e) => e.customerId === customerId);
  if (excludedRow) return { supported: false, excluded: true, reason: excludedRow.reason };
  const member = ctx.members.find((m) => m.customerId === customerId);
  if (!member) return { supported: false, excluded: true, reason: "Customer not present in the RFM fixture population." };
  if (!member.supported) return { supported: false, excluded: true, reason: member.reason };
  return { supported: true, excluded: false, ...member, monetaryLabel: ctx.monetaryLabel, config };
}

export function getGridData(config) {
  const ctx = buildScoringContext(config);
  if (ctx.dataAvailabilityError) return { dataAvailabilityError: ctx.dataAvailabilityError, cells: [], total: 0 };
  const scored = ctx.members.filter((m) => m.supported);
  const total = scored.length;
  const cells = [];
  for (let f = 5; f >= 1; f--) {
    for (let r = 1; r <= 5; r++) {
      const inCell = scored.filter((m) => m.rScore === r && m.fScore === f);
      const segmentsInCell = [...new Set(inCell.map((m) => m.segment))];
      cells.push({
        r,
        f,
        count: inCell.length,
        pct: total ? Math.round((inCell.length / total) * 1000) / 10 : 0,
        aggregateM: inCell.reduce((s, m) => s + (m.monetary || 0), 0),
        segments: segmentsInCell,
      });
    }
  }
  return { dataAvailabilityError: null, cells, total, monetaryLabel: ctx.monetaryLabel, tierCounts: ctx.tierCounts };
}

export function getSegmentList(config) {
  const ctx = buildScoringContext(config);
  if (ctx.dataAvailabilityError) return { dataAvailabilityError: ctx.dataAvailabilityError, rows: [], total: 0 };
  const scored = ctx.members.filter((m) => m.supported);
  const total = scored.length;
  const rows = SEGMENT_DEFINITIONS.map((def) => {
    const members = scored.filter((m) => m.segment === def.name);
    return {
      segment: def.name,
      description: def.description,
      count: members.length,
      pct: total ? Math.round((members.length / total) * 1000) / 10 : 0,
      aggregateM: members.reduce((s, m) => s + (m.monetary || 0), 0),
    };
  });
  return { dataAvailabilityError: null, rows, total, monetaryLabel: ctx.monetaryLabel };
}

/** Aggregate-only detail for one R/F grid cell — count, percentage,
 * aggregate monetary, and a tier-count breakdown. Deliberately never
 * returns the underlying member rows: this is the one function the
 * cell-detail drawer is allowed to call to populate itself, and it
 * cannot leak an identifiable record even if misused, because no
 * customer-level field is ever assembled here. `segment` is derived
 * from assignSegment(r,f) directly (pure function of the coordinates)
 * so it's correct even for an empty cell. */
export function getCellAggregateDetail(r, f, config) {
  const ctx = buildScoringContext(config);
  if (ctx.dataAvailabilityError) return { dataAvailabilityError: ctx.dataAvailabilityError };
  const scored = ctx.members.filter((m) => m.supported);
  const total = scored.length;
  const inCell = scored.filter((m) => m.rScore === r && m.fScore === f);
  const segment = assignSegment(r, f);
  const tierDistribution = Object.fromEntries(TIERS.map((t) => [t, inCell.filter((m) => m.tier === t).length]));
  return {
    kind: "cell",
    r,
    f,
    segment,
    count: inCell.length,
    pct: total ? Math.round((inCell.length / total) * 1000) / 10 : 0,
    aggregateM: inCell.reduce((s, m) => s + (m.monetary || 0), 0),
    tierDistribution,
    monetaryLabel: ctx.monetaryLabel,
  };
}

/** Aggregate-only detail for one named segment — same shape and same
 * privacy guarantee as getCellAggregateDetail above, just grouped by
 * segment name instead of (r,f). Used by both the Treemap (Customer
 * 360) and the segment table (RFM Analytics). */
export function getSegmentAggregateDetail(segmentName, config) {
  const ctx = buildScoringContext(config);
  if (ctx.dataAvailabilityError) return { dataAvailabilityError: ctx.dataAvailabilityError };
  const scored = ctx.members.filter((m) => m.supported);
  const total = scored.length;
  const inSeg = scored.filter((m) => m.segment === segmentName);
  const description = SEGMENT_DEFINITIONS.find((d) => d.name === segmentName)?.description || "";
  const tierDistribution = Object.fromEntries(TIERS.map((t) => [t, inSeg.filter((m) => m.tier === t).length]));
  return {
    kind: "segment",
    segment: segmentName,
    description,
    count: inSeg.length,
    pct: total ? Math.round((inSeg.length / total) * 1000) / 10 : 0,
    aggregateM: inSeg.reduce((s, m) => s + (m.monetary || 0), 0),
    tierDistribution,
    monetaryLabel: ctx.monetaryLabel,
  };
}
