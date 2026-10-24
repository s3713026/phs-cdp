/*
  Audience Insights (Audiences) — see js/data/audience-insights.js for
  why every metric here resolves to a real AUDIENCES record rather than
  a second audience model.
*/
import { AUDIENCES, getAudienceById } from "../data/audiences.js";
import { overview, audiencesBySize, growthSeries, compositionFor, overlapRows, reachMetrics, activeCampaignsFor } from "../data/audience-insights.js";
import { renderLineChart } from "../components/chart.js";

function refreshIcons() {
  if (window.lucide) window.lucide.createIcons();
}
function fmt(n) {
  return Math.round(n).toLocaleString();
}
function fmtCompact(n) {
  if (n >= 1000000) return `${(n / 1000000).toFixed(2)}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
  return String(n);
}
function statusBadge(status) {
  const map = { Active: "badge--success", Draft: "badge--neutral", Paused: "badge--warning" };
  return `<span class="badge ${map[status] || "badge--neutral"}">${status}</span>`;
}

function renderOverview() {
  const o = overview();
  document.querySelector("[data-ai-overview]").innerHTML = `
    <div class="metric metric--primary"><span class="metric__label">Total Audiences</span><div class="metric__value-row"><span class="metric__value tabular-nums" style="font-size: var(--text-xl);">${o.totalAudiences}</span></div></div>
    <div class="metric"><span class="metric__label">Total Audience Members</span><div class="metric__value-row"><span class="metric__value tabular-nums" style="font-size: var(--text-xl);">${fmtCompact(o.totalMembers)}</span></div></div>
    <div class="metric"><span class="metric__label">Reachable Customers</span><div class="metric__value-row"><span class="metric__value tabular-nums" style="font-size: var(--text-xl);">${fmtCompact(o.reachable)}</span></div></div>
    <div class="metric"><span class="metric__label">Consent Eligible</span><div class="metric__value-row"><span class="metric__value tabular-nums" style="font-size: var(--text-xl);">${fmtCompact(o.consentEligible)}</span></div></div>
    <div class="metric metric--success"><span class="metric__label">Active Audiences</span><div class="metric__value-row"><span class="metric__value tabular-nums" style="font-size: var(--text-xl);">${o.activeAudiences}</span></div></div>`;
}

function renderSize() {
  const top = audiencesBySize(6);
  const max = Math.max(...top.map((a) => a.memberCount));
  document.querySelector("[data-ai-size]").innerHTML = top
    .map(
      (a) => `
    <div class="chart-hbar" data-audience-link="${a.id}" style="cursor: pointer;">
      <div class="chart-hbar__label">${a.name}<span class="chart-hbar__sublabel">${a.type}</span></div>
      <div class="chart-hbar__track"><div class="chart-hbar__fill" style="width:${(a.memberCount / max) * 100}%; background: var(--chart-green);"></div></div>
      <div class="chart-hbar__value tabular-nums">${fmt(a.memberCount)}</div>
    </div>`
    )
    .join("");
  document.querySelectorAll("[data-ai-size] [data-audience-link]").forEach((el) => {
    el.addEventListener("click", () => openAudienceDrawer(el.dataset.audienceLink));
  });
}

function renderGrowth() {
  const top3 = audiencesBySize(3).map((a) => a.id);
  const { labels, series } = growthSeries(top3);
  renderLineChart(document.querySelector("[data-ai-growth]"), { series, labels, formatValue: (n) => fmtCompact(n) });
}

let compositionAudienceId = null;
function initCompositionSelect() {
  const select = document.querySelector("[data-ai-composition-select]");
  select.innerHTML = AUDIENCES.map((a) => `<option value="${a.id}">${a.name}</option>`).join("");
  compositionAudienceId = AUDIENCES[0].id;
  select.value = compositionAudienceId;
  select.addEventListener("change", (e) => {
    compositionAudienceId = e.target.value;
    renderComposition();
  });
}
function segmentedBar(rows, colors) {
  return `
    <div class="chart-bar-segmented">${rows.map((r, i) => `<div class="chart-bar-segmented__seg" style="width:${r.pct}%; background:${colors[i % colors.length]};"></div>`).join("")}</div>
    <div class="chart-legend">${rows
      .map((r, i) => `<span class="chart-legend__item"><span class="chart-legend__dot" style="background:${colors[i % colors.length]}"></span><span class="chart-legend__label">${r.label}</span><span class="chart-legend__value">${r.pct}%</span></span>`)
      .join("")}</div>`;
}
function renderComposition() {
  const a = getAudienceById(compositionAudienceId);
  if (!a) return;
  const c = compositionFor(a);
  const colors = ["var(--chart-green)", "var(--chart-blue)", "var(--chart-gold)", "var(--chart-neutral)"];
  document.querySelector("[data-ai-composition]").innerHTML = `
    <div class="grid-2">
      <div>
        <div class="chart-hbar__label" style="margin-bottom: var(--space-2);">Customer Type</div>
        ${c.customerType.length ? segmentedBar(c.customerType, colors) : '<p class="event-empty-note">No composition data.</p>'}
      </div>
      <div>
        <div class="chart-hbar__label" style="margin-bottom: var(--space-2);">Engagement</div>
        ${c.engagement.length ? segmentedBar(c.engagement, colors) : '<p class="event-empty-note">No composition data.</p>'}
      </div>
      <div>
        <div class="chart-hbar__label" style="margin-bottom: var(--space-2);">Product Interest (Channel)</div>
        ${c.productInterest.length ? segmentedBar(c.productInterest, colors) : '<p class="event-empty-note">No composition data.</p>'}
      </div>
      <div>
        <div class="chart-hbar__label" style="margin-bottom: var(--space-2);">Consent Eligibility</div>
        ${segmentedBar([{ label: "Eligible", pct: c.consentEligiblePct }, { label: "Not Eligible", pct: +(100 - c.consentEligiblePct).toFixed(1) }], ["var(--chart-green)", "var(--color-ink-200)"])}
      </div>
    </div>`;
}

function renderOverlap() {
  const tbody = document.querySelector("[data-ai-overlap-table] tbody");
  tbody.innerHTML = overlapRows()
    .map(
      (r) => `<tr>
      <td class="cell-primary">${r.a.name}</td>
      <td class="cell-primary">${r.b.name}</td>
      <td class="num tabular-nums">${fmt(r.overlap)}</td>
      <td class="num tabular-nums">${r.overlapPct}%</td>
    </tr>`
    )
    .join("");
}

/* ---- Audience detail drawer ---- */
function openAudienceDrawer(id) {
  const a = getAudienceById(id);
  if (!a) return;
  const r = reachMetrics(a);
  const campaigns = activeCampaignsFor(id);
  document.querySelector("[data-ai-drawer-title]").textContent = a.name;
  document.querySelector("[data-ai-drawer-body]").innerHTML = `
    <div class="stack gap-3">
      <div class="identity-row"><div class="identity-row__main"><span class="identity-row__label">Audience Definition</span><span style="font-size: var(--text-sm); color: var(--text-primary);">${a.description}</span></div></div>
      <div class="identity-row"><div class="identity-row__main"><span class="identity-row__label">Members</span><span class="tabular-nums" style="font-size: var(--text-sm);">${fmt(a.memberCount)}</span></div></div>
      <div class="identity-row"><div class="identity-row__main"><span class="identity-row__label">Reachable</span><span class="tabular-nums" style="font-size: var(--text-sm);">${fmt(r.reachable)}</span></div></div>
      <div class="identity-row"><div class="identity-row__main"><span class="identity-row__label">Consent Eligible</span><span class="tabular-nums" style="font-size: var(--text-sm);">${fmt(r.consentEligible)}</span></div></div>
      <div class="identity-row"><div class="identity-row__main"><span class="identity-row__label">Status</span>${statusBadge(a.status)}</div></div>
      <div class="identity-row"><div class="identity-row__main"><span class="identity-row__label">Last Updated</span><span class="tabular-nums" style="font-size: var(--text-sm);">${a.updatedAt}</span></div></div>
    </div>

    <div class="section__header" style="padding: 0; margin: var(--space-6) 0 var(--space-3);"><h3 class="section__title" style="font-size: var(--text-sm);">Active Campaigns (${campaigns.length})</h3></div>
    ${
      campaigns.length
        ? `<div class="stack gap-2">${campaigns
            .map(
              (c) => `<div class="identity-row"><div class="identity-row__main"><span class="identity-row__label">${c.goal}</span><a href="campaigns.html?open=${c.id}" style="font-size: var(--text-sm);">${c.name} <i data-lucide="arrow-up-right" style="width:11px;height:11px;"></i></a></div></div>`
            )
            .join("")}</div>`
        : `<p class="event-empty-note">No campaigns currently reference this audience.</p>`
    }

    <div class="cluster gap-2" style="margin-top: var(--space-6);">
      <a class="btn btn--primary btn--sm" href="audiences.html?open=${a.id}">View Audience</a>
    </div>`;
  document.getElementById("audience-detail-drawer").classList.add("is-open");
  refreshIcons();
}

export function initAudienceInsights() {
  renderOverview();
  renderSize();
  renderGrowth();
  initCompositionSelect();
  renderComposition();
  renderOverlap();
  refreshIcons();
}
