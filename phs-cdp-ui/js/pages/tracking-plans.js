/*
  Tracking Plans (Governance) — list + detail. References the
  canonical Event Catalog (js/data/events.js) by name only; a plan
  entry naming an event the catalog doesn't (yet) implement is a real
  governance gap, shown as "Not Implemented" rather than hidden.
*/
import { TRACKING_PLANS, TRACKING_PLAN_STATUSES, ENFORCEMENT_LEVELS, eventComplianceStatus, planCoverage, getPlanById } from "../data/tracking-plans.js";
import { EVENT_CATEGORY_META, EVENT_SOURCES, getEventByName } from "../data/events.js";

let plans = [...TRACKING_PLANS];

function refreshIcons() {
  if (window.lucide) window.lucide.createIcons();
}
function statusBadge(status) {
  const map = { Live: "badge--success", Draft: "badge--neutral", Deprecated: "badge--warning" };
  return `<span class="badge ${map[status] || "badge--neutral"}">${status}</span>`;
}
function complianceBadge(status) {
  if (status === "Implemented") return `<span class="badge badge--success">Implemented</span>`;
  if (status === "Not Active") return `<span class="badge badge--warning">Not Active</span>`;
  return `<span class="badge badge--danger">Not Implemented</span>`;
}
function findPlan(id) {
  return plans.find((p) => p.id === id);
}

function showView(view) {
  document.querySelector("[data-view-list]").hidden = view !== "list";
  document.querySelector("[data-view-detail]").hidden = view !== "detail";
  window.scrollTo({ top: 0 });
}

function renderList() {
  const tbody = document.querySelector("[data-plan-table] tbody");
  tbody.innerHTML = plans
    .map((p) => {
      const coverage = planCoverage(p);
      return `<tr data-plan-row="${p.id}" style="cursor:pointer;">
      <td><div class="event-cell"><span class="event-cell__icon"><i data-lucide="clipboard-check"></i></span><div><div class="event-cell__name">${p.name}</div><div class="event-cell__meta">${p.description}</div></div></div></td>
      <td class="cell-muted">${p.sources.join(", ")}</td>
      <td class="num tabular-nums">${p.events.length}</td>
      <td class="num tabular-nums">${coverage}%</td>
      <td>${statusBadge(p.status)}</td>
      <td class="cell-muted">${p.owner}</td>
      <td class="cell-muted tabular-nums">${p.lastAudit}</td>
    </tr>`;
    })
    .join("");
  tbody.querySelectorAll("[data-plan-row]").forEach((row) => {
    row.addEventListener("click", () => openDetail(row.dataset.planRow));
  });
  refreshIcons();
}

function openDetail(id) {
  const p = findPlan(id);
  if (!p) return;
  document.querySelector("[data-detail-header]").innerHTML = `
    <div class="dest-detail__header">
      <span class="dest-detail__icon"><i data-lucide="clipboard-check"></i></span>
      <div>
        <div class="page-header__eyebrow"><i data-lucide="git-branch" style="width:13px;height:13px;"></i> ${p.sources.join(", ")}</div>
        <h1 class="page-header__title">${p.name}</h1>
        <div class="cluster gap-2" style="margin-top: var(--space-2);">${statusBadge(p.status)}</div>
      </div>
    </div>`;

  const coverage = planCoverage(p);
  document.querySelector("[data-detail-summary]").innerHTML = `
    <div class="metric metric--primary"><span class="metric__label">Coverage</span><div class="metric__value-row"><span class="metric__value tabular-nums" style="font-size: var(--text-xl);">${coverage}%</span></div></div>
    <div class="metric"><span class="metric__label">Events Governed</span><div class="metric__value-row"><span class="metric__value tabular-nums" style="font-size: var(--text-xl);">${p.events.length}</span></div></div>
    <div class="metric"><span class="metric__label">Owner</span><div class="metric__value-row"><span class="metric__value" style="font-size: var(--text-md);">${p.owner}</span></div></div>
    <div class="metric"><span class="metric__label">Last Audit</span><div class="metric__value-row"><span class="metric__value tabular-nums" style="font-size: var(--text-md);">${p.lastAudit}</span></div></div>`;

  const tbody = document.querySelector("[data-plan-events-table] tbody");
  tbody.innerHTML = p.events
    .map((ev) => {
      const def = getEventByName(ev.eventName);
      const compliance = eventComplianceStatus(ev.eventName);
      return `<tr>
        <td class="cell-primary">${ev.eventName}</td>
        <td>${def ? `<span class="badge badge--neutral badge--dest-tag"><i data-lucide="${EVENT_CATEGORY_META[def.category]?.icon || "circle"}"></i>${def.category}</span>` : `<span class="cell-muted">—</span>`}</td>
        <td><span class="badge ${ev.enforcement === "Required" ? "badge--primary" : "badge--neutral"}">${ev.enforcement}</span></td>
        <td>${complianceBadge(compliance)}</td>
      </tr>`;
    })
    .join("");
  refreshIcons();
  showView("detail");
}

function initNewPlanModal() {
  const sourceSelect = document.getElementById("new-plan-source");
  sourceSelect.innerHTML = EVENT_SOURCES.map((s) => `<option value="${s}">${s}</option>`).join("");

  document.querySelector("[data-new-plan]").addEventListener("click", () => {
    document.getElementById("new-plan-name").value = "";
    document.getElementById("new-plan-modal").classList.add("is-open");
    document.body.style.overflow = "hidden";
  });

  document.querySelector("[data-create-plan-confirm]").addEventListener("click", () => {
    const name = document.getElementById("new-plan-name").value.trim() || "Untitled Tracking Plan";
    const source = sourceSelect.value;
    const newPlan = {
      id: `tp-custom-${Date.now()}`,
      name,
      description: "New tracking plan — no events governed yet.",
      sources: [source],
      status: "Draft",
      owner: "Growth Team",
      createdAt: "25 Sep 2026",
      lastAudit: "—",
      events: [],
    };
    plans.push(newPlan);
    document.getElementById("new-plan-modal").classList.remove("is-open");
    document.body.style.overflow = "";
    renderList();
    openDetail(newPlan.id);
  });
}

export function initTrackingPlans() {
  renderList();
  initNewPlanModal();
  document.querySelector("[data-back-to-list]").addEventListener("click", () => showView("list"));

  const openId = new URLSearchParams(location.search).get("open");
  if (openId && findPlan(openId)) openDetail(openId);
}
