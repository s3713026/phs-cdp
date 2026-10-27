import { CUSTOMERS, EVENT_SOURCES, FORWARD_DESTINATIONS, LIFECYCLE_STAGES, getCustomerById } from "../data/customers.js";
// Golden Customer fixture (js/data/customer-360-golden.js) — kept out
// of customers.js on purpose (see that file's header), so it is
// folded into this page's own 3 customer-resolution points below
// instead: searchCustomers(), the quick-switcher's localMatches(),
// and fetchCustomerRecord()'s local fallback.
import { GOLDEN_CUSTOMER } from "../data/customer-360-golden.js";
import {
  CRM_CLASSIFICATIONS,
  getClassificationForCustomer,
  getEkycFollowupsForCustomer,
  getTicketsForCustomer,
  getCustomerTypeLabel,
} from "../data/customer-360-crm.js";
import { generateRecommendations } from "../data/customer-360-recommendations.js";
import {
  eventsByDate,
  eventsByDateInWindow,
  eventsByWeek,
  hourWeekdayMatrix,
  resolveWindow,
  channelSplit,
  deviceBreakdown,
  productInterestSignal,
  journeyFrictionSignal,
  engagementChangeSignal,
  hasSufficientEventVolume,
  MINIMUM_EVENT_VOLUME,
  sessionFrequencyRecency,
  parseDisplayDate,
  formatDisplayDate,
} from "../data/customer-360-behavior.js";
import {
  getCampaignEnrollmentsForCustomer,
  getJourneyEnrollmentsForCustomer,
  getNotEnrolledNotesForCustomer,
} from "../data/customer-360-engagement.js";
import { renderLineChart } from "../components/chart.js";
import { chartSwitchHTML, wireChartSwitch, renderHeatmapHTML, renderDonutHTML, renderDnaGaugeHTML } from "./customer-360-charts.js";
import { getDnaProfile, filterHistoryByWindow, DNA_WEIGHTS, factorLabel, getCampaignReadiness, trendLabel as dnaTrendLabel } from "../data/customer-360-dna.js";
// Shared RFM engine (js/data/rfm/) — the SAME module the RFM Analysis
// page uses. Customer 360 never computes its own RFM score.
import { loadRfmConfig } from "../data/rfm/config.js";
import { scoreCustomer, getGridData, getSegmentList, getCellAggregateDetail, getSegmentAggregateDetail, TIER_DEFINITION_LABEL, SEGMENT_TAXONOMY_LABEL } from "../data/rfm/engine.js";
import { renderRfmGridHTML, wireRfmGridInteractivity } from "./rfm-grid.js";
import { renderRfmTreemapHTML, wireRfmTreemapInteractivity } from "./rfm-treemap.js";
import { renderRfmAggregateDetailHTML, wireRfmAggregateDetailInteractivity } from "./rfm-cell-detail.js";

const CATEGORY_DOT_CLASS = {
  behavior: "",
  trading: "timeline__dot--success",
  transaction: "timeline__dot--info",
  engagement: "timeline__dot--gold",
};

// Event-source taxonomy icon — represents the SOURCE, never the
// event type. Every event of a given source gets the same icon.
const SOURCE_ICON = {
  App: "smartphone",
  Web: "globe-2",
  API: "braces",
  Connector: "plug-zap",
  "In-App": "bell",
  "Web Message": "message-square",
  Email: "mail",
};

const BEHAVIOR_META = [
  { key: "appOpens", label: "App Opens · 30d", max: 200 },
  { key: "sessions", label: "Sessions · 30d", max: 150 },
  { key: "stockViews", label: "Stock Views · 30d", max: 500 },
  { key: "watchlistActions", label: "Watchlist Actions · 30d", max: 40 },
  { key: "tradingOrders", label: "Trading Orders · 30d", max: 50 },
  { key: "deposits", label: "Deposits · 30d", max: 10 },
];

let currentCustomer = null;
let currentCategoryFilter = "all";
let currentSourceFilter = "all";

// Search-first entry flow state. `lastQuery`/`lastField` persist across
// Search -> Results -> Detail so "Back to Results" can reconstruct the
// exact same result set without re-prompting the user.
let lastQuery = "";
let lastField = "all";
let cameFromResults = false;

function normalize(str) {
  return str.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
}

function maskCrmId(crmId) {
  return `CRM-••••${crmId.slice(-3)}`;
}

function makeInteractive(el, onActivate) {
  el.setAttribute("tabindex", "0");
  el.setAttribute("role", "button");
  el.addEventListener("click", onActivate);
  el.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onActivate();
    }
  });
}

function refreshIcons() {
  if (window.lucide) window.lucide.createIcons();
}

function verifyMeta(status) {
  const positive = status === "Verified" || status === "Active";
  return {
    icon: positive ? "check-check" : "circle-alert",
    cls: positive ? "identity-row__verify--verified" : "",
  };
}

/* ---------------------------------------------------------------- */
/* View switching — Search / Results / Not Found / Detail. Siblings  */
/* toggled via `hidden`, matching the existing list<->detail pattern */
/* already used elsewhere (e.g. Audiences' data-view-list/-detail)   */
/* rather than introducing a new routing mechanism.                  */
/* ---------------------------------------------------------------- */
function showView(view) {
  const map = {
    search: "[data-c360-search-view]",
    results: "[data-c360-results-view]",
    notfound: "[data-c360-notfound-view]",
    detail: "[data-c360-detail-view]",
  };
  Object.entries(map).forEach(([name, selector]) => {
    const el = document.querySelector(selector);
    if (el) el.hidden = name !== view;
  });
}

/* ---------------------------------------------------------------- */
/* Mock search — client-side only, against the local CUSTOMERS array.*/
/* Each field here corresponds to a real, existing field in the mock */
/* data; "all" only ever checks fields that actually exist.          */
/* ---------------------------------------------------------------- */
const SEARCH_FIELDS = [
  { value: "all", label: "All supported fields" },
  { value: "id", label: "Customer / Profile ID" },
  { value: "crmId", label: "CRM ID" },
  { value: "rudderId", label: "Canonical Identity ID (rudderId)" },
  { value: "email", label: "Email Address" },
  { value: "mobile", label: "Mobile Number" },
];

function fieldLabel(value) {
  const f = SEARCH_FIELDS.find((x) => x.value === value);
  return f ? f.label : value;
}

function populateFieldSelect(select) {
  if (!select) return;
  select.innerHTML = SEARCH_FIELDS.map((f) => `<option value="${f.value}">${f.label}</option>`).join("");
}

function identityValues(c, type) {
  const entry = c.identities.find((i) => i.type === type);
  return entry ? entry.values.map((v) => v.value) : [];
}

function fieldMatches(c, field, qNorm) {
  switch (field) {
    case "id":
      return normalize(c.id).includes(qNorm);
    case "crmId":
      return normalize(c.crmId).includes(qNorm);
    case "rudderId":
      return normalize(c.rudderId || "").includes(qNorm);
    case "email":
      return identityValues(c, "Email Address").some((v) => normalize(v).includes(qNorm));
    case "mobile":
      return identityValues(c, "Mobile Number").some((v) => normalize(v).includes(qNorm));
    default:
      return ["id", "crmId", "rudderId", "email", "mobile"].some((f) => fieldMatches(c, f, qNorm));
  }
}

function searchCustomers(query, field) {
  const qNorm = normalize(query.trim());
  if (!qNorm) return [];
  return [...CUSTOMERS, GOLDEN_CUSTOMER].filter((c) => fieldMatches(c, field, qNorm));
}

/* ---------------------------------------------------------------- */
/* Header + summary + journey                                        */
/* ---------------------------------------------------------------- */

function renderHeader(c) {
  const mount = document.querySelector("[data-c360-header]");
  if (!mount) return;
  const restricted = c.accessLevel === "restricted";
  mount.innerHTML = `
    <div class="cluster gap-4" style="align-items: flex-start;">
      <span class="avatar avatar--lg">${c.initials}</span>
      <div class="stack gap-2" style="flex: 1; min-width: 0;">
        <div class="cluster gap-3" style="flex-wrap: wrap;">
          <h1 class="page-header__title" style="font-size: var(--text-xl);">${c.name}</h1>
          <span class="badge badge--gold">${c.tier}</span>
          <span class="badge badge--primary">${c.lifecycle}</span>
          <span class="status-dot status-dot--${c.status === "Active" ? "success" : "warning"}">${c.status}</span>
        </div>
        <div class="cluster gap-3" style="flex-wrap: wrap; font-size: var(--text-sm); color: var(--text-tertiary);">
          <span class="font-mono">${c.crmId}</span>
          <span>·</span>
          <span>Last active ${c.lastActive}</span>
          <span>·</span>
          <span>${c.location}</span>
        </div>
        <p style="font-size: var(--text-sm); color: var(--text-secondary); max-width: 640px;">${c.summary}</p>
        <div class="cluster gap-3" style="flex-wrap: wrap; margin-top: 2px;">
          <span class="badge ${restricted ? "badge--info" : "badge--neutral"}">
            <i data-lucide="shield" style="width: 11px; height: 11px;"></i>
            ${restricted ? "Restricted Profile View" : "Standard Profile View"}
          </span>
          <span
            class="cluster gap-1"
            data-tooltip="Sensitive customer data is masked or aggregated based on profile access and data minimization rules. This is a frontend prototype and does not by itself provide legal compliance."
            style="font-size: 11px; color: var(--text-tertiary); cursor: help;"
          >
            <i data-lucide="info" style="width: 11px; height: 11px;"></i>
            Data minimization applied
          </span>
        </div>
      </div>
    </div>
  `;
  refreshIcons();
}

function renderSummary(c) {
  const mount = document.querySelector("[data-c360-summary]");
  if (!mount) return;
  mount.innerHTML = `
    <div class="metric-row">
      <div class="metric">
        <span class="metric__label">Portfolio Value</span>
        <div class="metric__value-row"><span class="metric__value" style="font-size: var(--text-xl);">${c.metrics.portfolioBand}</span></div>
      </div>
      <div class="metric">
        <span class="metric__label">Trading Activity</span>
        <div class="metric__value-row"><span class="metric__value" style="font-size: var(--text-xl);">${c.metrics.tradingActivity}</span></div>
      </div>
      <div class="metric">
        <span class="metric__label">Engagement Score</span>
        <div class="metric__value-row"><span class="metric__value" style="font-size: var(--text-xl);">${c.metrics.engagementScore}<span class="metric__unit">/100</span></span></div>
      </div>
      <div class="metric">
        <span class="metric__label">Days Since Last Login</span>
        <div class="metric__value-row"><span class="metric__value" style="font-size: var(--text-xl);">${c.metrics.daysSinceLogin}</span></div>
      </div>
    </div>
  `;
}

function renderJourney(c) {
  const mount = document.querySelector("[data-c360-journey]");
  if (!mount) return;
  const nodes = LIFECYCLE_STAGES.map((stage, i) => {
    const state = i < c.journey.currentStageIndex ? "is-complete" : i === c.journey.currentStageIndex ? "is-current" : "";
    return `<div class="stage-stepper__node ${state}"><span class="stage-stepper__dot"></span><span class="stage-stepper__label">${stage}</span></div>`;
  }).join("");

  mount.innerHTML = `
    <div class="stage-stepper">${nodes}</div>
    <div class="attr-grid" style="margin-top: var(--space-6); grid-template-columns: repeat(4, 1fr);">
      <div class="attr-item"><span class="attr-item__label">Current Stage</span><span class="attr-item__value">${c.journey.currentLabel}</span></div>
      <div class="attr-item"><span class="attr-item__label">Days in Stage</span><span class="attr-item__value tabular-nums">${c.journey.daysInStage}</span></div>
      <div class="attr-item"><span class="attr-item__label">Previous Stage</span><span class="attr-item__value">${c.journey.previousStage}</span></div>
      <div class="attr-item"><span class="attr-item__label">Next Likely Stage</span><span class="attr-item__value">${c.journey.nextLikelyStage}</span></div>
    </div>
  `;
}

/* ==================================================================== */
/* Investment Risk Appetite — Customer DNA. Data/scoring/anti-flip      */
/* logic lives entirely in js/data/customer-360-dna.js; this section    */
/* only renders it and wires the trend-chart range control. See that    */
/* file's header for the consistency-by-construction rationale.         */
/* ==================================================================== */

function dnaTrendBadgeHTML(profile) {
  if (!profile.dna_trend) return `<span class="badge badge--neutral">Not available</span>`;
  return `${dnaTrendLabel(profile.dna_trend)} <span class="badge ${profile.dna_trend_confirmed ? "badge--neutral" : "badge--warning"}" style="font-size: 10px;">${profile.dna_trend_confirmed ? "Confirmed" : "Pending confirmation"}</span>`;
}

function dnaTrendMarkersHTML(reviews, rangePoints) {
  if (!reviews.length) return "";
  const rangeDates = new Set(rangePoints.map((p) => p.date));
  const visible = reviews.filter((r) => rangeDates.has(r.date));
  if (!visible.length) return `<p style="font-size: var(--text-xs); color: var(--text-tertiary); margin-top: var(--space-2);">No monthly review falls within the selected range.</p>`;
  return `<div class="c360-dna-reviews">${visible
    .map((r) => `<span class="c360-dna-review-chip"><i data-lucide="calendar-check-2" style="width: 11px; height: 11px;"></i>${r.date} — ${r.band} (${r.score})</span>`)
    .join("")}</div>`;
}

function renderDnaTrendInto(contentEl, profile, windowKey) {
  const points = filterHistoryByWindow(profile.history, windowKey);
  if (!points.length) {
    contentEl.innerHTML = insufficientDataNote(`No scoring sessions recorded in this range for this customer (last scored ${profile.dna_last_scored}). Try "60 Sessions".`);
    return;
  }
  const start = points[0];
  const end = points[points.length - 1];
  const change = end.score - start.score;
  contentEl.innerHTML = `
    <div class="attr-grid" style="margin-bottom: var(--space-4); grid-template-columns: repeat(4, 1fr);">
      <div class="attr-item"><span class="attr-item__label">Starting Score</span><span class="attr-item__value tabular-nums">${start.score} <span style="color: var(--text-tertiary); font-weight: var(--weight-regular);">(${start.date})</span></span></div>
      <div class="attr-item"><span class="attr-item__label">Latest Score</span><span class="attr-item__value tabular-nums">${end.score} <span style="color: var(--text-tertiary); font-weight: var(--weight-regular);">(${end.date})</span></span></div>
      <div class="attr-item"><span class="attr-item__label">Change, Selected Range</span><span class="attr-item__value tabular-nums">${change > 0 ? "+" : ""}${change}</span></div>
      <div class="attr-item">
        <span class="attr-item__label" data-tooltip="Calculated only from the points shown in this selected range — NOT the confirmed Model DNA Trend shown above, and never implies two-consecutive-review confirmation." data-tooltip-pos="bottom">Range Movement <i data-lucide="info" style="width: 10px; height: 10px; vertical-align: -1px;"></i></span>
        <span class="attr-item__value">${directionLabelForDiff(change)}</span>
      </div>
    </div>
    <div class="c360-dna-trend-chart"><div data-dna-line-mount></div></div>
    ${dnaTrendMarkersHTML(profile.monthlyReviews, points)}
  `;
  renderLineChart(contentEl.querySelector("[data-dna-line-mount]"), {
    series: [{ name: "DNA Score", color: "var(--chart-blue)", values: points.map((p) => p.score) }],
    labels: thinLabels(points.map((p) => p.date)),
    formatValue: (n) => String(Math.round(n)),
    yMax: 100,
    yMin: 0,
    yTicks: 5,
  });
  refreshIcons();
}

function directionLabelForDiff(diff) {
  if (diff > 1) return "Up over this range";
  if (diff < -1) return "Down over this range";
  return "Flat over this range";
}

function dnaScoringBreakdownHTML(profile) {
  const c = profile.components;
  const weightRow = (label, weightPct, value) =>
    `<div class="attr-item"><span class="attr-item__label">${label} Score · ${weightPct}%</span><span class="attr-item__value">${value !== undefined ? value : "Weight only"}</span></div>`;

  const factorKeys = Object.keys(profile.factors || {});
  const factorsHTML = factorKeys.length
    ? `<details class="c360-population-section" style="margin-top: var(--space-3);">
        <summary class="cluster gap-2" style="color: var(--text-secondary); font-size: var(--text-sm);"><i data-lucide="chevron-right"></i>Available scoring factors (${factorKeys.length})</summary>
        <div class="attr-grid" style="margin-top: var(--space-3);">
          ${factorKeys.map((k) => `<div class="attr-item"><span class="attr-item__label">${factorLabel(k)}</span><span class="attr-item__value">${profile.factors[k]}</span></div>`).join("")}
        </div>
      </details>`
    : "";

  const checkLine = c
    ? `Risk ${c.risk} × 0.40 + Behavior ${c.behavior} × 0.40 + Style ${c.style} × 0.20 = ${(c.risk * DNA_WEIGHTS.risk + c.behavior * DNA_WEIGHTS.behavior + c.style * DNA_WEIGHTS.style).toFixed(1)} → rounded to ${profile.dna_score}.`
    : "Component scores are not recorded for this customer — only the documented weights are shown.";

  return `
    <p class="subhead" style="margin-bottom: var(--space-3);">Scoring Breakdown</p>
    <div class="attr-grid attr-grid--3" style="margin-bottom: var(--space-3);">
      ${weightRow("Risk", 40, c?.risk)}
      ${weightRow("Behavior", 40, c?.behavior)}
      ${weightRow("Style", 20, c?.style)}
    </div>
    ${factorsHTML}
    <p style="font-size: var(--text-xs); color: var(--text-tertiary); margin-top: var(--space-3);">${checkLine} No investment-product recommendation is implied by this breakdown.</p>
  `;
}

function dnaCampaignReadinessHTML(readiness) {
  const statusBadgeClass = { ready: "badge--success", pending: "badge--warning", ineligible: "badge--danger", data_unavailable: "badge--neutral" }[readiness.status];
  return `
    <div class="c360-signal-card">
      <div class="c360-signal-card__header">
        <span class="c360-signal-card__title">Campaign Readiness</span>
        <span class="badge ${statusBadgeClass}">${readiness.statusLabel}</span>
      </div>
      <div class="attr-grid" style="margin-bottom: var(--space-2);">
        <div class="attr-item"><span class="attr-item__label">Mapped Product Group</span><span class="attr-item__value">${readiness.productGroup}</span></div>
        <div class="attr-item"><span class="attr-item__label">Trend Confirmation</span><span class="attr-item__value">${readiness.candidateSegment ? (readiness.trendConfirmed ? "Confirmed" : "Pending / not confirmed") : "Not available"}</span></div>
        <div class="attr-item"><span class="attr-item__label">Candidate Segment</span><span class="attr-item__value font-mono" style="font-size: var(--text-xs);">${readiness.candidateSegment || "Not available"}</span></div>
        <div class="attr-item"><span class="attr-item__label">Channel Consent (Marketing)</span><span class="attr-item__value">${readiness.consentStatus}</span></div>
        <div class="attr-item"><span class="attr-item__label">Last Review Date</span><span class="attr-item__value">${readiness.lastReviewed}</span></div>
      </div>
      <p class="c360-signal-card__caveat">${readiness.explanation} DNA score does not equal campaign eligibility; confirmed trend does not guarantee channel consent; product mapping is a CRM/campaign use-case mapping, not personalized investment advice.</p>
    </div>`;
}

function dnaCampaignTestingHTML(readiness) {
  const statusBadgeClass = { ready: "badge--success", pending: "badge--warning", ineligible: "badge--danger", data_unavailable: "badge--neutral" }[readiness.status];
  return `
    <div class="c360-signal-card">
      <div class="c360-signal-card__header">
        <span class="c360-signal-card__title">Campaign Testing</span>
        <span class="c360-synthetic-note"><i data-lucide="flask-conical"></i>Synthetic demo data</span>
      </div>
      <dl class="c360-dna-testing-kv">
        <dt>candidate_segment</dt><dd>${readiness.candidateSegment || "null"}</dd>
        <dt>required_condition</dt><dd>${readiness.requiredCondition}</dd>
        <dt>anti_flip_condition</dt><dd>${readiness.antiFlipCondition}</dd>
        <dt>channel_consent</dt><dd>${readiness.consentStatus}${readiness.consentEligible ? " (eligible)" : " (not eligible)"}</dd>
        <dt>overall_readiness</dt><dd><span class="badge ${statusBadgeClass}" style="margin-left: 0;">${readiness.statusLabel}</span></dd>
      </dl>
      <p class="c360-signal-card__caveat">A "Ready for testing" result applies to this prototype's synthetic dataset only — it never implies production campaign eligibility, and nothing on this panel sends a message or activates a campaign.</p>
    </div>`;
}

function renderDnaRiskAppetite(c) {
  const mount = document.querySelector("[data-c360-dna]");
  if (!mount) return;
  const profile = getDnaProfile(c.id);

  if (!profile.available) {
    mount.innerHTML = insufficientDataNote(profile.unavailableReason);
    refreshIcons();
    return;
  }

  mount.innerHTML = `
    <div class="c360-dna-top">
      <div>
        ${renderDnaGaugeHTML({ score: profile.dna_score, band: profile.dna_band })}
        <p style="font-size: var(--text-xs); color: var(--text-tertiary); margin-top: var(--space-3); text-align: center;" data-tooltip="Reflects the model's risk-seeking profile only — not a guarantee of investment suitability or loss tolerance." data-tooltip-pos="bottom">
          <i data-lucide="info" style="width: 11px; height: 11px; vertical-align: -1px;"></i>
          Risk-seeking profile only — not a suitability guarantee.
        </p>
      </div>
      <div>
        <p class="subhead" style="margin-bottom: var(--space-3);">Current DNA Profile</p>
        <div class="c360-relative-summary" style="margin-bottom: 0;">
          <div class="c360-relative-summary__item">
            <span class="c360-relative-summary__label">Current DNA Score <span style="font-weight: var(--weight-regular);">(as of ${profile.dna_last_scored})</span></span>
            <span class="c360-relative-summary__value">${profile.dna_score} / 100</span>
          </div>
          <div class="c360-relative-summary__item"><span class="c360-relative-summary__label">DNA Band</span><span class="c360-relative-summary__value">${profile.dna_band.label}</span></div>
          <div class="c360-relative-summary__item">
            <span class="c360-relative-summary__label" data-tooltip="The model-level trend, confirmed only after two consecutive monthly reviews agree — distinct from short-term movement in the chart below." data-tooltip-pos="bottom">Model DNA Trend</span>
            <span class="c360-relative-summary__value">${dnaTrendBadgeHTML(profile)}</span>
          </div>
          <div class="c360-relative-summary__item"><span class="c360-relative-summary__label">Last Scoring Date</span><span class="c360-relative-summary__value">${profile.dna_last_scored}</span></div>
          <div class="c360-relative-summary__item"><span class="c360-relative-summary__label">Last Monthly Review</span><span class="c360-relative-summary__value">${profile.dna_last_reviewed || "Not available in demo data"}</span></div>
          <div class="c360-relative-summary__item"><span class="c360-relative-summary__label">DNA Lifecycle</span><span class="c360-relative-summary__value">${profile.dna_lifecycle_stage}</span></div>
        </div>
      </div>
    </div>
    <div data-dna-block="trend" style="margin-bottom: var(--space-6);">
      <div class="cluster" style="justify-content: space-between; align-items: center; flex-wrap: wrap; gap: var(--space-3); margin-bottom: var(--space-3);">
        <p class="subhead" style="margin-bottom: 0;">DNA Score Trend <span style="font-weight: var(--weight-regular); color: var(--text-tertiary);">— 0–100 scale</span></p>
        ${chartSwitchHTML("dna-trend-range", [{ id: "7d", label: "7D" }, { id: "30d", label: "30D" }, { id: "60s", label: "60 Sessions" }, { id: "90d", label: "90D" }], "30d")}
      </div>
      <div data-chart-content="dna-trend"></div>
      <p style="font-size: var(--text-xs); color: var(--text-tertiary); margin-top: var(--space-3);">Chart shows raw scoring-session history for the selected range only, on the full documented 0–100 scale — a separate measure from the Model DNA Trend above, which only updates after two consecutive monthly reviews agree on direction.</p>
    </div>`
     /*`<div style="margin-bottom: var(--space-6);">
      ${dnaScoringBreakdownHTML(profile)}
    </div>

    <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)); gap: var(--space-5);">
      ${dnaCampaignReadinessHTML(getCampaignReadiness(profile, c.consent))}
      ${dnaCampaignTestingHTML(getCampaignReadiness(profile, c.consent))}
    </div>`*/
  ;

  const trendBlock = mount.querySelector('[data-dna-block="trend"]');
  const trendContent = trendBlock.querySelector('[data-chart-content="dna-trend"]');
  renderDnaTrendInto(trendContent, profile, "30d");
  wireChartSwitch(trendBlock, "dna-trend-range", (windowKey) => renderDnaTrendInto(trendContent, profile, windowKey));

  refreshIcons();
}

/* ---------------------------------------------------------------- */
/* Tab 1 — Identity Resolution + Attributes                          */
/* ---------------------------------------------------------------- */

function renderIdentity(c) {
  const mount = document.querySelector("[data-c360-identity]");
  if (!mount) return;

  const summary = document.querySelector("[data-c360-identity-summary]");
  if (summary) {
    const sourceCount = new Set(c.identities.flatMap((i) => i.values.map((v) => v.source))).size;
    summary.textContent = `${c.identities.length} identity types unified from ${sourceCount} sources`;
  }

  function extraValueBlock(v) {
    const verify = verifyMeta(v.status);
    return `
      <div class="identity-item__extra-row">
        <div class="identity-item__value">${v.value}</div>
        <div class="identity-item__meta">
          <span class="badge badge--neutral">${v.source}</span>
          <span class="identity-row__verify ${verify.cls}"><i data-lucide="${verify.icon}"></i>${v.status}</span>
          <span class="identity-item__seen">${v.lastSeen}</span>
        </div>
      </div>`;
  }

  // Compact 2-column grid — one item per identity type. Items with
  // more than one value are expandable (click the item or the +N
  // chip) rather than showing every value by default.
  mount.innerHTML = c.identities
    .map((idn, idx) => {
      const [first, ...rest] = idn.values;
      const hasMore = rest.length > 0;
      const verify = verifyMeta(first.status);
      return `
      <div class="identity-item${hasMore ? " identity-item--expandable" : ""}" data-identity-item="${idx}">
        <div class="identity-item__head">
          <span class="identity-item__label">${idn.type}</span>
          ${hasMore ? `<span class="identity-row__more" data-identity-toggle="${idx}" aria-expanded="false" aria-controls="identity-extra-${idx}">+${idn.values.length}</span>` : ""}
        </div>
        <div class="identity-item__value">${first.value}</div>
        <div class="identity-item__meta">
          <span class="badge badge--neutral">${first.source}</span>
          <span class="identity-row__verify ${verify.cls}"><i data-lucide="${verify.icon}"></i>${first.status}</span>
          <span class="identity-item__seen">${first.lastSeen}</span>
        </div>
        ${hasMore ? `<div class="identity-item__extra" id="identity-extra-${idx}" hidden>${rest.map(extraValueBlock).join("")}</div>` : ""}
      </div>`;
    })
    .join("");

  mount.querySelectorAll("[data-identity-item].identity-item--expandable").forEach((item) => {
    const idx = item.dataset.identityItem;
    const extra = document.getElementById(`identity-extra-${idx}`);
    const chip = item.querySelector("[data-identity-toggle]");
    if (!extra) return;
    makeInteractive(item, () => {
      const willShow = extra.hidden;
      extra.hidden = !willShow;
      chip?.setAttribute("aria-expanded", String(willShow));
    });
  });

  refreshIcons();
}

function renderAttributes(c) {
  const mount = document.querySelector("[data-c360-attributes]");
  if (!mount) return;
  mount.innerHTML = Object.entries(c.attributes)
    .map(
      ([label, value]) => `
    <div class="attr-item">
      <span class="attr-item__label">${label}</span>
      <span class="attr-item__value">${value}</span>
    </div>`
    )
    .join("");
}

/* ---------------------------------------------------------------- */
/* Tab 2 — Behavior, Event Timeline, Transactions, Consent            */
/* ---------------------------------------------------------------- */

function renderBehavior(c) {
  const mount = document.querySelector("[data-c360-behavior]");
  if (!mount) return;
  mount.innerHTML = BEHAVIOR_META.map(({ key, label, max }) => {
    const value = c.behavior[key];
    const pct = Math.min(100, Math.round((value / max) * 100));
    return `
      <div class="behavior-item">
        <span class="behavior-item__label">${label}</span>
        <span class="behavior-item__value">${value.toLocaleString("en-US")}</span>
        <span class="mini-bar mini-bar--full"><span class="mini-bar__track"><span class="mini-bar__fill" style="width:${pct}%;"></span></span></span>
      </div>`;
  }).join("");
}

function renderTimeline(c) {
  const mount = document.querySelector("[data-c360-timeline]");
  if (!mount) return;

  const events = c.events.filter(
    (e) =>
      (currentCategoryFilter === "all" || e.category === currentCategoryFilter) &&
      (currentSourceFilter === "all" || e.source === currentSourceFilter)
  );

  if (events.length === 0) {
    mount.innerHTML = `<p class="table__empty">No events match the current filters.</p>`;
    return;
  }

  mount.innerHTML = `
    <div class="timeline timeline--rich">
      ${events
        .map(
          (ev, i) => `
        <div class="timeline__item" data-event-index="${i}">
          <div class="timeline__rail">
            <span class="timeline__dot ${CATEGORY_DOT_CLASS[ev.category]}"></span>
            <span class="timeline__line"></span>
          </div>
          <div class="timeline__content">
            <div class="timeline__header">
              <span class="timeline__title">${ev.type}</span>
              <span class="badge badge--neutral"><i data-lucide="${SOURCE_ICON[ev.source] || "circle-dot"}"></i>${ev.source}</span>
              ${ev.status ? `<span class="badge badge--success timeline__status">${ev.status}</span>` : ""}
            </div>
            <p class="timeline__time">${ev.date} · ${ev.time}</p>
            ${
              ev.props.length
                ? `<div class="timeline__props">${ev.props.map((p) => `<span class="timeline__prop">${p}</span>`).join("")}</div>`
                : ""
            }
          </div>
        </div>`
        )
        .join("")}
    </div>
  `;

  mount.querySelectorAll("[data-event-index]").forEach((el) => {
    const ev = events[Number(el.dataset.eventIndex)];
    makeInteractive(el, () => openDetailDrawer("event", ev, c));
  });

  refreshIcons();
}

function initEventFilters() {
  const tablist = document.querySelector("[data-c360-event-filter]");
  const sourceSelect = document.querySelector("[data-c360-source-filter]");

  if (tablist) {
    const tabs = Array.from(tablist.querySelectorAll(".tabs__tab"));
    tabs.forEach((tab) => {
      tab.addEventListener("click", () => {
        tabs.forEach((t) => t.setAttribute("aria-selected", String(t === tab)));
        currentCategoryFilter = tab.dataset.filter;
        renderTimeline(currentCustomer);
      });
    });
  }

  if (sourceSelect) {
    sourceSelect.addEventListener("change", () => {
      currentSourceFilter = sourceSelect.value;
      renderTimeline(currentCustomer);
    });
  }
}

function renderTransactions(c) {
  const table = document.querySelector("[data-c360-transactions]");
  if (!table) return;
  // Headers are static and already wired once by bootstrapPage's
  // initAllSortableTables() — only the tbody changes per customer.
  const tbody = table.querySelector("tbody");
  tbody.innerHTML = c.transactions
    .map(
      (t) => `
    <tr>
      <td class="cell-muted">${t.date}</td>
      <td class="cell-primary">${t.type}</td>
      <td>${t.instrument}</td>
      <td class="cell-muted">${t.side}</td>
      <td class="num tabular-nums">${t.qty}</td>
      <td class="num cell-primary">${t.valueBand}</td>
      <td><span class="badge badge--neutral">${t.channel}</span></td>
      <td><span class="badge badge--success">${t.status}</span></td>
    </tr>`
    )
    .join("");
}

function renderConsent(c) {
  const mount = document.querySelector("[data-c360-consent]");
  if (!mount) return;
  mount.innerHTML = c.consent
    .map(
      (row) => `
    <div class="identity-row">
      <div class="identity-row__main">
        <span class="identity-row__label">${row.type}</span>
        <span class="badge ${row.status === "Granted" ? "badge--success" : "badge--neutral"}" style="margin-top: 2px;">${row.status}</span>
      </div>
      <div class="identity-row__meta">
        <span class="identity-row__seen">Source: ${row.source}</span>
        <span class="identity-row__seen">Updated ${row.updated}</span>
      </div>
    </div>`
    )
    .join("");
}

/* ---------------------------------------------------------------- */
/* Tab 3 — Engagement, Audience Membership, Forward / Activation      */
/* ---------------------------------------------------------------- */

function renderEngagement(c) {
  const mount = document.querySelector("[data-c360-engagement]");
  if (!mount) return;
  const e = c.engagement;
  mount.innerHTML = `
    <div class="behavior-item">
      <span class="behavior-item__label">Push Open Rate</span>
      <span class="behavior-item__value">${e.pushOpenRate}%</span>
      <span class="mini-bar mini-bar--full"><span class="mini-bar__track"><span class="mini-bar__fill" style="width:${e.pushOpenRate}%;background:var(--chart-blue);"></span></span></span>
    </div>
    <div class="behavior-item">
      <span class="behavior-item__label">Email Open Rate</span>
      <span class="behavior-item__value">${e.emailOpenRate}%</span>
      <span class="mini-bar mini-bar--full"><span class="mini-bar__track"><span class="mini-bar__fill" style="width:${e.emailOpenRate}%;background:var(--chart-teal);"></span></span></span>
    </div>
    <div class="behavior-item">
      <span class="behavior-item__label">In-App Engagement</span>
      <span class="behavior-item__value">${e.inAppEngagement}%</span>
      <span class="mini-bar mini-bar--full"><span class="mini-bar__track"><span class="mini-bar__fill" style="width:${e.inAppEngagement}%;background:var(--chart-gold);"></span></span></span>
    </div>
    <div class="behavior-item">
      <span class="behavior-item__label">Web Message Engagement</span>
      <span class="behavior-item__value">${e.webMessageEngagement}%</span>
      <span class="mini-bar mini-bar--full"><span class="mini-bar__track"><span class="mini-bar__fill" style="width:${e.webMessageEngagement}%;background:var(--chart-green);"></span></span></span>
    </div>
    <div class="behavior-item">
      <span class="behavior-item__label">Last Campaign</span>
      <span class="behavior-item__value" style="font-size: var(--text-sm);">${e.lastCampaign}</span>
    </div>
    <div class="behavior-item">
      <span class="behavior-item__label">Campaign Interactions</span>
      <span class="behavior-item__value">${e.campaignInteractions}</span>
    </div>
    <div class="behavior-item">
      <span class="behavior-item__label">Last Engagement</span>
      <span class="behavior-item__value" style="font-size: var(--text-sm);">${e.lastEngagement}</span>
    </div>
  `;
}

function renderAudiences(c) {
  const table = document.querySelector("[data-c360-audiences]");
  if (!table) return;
  const tbody = table.querySelector("tbody");
  tbody.innerHTML = c.audiences
    .map(
      (a, i) => `
    <tr data-audience-index="${i}">
      <td class="cell-primary">${a.name}</td>
      <td class="cell-muted">${a.joined}</td>
      <td><span class="badge badge--success">${a.status}</span></td>
      <td class="cell-muted">${a.lastEvaluated}</td>
      <td><i class="row-affordance" data-lucide="chevron-right"></i></td>
    </tr>`
    )
    .join("");

  tbody.querySelectorAll("[data-audience-index]").forEach((row) => {
    row.style.cursor = "pointer";
    const a = c.audiences[Number(row.dataset.audienceIndex)];
    makeInteractive(row, () => openDetailDrawer("audience", a, c));
  });
  refreshIcons();
}

/* ---- Campaigns & Journeys sub-tab (beside Audience Membership) -------- */
/* Names/channels/goals are pulled read-only from the real shared      */
/* Campaigns/Journey Builder catalogs; enrollment status/timestamps    */
/* are synthetic Customer-360-local prototype data — see module header */
/* in js/data/customer-360-engagement.js. Nothing here writes to, or   */
/* claims to reflect, the live Campaigns or Journey Builder modules.   */
const ENROLLMENT_BADGE_CLASS = {
  Enrolled: "badge--info",
  "In Progress": "badge--warning",
  Completed: "badge--success",
  Exited: "badge--neutral",
  "Not Enrolled": "badge--neutral",
  Unknown: "badge--neutral",
};

function campaignsJourneysTableHTML(title, rows, columns) {
  if (!rows.length) {
    return `<div style="margin-bottom: var(--space-6);"><p class="subhead" style="margin-bottom: var(--space-2);">${title}</p>${insufficientDataNote("No records for this customer.")}</div>`;
  }
  return `
    <div style="margin-bottom: var(--space-6);">
      <p class="subhead" style="margin-bottom: var(--space-2);">${title}</p>
      <div class="table-wrap">
        <table class="table table--dense">
          <thead><tr>${columns.map((c) => `<th>${c.label}</th>`).join("")}</tr></thead>
          <tbody>${rows.map((r) => `<tr>${columns.map((c) => `<td>${c.render(r)}</td>`).join("")}</tr>`).join("")}</tbody>
        </table>
      </div>
    </div>`;
}

function renderCampaignsJourneys(c) {
  const mount = document.querySelector("[data-c360-campaigns-journeys]");
  if (!mount) return;

  const campaigns = getCampaignEnrollmentsForCustomer(c.id);
  const journeys = getJourneyEnrollmentsForCustomer(c.id);
  const notEnrolled = getNotEnrolledNotesForCustomer(c.id);

  const campaignsTable = campaignsJourneysTableHTML("Campaigns", campaigns, [
    { label: "Campaign", render: (r) => `<span class="cell-primary">${r.name}</span>` },
    { label: "Channel", render: (r) => r.channel },
    { label: "Status", render: (r) => `<span class="badge ${ENROLLMENT_BADGE_CLASS[r.status] || "badge--neutral"}">${r.status}</span>` },
    { label: "Enrolled", render: (r) => r.enrolledAt || "—" },
    { label: "Delivery", render: (r) => r.deliveryStatus || "Unknown" },
    { label: "Engagement", render: (r) => r.engagementStatus || "Unknown" },
    { label: "Last Interaction", render: (r) => r.lastInteractionAt || "Not recorded" },
    { label: "Outcome", render: (r) => r.outcome || "Not recorded" },
  ]);

  const journeysTable = campaignsJourneysTableHTML("Journeys", journeys, [
    { label: "Journey", render: (r) => `<span class="cell-primary">${r.name}</span>` },
    { label: "Status", render: (r) => `<span class="badge ${ENROLLMENT_BADGE_CLASS[r.status] || "badge--neutral"}">${r.status}</span>` },
    { label: "Enrolled", render: (r) => r.enrolledAt || "—" },
    { label: "Current Step", render: (r) => r.currentStep || "Unknown" },
    { label: "Last Interaction", render: (r) => r.lastInteractionAt || "Not recorded" },
    { label: "Exit / Completion", render: (r) => r.exitStatus || "Not exited" },
    { label: "Outcome", render: (r) => r.outcome || "Not recorded" },
  ]);

  const notEnrolledBlock = notEnrolled.length
    ? `<div class="panel" style="background: var(--surface-sunken); margin-bottom: var(--space-6);">${notEnrolled
        .map((n) => `<p style="font-size: var(--text-xs); color: var(--text-secondary); margin: 0;"><strong>${n.name}</strong> — ${n.reason}</p>`)
        .join("")}</div>`
    : "";

  mount.innerHTML =
    campaignsTable +
    journeysTable +
    notEnrolledBlock +
    `<p style="font-size: var(--text-xs); color: var(--text-tertiary);">Campaign/journey names are from the shared Campaigns and Journey Builder catalogs; enrollment status, timestamps and outcomes shown here are synthetic prototype data local to Customer 360, not live execution records. Audience membership above is never used to infer enrollment here.</p>`;
}

function renderForward() {
  const table = document.querySelector("[data-c360-forward]");
  if (!table) return;
  const tbody = table.querySelector("tbody");
  tbody.innerHTML = FORWARD_DESTINATIONS.map((d, i) => {
    const statusBadge = d.status === "Connected" ? "badge--success" : d.status === "Warning" ? "badge--warning" : "badge--danger";
    return `
    <tr data-destination-index="${i}">
      <td class="cell-primary">${d.destination}</td>
      <td class="cell-muted">${d.type}</td>
      <td><span class="badge ${statusBadge}">${d.status}</span></td>
      <td class="cell-muted">${d.lastSync}</td>
      <td class="num tabular-nums">${d.forwarded}</td>
      <td><i class="row-affordance" data-lucide="chevron-right"></i></td>
    </tr>`;
  }).join("");

  tbody.querySelectorAll("[data-destination-index]").forEach((row) => {
    row.style.cursor = "pointer";
    const d = FORWARD_DESTINATIONS[Number(row.dataset.destinationIndex)];
    makeInteractive(row, () => openDetailDrawer("destination", d));
  });
  refreshIcons();
}

/* ---------------------------------------------------------------- */
/* Shared detail drawer (event | audience | destination)             */
/* ---------------------------------------------------------------- */

function fieldRow(label, value) {
  return `<div class="cluster gap-2" style="justify-content:space-between;"><span class="cell-muted">${label}</span><span class="font-mono">${value}</span></div>`;
}

function openDetailDrawer(type, item, c) {
  const overlay = document.getElementById("c360-detail-drawer");
  if (!overlay) return;
  const eyebrow = overlay.querySelector("[data-drawer-eyebrow]");
  const title = overlay.querySelector("[data-drawer-title]");
  const body = overlay.querySelector("[data-drawer-body]");

  if (type === "event") {
    eyebrow.textContent = "Event Detail";
    title.textContent = item.type;
    body.innerHTML = `
      <div class="stack gap-2" style="font-size: var(--text-sm);">
        ${fieldRow("Customer", c.name)}
        ${fieldRow("Timestamp", `${item.date} ${item.time}`)}
        ${fieldRow("Source", item.source)}
        ${item.status ? fieldRow("Status", item.status) : ""}
        ${item.props.map((p, i) => fieldRow(`Property ${i + 1}`, p)).join("")}
      </div>`;
  } else if (type === "audience") {
    eyebrow.textContent = "Audience Membership";
    title.textContent = item.name;
    body.innerHTML = `
      <div class="stack gap-2" style="font-size: var(--text-sm);">
        ${fieldRow("Customer", c.name)}
        ${fieldRow("Joined", item.joined)}
        ${fieldRow("Status", item.status)}
        ${fieldRow("Last Evaluated", item.lastEvaluated)}
      </div>`;
  } else if (type === "destination") {
    eyebrow.textContent = "Forward Destination";
    title.textContent = item.destination;
    body.innerHTML = `
      <div class="stack gap-2" style="font-size: var(--text-sm);">
        ${fieldRow("Type", item.type)}
        ${fieldRow("Status", item.status)}
        ${fieldRow("Last Sync", item.lastSync)}
        ${fieldRow("Records / Events Forwarded", item.forwarded)}
      </div>
      <p style="font-size: var(--text-xs); color: var(--text-tertiary); margin-top: var(--space-4);">Illustrative only — no data is actually sent to this destination.</p>`;
  } else if (type === "recommendation") {
    eyebrow.textContent = `Recommendation · Rule ${item.ruleId}`;
    title.textContent = item.title;
    body.innerHTML = `
      <p style="font-size: var(--text-sm); color: var(--text-secondary); margin-bottom: var(--space-4);">${item.reason}</p>
      <p class="subhead" style="margin-bottom: var(--space-2);">Evidence</p>
      <div class="stack gap-2" style="font-size: var(--text-sm); margin-bottom: var(--space-4);">
        ${item.evidence.map((e) => fieldRow(e.label, e.value)).join("") || `<p class="table__empty">No supporting evidence recorded.</p>`}
      </div>
      ${item.suggestedNextStep ? `<p class="subhead" style="margin-bottom: var(--space-2);">Suggested Next Step</p><p style="font-size: var(--text-sm); color: var(--text-primary); margin-bottom: var(--space-4);">${item.suggestedNextStep}</p>` : ""}
      ${item.note ? `<p style="font-size: var(--text-xs); color: var(--text-tertiary);">${item.note}</p>` : ""}
      <p style="font-size: var(--text-xs); color: var(--text-tertiary); margin-top: var(--space-4);">Prototype recommendation — generated from a documented rule, not a predictive score.</p>`;
  } else if (type === "ekyc") {
    eyebrow.textContent = "eKYC Follow-up";
    title.textContent = item.transId.slice(0, 8);
    body.innerHTML = `
      <div class="stack gap-2" style="font-size: var(--text-sm);">
        ${fieldRow("Customer", c.name)}
        ${fieldRow("Step", item.step)}
        ${fieldRow("Error", item.error || "Not recorded")}
        ${fieldRow("PIC", item.pic || "Not recorded")}
        ${fieldRow("Call Date", item.callDate || "Not recorded")}
        ${fieldRow("Follow Count", item.followCount)}
        ${fieldRow("Reachability", item.reachability || "Not recorded")}
        ${fieldRow("Call Outcome", item.callOutcome || "Not recorded")}
        ${fieldRow("CS Comment", item.csComment || "Not recorded")}
      </div>
      <p style="font-size: var(--text-xs); color: var(--text-tertiary); margin-top: var(--space-4);">Synthetic prototype data, shaped after a real PHS customer-care workbook. Not a live eKYC system.</p>`;
  } else if (type === "ticket") {
    eyebrow.textContent = "Support Ticket";
    title.textContent = item.code;
    body.innerHTML = `
      <div class="stack gap-2" style="font-size: var(--text-sm);">
        ${fieldRow("Customer", c.name)}
        ${fieldRow("Created", item.createdDate)}
        ${fieldRow("Classification", item.classification)}
        ${fieldRow("Category", item.category)}
        ${fieldRow("Source", item.source)}
        ${fieldRow("Status", item.status)}
        ${fieldRow("Priority", item.priority)}
        ${fieldRow("VIP Classification", item.vipClassification || "Not recorded")}
        ${fieldRow("Description", item.description || "Not recorded")}
        ${fieldRow("Resolution", item.resolution || "Not recorded")}
        ${fieldRow("Total Time", item.totalTime)}
        ${fieldRow("Total Processing Time", item.totalProcessingTime)}
        ${fieldRow("Assigned To", item.assignedTo || "Not recorded")}
      </div>
      <p style="font-size: var(--text-xs); color: var(--text-tertiary); margin-top: var(--space-4);">Synthetic prototype data, shaped after a real PHS support-ticket workbook. Not a live CRM ticket.</p>`;
  } else if (type === "rfmAggregate") {
    // Shared, aggregate-only detail content (js/pages/rfm-cell-detail.js)
    // — the same module the RFM Analysis page uses. Never fetches or
    // displays individual customer records; "includesCurrentCustomer"
    // is a pure coordinate/segment-name comparison against this
    // customer's OWN already-known score (see openRfmAggregateDetail
    // below), not a population lookup.
    const meta = item;
    eyebrow.textContent = meta.kind === "cell" ? `RFM Cell — R${meta.r} × F${meta.f}` : "RFM Segment";
    title.textContent = meta.segment || "No segment";
    body.innerHTML = renderRfmAggregateDetailHTML(meta);
    wireRfmAggregateDetailInteractivity(body, meta);
  }

  overlay.classList.add("is-open");
  document.body.style.overflow = "hidden";
}

/** Opens the aggregate-only RFM detail drawer for either a grid cell
 * or a treemap segment, then applies the "selected" outline to
 * whichever view is currently active. `result` is this customer's
 * OWN already-computed score (from renderRfmPosition's scoreCustomer
 * call) — used only to derive "does this cell/segment include the
 * customer currently being viewed", a plain coordinate/name
 * comparison, never a fetch of anyone else's record. */
function openRfmAggregateDetail(selector, config, result, c) {
  const detail = selector.kind === "cell" ? getCellAggregateDetail(selector.r, selector.f, config) : getSegmentAggregateDetail(selector.segment, config);
  if (detail.dataAvailabilityError) return;

  const includesCurrentCustomer =
    result.supported &&
    (selector.kind === "cell" ? result.rScore === selector.r && result.fScore === selector.f : result.segment === selector.segment);

  const meta = {
    ...detail,
    referenceDate: config.referenceDate,
    lookbackDays: config.lookbackDays,
    rMetricLabel: rfmMetricLabel(config.rMetric, C360_R_METRIC_OPTIONS),
    mMetricLabel: rfmMetricLabel(config.mMetric, C360_M_METRIC_OPTIONS),
    formatM: formatVndCompact,
    includesCurrentCustomer,
  };
  openDetailDrawer("rfmAggregate", meta, c);

  if (selector.kind === "cell") {
    document.querySelectorAll("[data-rfm-cell]").forEach((el) => {
      el.classList.toggle("rfm-grid__cell--selected", Number(el.dataset.rfmR) === selector.r && Number(el.dataset.rfmF) === selector.f);
    });
  } else {
    document.querySelectorAll("[data-rfm-segment]").forEach((el) => {
      el.classList.toggle("rfm-treemap__rect--selected", el.dataset.rfmSegment === selector.segment);
    });
  }
  refreshIcons();
}

function initDetailDrawer() {
  const overlay = document.getElementById("c360-detail-drawer");
  if (!overlay) return;
  function close() {
    overlay.classList.remove("is-open");
    document.body.style.overflow = "";
    // Harmless no-op when the drawer was showing a non-RFM detail —
    // only clears the "selected" outline on the RFM grid/treemap, if present.
    document.querySelectorAll("[data-rfm-cell].rfm-grid__cell--selected").forEach((el) => el.classList.remove("rfm-grid__cell--selected"));
    document.querySelectorAll("[data-rfm-segment].rfm-treemap__rect--selected").forEach((el) => el.classList.remove("rfm-treemap__rect--selected"));
  }
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) close();
  });
  overlay.querySelectorAll("[data-drawer-close]").forEach((btn) => btn.addEventListener("click", close));
  // js/components/drawer.js's global Escape handler (registered
  // earlier, during bootstrapPage) also closes any open
  // .drawer-overlay — but it fires FIRST (listener registration
  // order) and only removes "is-open", so a guard here checking
  // "is it still open" would already read false by the time it runs,
  // skipping this page's own cleanup (clearing the RFM grid's
  // selected-cell outline). close() is idempotent when already
  // closed, so this just always runs it rather than racing that check.
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") close();
  });
}

/* ==================================================================== */
/* PROFILE ANALYTICS — decision-support tab                              */
/* Recommendation status is prototype-only, persisted to localStorage,   */
/* keyed by customerId + ruleId so one customer's changes can never leak */
/* into another's. Follows the same localStorage-with-safe-fallback      */
/* pattern already established by js/components/connector-directory.js.  */
/* ==================================================================== */
const ACTION_STATUS_STORAGE_KEY = "phs-cdp-c360-action-status-v1";
const ACTION_STATUSES = ["Recommended", "In Progress", "Completed", "Dismissed"];
let actionStatusMemory = {}; // in-memory fallback if localStorage throws/unavailable

function loadActionStatusStore() {
  try {
    const raw = localStorage.getItem(ACTION_STATUS_STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return actionStatusMemory;
  }
}

function saveActionStatusStore(store) {
  try {
    localStorage.setItem(ACTION_STATUS_STORAGE_KEY, JSON.stringify(store));
  } catch {
    actionStatusMemory = store; // localStorage unavailable — state won't persist across reloads this session
  }
}

function getActionStatus(customerId, ruleId) {
  const store = loadActionStatusStore();
  return store[customerId]?.[ruleId]?.status || "Recommended";
}

function getActionHistory(customerId, ruleId) {
  const store = loadActionStatusStore();
  return store[customerId]?.[ruleId]?.history || [];
}

function setActionStatus(customerId, ruleId, status) {
  const store = loadActionStatusStore();
  if (!store[customerId]) store[customerId] = {};
  if (!store[customerId][ruleId]) store[customerId][ruleId] = { status: "Recommended", history: [] };
  store[customerId][ruleId].status = status;
  store[customerId][ruleId].history.push({ status, at: new Date().toISOString() });
  saveActionStatusStore(store);
}

/** All recorded action-status changes for a customer, across every
 * rule that has ever had a status change — feeds Action Outcome &
 * Follow-up History. Returns [] (not undefined) when nothing recorded. */
function getAllActionHistoryForCustomer(customerId) {
  const store = loadActionStatusStore();
  const byRule = store[customerId] || {};
  const rows = [];
  Object.entries(byRule).forEach(([ruleId, entry]) => {
    entry.history.forEach((h) => rows.push({ ruleId, status: h.status, at: h.at }));
  });
  return rows.sort((a, b) => new Date(b.at) - new Date(a.at));
}

function currentAnalyticsContext(c) {
  const classification = getClassificationForCustomer(c.id);
  const ekycFollowups = getEkycFollowupsForCustomer(c.id);
  const tickets = getTicketsForCustomer(c.id);
  return { customer: c, classification, ekycFollowups, tickets };
}

/* ---- 1. Customer Snapshot ------------------------------------------- */
// Count of this customer's recommendations that are not yet
// Completed/Dismissed (and not the Rule-F "insufficient data"
// placeholder, which isn't an actionable item). Genuinely new
// information for the snapshot — not a restatement of the ticket or
// eKYC counts shown alongside it, since one open ticket or eKYC issue
// doesn't necessarily correspond 1:1 with an open recommendation.
function openRecommendationCount(c) {
  const recs = generateRecommendations(currentAnalyticsContext(c)).filter((r) => r.ruleId !== "F");
  return recs.filter((r) => {
    const status = getActionStatus(c.id, r.ruleId);
    return status !== "Completed" && status !== "Dismissed";
  }).length;
}

function renderAnalyticsSnapshot(c) {
  const mount = document.querySelector("[data-c360-analytics-snapshot]");
  if (!mount) return;
  const { classification, ekycFollowups, tickets } = currentAnalyticsContext(c);
  const openTickets = tickets.filter((t) => t.status !== "Đã đóng" && t.status !== "Đã hủy").length;
  const openRecs = openRecommendationCount(c);

  mount.innerHTML = `
    <div class="metric-row">
      <div class="metric metric--primary">
        <span class="metric__label">CRM Classification</span>
        <div class="metric__value-row"><span class="metric__value" style="font-size: var(--text-xl);">${classification ? classification.classificationCode : "—"}</span></div>
        <span class="metric__footnote">${classification ? getClassificationLabelSafe(classification.classificationCode) : "No CRM classification on record"}</span>
      </div>
      <div class="metric ${openRecs > 0 ? "metric--warning" : ""}">
        <span class="metric__label">Open Recommendations</span>
        <div class="metric__value-row"><span class="metric__value" style="font-size: var(--text-xl);">${openRecs}</span></div>
        <span class="metric__footnote">${openRecs ? "Not yet Completed or Dismissed" : "None open"}</span>
      </div>
      <div class="metric ${openTickets > 0 ? "metric--warning" : ""}">
        <span class="metric__label">Support Tickets</span>
        <div class="metric__value-row"><span class="metric__value" style="font-size: var(--text-xl);">${tickets.length}</span></div>
        <span class="metric__footnote">${tickets.length ? `${openTickets} not confirmed-closed` : "No related tickets"}</span>
      </div>
      <div class="metric ${ekycFollowups.length ? "metric--warning" : ""}">
        <span class="metric__label">eKYC Follow-ups</span>
        <div class="metric__value-row"><span class="metric__value" style="font-size: var(--text-xl);">${ekycFollowups.length}</span></div>
        <span class="metric__footnote">${ekycFollowups.length ? "Documented follow-up on record" : "None on record"}</span>
      </div>
      <div class="metric">
        <span class="metric__label">Last CRM Contact</span>
        <div class="metric__value-row"><span class="metric__value" style="font-size: var(--text-lg);">${classification ? classification.lastContactDate : "—"}</span></div>
        <span class="metric__footnote">${classification ? classification.lastContactOutcome : "Not applicable"}</span>
      </div>
    </div>`;
}

function getClassificationLabelSafe(code) {
  return CRM_CLASSIFICATIONS.find((x) => x.code === code)?.label || code;
}

/* ---- 2. Recommended Next Actions -------------------------------------- */
const STATUS_BADGE_CLASS = {
  Recommended: "badge--info",
  "In Progress": "badge--warning",
  Completed: "badge--success",
  Dismissed: "badge--neutral",
};
const PRIORITY_BADGE_CLASS = { High: "badge--danger", Medium: "badge--warning", Low: "badge--neutral" };

function recommendationCardHTML(rec, c) {
  if (rec.ruleId === "F") {
    return `
      <div class="panel" style="text-align: center; padding: var(--space-8);">
        <p style="font-size: var(--text-sm); color: var(--text-secondary); margin: 0;">${rec.title}.</p>
        <p style="font-size: var(--text-xs); color: var(--text-tertiary); margin-top: var(--space-2);">${rec.reason}</p>
      </div>`;
  }
  const status = getActionStatus(c.id, rec.ruleId);
  return `
    <div class="panel" style="margin-bottom: var(--space-3);" data-rec-card="${rec.ruleId}">
      <div class="cluster gap-3" style="justify-content: space-between; align-items: flex-start; flex-wrap: wrap;">
        <div style="min-width: 0;">
          <div class="cluster gap-2" style="flex-wrap: wrap; margin-bottom: var(--space-1);">
            <span class="badge ${PRIORITY_BADGE_CLASS[rec.priority] || "badge--neutral"}">${rec.priority} priority</span>
            <span class="badge ${STATUS_BADGE_CLASS[status]}" data-rec-status-badge>${status}</span>
          </div>
          <h3 style="font-size: var(--text-base); font-weight: var(--weight-semibold); color: var(--text-primary); margin: 0 0 var(--space-1);">${rec.title}</h3>
          <p style="font-size: var(--text-sm); color: var(--text-secondary); margin: 0; max-width: 640px;">${rec.reason}</p>
        </div>
        <div class="cluster gap-2" style="flex-shrink: 0;">
          <button type="button" class="btn btn--outline btn--sm" data-rec-evidence="${rec.ruleId}">
            <i data-lucide="search"></i>
            Evidence
          </button>
          <div class="select select--sm" style="width: 150px;">
            <select data-rec-status-select="${rec.ruleId}" aria-label="Status for ${rec.title}">
              ${ACTION_STATUSES.map((s) => `<option value="${s}" ${s === status ? "selected" : ""}>${s}</option>`).join("")}
            </select>
            <i class="select__chevron" data-lucide="chevron-down"></i>
          </div>
        </div>
      </div>
    </div>`;
}

function renderRecommendations(c) {
  const mount = document.querySelector("[data-c360-recommendations]");
  if (!mount) return;
  const recs = generateRecommendations(currentAnalyticsContext(c));
  mount.innerHTML = recs.map((r) => recommendationCardHTML(r, c)).join("");

  mount.querySelectorAll("[data-rec-evidence]").forEach((btn) => {
    const rec = recs.find((r) => r.ruleId === btn.dataset.recEvidence);
    btn.addEventListener("click", () => openDetailDrawer("recommendation", rec, c));
  });
  mount.querySelectorAll("[data-rec-status-select]").forEach((select) => {
    select.addEventListener("change", () => {
      setActionStatus(c.id, select.dataset.recStatusSelect, select.value);
      // Re-render just the affected pieces — avoids a full customer
      // reload and keeps focus on the control the user just used.
      renderRecommendations(c);
      renderOutcomeHistory(c);
    });
  });
  refreshIcons();
}

/* ---- 3. CRM Classification & Lifecycle --------------------------------- */
function renderClassificationLifecycle(c) {
  const mount = document.querySelector("[data-c360-classification-lifecycle]");
  if (!mount) return;
  const { classification } = currentAnalyticsContext(c);

  const classificationBlock = classification
    ? `
      <div class="identity-row">
        <div class="identity-row__main">
          <span class="identity-row__label">Classification</span>
          <span style="font-size: var(--text-sm); color: var(--text-primary);"><strong>${classification.classificationCode}</strong> — ${getClassificationLabelSafe(classification.classificationCode)}</span>
        </div>
        <div class="identity-row__meta">
          <span class="identity-row__seen">Source: ${classification.source}</span>
          <span class="identity-row__seen">Last contact ${classification.lastContactDate}</span>
        </div>
      </div>
      <div class="identity-row">
        <div class="identity-row__main">
          <span class="identity-row__label">Last Contact Outcome</span>
          <span style="font-size: var(--text-sm); color: var(--text-primary);">${classification.lastContactOutcome}</span>
        </div>
        <div class="identity-row__meta">
          <span class="identity-row__seen">${classification.followUpAttempts} follow-up attempt(s)</span>
        </div>
      </div>`
    : `<p class="table__empty">No CRM classification on record for this customer.</p>`;

  mount.innerHTML = `
    <div class="identity-list">${classificationBlock}</div>
    <p style="font-size: var(--text-xs); color: var(--text-tertiary); margin-top: var(--space-3);">CRM classification reflects a lead/contact-outcome group, not investment risk, asset value, or a confirmed lifecycle stage. Current lifecycle stage is <strong>${c.journey?.currentLabel || "Unknown"}</strong> — see the Customer Journey section above for the full lifecycle position; it is not repeated here.</p>`;
}

/* ---- 4. eKYC & Account Opening Insights (shared with Engagement tab) -- */
function ekycTableHTML(records, c) {
  if (!records.length) {
    return `<p class="table__empty">No eKYC follow-up records for this customer.</p>`;
  }
  return `
    <div class="table-wrap">
      <table class="table table--dense">
        <thead>
          <tr>
            <th>Step</th>
            <th>Error</th>
            <th>PIC</th>
            <th>Call Date</th>
            <th>Follow Count</th>
            <th>Reachability</th>
            <th>Call Outcome</th>
            <th class="cell-check"></th>
          </tr>
        </thead>
        <tbody>
          ${records
            .map(
              (r) => `
          <tr data-ekyc-row="${r.id}" tabindex="0" role="button" style="cursor:pointer;">
            <td class="cell-primary">${r.step}</td>
            <td class="cell-muted">${r.error || "—"}</td>
            <td class="cell-muted">${r.pic || "—"}</td>
            <td class="cell-muted">${r.callDate || "—"}</td>
            <td class="cell-muted">${r.followCount}</td>
            <td class="cell-muted">${r.reachability || "—"}</td>
            <td class="cell-muted">${r.callOutcome || "—"}</td>
            <td><i class="row-affordance" data-lucide="chevron-right"></i></td>
          </tr>`
            )
            .join("")}
        </tbody>
      </table>
    </div>`;
}

function wireEkycRows(mount, records, c) {
  mount.querySelectorAll("[data-ekyc-row]").forEach((row) => {
    const rec = records.find((r) => r.id === row.dataset.ekycRow);
    makeInteractive(row, () => openDetailDrawer("ekyc", rec, c));
  });
  refreshIcons();
}

// Summary only in the Profile Analytics tab's eKYC & Account Opening
// Insights (this function) — NOT duplicated into renderEkycHistory
// (the Engagement tab's plain record list), per the no-duplication
// instruction: one actionable summary, one operational record list.
const EKYC_RESOLVED_OUTCOMES = new Set(["Thành công"]);
function ekycSummaryHTML(records) {
  if (!records.length) {
    return `<p class="table__empty" style="margin-bottom: var(--space-4);">No eKYC follow-up records for this customer — nothing documented or outstanding.</p>`;
  }
  const latest = records[records.length - 1];
  const hasError = records.some((r) => r.error);
  const outstanding = records.some((r) => r.error && !EKYC_RESOLVED_OUTCOMES.has(r.callOutcome));
  const status = !hasError ? "No documented issue" : outstanding ? "Issue documented — follow-up outstanding" : "Issue documented — latest contact successful";
  return `
    <div class="attr-grid" style="margin-bottom: var(--space-5);">
      <div class="attr-item"><span class="attr-item__label">Current Status</span><span class="attr-item__value">${status}</span></div>
      <div class="attr-item"><span class="attr-item__label">Latest Issue / Error</span><span class="attr-item__value">${latest.error || "None documented"}</span></div>
      <div class="attr-item"><span class="attr-item__label">Outstanding Follow-up</span><span class="attr-item__value">${outstanding ? "Yes" : "No"}</span></div>
      <div class="attr-item"><span class="attr-item__label">Latest Contact Outcome</span><span class="attr-item__value">${latest.callOutcome || "Not recorded"}${latest.pic ? ` · PIC: ${latest.pic}` : ""}</span></div>
    </div>`;
}

function renderEkycInsights(c) {
  const mount = document.querySelector("[data-c360-ekyc-insights]");
  if (!mount) return;
  const records = getEkycFollowupsForCustomer(c.id);
  mount.innerHTML = ekycSummaryHTML(records) + ekycTableHTML(records, c);
  wireEkycRows(mount, records, c);
}

function renderEkycHistory(c) {
  const mount = document.querySelector("[data-c360-ekyc-history]");
  if (!mount) return;
  const records = getEkycFollowupsForCustomer(c.id);
  mount.innerHTML = ekycTableHTML(records, c);
  wireEkycRows(mount, records, c);
}

/* ---- 5. Engagement & Customer Support Insights (shared with Engagement tab) */
function ticketTableHTML(tickets, c) {
  if (!tickets.length) {
    return `<p class="table__empty">No support tickets for this customer.</p>`;
  }
  return `
    <div class="table-wrap">
      <table class="table table--dense">
        <thead>
          <tr>
            <th>Ticket</th>
            <th>Created</th>
            <th>Category</th>
            <th>Source</th>
            <th>Status</th>
            <th>Priority</th>
            <th>Assigned To</th>
            <th class="cell-check"></th>
          </tr>
        </thead>
        <tbody>
          ${tickets
            .map(
              (t) => `
          <tr data-ticket-row="${t.id}" tabindex="0" role="button" style="cursor:pointer;">
            <td class="cell-primary font-mono">${t.code}</td>
            <td class="cell-muted">${t.createdDate}</td>
            <td class="cell-muted">${t.category}</td>
            <td class="cell-muted">${t.source}</td>
            <td><span class="badge ${t.status === "Đã đóng" ? "badge--success" : t.status === "Đã hủy" ? "badge--neutral" : "badge--warning"}">${t.status}</span></td>
            <td><span class="badge ${t.priority === "Cao" ? "badge--danger" : "badge--neutral"}">${t.priority}</span></td>
            <td class="cell-muted">${t.assignedTo || "—"}</td>
            <td><i class="row-affordance" data-lucide="chevron-right"></i></td>
          </tr>`
            )
            .join("")}
        </tbody>
      </table>
    </div>`;
}

function wireTicketRows(mount, tickets, c) {
  mount.querySelectorAll("[data-ticket-row]").forEach((row) => {
    const t = tickets.find((x) => x.id === row.dataset.ticketRow);
    makeInteractive(row, () => openDetailDrawer("ticket", t, c));
  });
  refreshIcons();
}

function renderSupportInsights(c) {
  const mount = document.querySelector("[data-c360-support-insights]");
  if (!mount) return;
  const tickets = getTicketsForCustomer(c.id);
  const byCategory = new Map();
  tickets.forEach((t) => byCategory.set(t.category, (byCategory.get(t.category) || 0) + 1));

  const summary = tickets.length
    ? `
    <div class="metric-row" style="margin-bottom: var(--space-5);">
      <div class="metric"><span class="metric__label">Total Tickets</span><div class="metric__value-row"><span class="metric__value" style="font-size: var(--text-lg);">${tickets.length}</span></div></div>
      <div class="metric"><span class="metric__label">Customer Type</span><div class="metric__value-row"><span class="metric__value" style="font-size: var(--text-base);">${getCustomerTypeLabel(c.id)}</span></div></div>
      <div class="metric"><span class="metric__label">Categories</span><div class="metric__value-row"><span class="metric__value" style="font-size: var(--text-base);">${[...byCategory.keys()].join(", ")}</span></div></div>
    </div>`
    : "";

  mount.innerHTML = summary + ticketTableHTML(tickets, c);
  wireTicketRows(mount, tickets, c);
}

function renderTicketHistory(c) {
  const mount = document.querySelector("[data-c360-ticket-history]");
  if (!mount) return;
  const tickets = getTicketsForCustomer(c.id);
  mount.innerHTML = ticketTableHTML(tickets, c);
  wireTicketRows(mount, tickets, c);
}

/* ---- Customer Behavior & Usage Insights -------------------------------- */
/* Every chart/metric here derives ONLY from fields that already exist */
/* on the customer record (events/transactions/behavior/metrics) — no  */
/* new mock records are introduced. Each sub-view either renders real  */
/* data or an explicit insufficient-data state; nothing is fabricated  */
/* to fill a chart. See js/data/customer-360-behavior.js for the pure  */
/* helper functions this section calls.                                */

function insufficientDataNote(text) {
  return `<p class="table__empty" style="padding: var(--space-5) 0;">${text}</p>`;
}

// The shared renderLineChart (js/components/chart.js) renders one
// <text> tick per label with no built-in thinning — fine for the
// small series it was originally built for, but 17+ daily points
// collide into unreadable overlapping text at the chart's fixed
// width. Blanking all but every Nth label (keeping every real data
// point/dot/tooltip intact) fixes this without touching the shared
// component.
function thinLabels(labels, maxTicks = 10) {
  if (labels.length <= maxTicks) return labels;
  const step = Math.ceil(labels.length / maxTicks);
  const lastIndex = labels.length - 1;
  // Only force a label on the very last point if it's a full step away
  // from the nearest natural tick before it — otherwise the two end up
  // close enough on screen to visually crowd/overlap (seen with a
  // 30-point series: the natural tick at 27 and a forced one at 29).
  const lastNaturalTick = Math.floor(lastIndex / step) * step;
  const forceLast = lastIndex - lastNaturalTick >= step;
  return labels.map((l, i) => (i % step === 0 || (i === lastIndex && forceLast) ? l : ""));
}

function formatVndCompact(n) {
  if (n >= 1_000_000) {
    const millions = n / 1_000_000;
    return `₫${millions % 1 === 0 ? millions : millions.toFixed(1)}M`;
  }
  return `₫${n.toLocaleString("en-US")}`;
}

/* ---- Activity by Time of Day & Day of Week — Heatmap, window-filtered --- */
// Single combined visualization (the prior Bar/Heatmap switch added no
// interpretive value beyond the heatmap, which already shows both
// axes at once — removed per review). Window filter clamps to the
// customer's own registration date (see resolveWindow/clampWindow in
// customer-360-behavior.js), so a day before they existed is excluded
// from the grid entirely rather than shown as an observed zero.
function timeOfDayWeekdayHeatmapHTML(c, windowKey) {
  const { since, until } = resolveWindow(c, windowKey);
  const { matrix, rowLabels, colLabels, eventCount } = hourWeekdayMatrix(c, { sinceDate: since, untilDate: until });
  if (!eventCount || !colLabels.length) {
    return insufficientDataNote(`No recorded events with a parsable time in this window (${since ? formatDisplayDate(since) : "—"} – ${until ? formatDisplayDate(until) : "—"}).`);
  }
  return renderHeatmapHTML({
    rowLabels,
    colLabels,
    matrix,
    cellTitle: (row, col, v) => `${row} · ${col}: ${v} event${v === 1 ? "" : "s"}`,
  });
}

function renderTimeOfDayAndWeekday(c) {
  if (!hasSufficientEventVolume(c)) {
    return `
      <div style="margin-bottom: var(--space-8);">
        <p class="subhead" style="margin-bottom: var(--space-3);">Activity by Time of Day &amp; Day of Week</p>
        ${insufficientDataNote(`Only ${c.events?.length || 0} recorded event(s) — fewer than the ${MINIMUM_EVENT_VOLUME} needed to show a reliable pattern.`)}
      </div>`;
  }
  return `
    <div style="margin-bottom: var(--space-8);" data-behavior-block="timeday">
      <div class="cluster" style="justify-content: space-between; align-items: center; margin-bottom: var(--space-3); flex-wrap: wrap; gap: var(--space-3);">
        <p class="subhead" style="margin-bottom: 0;">Activity by Time of Day &amp; Day of Week — Heatmap</p>
        ${chartSwitchHTML("timeday-window", [{ id: "7d", label: "7d" }, { id: "30d", label: "30d" }, { id: "90d", label: "90d" }, { id: "all", label: "All" }], "30d")}
      </div>
      <div data-chart-content="timeday">${timeOfDayWeekdayHeatmapHTML(c, "30d")}</div>
      <p style="font-size: var(--text-xs); color: var(--text-tertiary); margin-top: var(--space-3);">Times as recorded (Asia/Ho_Chi_Minh). Event count only — no valid session-boundary data exists, so no Session Count metric is offered here rather than fabricating one. Not a preferred-contact-time inference.</p>
    </div>`;
}

/* ---- Daily Activity Trend — line chart only, 7d/30d/All range ----- */
// Computes an integer-safe Y-axis tick count for the shared
// renderLineChart's new optional `yTicks` param (js/components/chart.js)
// — the default fixed 4 steps visibly duplicate adjacent labels for a
// small max (e.g. "0, 1, 1, 2, 2"); every OTHER existing caller of
// renderLineChart still gets the unchanged default of 4.
function integerSafeYTicks(values) {
  const max = Math.max(0, ...values);
  if (max <= 4) return Math.max(1, Math.round(max));
  return 4;
}

function renderDailyTrendInto(contentEl, c, range) {
  const { since, until } = resolveWindow(c, range);
  const rows = eventsByDateInWindow(c, { sinceDate: since, untilDate: until });
  if (!rows.length) {
    contentEl.innerHTML = insufficientDataNote("No recorded events for this customer.");
    return;
  }
  // A zero-filled window can legitimately be all-zero (customer's
  // activity falls entirely outside it) — the shared renderLineChart
  // divides by (max - min) with no zero-guard, so this is handled here
  // rather than risking a NaN-attribute SVG from the shared component.
  if (rows.every((r) => r.count === 0)) {
    contentEl.innerHTML = insufficientDataNote(`No recorded events within this date range (${rows[0].date} – ${rows[rows.length - 1].date}) — this customer's recorded activity falls outside it. Try "All".`);
    return;
  }
  contentEl.innerHTML = `<div data-daily-line-mount></div>`;
  const values = rows.map((r) => r.count);
  renderLineChart(contentEl.querySelector("[data-daily-line-mount]"), {
    series: [{ name: "Events", color: "var(--chart-green)", values, area: true }],
    labels: thinLabels(rows.map((r) => r.date)),
    formatValue: (n) => String(Math.round(n)),
    yTicks: integerSafeYTicks(values),
  });
}

function renderDailyTrend(c) {
  const hasAny = eventsByDate(c).length > 0;
  return `
    <div style="margin-bottom: var(--space-8);" data-behavior-block="dailytrend">
      <div class="cluster" style="justify-content: space-between; align-items: center; margin-bottom: var(--space-3); flex-wrap: wrap; gap: var(--space-3);">
        <p class="subhead" style="margin-bottom: 0;">Daily Activity Trend</p>
        ${hasAny ? chartSwitchHTML("dailytrend-range", [{ id: "7d", label: "7d" }, { id: "30d", label: "30d" }, { id: "all", label: "All" }], "30d") : ""}
      </div>
      <div data-chart-content="dailytrend">${hasAny ? "" : insufficientDataNote("No recorded events for this customer.")}</div>
      <p style="font-size: var(--text-xs); color: var(--text-tertiary); margin-top: var(--space-3);">Event count only — zero-filled across the selected range within this customer's known coverage, based on recorded dates. Never interpolated or smoothed.</p>
    </div>`;
}

/* ---- Web vs. App Usage — Donut ⟷ Horizontal Bar ------------------- */
function channelSplitSegments(c) {
  const { web, app, other, total } = channelSplit(c);
  const segments = [
    { label: "App", sublabel: "Mobile app events", value: app, color: "var(--chart-green)" },
    { label: "Web", sublabel: "Website events", value: web, color: "var(--chart-blue)" },
  ];
  if (other > 0) segments.push({ label: "Other sources", sublabel: "API / Connector / In-App / Email — not a customer device signal", value: other, color: "var(--chart-neutral)" });
  return { segments, total };
}

function hbarsHTML(rows) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  return `<div class="chart-hbars">${rows
    .map(
      (r) => `
    <div class="chart-hbar" title="${r.label}: ${r.value}">
      <span class="chart-hbar__label">${r.label}${r.sublabel ? `<span class="chart-hbar__sublabel">${r.sublabel}</span>` : ""}</span>
      <div class="chart-hbar__track"><div class="chart-hbar__fill" style="width: ${Math.round((r.value / max) * 100)}%; background: ${r.color};"></div></div>
      <span class="chart-hbar__value">${r.value}</span>
    </div>`
    )
    .join("")}</div>`;
}

function channelSplitContentHTML(c, view) {
  const { segments, total } = channelSplitSegments(c);
  if (!total) return insufficientDataNote("No recorded events for this customer.");
  return view === "bar" ? hbarsHTML(segments) : renderDonutHTML({ segments, formatValue: (n) => `${n}`, centerLabel: "Events" });
}

function renderChannelSplit(c) {
  return `
    <div data-behavior-block="channelsplit">
      <p class="subhead" style="margin-bottom: var(--space-3);">Web vs. App Usage</p>
      ${chartSwitchHTML("channelsplit", [{ id: "donut", label: "Donut" }, { id: "bar", label: "Horizontal Bar" }], "donut")}
      <div data-chart-content="channelsplit">${channelSplitContentHTML(c, "donut")}</div>
      <p style="font-size: var(--text-xs); color: var(--text-tertiary); margin-top: var(--space-3);">Event Count. Answers which PLATFORM was used — see Device Breakdown for which supported device category.</p>
    </div>`;
}

/* ---- Device Breakdown — Donut ⟷ Horizontal Bar --------------------- */
const DEVICE_COLOR = { "iOS App": "var(--chart-blue)", "Android App": "var(--chart-green)", "Desktop Web": "var(--chart-gold)", "Mobile Web": "var(--chart-teal)", Unknown: "var(--chart-neutral)" };

function deviceSegments(c) {
  const { counts, total, anyKnownDevice } = deviceBreakdown(c);
  const segments = Object.entries(counts)
    .filter(([, v]) => v > 0)
    .map(([label, value]) => ({ label, value, color: DEVICE_COLOR[label] }));
  return { segments, total, anyKnownDevice };
}

function deviceContentHTML(c, view) {
  const { segments, total } = deviceSegments(c);
  if (!total) return insufficientDataNote("No recorded events for this customer.");
  return view === "bar" ? hbarsHTML(segments) : renderDonutHTML({ segments, formatValue: (n) => `${n}`, centerLabel: "Events" });
}

function renderDeviceBreakdown(c) {
  const { anyKnownDevice } = deviceSegments(c);
  return `
    <div data-behavior-block="devicebreakdown">
      <p class="subhead" style="margin-bottom: var(--space-3);">Device Breakdown</p>
      ${chartSwitchHTML("devicebreakdown", [{ id: "donut", label: "Donut" }, { id: "bar", label: "Horizontal Bar" }], "donut")}
      <div data-chart-content="devicebreakdown">${deviceContentHTML(c, "donut")}</div>
      <p style="font-size: var(--text-xs); color: var(--text-tertiary); margin-top: var(--space-3);">${
        anyKnownDevice
          ? "Derived from this customer's own recorded events. API/Email/In-App events are not a customer device signal and are counted as Unknown rather than guessed."
          : "Device OS is not tracked in this customer's underlying record — every event is correctly shown as Unknown Device rather than a guessed OS."
      }</p>
    </div>`;
}

function renderPlatformAndDeviceRow(c) {
  return `<div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(340px, 1fr)); gap: var(--space-8); margin-bottom: var(--space-8);">${renderChannelSplit(c)}${renderDeviceBreakdown(c)}</div>`;
}

/* ---- Session Frequency & Recency — KPIs + Daily ⟷ Weekly trend ----- */
function renderSessionTrendInto(contentEl, c, granularity) {
  const rows = granularity === "weekly" ? eventsByWeek(c) : eventsByDate(c);
  if (!rows.length) {
    contentEl.innerHTML = insufficientDataNote("No recorded events for this customer.");
    return;
  }
  contentEl.innerHTML = `<div data-session-line-mount></div>`;
  const values = rows.map((r) => r.count);
  renderLineChart(contentEl.querySelector("[data-session-line-mount]"), {
    series: [{ name: granularity === "weekly" ? "Events / week" : "Events / day", color: "var(--chart-blue)", values }],
    labels: thinLabels(rows.map((r) => r.date)),
    formatValue: (n) => String(Math.round(n)),
    yTicks: integerSafeYTicks(values),
  });
}

function renderSessionFrequency(c) {
  const session = sessionFrequencyRecency(c);
  const hasAny = eventsByDate(c).length > 0;
  return `
    <div data-behavior-block="sessionfreq">
      <p class="subhead" style="margin-bottom: var(--space-3);">Session Frequency &amp; Recency</p>
      <div class="attr-grid" style="margin-bottom: var(--space-4);">
        <div class="attr-item"><span class="attr-item__label">Sessions · 30d</span><span class="attr-item__value">${session.sessions30d ?? "Unknown"}</span></div>
        <div class="attr-item"><span class="attr-item__label">Last Recorded Event</span><span class="attr-item__value">${session.lastRecordedActivityDate || "None recorded"}</span></div>
        <div class="attr-item"><span class="attr-item__label">Active Days Recorded</span><span class="attr-item__value">${session.activeDaysRecorded}</span></div>
        <div class="attr-item"><span class="attr-item__label">Last Known Session Boundary</span><span class="attr-item__value">Not available</span></div>
      </div>
      ${hasAny ? chartSwitchHTML("sessionfreq", [{ id: "daily", label: "Daily" }, { id: "weekly", label: "Weekly" }], "daily") : ""}
      <div data-chart-content="sessionfreq">${hasAny ? "" : insufficientDataNote("No recorded events for this customer.")}</div>
      <p style="font-size: var(--text-xs); color: var(--text-tertiary); margin-top: var(--space-3);">"Last Recorded Event" is distinct from last login and from "last known session" (not available — no session-boundary data exists, so Session Count stays N/A rather than fabricated).</p>
    </div>`;
}

/* ---- Behavior-to-Need Signals — explicit, rule-based, allowlisted -- */
/* Three signal TYPES (customer-360-behavior.js: productInterestSignal, */
/* journeyFrictionSignal, engagementChangeSignal), each eligible only    */
/* for its own documented event-type allowlist (§7.2) — an event not on */
/* a signal's allowlist still shows in the plain Event Timeline, it     */
/* just never becomes a business signal. Section-level Cards ⟷ Timeline */
/* switch (not per-signal), matching the "keep cards default, timeline  */
/* an optional alternative for inspecting supporting events" spec.      */
function collectSignals(c) {
  return [productInterestSignal(c), journeyFrictionSignal(c), engagementChangeSignal(c)].filter(Boolean);
}

function signalCardHTML(signal) {
  if (signal.kind === "productInterest") {
    return `
      <div class="c360-signal-card">
        <div class="c360-signal-card__header">
          <span class="c360-signal-card__title">Product Interest — repeated interest in ${signal.subject}</span>
          <span class="badge badge--info">Product Interest Signal</span>
        </div>
        <div class="c360-signal-card__meta">
          <span>Observation window: <strong>${signal.observationWindow}</strong></span>
          <span>Qualifying event count: <strong>${signal.occurrences}</strong></span>
        </div>
        <p style="font-size: var(--text-xs); color: var(--text-secondary); margin: 0;">Supporting events${signal.evidenceTruncated ? ` (${signal.events.length} most recent of ${signal.occurrences})` : ""}: ${signal.events.map((e) => `${e.type} (${e.date})`).join(", ")}</p>
        <p class="c360-signal-card__caveat">Rule: ${signal.rule} Viewing information is not proof of purchase or trading intent — no investment suitability or sensitive personal characteristic is inferred.</p>
      </div>`;
  }
  if (signal.kind === "journeyFriction") {
    return `
      <div class="c360-signal-card">
        <div class="c360-signal-card__header">
          <span class="c360-signal-card__title">Journey Friction — repeated failures at "${signal.step}"</span>
          <span class="badge badge--warning">Journey Friction Signal</span>
        </div>
        <div class="c360-signal-card__meta">
          <span>Failure count: <strong>${signal.occurrences}</strong></span>
          <span>Latest event date: <strong>${signal.latestDate}</strong></span>
        </div>
        <p style="font-size: var(--text-xs); color: var(--text-secondary); margin: 0;">Error detail: ${signal.errors.join("; ")}</p>
        <p class="c360-signal-card__caveat">Rule: ${signal.rule} Suggested review: ${signal.suggestedReview}</p>
      </div>`;
  }
  // engagementChange
  const pctText = signal.percentChange === null ? "Not calculated (zero baseline)" : `${signal.percentChange > 0 ? "+" : ""}${signal.percentChange}%`;
  return `
    <div class="c360-signal-card">
      <div class="c360-signal-card__header">
        <span class="c360-signal-card__title">Engagement Change — ${signal.direction} in recorded activity</span>
        <span class="badge ${signal.direction === "increase" ? "badge--success" : "badge--warning"}">Engagement Change Signal</span>
      </div>
      <div class="c360-signal-card__meta">
        <span>Current (${signal.currentPeriod.start}–${signal.currentPeriod.end}): <strong>${signal.currentPeriod.count}</strong></span>
        <span>Comparison (${signal.comparisonPeriod.start}–${signal.comparisonPeriod.end}): <strong>${signal.comparisonPeriod.count}</strong></span>
      </div>
      <p style="font-size: var(--text-xs); color: var(--text-secondary); margin: 0;">Absolute difference: ${signal.absoluteDiff > 0 ? "+" : ""}${signal.absoluteDiff} · Percentage change: ${pctText}</p>
      <p class="c360-signal-card__caveat">Rule: ${signal.rule} This measures recorded digital activity only — it does not establish churn, or a change in assets or trading activity.</p>
    </div>`;
}

function allSignalEventsForTimeline(signals) {
  const rows = [];
  signals.forEach((s) => {
    if (s.kind === "productInterest") s.events.forEach((e) => rows.push({ date: e.date, text: `${e.type} — ${s.subject} (Product Interest)` }));
    if (s.kind === "journeyFriction") s.events.forEach((e) => rows.push({ date: e.date, text: `${e.type} (Journey Friction)` }));
    if (s.kind === "engagementChange") rows.push({ date: s.currentPeriod.end, text: `Engagement Change signal computed (${s.direction})` });
  });
  return rows.sort((a, b) => (parseDisplayDate(b.date) ?? 0) - (parseDisplayDate(a.date) ?? 0));
}

function signalTimelineHTML(signals) {
  const rows = allSignalEventsForTimeline(signals);
  if (!rows.length) return insufficientDataNote("No supporting events to show.");
  return `<div class="timeline">${rows
    .map(
      (r) => `
    <div class="timeline__item">
      <div class="timeline__rail"><span class="timeline__dot"></span><span class="timeline__line"></span></div>
      <div class="timeline__content"><p class="timeline__text">${r.text}</p><p class="timeline__time">${r.date}</p></div>
    </div>`
    )
    .join("")}</div>`;
}

function behaviorSignalContentHTML(c, view) {
  const signals = collectSignals(c);
  if (!signals.length) return insufficientDataNote("No evidence-based behavioral signal observed for this customer under the current rules.");
  return view === "timeline" ? signalTimelineHTML(signals) : signals.map(signalCardHTML).join("");
}

function renderBehaviorSignals(c) {
  const signals = collectSignals(c);
  return `
    <div data-behavior-block="signals">
      <p class="subhead" style="margin-bottom: var(--space-3);">Behavior-to-Need Signals</p>
      ${signals.length ? chartSwitchHTML("signals", [{ id: "cards", label: "Signal Cards" }, { id: "timeline", label: "Event Timeline" }], "cards") : ""}
      <div data-chart-content="signals">${behaviorSignalContentHTML(c, "cards")}</div>
    </div>`;
}

function behaviorDeferredNoteHTML() {
  return `
    <div class="panel" style="background: var(--surface-sunken);">
      <p class="subhead" style="margin-bottom: var(--space-2);">Not shown in this prototype</p>
      <ul style="margin: 0; padding-left: var(--space-5); font-size: var(--text-xs); color: var(--text-tertiary); line-height: var(--leading-relaxed);">
        <li>Session Count as a metric (time-of-day/weekday/daily/weekly trend) — no session-boundary data exists anywhere in this schema; only Event Count is shown, rather than fabricating sessions.</li>
        <li>Event sequences correlated to a specific support ticket — not implemented, to avoid implying a causal link the data doesn't establish.</li>
        <li>A second lifecycle funnel on this customer's own profile — Customer Journey above already shows this customer's current-stage snapshot.</li>
      </ul>
    </div>`;
}

function wireBehaviorInsightsInteractivity(mount, c) {
  const timedayBlock = mount.querySelector('[data-behavior-block="timeday"]');
  if (timedayBlock) {
    const content = timedayBlock.querySelector('[data-chart-content="timeday"]');
    wireChartSwitch(timedayBlock, "timeday-window", (windowKey) => {
      content.innerHTML = timeOfDayWeekdayHeatmapHTML(c, windowKey);
    });
  }

  const dailyBlock = mount.querySelector('[data-behavior-block="dailytrend"]');
  if (dailyBlock) {
    const content = dailyBlock.querySelector('[data-chart-content="dailytrend"]');
    if (eventsByDate(c).length) {
      renderDailyTrendInto(content, c, "30d");
      wireChartSwitch(dailyBlock, "dailytrend-range", (range) => renderDailyTrendInto(content, c, range));
    }
  }

  const channelBlock = mount.querySelector('[data-behavior-block="channelsplit"]');
  if (channelBlock) {
    const content = channelBlock.querySelector('[data-chart-content="channelsplit"]');
    wireChartSwitch(channelBlock, "channelsplit", (v) => {
      content.innerHTML = channelSplitContentHTML(c, v);
    });
  }

  const deviceBlock = mount.querySelector('[data-behavior-block="devicebreakdown"]');
  if (deviceBlock) {
    const content = deviceBlock.querySelector('[data-chart-content="devicebreakdown"]');
    wireChartSwitch(deviceBlock, "devicebreakdown", (v) => {
      content.innerHTML = deviceContentHTML(c, v);
    });
  }

  const sessionBlock = mount.querySelector('[data-behavior-block="sessionfreq"]');
  if (sessionBlock) {
    const content = sessionBlock.querySelector('[data-chart-content="sessionfreq"]');
    if (eventsByDate(c).length) {
      const render = (g) => renderSessionTrendInto(content, c, g);
      render("daily");
      wireChartSwitch(sessionBlock, "sessionfreq", render);
    }
  }

  const signalsBlock = mount.querySelector('[data-behavior-block="signals"]');
  if (signalsBlock) {
    const content = signalsBlock.querySelector('[data-chart-content="signals"]');
    wireChartSwitch(signalsBlock, "signals", (v) => {
      content.innerHTML = behaviorSignalContentHTML(c, v);
    });
  }

  refreshIcons();
}

// Layout: heatmap, daily trend, platform+device side by side, session
// frequency + signals side by side. Activity Decline and the old RFM
// Analysis section are REMOVED per this task — RFM now lives in its
// own "RFM Position" section (renderRfmPosition, below), reading the
// shared RFM engine (js/data/rfm/engine.js) instead of a second,
// independently-calculated score.
function renderBehaviorInsights(c) {
  const mount = document.querySelector("[data-c360-behavior-insights]");
  if (!mount) return;
  mount.innerHTML =
    renderTimeOfDayAndWeekday(c) +
    renderDailyTrend(c) +
    renderPlatformAndDeviceRow(c) +
    `<div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(360px, 1fr)); gap: var(--space-8); margin-bottom: var(--space-8);">${renderSessionFrequency(c)}${renderBehaviorSignals(c)}</div>` +
    behaviorDeferredNoteHTML();
  wireBehaviorInsightsInteractivity(mount, c);
}

/* ==================================================================== */
/* RFM Position — reads js/data/rfm/engine.js ONLY. No second,           */
/* independently-calculated score exists anywhere in Customer 360.      */
/* Same configuration (js/data/rfm/config.js, localStorage-shared) and   */
/* the same grid cells as the RFM Analysis page.                        */
/* ==================================================================== */

function rfmMetricLabel(key, options) {
  return options.find((o) => o.value === key)?.label || key;
}
const C360_R_METRIC_OPTIONS = [
  { value: "lastOrder", label: "Most recent matched-order date" },
  { value: "lastLogin", label: "Most recent app login date" },
];
const C360_M_METRIC_OPTIONS = [
  { value: "transactionValue", label: "Total Matched Transaction Value" },
  { value: "brokerageFee", label: "Total Brokerage Fee" },
  { value: "nav", label: "Net Asset Value (NAV)" },
];

const RFM_VIEW_OPTIONS = [
  { id: "treemap", label: "Treemap" },
  { id: "grid", label: "R/F Grid" },
];

// Local, non-persisted view-mode state: which of the two RFM views
// (Treemap default, or R/F Grid) is currently showing. Deliberately
// NOT saved to localStorage/config — switching views never changes
// the customer, configuration, score, or segment, and the Treemap
// must always be what's shown the moment a Customer 360 profile
// opens, per spec. Reset to the default at the top of every
// renderRfmPosition call (i.e. every time a profile opens).
let rfmViewMode = "treemap";

function renderRfmPosition(c) {
  const mount = document.querySelector("[data-c360-rfm-position]");
  if (!mount) return;
  rfmViewMode = "treemap";
  const config = loadRfmConfig();
  const result = scoreCustomer(c.id, config);
  const segmentTag = `<span class="rfm-segment-tag">Current segment: ${result.supported ? result.segment : "Insufficient data"}</span>`;

  if (!result.supported) {
    mount.innerHTML = `
      ${segmentTag}
      <div class="rfm-position-excluded" style="margin-top: var(--space-3);">
        <p style="margin: 0 0 var(--space-2); font-weight: var(--weight-semibold); color: var(--text-primary);">This customer has no position in the current RFM configuration.</p>
        <p style="margin: 0;">${result.dataAvailabilityError || result.reason}</p>
      </div>`;
    refreshIcons();
    return;
  }

  const gridData = getGridData(config);
  const segData = getSegmentList(config);
  const summary = `
    <div class="attr-grid" style="margin-bottom: var(--space-5);">
      <div class="attr-item"><span class="attr-item__label">RFM Segment</span><span class="attr-item__value">${result.segment}</span></div>
      <div class="attr-item"><span class="attr-item__label">Asset Tier</span><span class="attr-item__value">${result.tier} <span class="badge badge--neutral" style="font-size: 10px;">${TIER_DEFINITION_LABEL}</span></span></div>
      <div class="attr-item"><span class="attr-item__label">Recency</span><span class="attr-item__value">${result.recencyDays}d <span class="badge badge--neutral">R ${result.rScore}/5</span></span></div>
      <div class="attr-item"><span class="attr-item__label">Frequency</span><span class="attr-item__value">${result.frequency} orders <span class="badge badge--neutral">F ${result.fScore}/5</span></span></div>
      <div class="attr-item"><span class="attr-item__label">Monetary</span><span class="attr-item__value">${formatVndCompact(result.monetary)} <span class="badge badge--neutral">M ${result.mScore}/5</span></span></div>
      <div class="attr-item"><span class="attr-item__label">Analysis Reference Date</span><span class="attr-item__value">${config.referenceDate}</span></div>
      <div class="attr-item"><span class="attr-item__label">Lookback Window</span><span class="attr-item__value">${config.lookbackDays} days</span></div>
      <div class="attr-item"><span class="attr-item__label">R / M Metric</span><span class="attr-item__value">${rfmMetricLabel(config.rMetric, C360_R_METRIC_OPTIONS)} / ${rfmMetricLabel(config.mMetric, C360_M_METRIC_OPTIONS)}</span></div>
    </div>
    <p style="font-size: var(--text-xs); color: var(--text-tertiary); margin: 0 0 var(--space-5);">${result.monetaryLabel} ${SEGMENT_TAXONOMY_LABEL} Scored against this exact configuration's eligible population via one shared engine — see <a href="rfm-analytics.html">RFM Analysis</a> to change it.</p>`;

  mount.innerHTML = `${summary}
    <div class="rfm-view-switcher">
      ${chartSwitchHTML("rfm-view", RFM_VIEW_OPTIONS, rfmViewMode)}
      ${segmentTag}
    </div>
    <div data-c360-rfm-view-mount></div>
    <p class="c360-synthetic-note" style="margin-top: var(--space-3);"><i data-lucide="flask-conical"></i>Synthetic demo data — for UI demonstration and validation only. Not actual PHS customer activity.</p>`;

  renderRfmViewContent(mount, config, gridData, segData, result, c);
  wireChartSwitch(mount, "rfm-view", (mode) => {
    rfmViewMode = mode;
    renderRfmViewContent(mount, config, gridData, segData, result, c);
  });
  refreshIcons();
}

/** Renders whichever RFM view is currently active (module-level
 * rfmViewMode) into the inner mount. Switching views re-renders ONLY
 * this inner block — the customer, config, score, and segment above
 * are untouched. */
function renderRfmViewContent(mount, config, gridData, segData, result, c) {
  const viewMount = mount.querySelector("[data-c360-rfm-view-mount]");
  if (!viewMount) return;
  if (rfmViewMode === "grid") {
    const grid = renderRfmGridHTML({ cells: gridData.cells, formatM: formatVndCompact, highlight: { r: result.rScore, f: result.fScore, customerId: c.id, segment: result.segment } });
    viewMount.innerHTML = `<p class="subhead" style="margin-bottom: var(--space-3);">Position in the RFM Grid</p>${grid}`;
    wireRfmGridInteractivity(viewMount, (r, f) => openRfmAggregateDetail({ kind: "cell", r, f }, config, result, c));
  } else {
    const treemap = renderRfmTreemapHTML({ rows: segData.rows, highlightSegment: result.segment, formatM: formatVndCompact });
    viewMount.innerHTML = `<p class="subhead" style="margin-bottom: var(--space-3);">Position in the Segment Treemap</p>${treemap}`;
    wireRfmTreemapInteractivity(viewMount, (segment) => openRfmAggregateDetail({ kind: "segment", segment }, config, result, c));
  }
  refreshIcons();
}

/* ---- 6. Action Outcome & Follow-up History ----------------------------- */
const OUTCOME_DOT_CLASS = {
  Recommended: "timeline__dot--info",
  "In Progress": "timeline__dot--warning",
  Completed: "timeline__dot--success",
  Dismissed: "",
};

// This prototype stores exactly ONE kind of record: a recommendation
// status change (see ACTION_STATUS_STORAGE_KEY above). It does not
// store a separate "operational action was actually performed" record
// or a "confirmed customer outcome" record — there is no PIC
// sign-off, no ticket-closure webhook, no trade-confirmation feed
// behind this UI. Rather than implying those exist, every entry below
// explicitly says what is and is not known.
function recommendationActivityDistinctionHTML() {
  return `
    <div class="panel" style="margin-bottom: var(--space-4); background: var(--surface-sunken);">
      <p style="font-size: var(--text-xs); color: var(--text-secondary); margin: 0;">
        This prototype tracks <strong>recommendation status</strong> only (the dropdown on each card above). It does not separately record whether the underlying action was actually performed, what the follow-up result was, or a confirmed customer outcome — those would need their own data sources this prototype does not have. Setting a recommendation to "Completed" is not evidence that the customer's issue was resolved, or that they opened an account, funded it, placed a first trade, or reactivated.
      </p>
    </div>`;
}

function renderOutcomeHistory(c) {
  const mount = document.querySelector("[data-c360-outcome-history]");
  if (!mount) return;
  const rows = getAllActionHistoryForCustomer(c.id);

  if (!rows.length) {
    mount.innerHTML = recommendationActivityDistinctionHTML() + `<p class="table__empty">No recommendation status changes recorded yet for this customer.</p>`;
    return;
  }

  mount.innerHTML =
    recommendationActivityDistinctionHTML() +
    `
    <div class="timeline">
      ${rows
        .map((r) => {
          const when = new Date(r.at);
          const whenLabel = Number.isNaN(when.getTime()) ? r.at : when.toLocaleString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
          return `
        <div class="timeline__item">
          <div class="timeline__rail"><span class="timeline__dot ${OUTCOME_DOT_CLASS[r.status] || ""}"></span><span class="timeline__line"></span></div>
          <div class="timeline__content">
            <p class="timeline__text">Rule ${r.ruleId} recommendation status set to <strong>${r.status}</strong></p>
            <p class="timeline__time">${whenLabel} · stored in this browser only</p>
          </div>
        </div>`;
        })
        .join("")}
    </div>`;
}

function renderProfileAnalytics(c) {
  renderAnalyticsSnapshot(c);
  renderRecommendations(c);
  renderClassificationLifecycle(c);
  renderEkycInsights(c);
  renderBehaviorInsights(c);
  renderRfmPosition(c);
  renderSupportInsights(c);
  renderOutcomeHistory(c);
}

/* ---------------------------------------------------------------- */
/* Consent history + Add to audience modals                          */
/* ---------------------------------------------------------------- */

function initConsentHistory() {
  const btn = document.querySelector("[data-consent-history-btn]");
  const body = document.querySelector("[data-consent-history-body]");
  if (!btn || !body) return;
  btn.addEventListener("click", () => {
    body.innerHTML = `
      <div class="timeline">
        ${currentCustomer.consentHistory
          .map(
            (h) => `
          <div class="timeline__item">
            <div class="timeline__rail"><span class="timeline__dot timeline__dot--info"></span><span class="timeline__line"></span></div>
            <div class="timeline__content">
              <p class="timeline__text">${h.text}</p>
              <p class="timeline__time">${h.date} · ${h.source}</p>
            </div>
          </div>`
          )
          .join("")}
      </div>`;
  });
}

const ALL_AUDIENCE_NAMES = ["Active Investors", "High Value Customers", "New Mobile Users", "Dormant Investors", "High Engagement", "Premium Customers", "Mobile Investors"];

function initAddToAudience() {
  const btn = document.querySelector("[data-add-audience-btn]");
  const body = document.querySelector("[data-add-audience-body]");
  if (!btn || !body) return;
  btn.addEventListener("click", () => {
    const memberNames = new Set(currentCustomer.audiences.map((a) => a.name));
    body.innerHTML = ALL_AUDIENCE_NAMES.map((name) => {
      const isMember = memberNames.has(name);
      return `
        <label class="cluster gap-3" style="padding: var(--space-2) 0; cursor: pointer;">
          <input type="checkbox" class="table-checkbox" ${isMember ? "checked disabled" : ""} />
          <span style="font-size: var(--text-sm); color: ${isMember ? "var(--text-tertiary)" : "var(--text-primary)"};">${name}${isMember ? " (already a member)" : ""}</span>
        </label>`;
    }).join("");
  });
}

/* ---------------------------------------------------------------- */
/* Export                                                             */
/* ---------------------------------------------------------------- */

function initExport() {
  const btn = document.querySelector("[data-c360-export]");
  if (!btn) return;
  const label = btn.querySelector("[data-export-label]");
  const defaultText = label.textContent;
  btn.addEventListener("click", () => {
    if (btn.disabled) return;
    btn.disabled = true;
    label.textContent = "Exporting…";
    setTimeout(() => {
      btn.disabled = false;
      label.textContent = defaultText;
    }, 900);
  });
}

/* ---------------------------------------------------------------- */
/* Search view, Results view, Not Found view                         */
/* ---------------------------------------------------------------- */

function resetSearchHeroControls() {
  const input = document.querySelector("[data-c360-search-input]");
  const fieldSelect = document.querySelector("[data-c360-search-field]");
  const errorBox = document.querySelector("[data-c360-search-error]");
  if (input) input.value = "";
  if (fieldSelect) fieldSelect.value = "all";
  if (errorBox) errorBox.hidden = true;
}

function goToSearch() {
  resetSearchHeroControls();
  showView("search");
  document.title = "Customer 360 — PHS CDP";
}

function goToResults() {
  if (!lastQuery) {
    goToSearch();
    return;
  }
  renderResultsView(lastQuery, lastField, searchCustomers(lastQuery, lastField));
  showView("results");
}

function renderResultsView(query, field, results) {
  // Keep the persisted search bar in sync with whatever query actually
  // produced these results (covers both the hero submit and a refine
  // from the results bar itself).
  const barInput = document.querySelector("[data-c360-results-search-input]");
  const barField = document.querySelector("[data-c360-results-search-field]");
  if (barInput) barInput.value = query;
  if (barField) barField.value = field;

  const summary = document.querySelector("[data-c360-results-summary]");
  if (summary) {
    summary.textContent = `${results.length} matching profile${results.length === 1 ? "" : "s"} for "${query}" in ${fieldLabel(field)}.`;
  }

  const body = document.querySelector("[data-c360-results-body]");
  if (!body) return;

  if (results.length === 0) {
    body.innerHTML = `
      <div class="state-empty">
        <span class="state-empty__icon"><i data-lucide="search-x"></i></span>
        <h2 class="state-empty__title">No matching profiles</h2>
        <p class="state-empty__description">No demo profile matched "${query}" in ${fieldLabel(field)}. Try a different ID, or search "All supported fields".</p>
      </div>`;
    refreshIcons();
    return;
  }

  body.innerHTML = `
    <div class="table-wrap">
      <table class="table table--dense">
        <thead>
          <tr>
            <th>Profile / Customer ID</th>
            <th>Masked Identifier</th>
            <th>Lifecycle Stage</th>
            <th>Profile Status</th>
            <th>Last Activity</th>
            <th class="cell-check"></th>
          </tr>
        </thead>
        <tbody>
          ${results
            .map(
              (c) => `
          <tr data-detail-row data-result-id="${c.id}">
            <td class="cell-primary font-mono">${c.id}</td>
            <td class="font-mono cell-muted">${maskCrmId(c.crmId)}</td>
            <td><span class="badge badge--primary">${c.lifecycle}</span></td>
            <td><span class="status-dot status-dot--${c.status === "Active" ? "success" : "warning"}">${c.status}</span></td>
            <td class="cell-muted">${c.lastActive}</td>
            <td><i class="row-affordance" data-lucide="chevron-right"></i></td>
          </tr>`
            )
            .join("")}
        </tbody>
      </table>
    </div>`;

  body.querySelectorAll("[data-result-id]").forEach((row) => {
    row.setAttribute("tabindex", "0");
    row.setAttribute("role", "button");
    const open = () => openDetail(row.dataset.resultId, { fromResults: true });
    row.addEventListener("click", open);
    row.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        open();
      }
    });
  });
  refreshIcons();
}

function runSearch(query, field) {
  lastQuery = query;
  lastField = field;
  renderResultsView(query, field, searchCustomers(query, field));
  showView("results");
}

function renderNotFoundView(id, fromResults) {
  const text = document.querySelector("[data-c360-notfound-text]");
  if (text) {
    text.textContent = `No demo profile matches "${id}". It may have been mistyped, or the link may be stale.`;
  }
  const backResultsBtn = document.querySelector("[data-c360-notfound-back-results]");
  if (backResultsBtn) backResultsBtn.hidden = !(fromResults && lastQuery);
}

function initSearchHero() {
  const form = document.querySelector("[data-c360-search-form]");
  const input = document.querySelector("[data-c360-search-input]");
  const fieldSelect = document.querySelector("[data-c360-search-field]");
  const resetBtn = document.querySelector("[data-c360-search-reset]");
  const errorBox = document.querySelector("[data-c360-search-error]");
  const errorText = document.querySelector("[data-c360-search-error-text]");
  if (!form || !input || !fieldSelect) return;

  populateFieldSelect(fieldSelect);

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const query = input.value.trim();
    if (!query) {
      if (errorText) errorText.textContent = "Enter a customer ID or identifier to search.";
      if (errorBox) errorBox.hidden = false;
      return;
    }
    if (errorBox) errorBox.hidden = true;
    runSearch(query, fieldSelect.value);
  });

  resetBtn?.addEventListener("click", () => {
    resetSearchHeroControls();
    input.focus();
  });
}

function initResultsBar() {
  const input = document.querySelector("[data-c360-results-search-input]");
  const fieldSelect = document.querySelector("[data-c360-results-search-field]");
  const submitBtn = document.querySelector("[data-c360-results-search-submit]");
  const resetBtn = document.querySelector("[data-c360-results-reset]");
  if (!input || !fieldSelect || !submitBtn) return;

  populateFieldSelect(fieldSelect);

  function submit() {
    const query = input.value.trim();
    if (!query) {
      input.focus();
      return;
    }
    runSearch(query, fieldSelect.value);
  }

  submitBtn.addEventListener("click", submit);
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      submit();
    }
  });
  resetBtn?.addEventListener("click", () => {
    input.value = "";
    fieldSelect.value = "all";
    input.focus();
  });
}

function initBackNav() {
  document.querySelector("[data-c360-back-to-search]")?.addEventListener("click", goToSearch);
  document.querySelector("[data-c360-back-to-search-2]")?.addEventListener("click", goToSearch);
  document.querySelector("[data-c360-notfound-back-search]")?.addEventListener("click", goToSearch);
  document.querySelector("[data-c360-back-to-results]")?.addEventListener("click", goToResults);
  document.querySelector("[data-c360-notfound-back-results]")?.addEventListener("click", goToResults);
}

/* ---------------------------------------------------------------- */
/* Customer selector / search                                        */
/* ---------------------------------------------------------------- */

function initCustomerSwitcher() {
  const wrapper = document.querySelector("[data-customer-switcher]");
  const input = document.querySelector("[data-customer-search]");
  const results = document.querySelector("[data-customer-results]");
  if (!wrapper || !input || !results) return;

  function showResults(list) {
    results.innerHTML = list.length
      ? list
          .map(
            (c) => `
        <button class="dropdown__item" role="menuitem" data-result-id="${c.id}" style="flex-direction: column; align-items: flex-start; gap: 0;">
          <span style="font-weight: var(--weight-medium); color: var(--text-primary);">${c.name}</span>
          <span class="font-mono" style="font-size: 11px; color: var(--text-tertiary);">${c.crmId}${c.accessLevel === "restricted" ? " · Restricted" : ""}</span>
        </button>`
          )
          .join("")
      : `<div class="dropdown__label">No customers found</div>`;
    results.querySelectorAll("[data-result-id]").forEach((btn) => {
      btn.addEventListener("click", () => {
        openDetail(btn.dataset.resultId, { fromResults: cameFromResults });
        wrapper.classList.remove("is-open");
        input.value = "";
      });
    });
  }

  function localMatches(q) {
    return [...CUSTOMERS, GOLDEN_CUSTOMER].filter((c) => normalize(c.name).includes(q) || normalize(c.id).includes(q));
  }

  async function renderResults(query) {
    const q = normalize(query || "");
    if (window.PHSC360) {
      // Use BFF for search — gives results from all customers, not just
      // the 5 mock ones. Falls back to the local mock data when the BFF
      // is unreachable (no live BFF in this prototype) rather than
      // silently showing zero results.
      const list = await window.PHSC360.fetchCustomerList(q);
      showResults(list && list.length ? list : localMatches(q));
    } else {
      showResults(localMatches(q));
    }
  }

  input.addEventListener("focus", () => {
    renderResults(input.value);
    wrapper.classList.add("is-open");
  });
  input.addEventListener("input", () => renderResults(input.value));
  document.addEventListener("click", (e) => {
    if (!wrapper.contains(e.target)) wrapper.classList.remove("is-open");
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") wrapper.classList.remove("is-open");
  });
}

/* ---------------------------------------------------------------- */
/* Master render                                                     */
/* ---------------------------------------------------------------- */

function resetToFirstTab() {
  const tablist = document.querySelector("[data-c360-primary-tabs]");
  if (!tablist) return;
  const tabs = Array.from(tablist.querySelectorAll(".tabs__tab"));
  tabs.forEach((t, i) => {
    const selected = i === 0;
    t.setAttribute("aria-selected", String(selected));
    const panel = document.getElementById(t.getAttribute("aria-controls"));
    if (panel) panel.hidden = !selected;
  });
}

// Resolves `id` against the BFF when available, falling back to the
// local mock data — same fallback order as before. Returns the record,
// or `undefined` if nothing matches anywhere: the caller must show a
// safe not-found state rather than substituting a different profile.
function resolveLocalCustomer(id) {
  return getCustomerById(id) || (id === GOLDEN_CUSTOMER.id ? GOLDEN_CUSTOMER : undefined);
}

async function fetchCustomerRecord(id) {
  if (window.PHSC360) {
    const bffData = await window.PHSC360.fetchCustomer(id);
    return bffData || resolveLocalCustomer(id);
  }
  return resolveLocalCustomer(id);
}

function updateDetailBackRow() {
  const backResultsBtn = document.querySelector("[data-c360-back-to-results]");
  if (backResultsBtn) backResultsBtn.hidden = !(cameFromResults && lastQuery);
}

// The only entry point into the Detail view. `fromResults` controls
// whether "Back to Results" is offered — true only when the id came
// from a clicked search result, never for a direct/contextual link
// (Dashboard Profile Samples, Identity Graph), so that path correctly
// offers only "Back to Search".
async function openDetail(id, { fromResults = false } = {}) {
  const record = await fetchCustomerRecord(id);
  if (!record) {
    renderNotFoundView(id, fromResults);
    showView("notfound");
    return;
  }

  cameFromResults = fromResults;
  currentCustomer = record;
  currentCategoryFilter = "all";
  currentSourceFilter = "all";

  const filterTabs = document.querySelectorAll("[data-c360-event-filter] .tabs__tab");
  filterTabs.forEach((t) => t.setAttribute("aria-selected", t.dataset.filter === "all" ? "true" : "false"));
  const sourceSelect = document.querySelector("[data-c360-source-filter]");
  if (sourceSelect) sourceSelect.value = "all";

  resetToFirstTab();

  renderHeader(currentCustomer);
  renderSummary(currentCustomer);
  renderProfileAnalytics(currentCustomer);
  renderJourney(currentCustomer);
  renderDnaRiskAppetite(currentCustomer);
  renderIdentity(currentCustomer);
  renderAttributes(currentCustomer);
  renderBehavior(currentCustomer);
  renderTimeline(currentCustomer);
  renderTransactions(currentCustomer);
  renderConsent(currentCustomer);
  renderEngagement(currentCustomer);
  renderAudiences(currentCustomer);
  renderCampaignsJourneys(currentCustomer);
  renderEkycHistory(currentCustomer);
  renderTicketHistory(currentCustomer);

  updateDetailBackRow();
  showView("detail");
  document.title = `${currentCustomer.name} — Customer 360 — PHS CDP`;
}

export function initCustomer360() {
  const sourceSelect = document.querySelector("[data-c360-source-filter]");
  if (sourceSelect) {
    sourceSelect.innerHTML =
      `<option value="all">All sources</option>` + EVENT_SOURCES.map((s) => `<option value="${s}">${s}</option>`).join("");
  }

  initEventFilters();
  initDetailDrawer();
  initConsentHistory();
  initAddToAudience();
  initExport();
  initCustomerSwitcher();
  renderForward();
  initSearchHero();
  initResultsBar();
  initBackNav();

  // A deep link (?id=<customer id>) opens that profile's detail
  // directly (Dashboard Profile Samples, Identity Graph "Open Customer
  // 360"). With no id, Customer 360 always opens on Search — it never
  // preselects a profile or shows a directory.
  const linkedId = new URLSearchParams(location.search).get("id");
  if (linkedId) {
    openDetail(linkedId, { fromResults: false });
  } else {
    showView("search");
  }
}
