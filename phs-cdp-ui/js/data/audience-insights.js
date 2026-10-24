/*
  Audience Insights (Audiences) — cross-audience analytics over the
  SAME audiences already defined in js/data/audiences.js. Nothing here
  is a second audience model: every row resolves to a real AUDIENCES
  record by id, and "View Audience" always lands on the existing All
  Audiences / audience detail experience — this page only adds a
  measurement/overlap lens, the same pattern Data Quality uses over
  Sources/Tracking Plans.

  Data source: 100% local mock data, synchronous, zero fetch/BFF calls
  — all values are deterministic (hash-seeded), so repeated renders and
  screenshots stay stable across reloads.
  // TODO: Replace the mock insight provider with a BFF endpoint when
  // the backend contract exists. overview() / audiencesBySize() /
  // growthSeries() / compositionFor() / overlapRows() are the
  // functions to swap.
*/
import { AUDIENCES, getAudienceById, reachMetrics } from "./audiences.js";
import { CAMPAIGNS } from "./campaigns.js";

function hashString(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) >>> 0;
  return h;
}

export { reachMetrics };

export function activeCampaignsFor(audienceId) {
  return CAMPAIGNS.filter((c) => c.targeting?.type === "audience" && c.targeting.audienceId === audienceId);
}

/* ------------------------------------------------------------------ */
/* Overview (section 4)                                                */
/* ------------------------------------------------------------------ */
export function overview() {
  const totalAudiences = AUDIENCES.length;
  const totalMembers = AUDIENCES.reduce((sum, a) => sum + a.memberCount, 0);
  let reachable = 0;
  let consentEligible = 0;
  AUDIENCES.forEach((a) => {
    const r = reachMetrics(a);
    reachable += r.reachable;
    consentEligible += r.consentEligible;
  });
  const activeAudiences = AUDIENCES.filter((a) => a.status === "Active").length;
  return { totalAudiences, totalMembers, reachable, consentEligible, activeAudiences };
}

/* ------------------------------------------------------------------ */
/* Audience Size (section 5.A) — largest audiences by member count.    */
/* ------------------------------------------------------------------ */
export function audiencesBySize(limit = 6) {
  return [...AUDIENCES].sort((a, b) => b.memberCount - a.memberCount).slice(0, limit);
}

/* ------------------------------------------------------------------ */
/* Audience Growth (section 5.B) — simple trend, deterministic per      */
/* audience so the same selection always renders the same series.      */
/* ------------------------------------------------------------------ */
export function growthSeries(audienceIds, points = 8) {
  const labels = Array.from({ length: points }, (_, i) => `W${i + 1}`);
  const series = audienceIds.map((id) => {
    const a = getAudienceById(id);
    if (!a) return null;
    const h = hashString(id + "-growth");
    const endValue = a.memberCount;
    const startValue = Math.round(endValue * (0.78 + (h % 10) / 100));
    const values = labels.map((_, i) => Math.round(startValue + ((endValue - startValue) * i) / (points - 1)));
    return { name: a.name, color: ["var(--chart-green)", "var(--chart-blue)", "var(--chart-gold)", "var(--chart-teal)"][AUDIENCES.findIndex((x) => x.id === id) % 4], values };
  }).filter(Boolean);
  return { labels, series };
}

/* ------------------------------------------------------------------ */
/* Audience Composition (section 5.C) — reuses each audience's own      */
/* `composition` + consent-eligibility rate. No new attribute model.   */
/* ------------------------------------------------------------------ */
export function compositionFor(audience) {
  const r = reachMetrics(audience);
  const consentEligiblePct = +((r.consentEligible / audience.memberCount) * 100).toFixed(1);
  return {
    customerType: audience.composition?.["Customer Tier"] || [],
    engagement: audience.composition?.Lifecycle || [],
    productInterest: audience.composition?.["Preferred Channel"] || [],
    consentEligiblePct,
  };
}

/* ------------------------------------------------------------------ */
/* Audience Overlap (section 5.D) — pairwise, deterministic.            */
/* ------------------------------------------------------------------ */
export const OVERLAP_PAIRS = [
  ["aud-012", "aud-008"], // Funded — No First Trade vs High Engagement — No Recent Trade
  ["aud-003", "aud-007"], // Dormant Investors vs Recently Registered
  ["aud-001", "aud-002"], // Active Mobile Investors vs High Value Customers
];
export function overlapRows() {
  return OVERLAP_PAIRS.map(([idA, idB]) => {
    const a = getAudienceById(idA);
    const b = getAudienceById(idB);
    if (!a || !b) return null;
    const h = hashString(idA + idB);
    const smaller = Math.min(a.memberCount, b.memberCount);
    const overlapPct = 4 + (h % 22); // 4-25%
    const overlap = Math.round(smaller * (overlapPct / 100));
    return { a, b, overlap, overlapPct: +((overlap / smaller) * 100).toFixed(1) };
  }).filter(Boolean);
}
