/*
  PHS CDP — RFM Layer 2: customer-level aggregation over the Layer 1
  fact tables (js/data/rfm/fixtures.js).

  Target PRODUCTION design: a `customer_daily_aggregation` mart,
  incrementally maintained so any of the 30/90/180-day lookback
  windows can be reconstructed WITHOUT rescanning raw transaction
  history on every UI request (the RFM spec explicitly calls out that
  a single precomputed 30-day aggregate is insufficient for 30/90/180
  — the production mart needs to retain enough daily granularity to
  derive each window). That production job is described in full in
  this project's final RFM report (not implemented here — no
  scheduler, no warehouse, no dbt/Spark/BigQuery/Snowflake/ClickHouse
  exists in this repository).

  THIS FILE is the prototype's deterministic stand-in: since the full
  fact set already lives in memory as a static, versioned fixture
  (not a live, growing transaction log), there is no incremental-
  processing problem to solve in-browser — every function here simply
  filters the in-memory fact arrays to the requested window and
  aggregates. The point being proven (several supported lookback
  windows, each correctly reconstructed, not just one hardcoded 30-day
  number) still holds; only the "avoid re-scanning raw history on
  every request" performance property is explicitly NOT a real
  property of this prototype, and is not claimed as one.
*/

import { FACT_ORDER_MATCHED, FACT_CASH_FLOW, FACT_DAILY_NAV, REFERENCE_DATE } from "./fixtures.js";

const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
function parseDisplayDate(str) {
  const m = /^(\d{1,2})\s+([A-Za-z]{3})\s+(\d{4})$/.exec((str || "").trim());
  if (!m) return null;
  const monthIndex = MONTH_NAMES.indexOf(m[2]);
  if (monthIndex === -1) return null;
  return new Date(Number(m[3]), monthIndex, Number(m[1]));
}

export function referenceDate() {
  return parseDisplayDate(REFERENCE_DATE);
}

/** Orders for one customer, matched within the last `windowDays`
 * (inclusive of the reference date), optionally restricted to a set
 * of asset types. The one function every F/M-over-orders calculation
 * goes through — one window definition, never re-derived per caller. */
export function ordersInWindow(customerId, windowDays, assetTypes) {
  const ref = referenceDate();
  const cutoff = ref.getTime() - (windowDays - 1) * 86400000;
  return FACT_ORDER_MATCHED.filter((o) => {
    if (o.customerId !== customerId) return false;
    if (o.matchedTimestamp < cutoff || o.matchedTimestamp > ref.getTime()) return false;
    if (assetTypes && assetTypes.length && !assetTypes.includes(o.assetType)) return false;
    return true;
  });
}

export function allOrdersForCustomer(customerId, assetTypes) {
  return FACT_ORDER_MATCHED.filter((o) => o.customerId === customerId && (!assetTypes || !assetTypes.length || assetTypes.includes(o.assetType)));
}

/** Latest valid NAV at or before the reference date — a point-in-time
 * asset measure, never summed across the lookback window (per the
 * spec's explicit "do not sum daily NAV values" instruction). Returns
 * null (not 0) when the customer has no NAV record — an explicit
 * "Unknown / Insufficient NAV" condition the caller must surface, not
 * silently treat as zero or the lowest tier. */
export function latestNav(customerId) {
  const ref = referenceDate().getTime();
  const rows = FACT_DAILY_NAV.filter((n) => n.customerId === customerId && n.dateMs <= ref).sort((a, b) => b.dateMs - a.dateMs);
  return rows.length ? rows[0] : null;
}

export function lastOrderDate(customerId) {
  const rows = FACT_ORDER_MATCHED.filter((o) => o.customerId === customerId).sort((a, b) => b.matchedTimestamp - a.matchedTimestamp);
  return rows.length ? rows[0] : null;
}

export function cashFlowInWindow(customerId, windowDays) {
  const ref = referenceDate();
  const cutoff = ref.getTime() - (windowDays - 1) * 86400000;
  return FACT_CASH_FLOW.filter((f) => f.customerId === customerId && f.timestampMs >= cutoff && f.timestampMs <= ref.getTime());
}
