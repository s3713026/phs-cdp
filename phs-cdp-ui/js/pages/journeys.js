import { NODE_TYPE_META, JOURNEY_STATUSES, TEST_CUSTOMERS, simulateJourney, loadJourneys, getNodeById, getEntryNode } from "../data/journeys.js";
import { AUDIENCES } from "../data/audiences.js";
import { renderJourneyFlow } from "./journey-builder.js";

let journeys = [];
const filterState = { query: "", status: "all" };
let currentDetailId = null;

function normalize(str) {
  return String(str).toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
}
function refreshIcons() {
  if (window.lucide) window.lucide.createIcons();
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
function showView(view) {
  document.querySelector("[data-view-list]").hidden = view !== "list";
  document.querySelector("[data-view-detail]").hidden = view !== "detail";
  window.scrollTo({ top: 0 });
}
function statusBadgeClass(status) {
  if (status === "Active") return "badge--success";
  if (status === "Draft") return "badge--neutral";
  if (status === "Completed") return "badge--primary";
  return "badge--warning";
}

/* ---------------------------------------------------------------- */
/* Entry description                                                 */
/* ---------------------------------------------------------------- */
function entryLabel(journey) {
  const entry = getEntryNode(journey);
  if (entry.type === "entry-audience") return entry.config.audienceName;
  if (entry.type === "entry-event") return entry.config.eventName;
  if (entry.type === "entry-attribute") return `${entry.config.field} ${entry.config.operator} ${entry.config.value ?? ""}`.trim();
  return "—";
}

/* ---------------------------------------------------------------- */
/* Summary + list                                                    */
/* ---------------------------------------------------------------- */
function renderSummary() {
  const mount = document.querySelector("[data-journey-summary]");
  if (!mount) return;
  const total = journeys.length;
  const active = journeys.filter((j) => j.status === "Active").length;
  const draft = journeys.filter((j) => j.status === "Draft").length;
  const completed = journeys.filter((j) => j.status === "Completed").length;
  mount.innerHTML = `
    <div class="metric-row">
      <div class="metric"><span class="metric__label">Total Journeys</span><div class="metric__value-row"><span class="metric__value" style="font-size: var(--text-xl);">${total}</span></div></div>
      <div class="metric metric--success"><span class="metric__label">Active</span><div class="metric__value-row"><span class="metric__value" style="font-size: var(--text-xl);">${active}</span></div></div>
      <div class="metric"><span class="metric__label">Draft</span><div class="metric__value-row"><span class="metric__value" style="font-size: var(--text-xl);">${draft}</span></div></div>
      <div class="metric metric--primary"><span class="metric__label">Completed Recently</span><div class="metric__value-row"><span class="metric__value" style="font-size: var(--text-xl);">${completed}</span></div></div>
    </div>`;
}

function passesFilters(j) {
  const q = normalize(filterState.query);
  const matchesSearch = !q || normalize(j.name).includes(q) || normalize(j.owner).includes(q) || normalize(entryLabel(j)).includes(q);
  const matchesStatus = filterState.status === "all" || j.status === filterState.status;
  return matchesSearch && matchesStatus;
}

function renderList() {
  const tbody = document.querySelector("[data-journey-table] tbody");
  if (!tbody) return;
  const filtered = journeys.filter(passesFilters);

  if (!filtered.length) {
    tbody.innerHTML = `<tr><td colspan="6" class="table__empty">No journeys match your search and filters.</td></tr>`;
    return;
  }

  tbody.innerHTML = filtered
    .map(
      (j) => `
    <tr data-journey-row="${j.id}">
      <td class="cell-primary">${j.name}</td>
      <td class="cell-muted">${entryLabel(j)}</td>
      <td><span class="badge ${statusBadgeClass(j.status)}">${j.status}</span></td>
      <td class="num tabular-nums">${j.audienceLabel}</td>
      <td class="cell-muted">${j.updatedAt}</td>
      <td class="cell-muted">${j.owner}</td>
    </tr>`
    )
    .join("");

  tbody.querySelectorAll("[data-journey-row]").forEach((row) => {
    makeInteractive(row, () => openDetail(row.dataset.journeyRow));
  });
}

function initFilters() {
  const searchInput = document.querySelector("[data-journey-search]");
  const statusSelect = document.querySelector("[data-filter-status]");
  statusSelect.innerHTML = `<option value="all">All</option>` + JOURNEY_STATUSES.map((s) => `<option value="${s}">${s}</option>`).join("");
  searchInput?.addEventListener("input", (e) => {
    filterState.query = e.target.value;
    renderList();
  });
  statusSelect?.addEventListener("change", (e) => {
    filterState.status = e.target.value;
    renderList();
  });
}

/* ---------------------------------------------------------------- */
/* Detail view                                                       */
/* ---------------------------------------------------------------- */
function fieldRow(label, value) {
  return `<div class="cluster gap-2" style="justify-content:space-between;"><span class="cell-muted">${label}</span><span>${value}</span></div>`;
}

function openDetail(id) {
  const journey = journeys.find((j) => j.id === id);
  if (!journey) return;
  currentDetailId = id;

  const header = document.querySelector("[data-detail-header]");
  header.innerHTML = `
    <div class="page-header__eyebrow"><i data-lucide="workflow" style="width:13px;height:13px;"></i> Journeys</div>
    <h1 class="page-header__title">${journey.name}</h1>
    <p class="page-header__description">${journey.description}</p>`;
  document.querySelector("[data-edit-journey]").href = `journey-builder.html?edit=${encodeURIComponent(journey.id)}`;

  renderOverviewTab(journey);
  renderFlowTab(journey);
  renderAudienceTab(journey);
  renderActivityTab(journey);

  showView("detail");
  refreshIcons();
}

function renderOverviewTab(journey) {
  const mount = document.querySelector("[data-tab-overview]");
  const showInsights = journey.status === "Active" || journey.status === "Completed";
  mount.innerHTML = `
    <section class="section">
      <div class="section__body stack gap-3" style="max-width: 480px;">
        ${fieldRow("Status", `<span class="badge ${statusBadgeClass(journey.status)}">${journey.status}</span>`)}
        ${fieldRow("Owner", journey.owner)}
        ${fieldRow("Created", journey.createdAt)}
        ${fieldRow("Updated", journey.updatedAt)}
        ${fieldRow("Entry", entryLabel(journey))}
        ${fieldRow("Goal", journey.goal)}
      </div>
    </section>
    <section class="section" style="margin-bottom: 0;">
      <div class="section__header">
        <div>
          <h2 class="section__title">Journey Insights</h2>
          <p class="section__subtitle">Prototype metric — illustrative only, not computed from a live rules engine.</p>
        </div>
      </div>
      <div class="section__body">
        ${
          showInsights
            ? `<div class="metric-row">
                <div class="metric"><span class="metric__label">Entered</span><div class="metric__value-row"><span class="metric__value tabular-nums" style="font-size: var(--text-lg);">${journey.metrics.entered.toLocaleString()}</span></div></div>
                <div class="metric metric--primary"><span class="metric__label">Currently Active</span><div class="metric__value-row"><span class="metric__value tabular-nums" style="font-size: var(--text-lg);">${journey.metrics.active.toLocaleString()}</span></div></div>
                <div class="metric metric--success"><span class="metric__label">Completed</span><div class="metric__value-row"><span class="metric__value tabular-nums" style="font-size: var(--text-lg);">${journey.metrics.completed.toLocaleString()}</span></div></div>
                <div class="metric"><span class="metric__label">Exited</span><div class="metric__value-row"><span class="metric__value tabular-nums" style="font-size: var(--text-lg);">${journey.metrics.exited.toLocaleString()}</span></div></div>
                <div class="metric metric--primary"><span class="metric__label">Goal Rate</span><div class="metric__value-row"><span class="metric__value tabular-nums" style="font-size: var(--text-lg);">${journey.metrics.goalRate}%</span></div></div>
              </div>`
            : `<p class="table__empty">This journey is still a draft — no customers have entered it yet.</p>`
        }
      </div>
    </section>`;
}

function openReadOnlyNodeDrawer(journey, nodeId) {
  const node = getNodeById(journey, nodeId);
  if (!node) return;
  const overlay = document.getElementById("journey-node-drawer");
  const meta = NODE_TYPE_META[node.type];
  overlay.querySelector("[data-drawer-eyebrow]").textContent = meta.label.toUpperCase();
  overlay.querySelector("[data-drawer-title]").textContent = node.name;
  const rows = Object.entries(node.config || {})
    .filter(([k]) => k !== "params")
    .map(([k, v]) => fieldRow(labelize(k), Array.isArray(v) ? v.join(" + ") : String(v)))
    .join("");
  overlay.querySelector("[data-drawer-body]").innerHTML = `<div class="stack gap-2" style="font-size: var(--text-sm);">${rows || '<p class="cell-muted">No configuration.</p>'}</div>`;
  overlay.classList.add("is-open");
  document.body.style.overflow = "hidden";
}
function labelize(key) {
  return key.replace(/([A-Z])/g, " $1").replace(/^./, (c) => c.toUpperCase());
}

function renderFlowTab(journey) {
  const mount = document.querySelector("[data-tab-flow]");
  mount.innerHTML = `<section class="section" style="margin-bottom:0;"><div class="section__body"><div data-flow-readonly></div></div></section>`;
  renderJourneyFlow(mount.querySelector("[data-flow-readonly]"), journey, {
    editable: false,
    onNodeClick: (nodeId) => openReadOnlyNodeDrawer(journey, nodeId),
  });
}

function renderAudienceTab(journey) {
  const mount = document.querySelector("[data-tab-audience]");
  const entry = getEntryNode(journey);
  if (entry.type === "entry-audience") {
    const aud = AUDIENCES.find((a) => a.name === entry.config.audienceName);
    mount.innerHTML = `
      <section class="section" style="margin-bottom:0;">
        <div class="section__body stack gap-3" style="max-width: 420px;">
          ${fieldRow("Entry Audience", entry.config.audienceName)}
          ${fieldRow("Estimated Members", `<span class="tabular-nums">${(aud?.memberCount || 0).toLocaleString()}</span>`)}
          ${fieldRow("Audience Type", aud?.type || "—")}
        </div>
      </section>`;
  } else {
    mount.innerHTML = `
      <section class="section" style="margin-bottom:0;">
        <div class="section__body">
          <p class="table__empty">This journey is event-based (${entryLabel(journey)}) — customers enter individually as the event occurs, rather than from a fixed audience.</p>
        </div>
      </section>`;
  }
}

function renderActivityTab(journey) {
  const mount = document.querySelector("[data-tab-activity]");
  const entries = journey.status === "Draft"
    ? []
    : [
        { time: `${journey.updatedAt} · 09:42`, text: `${journey.metrics.entered.toLocaleString()} profiles entered` },
        { time: `${journey.updatedAt} · 09:38`, text: "Customer matched consent check" },
        { time: `${journey.updatedAt} · 09:15`, text: "Batch evaluation completed for entry audience" },
        { time: `${journey.updatedAt} · 06:00`, text: "Journey definition re-evaluated" },
      ];
  mount.innerHTML = `
    <section class="section" style="margin-bottom:0;">
      <div class="section__header"><div><h2 class="section__title">Activity</h2><p class="section__subtitle">Mock activity only — no customer-level detail is shown here.</p></div></div>
      <div class="section__body">
        ${
          entries.length
            ? `<div class="stack gap-3">${entries.map((e) => `<div class="cluster gap-3" style="align-items:flex-start;"><span class="cell-muted" style="min-width:150px; font-size:var(--text-xs);">${e.time}</span><span style="font-size:var(--text-sm);">${e.text}</span></div>`).join("")}</div>`
            : `<p class="table__empty">No activity yet — this journey is still a draft.</p>`
        }
      </div>
    </section>`;
}

/* ---------------------------------------------------------------- */
/* Test Journey — simulation                                         */
/* ---------------------------------------------------------------- */
function initTestJourney() {
  const modal = document.getElementById("journey-test-modal");
  const customerSelect = modal.querySelector("[data-test-customer]");
  customerSelect.innerHTML = TEST_CUSTOMERS.map((c) => `<option value="${c.id}">${c.name} — ${c.crmId}</option>`).join("");

  modal.querySelector("[data-test-run]").addEventListener("click", () => {
    const journey = journeys.find((j) => j.id === currentDetailId);
    const customer = TEST_CUSTOMERS.find((c) => c.id === customerSelect.value);
    const steps = simulateJourney(journey, customer);
    const resultsEl = modal.querySelector("[data-test-results]");
    resultsEl.hidden = false;
    resultsEl.innerHTML = steps
      .map(
        (s) => `
      <div class="journey-sim-step">
        <span class="journey-sim-step__dot"><i data-lucide="${NODE_TYPE_META[s.type]?.icon || "circle"}"></i></span>
        <div>
          <div class="journey-sim-step__label">${s.label}</div>
          <div class="journey-sim-step__title">${s.name}</div>
          <div class="journey-sim-step__result">${s.result}</div>
          <div class="journey-sim-step__detail">${s.detail}</div>
        </div>
      </div>`
      )
      .join("");
    refreshIcons();
  });

  modal.querySelectorAll("[data-modal-close]").forEach((btn) =>
    btn.addEventListener("click", () => {
      modal.querySelector("[data-test-results]").hidden = true;
    })
  );
}

/* ---------------------------------------------------------------- */
/* Init                                                                */
/* ---------------------------------------------------------------- */
export function initJourneys() {
  journeys = loadJourneys();
  renderSummary();
  initFilters();
  renderList();
  initTestJourney();

  const openId = new URLSearchParams(location.search).get("open");
  if (openId && journeys.some((j) => j.id === openId)) {
    openDetail(openId);
  }

  document.querySelector("[data-back-to-list]").addEventListener("click", () => showView("list"));
}
