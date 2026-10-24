/*
  PHS CDP — RFM synthetic Layer 1 fact tables.

  Target PRODUCTION source contracts (per the RFM spec) — this file
  implements SYNTHETIC, fixture-backed equivalents of these three
  tables only, never a real warehouse connection:

    fact_order_matched  — customer_id, matched_time, asset_type,
                           match_value, brokerage_fee
    fact_cash_flow      — customer_id, timestamp, action_type
                           (deposit/withdrawal), amount
    fact_daily_nav      — customer_id, date, net_asset_value,
                           margin_debt

  Plus one small CUSTOMER_DIMENSION table — not one of the three named
  facts, but necessary plumbing: branch/broker/management-channel are
  customer-level filters the spec requires (§5.1), and nothing in the
  three fact-table contracts carries them. A real warehouse would join
  these from an actual customer/account dimension table; this is its
  synthetic equivalent, kept separate from the fact rows themselves
  (standard dimensional-modeling practice, not fields repeated on every
  fact row).

  SCOPE: this is a dedicated, SHARED fixture — not Customer-360-local.
  Both the RFM Analytics page and Customer 360's RFM view read from
  the same engine (js/data/rfm/engine.js), which reads only from here.
  `customers.js` (protected, no branch/broker/management-channel/NAV/
  margin-debt/brokerage-fee fields exist there — confirmed by direct
  grep before writing this file) and `customer-360-golden.js` are
  NEITHER modified NOR used as a data source here: the 6 real
  Customer-360 ids below get their OWN newly-authored synthetic fact
  rows under this module, generated the same deterministic way as
  every other row — they are not derived from (and may not visually
  "match") those customers' existing banded transaction records, since
  this schema needs fields (fee, NAV, margin debt, asset type, branch,
  broker) those protected files don't have.

  DETERMINISM: one seeded mulberry32 PRNG (fixed seed), generated once
  at module load — never Math.random(). Self-check at the bottom
  regenerates and asserts byte-identical output, same convention as
  customer-360-population.js and customer-360-golden.js.

  SIMPLIFICATION DISCLOSED: fact_daily_nav is generated at WEEKLY
  cadence (26 snapshots over the 180-day fixture window), not literally
  daily — still fully schema-compatible (same 4 columns) and still
  correct for "latest valid NAV at or before the reference date"
  lookups (monotonically dated snapshots), but a true production table
  would be daily. Keeping this a demo-sized fixture (~220 customers)
  rather than literally-daily rows avoids an unreasonably large static
  JS file for a frontend prototype with no backend.
*/

export const REFERENCE_DATE = "17 Sep 2026"; // same shared "today" used everywhere else in this app
const FIXTURE_WINDOW_DAYS = 180; // covers the longest supported lookback (180d) plus NAV history before it
const SEED = 905905;

function mulberry32(seed) {
  let a = seed >>> 0;
  return function rand() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function pickWeighted(rand, entries) {
  const total = entries.reduce((s, [, w]) => s + w, 0);
  let r = rand() * total;
  for (const [value, weight] of entries) {
    if (r < weight) return value;
    r -= weight;
  }
  return entries[entries.length - 1][0];
}
function pickInt(rand, min, max) {
  return min + Math.floor(rand() * (max - min + 1));
}
const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
function fmtDate(d) {
  return `${String(d.getDate()).padStart(2, "0")} ${MONTH_NAMES[d.getMonth()]} ${d.getFullYear()}`;
}
function addDays(date, days) {
  return new Date(date.getTime() + days * 86400000);
}

const REF_DATE_OBJ = new Date(2026, 8, 17); // 17 Sep 2026

/* ------------------------------------------------------------------ */
/* Dimensions                                                          */
/* ------------------------------------------------------------------ */
export const BRANCHES = [
  { id: "BR-HCM1", name: "Ho Chi Minh City — District 1" },
  { id: "BR-HCM2", name: "Ho Chi Minh City — District 3" },
  { id: "BR-HN1", name: "Hanoi — Hoan Kiem" },
  { id: "BR-DN1", name: "Da Nang" },
  { id: "BR-CT1", name: "Can Tho" },
];
const BROKER_TEAMS = ["Team Alpha", "Team Beta", "Team Gamma", "Team Delta"];
export const BROKERS = Array.from({ length: 12 }, (_, i) => ({
  id: `BRK-${String(i + 1).padStart(2, "0")}`,
  team: BROKER_TEAMS[i % BROKER_TEAMS.length],
}));
export const MANAGEMENT_CHANNELS = ["Self-directed", "Broker-managed"];
export const ASSET_TYPES = ["Equities", "Derivatives", "Covered Warrants", "Bonds"];

// The 6 real Customer-360 ids participate in this fixture under their
// own ids so Customer 360's RFM view has a genuine grid position, not
// a permanently-excluded placeholder. The remaining ids are purely
// synthetic, generated only to fill out a realistic population for
// percentile scoring.
const REAL_CUSTOMER_IDS = ["PHS-CUS-1002831", "PHS-CUS-1002832", "PHS-CUS-1002833", "PHS-CUS-1002834", "PHS-CUS-1002835", "PHS-CUS-GOLDEN-001"];
const SYNTHETIC_POPULATION_SIZE = 214;

const ACTIVITY_WEIGHTS = [
  ["Frequent", 30],
  ["Occasional", 35],
  ["Declining", 20],
  ["Insufficient", 15],
];
const ORDER_COUNT_RANGE = { Frequent: [40, 120], Occasional: [10, 40], Declining: [5, 20], Insufficient: [0, 4] };
const TIER_TARGET_WEIGHTS = [
  ["Whale", 5],
  ["Shark", 25],
  ["Standard", 70],
];
const TIER_NAV_RANGE_VND = {
  Whale: [2_000_000_000, 6_000_000_000],
  Shark: [200_000_000, 1_999_999_999],
  Standard: [5_000_000, 199_999_999],
};
const ASSET_TYPE_WEIGHTS = [
  ["Equities", 60],
  ["Derivatives", 15],
  ["Covered Warrants", 10],
  ["Bonds", 15],
];

function buildCustomerDimension(id, index, rand) {
  const branch = BRANCHES[Math.floor(rand() * BRANCHES.length)];
  const broker = BROKERS[Math.floor(rand() * BROKERS.length)];
  const managementChannel = pickWeighted(rand, [["Self-directed", 70], ["Broker-managed", 30]]);
  return { customerId: id, branchId: branch.id, brokerId: broker.id, brokerTeam: broker.team, managementChannel };
}

function buildOrdersForCustomer(id, activityPattern, rand) {
  const [min, max] = ORDER_COUNT_RANGE[activityPattern];
  const count = pickInt(rand, min, max);
  const orders = [];
  for (let i = 0; i < count; i++) {
    // "Declining" concentrates orders in the FIRST half of the window
    // (active a while ago, quiet recently) — the one pattern that
    // genuinely needs a non-uniform date distribution to be meaningful;
    // the others are spread across the full window.
    const daysAgo = activityPattern === "Declining" ? pickInt(rand, 90, FIXTURE_WINDOW_DAYS) : pickInt(rand, 0, FIXTURE_WINDOW_DAYS);
    const matchedDate = addDays(REF_DATE_OBJ, -daysAgo);
    const assetType = pickWeighted(rand, ASSET_TYPE_WEIGHTS);
    const matchValue = pickInt(rand, 1, 50) * 1_000_000 * (assetType === "Derivatives" ? 3 : 1); // VND, whole-million units
    const feeRate = 0.0015 + rand() * 0.002; // 0.15%–0.35%, a plausible matched-order brokerage fee rate
    orders.push({
      customerId: id,
      matchedTime: fmtDate(matchedDate),
      matchedTimestamp: matchedDate.getTime(),
      assetType,
      matchValue,
      brokerageFee: Math.round(matchValue * feeRate),
    });
  }
  return orders;
}

function buildCashFlowForCustomer(id, tier, rand) {
  const count = pickInt(rand, 2, 8);
  const [navMin, navMax] = TIER_NAV_RANGE_VND[tier];
  const flows = [];
  for (let i = 0; i < count; i++) {
    const daysAgo = pickInt(rand, 0, FIXTURE_WINDOW_DAYS);
    const date = addDays(REF_DATE_OBJ, -daysAgo);
    const actionType = pickWeighted(rand, [["deposit", 70], ["withdrawal", 30]]);
    const amount = Math.round((navMin + rand() * (navMax - navMin)) * 0.05); // a modest fraction of tier NAV per flow
    flows.push({ customerId: id, timestamp: fmtDate(date), timestampMs: date.getTime(), actionType, amount });
  }
  return flows;
}

function buildNavSeriesForCustomer(id, tier, hasNav, rand) {
  if (!hasNav) return [];
  const [navMin, navMax] = TIER_NAV_RANGE_VND[tier];
  const endNav = navMin + rand() * (navMax - navMin);
  const rows = [];
  const weeks = Math.floor(FIXTURE_WINDOW_DAYS / 7);
  let nav = endNav * (0.85 + rand() * 0.1); // start a bit below the ending value, drifts up to it
  for (let w = weeks; w >= 0; w--) {
    const date = addDays(REF_DATE_OBJ, -w * 7);
    const drift = 1 + (rand() - 0.45) * 0.06; // small weekly random walk, slightly upward-biased
    nav = w === 0 ? endNav : nav * drift;
    const hasMargin = rand() < 0.2;
    rows.push({
      customerId: id,
      date: fmtDate(date),
      dateMs: date.getTime(),
      netAssetValue: Math.round(Math.max(0, nav)),
      marginDebt: hasMargin ? Math.round(Math.max(0, nav) * (0.05 + rand() * 0.2)) : 0,
    });
  }
  return rows;
}

function buildPopulation() {
  const rand = mulberry32(SEED);
  const ids = [...REAL_CUSTOMER_IDS, ...Array.from({ length: SYNTHETIC_POPULATION_SIZE }, (_, i) => `PHS-RFM-${String(i + 1).padStart(4, "0")}`)];

  const dimension = [];
  const orders = [];
  const cashFlow = [];
  const nav = [];

  ids.forEach((id, index) => {
    dimension.push(buildCustomerDimension(id, index, rand));
    const activityPattern = pickWeighted(rand, ACTIVITY_WEIGHTS);
    const tierTarget = pickWeighted(rand, TIER_TARGET_WEIGHTS);
    // ~5% of the population has no NAV on record at all (exercises the
    // "Unknown / Insufficient NAV" tiering state — never silently
    // folded into Standard) and ~5% has zero matched orders (exercises
    // F=0 / ineligible-population handling).
    const hasNav = rand() >= 0.05;
    const hasOrders = rand() >= 0.05;

    orders.push(...(hasOrders ? buildOrdersForCustomer(id, activityPattern, rand) : []));
    cashFlow.push(...buildCashFlowForCustomer(id, tierTarget, rand));
    nav.push(...buildNavSeriesForCustomer(id, tierTarget, hasNav, rand));
  });

  return { dimension, orders, cashFlow, nav };
}

const GENERATED = buildPopulation();
export const CUSTOMER_DIMENSION = GENERATED.dimension;
export const FACT_ORDER_MATCHED = GENERATED.orders;
export const FACT_CASH_FLOW = GENERATED.cashFlow;
export const FACT_DAILY_NAV = GENERATED.nav;

(function assertDeterministic() {
  const again = buildPopulation();
  const same = JSON.stringify(again) === JSON.stringify(GENERATED);
  if (!same) {
    console.warn("[rfm/fixtures] generator is NOT deterministic — investigate before relying on this dataset.");
  }
})();
