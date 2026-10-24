/*
  Campaigns (Activation) — the activation configuration layer. See
  js/data/campaigns.js for the full WHO/WHAT/WHEN data model and the
  explicit Journey Builder boundary: a Campaign owns exactly one
  primary messaging channel, a simple schedule/trigger, and single/A-B/
  split-delivery experimentation — never multi-step orchestration,
  branching, or wait-as-a-node sequencing. journeyBoundaryNote() below
  is the one link this page offers toward that boundary.
*/
import {
  CAMPAIGNS,
  CAMPAIGN_STATUSES,
  GOAL_CATEGORIES,
  CAMPAIGN_CHANNELS,
  CAMPAIGN_PRIORITIES,
  MESSAGE_TYPES,
  MESSAGE_TYPE_LABELS,
  AB_TEST_GOALS,
  FREQUENCY_UNITS,
  PRIMARY_KPI_OPTIONS,
  SECONDARY_KPI_OPTIONS,
  CONVERSION_EVENT_OPTIONS,
  STATUS_TRANSITION_COPY,
  getCampaignById,
  campaignAudience,
  campaignDestination,
  destinationIdForChannel,
  targetingReach,
  addCampaign,
  updateCampaign,
  updateCampaignStatus,
  duplicateCampaign,
  performanceFor,
} from "../data/campaigns.js";
import {
  AUDIENCES,
  getAudienceById,
  reachMetrics,
  FIELD_META,
  CONDITION_FIELDS,
  OPERATORS_BY_TYPE,
  TIME_UNITS,
  getValueSchema,
  formatConditionValue,
  estimateAudienceSize,
  isConditionComplete,
} from "../data/audiences.js";
import { CONTENT, templatesByChannel, getContentById } from "../data/content.js";
import { getDestinationById } from "../data/destinations.js";
import { initFilterPanel, countActiveFilters } from "../components/connector-directory.js";
import { initAllDropdowns } from "../components/dropdown.js";

let filterState = { query: "", status: [], channel: [], goal: [], owner: [] };

function refreshIcons() {
  if (window.lucide) window.lucide.createIcons();
}
function fmt(n) {
  return n === null || n === undefined ? "—" : Math.round(n).toLocaleString();
}
function statusBadge(status) {
  const map = { Draft: "badge--neutral", Scheduled: "badge--info", Active: "badge--success", Paused: "badge--warning", Completed: "badge--primary" };
  return `<span class="badge ${map[status] || "badge--neutral"}">${status}</span>`;
}
function showView(view) {
  document.querySelector("[data-view-list]").hidden = view !== "list";
  document.querySelector("[data-view-detail]").hidden = view !== "detail";
  document.querySelector("[data-view-create]").hidden = view !== "create";
  window.scrollTo({ top: 0 });
}
function journeyBoundaryNote() {
  return "Need multi-step orchestration, branching or wait conditions? Use Journey Builder for multi-step orchestration.";
}

/* ================================================================ */
/* List                                                                */
/* ================================================================ */
function renderSummary() {
  const total = CAMPAIGNS.length;
  const byStatus = (s) => CAMPAIGNS.filter((c) => c.status === s).length;
  document.querySelector("[data-campaign-summary]").innerHTML = `
    <div class="metric metric--primary"><span class="metric__label">Total Campaigns</span><div class="metric__value-row"><span class="metric__value tabular-nums" style="font-size: var(--text-xl);">${total}</span></div></div>
    <div class="metric metric--success"><span class="metric__label">Active</span><div class="metric__value-row"><span class="metric__value tabular-nums" style="font-size: var(--text-xl);">${byStatus("Active")}</span></div></div>
    <div class="metric"><span class="metric__label">Scheduled</span><div class="metric__value-row"><span class="metric__value tabular-nums" style="font-size: var(--text-xl);">${byStatus("Scheduled")}</span></div></div>
    <div class="metric"><span class="metric__label">Draft</span><div class="metric__value-row"><span class="metric__value tabular-nums" style="font-size: var(--text-xl);">${byStatus("Draft")}</span></div></div>`;
}
function filteredCampaigns() {
  const q = filterState.query.trim().toLowerCase();
  return CAMPAIGNS.filter((c) => {
    if (!q) return true;
    const audience = campaignAudience(c);
    return c.name.toLowerCase().includes(q) || (audience?.name || "").toLowerCase().includes(q) || c.goal.toLowerCase().includes(q) || c.owner.toLowerCase().includes(q);
  })
    .filter((c) => !filterState.status.length || filterState.status.includes(c.status))
    .filter((c) => !filterState.channel.length || filterState.channel.includes(c.channel))
    .filter((c) => !filterState.goal.length || filterState.goal.includes(c.goalCategory))
    .filter((c) => !filterState.owner.length || filterState.owner.includes(c.owner));
}
function rowActionsMenu(c) {
  const nextStatus = c.status === "Active" ? "Paused" : "Active";
  const nextLabel = c.status === "Active" ? "Pause" : "Activate";
  return `
    <div class="dropdown" data-row-actions>
      <button class="btn btn--ghost btn--sm" data-dropdown-trigger aria-label="Campaign actions" onclick="event.stopPropagation()"><i data-lucide="more-horizontal"></i></button>
      <div class="dropdown__menu" role="menu">
        <button type="button" class="dropdown__item" data-row-edit="${c.id}">Edit</button>
        <button type="button" class="dropdown__item" data-row-duplicate="${c.id}">Duplicate</button>
        <button type="button" class="dropdown__item" data-row-status="${c.id}" data-row-status-to="${nextStatus}">${nextLabel}</button>
      </div>
    </div>`;
}
function renderList() {
  const tbody = document.querySelector("[data-campaign-table] tbody");
  const rows = filteredCampaigns();
  tbody.innerHTML = rows.length
    ? rows
        .map((c) => {
          const audience = campaignAudience(c);
          const segmentLabel = audience ? audience.name : "Custom filter";
          return `<tr data-campaign-row="${c.id}" style="cursor: pointer;">
        <td class="cell-primary">${c.name}</td>
        <td class="cell-muted">${segmentLabel}</td>
        <td class="cell-muted">${c.goal}</td>
        <td class="cell-muted">${c.channel}</td>
        <td>${statusBadge(c.status)}</td>
        <td class="cell-muted">${c.schedule.label}</td>
        <td class="cell-muted tabular-nums">${c.updatedAt}</td>
        <td class="cell-muted">${c.owner}</td>
        <td>${rowActionsMenu(c)}</td>
      </tr>`;
        })
        .join("")
    : `<tr><td colspan="9" class="table__empty">No campaigns match the current filters.</td></tr>`;
  refreshIcons();
  initAllDropdowns(tbody);
  tbody.querySelectorAll("[data-campaign-row]").forEach((row) => row.addEventListener("click", () => openDetail(row.dataset.campaignRow)));
  tbody.querySelectorAll("[data-row-edit]").forEach((btn) => btn.addEventListener("click", (e) => { e.stopPropagation(); openWizard(btn.dataset.rowEdit); }));
  tbody.querySelectorAll("[data-row-duplicate]").forEach((btn) =>
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      duplicateCampaign(btn.dataset.rowDuplicate);
      renderSummary();
      renderList();
    })
  );
  tbody.querySelectorAll("[data-row-status]").forEach((btn) =>
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const id = btn.dataset.rowStatus;
      const to = btn.dataset.rowStatusTo;
      const copy = STATUS_TRANSITION_COPY[to];
      openStatusConfirm(copy, () => {
        updateCampaignStatus(id, to);
        renderSummary();
        renderList();
      });
    })
  );
}
function initSearchAndFilter() {
  document.querySelector("[data-campaign-search]").addEventListener("input", (e) => {
    filterState.query = e.target.value;
    renderList();
  });
  const owners = [...new Set(CAMPAIGNS.map((c) => c.owner))];
  const fields = [
    { key: "status", label: "Status", type: "multiselect", options: CAMPAIGN_STATUSES },
    { key: "channel", label: "Channel", type: "multiselect", options: CAMPAIGN_CHANNELS },
    { key: "goal", label: "Goal", type: "multiselect", options: GOAL_CATEGORIES },
    { key: "owner", label: "Owner", type: "multiselect", options: owners },
  ];
  const countBadge = document.querySelector("[data-campaign-filter-count]");
  function updateBadge() {
    const n = countActiveFilters(filterState, fields);
    countBadge.hidden = n === 0;
    countBadge.textContent = n;
  }
  initFilterPanel({
    triggerEl: document.querySelector("[data-campaign-filter-trigger]"),
    panelEl: document.querySelector("[data-campaign-filter-panel]"),
    fields,
    getState: () => filterState,
    onApply: (state) => {
      filterState = { ...filterState, ...state };
      updateBadge();
      renderList();
    },
    onClear: () => {
      filterState = { query: filterState.query, status: [], channel: [], goal: [], owner: [] };
      updateBadge();
      renderList();
    },
  });
  updateBadge();
}

/* ================================================================ */
/* Detail                                                              */
/* ================================================================ */
function renderStatusActions(c) {
  const mount = document.querySelector("[data-detail-status-actions]");
  mount.innerHTML = `
    ${statusBadge(c.status)}
    <div class="select select--sm" style="width: 160px;">
      <select data-status-select>${CAMPAIGN_STATUSES.map((s) => `<option value="${s}" ${s === c.status ? "selected" : ""}>${s}</option>`).join("")}</select>
      <i class="select__chevron" data-lucide="chevron-down"></i>
    </div>
    <button class="btn btn--outline btn--sm" data-detail-edit>Edit</button>
    <button class="btn btn--outline btn--sm" data-detail-duplicate>Duplicate</button>`;
  refreshIcons();
  document.querySelector("[data-status-select]").addEventListener("change", (e) => {
    const newStatus = e.target.value;
    if (newStatus === c.status) return;
    const copy = STATUS_TRANSITION_COPY[newStatus];
    if (copy) {
      openStatusConfirm(copy, () => {
        updateCampaignStatus(c.id, newStatus);
        renderList();
        openDetail(c.id);
      });
      e.target.value = c.status;
    } else {
      updateCampaignStatus(c.id, newStatus);
      renderList();
      openDetail(c.id);
    }
  });
  document.querySelector("[data-detail-edit]").addEventListener("click", () => openWizard(c.id));
  document.querySelector("[data-detail-duplicate]").addEventListener("click", () => {
    const copy = duplicateCampaign(c.id);
    renderList();
    openDetail(copy.id);
  });
}
function openStatusConfirm(copy, onConfirm) {
  document.querySelector("[data-status-confirm-title]").textContent = copy.title;
  document.querySelector("[data-status-confirm-body]").textContent = copy.body;
  const modal = document.getElementById("status-confirm-modal");
  modal.classList.add("is-open");
  const applyBtn = document.querySelector("[data-status-confirm-apply]");
  const handler = () => {
    modal.classList.remove("is-open");
    applyBtn.removeEventListener("click", handler);
    onConfirm();
  };
  applyBtn.addEventListener("click", handler);
}

function templateRefRow(t) {
  if (!t) return "";
  return `<a class="event-stream-card" href="content.html?open=${t.id}" style="text-decoration:none;">
    <div class="event-stream-card__head"><span class="event-stream-card__icon"><i data-lucide="layout-template"></i></span><div><div class="event-stream-card__name">${t.name}</div><div class="event-stream-card__today">${t.channel} · ${t.version}</div></div></div>
  </a>`;
}
function openDetail(id) {
  const c = getCampaignById(id);
  if (!c) return;
  const audience = campaignAudience(c);
  const reach = targetingReach(c.targeting);
  const destination = campaignDestination(c);
  const perf = performanceFor(c);

  document.querySelector("[data-detail-title]").textContent = c.name;
  document.querySelector("[data-detail-description]").textContent = c.description;
  renderStatusActions(c);

  document.querySelector("[data-detail-overview]").innerHTML = `
    <div class="metric"><span class="metric__label">Goal</span><div class="metric__value-row"><span class="metric__value" style="font-size: var(--text-md);">${c.goal}</span></div></div>
    <div class="metric"><span class="metric__label">Messaging Channel</span><div class="metric__value-row"><span class="metric__value" style="font-size: var(--text-md);">${c.channel}</span></div></div>
    <div class="metric"><span class="metric__label">Owner</span><div class="metric__value-row"><span class="metric__value" style="font-size: var(--text-md);">${c.owner}</span></div></div>
    <div class="metric"><span class="metric__label">Created</span><div class="metric__value-row"><span class="metric__value tabular-nums" style="font-size: var(--text-md);">${c.createdAt}</span></div></div>
    <div class="metric"><span class="metric__label">Last Updated</span><div class="metric__value-row"><span class="metric__value tabular-nums" style="font-size: var(--text-md);">${c.updatedAt}</span></div></div>`;

  document.querySelector("[data-detail-who]").innerHTML = `
    <div class="event-summary-grid">
      <div class="metric metric--primary"><span class="metric__label">Target Segment</span><div class="metric__value-row"><span class="metric__value" style="font-size: var(--text-md);">${audience ? audience.name : "Custom filter"}</span></div></div>
      <div class="metric"><span class="metric__label">Audience Size</span><div class="metric__value-row"><span class="metric__value tabular-nums" style="font-size: var(--text-md);">${fmt(reach.total)}</span></div></div>
      <div class="metric"><span class="metric__label">Reachable</span><div class="metric__value-row"><span class="metric__value tabular-nums" style="font-size: var(--text-md);">${fmt(reach.reachable)}</span></div></div>
      <div class="metric"><span class="metric__label">Consent Eligible</span><div class="metric__value-row"><span class="metric__value tabular-nums" style="font-size: var(--text-md);">${fmt(reach.consentEligible)}</span></div></div>
    </div>
    ${audience ? `<div class="cluster gap-2" style="margin-top: var(--space-4);"><a class="btn btn--outline btn--sm" href="audiences.html?open=${audience.id}">View Segment</a></div>` : ""}`;

  const templates = c.templateIds.map(getContentById).filter(Boolean);
  document.querySelector("[data-detail-what]").innerHTML = `
    <div class="identity-row"><div class="identity-row__main"><span class="identity-row__label">Message Type</span><span style="font-size: var(--text-sm);">${MESSAGE_TYPE_LABELS[c.messageType]}</span></div></div>
    <div class="event-stream-grid" style="margin-top: var(--space-3);">${templates.map(templateRefRow).join("")}</div>
    ${
      c.variants.length
        ? `<div class="table-wrap" style="margin-top: var(--space-4);"><table class="table table--dense"><thead><tr><th>Variant</th><th>Template</th><th class="num">Distribution</th></tr></thead><tbody>${c.variants
            .map((v) => `<tr><td class="cell-primary">${v.id}</td><td class="cell-muted">${getContentById(v.templateId)?.name || "—"}</td><td class="num tabular-nums">${v.distribution}%</td></tr>`)
            .join("")}</tbody></table></div>`
        : ""
    }`;

  document.querySelector("[data-detail-when]").innerHTML = `
    <div class="stack gap-3" style="margin-bottom: var(--space-5);">
      <div class="identity-row"><div class="identity-row__main"><span class="identity-row__label">Start</span><span style="font-size: var(--text-sm);">${c.schedule.startDate ? `${c.schedule.startDate} ${c.schedule.startTime}` : "—"}</span></div></div>
      <div class="identity-row"><div class="identity-row__main"><span class="identity-row__label">End</span><span style="font-size: var(--text-sm);">${c.schedule.endDate ? `${c.schedule.endDate} ${c.schedule.endTime}` : "—"}</span></div></div>
      <div class="identity-row"><div class="identity-row__main"><span class="identity-row__label">Timezone</span><span style="font-size: var(--text-sm);">${c.schedule.timezone}</span></div></div>
    </div>
    <div class="section__header" style="padding: 0; margin-bottom: var(--space-3);"><h3 class="section__title" style="font-size: var(--text-sm);">Delivery Preferences</h3></div>
    <div class="stack gap-3">
      <div class="identity-row"><div class="identity-row__main"><span class="identity-row__label">Frequency Cap</span><span style="font-size: var(--text-sm);">${c.deliveryPreferences.frequencyCapAmount} message / ${c.deliveryPreferences.frequencyCapUnit}</span></div></div>
      <div class="identity-row"><div class="identity-row__main"><span class="identity-row__label">Quiet Hours</span><span style="font-size: var(--text-sm);">${c.deliveryPreferences.quietHoursStart} – ${c.deliveryPreferences.quietHoursEnd}</span></div></div>
      <div class="identity-row"><div class="identity-row__main"><span class="identity-row__label">Consent</span><span style="font-size: var(--text-sm);">${c.deliveryPreferences.respectConsent ? "Required" : "Not required"}</span></div></div>
      <div class="identity-row"><div class="identity-row__main"><span class="identity-row__label">Channel Preference</span><span style="font-size: var(--text-sm);">${c.deliveryPreferences.respectChannelPreference ? "Respected" : "Not respected"}</span></div></div>
      <div class="identity-row"><div class="identity-row__main"><span class="identity-row__label">TTL / Expiration</span><span style="font-size: var(--text-sm);">${c.deliveryPreferences.ttl}</span></div></div>
    </div>`;

  document.querySelector("[data-detail-performance]").innerHTML = `
    <div class="table-wrap"><table class="table table--dense">
      <thead><tr><th>Audience</th><th>Eligible</th><th>Sent</th><th>Delivered</th><th>Opened / Viewed</th><th>Clicked</th><th>Converted</th><th>Conversion Rate</th></tr></thead>
      <tbody><tr>
        <td class="num tabular-nums">${fmt(perf.audience)}</td>
        <td class="num tabular-nums">${fmt(perf.eligible)}</td>
        <td class="num tabular-nums">${fmt(perf.sent)}</td>
        <td class="num tabular-nums">${fmt(perf.delivered)}</td>
        <td class="num tabular-nums">${fmt(perf.opened)}</td>
        <td class="num tabular-nums">${fmt(perf.clicked)}</td>
        <td class="num tabular-nums">${fmt(perf.converted)}</td>
        <td class="num tabular-nums">${perf.conversionRate === null ? "—" : perf.conversionRate + "%"}</td>
      </tr></tbody>
    </table></div>
    <p class="event-empty-note" style="margin-top: var(--space-2);">Prototype performance data — not real PHS results.</p>`;

  showView("detail");
  history.replaceState(null, "", `campaigns.html?open=${c.id}`);
  refreshIcons();
}

/* ================================================================ */
/* Create / Edit wizard                                                */
/* ================================================================ */
const STEPS = ["Details", "WHO", "WHAT", "WHEN", "Review"];
let wizard, currentStep, editingCampaignId;

function blankWizard() {
  return {
    name: "",
    description: "",
    channel: CAMPAIGN_CHANNELS[0],
    goalCategory: GOAL_CATEGORIES[0],
    goal: "",
    priority: "P1",
    owner: "",
    targeting: { type: "audience", audienceId: null, filters: [] },
    messageType: "single",
    templateId: null,
    variants: [],
    abTest: { testAudiencePct: 10, testGoal: "Clicks", testDuration: "45 minutes" },
    schedule: { startDate: "", startTime: "", endDate: "", endTime: "", timezone: "Asia/Ho_Chi_Minh" },
    deliveryPreferences: { frequencyCapAmount: 1, frequencyCapUnit: "24 hours", quietHoursStart: "22:00", quietHoursEnd: "07:00", respectConsent: true, respectChannelPreference: true, ttl: "" },
    primaryKpi: "",
    secondaryKpis: [],
    conversionEvent: "",
  };
}
function wizardFromCampaign(c) {
  return {
    name: c.name,
    description: c.description,
    channel: c.channel,
    goalCategory: c.goalCategory,
    goal: c.goal,
    priority: c.priority,
    owner: c.owner,
    targeting: JSON.parse(JSON.stringify(c.targeting)),
    messageType: c.messageType,
    templateId: c.templateIds[0] || null,
    variants: JSON.parse(JSON.stringify(c.variants)),
    abTest: c.abTest ? JSON.parse(JSON.stringify(c.abTest)) : { testAudiencePct: 10, testGoal: "Clicks", testDuration: "45 minutes" },
    schedule: JSON.parse(JSON.stringify(c.schedule)),
    deliveryPreferences: JSON.parse(JSON.stringify(c.deliveryPreferences)),
    primaryKpi: c.primaryKpi,
    secondaryKpis: [...c.secondaryKpis],
    conversionEvent: c.conversionEvent,
  };
}
function newConditionFor(field) {
  field = field || CONDITION_FIELDS.Profile[0];
  const operator = OPERATORS_BY_TYPE[FIELD_META[field].type][0];
  return { field, operator, params: {} };
}

function renderStepNav() {
  document.querySelector("[data-wizard-steps]").innerHTML = STEPS.map((label, i) => {
    const state = i === currentStep ? "current" : i < currentStep ? "done" : "upcoming";
    const color = state === "current" ? "var(--color-primary-600)" : state === "done" ? "var(--text-secondary)" : "var(--text-tertiary)";
    const weight = state === "current" ? "var(--weight-semibold)" : "var(--weight-regular)";
    return `<span data-wizard-step-jump="${i}" style="cursor:pointer; font-size: var(--text-xs); color:${color}; font-weight:${weight};">${i + 1}. ${label}</span>`;
  }).join(`<span style="color: var(--border-default);">/</span>`);
  document.querySelectorAll("[data-wizard-step-jump]").forEach((el) => {
    el.addEventListener("click", () => {
      const target = Number(el.dataset.wizardStepJump);
      if (target <= currentStep || validateStep(currentStep)) {
        currentStep = target;
        renderStep();
      }
    });
  });
}

function stepDetailsHTML() {
  return `
    <div class="event-form-grid">
      <div class="field field--full"><label class="field__label">Campaign Name</label><input class="input" type="text" data-w-field="name" value="${wizard.name}" placeholder="e.g. First Trade Activation" /></div>
      <div class="field"><label class="field__label">Messaging Channel</label><div class="select select--sm"><select data-w-field="channel">${CAMPAIGN_CHANNELS.map((c) => `<option value="${c}" ${c === wizard.channel ? "selected" : ""}>${c}</option>`).join("")}</select><i class="select__chevron" data-lucide="chevron-down"></i></div></div>
      <div class="field"><label class="field__label">Goal</label><div class="select select--sm"><select data-w-field="goalCategory">${GOAL_CATEGORIES.map((g) => `<option value="${g}" ${g === wizard.goalCategory ? "selected" : ""}>${g}</option>`).join("")}</select><i class="select__chevron" data-lucide="chevron-down"></i></div></div>
      <div class="field field--full"><label class="field__label">Description (optional)</label><input class="input" type="text" data-w-field="description" value="${wizard.description}" /></div>
      <div class="field"><label class="field__label">Owner</label><input class="input" type="text" data-w-field="owner" value="${wizard.owner}" placeholder="e.g. CRM Automation" /></div>
      <div class="field"><label class="field__label">Priority</label><div class="select select--sm"><select data-w-field="priority">${CAMPAIGN_PRIORITIES.map((p) => `<option value="${p}" ${p === wizard.priority ? "selected" : ""}>${p}</option>`).join("")}</select><i class="select__chevron" data-lucide="chevron-down"></i></div></div>
    </div>
    <p class="event-empty-note" style="margin-top: var(--space-5);">A campaign has one primary messaging channel. For Push -&gt; wait -&gt; Email -&gt; Zalo sequencing, <a href="journey-builder.html">use Journey Builder</a>.</p>`;
}

function conditionRowHtml(condition, idx) {
  const meta = FIELD_META[condition.field];
  const schema = getValueSchema(meta.type, condition.operator);
  const operators = OPERATORS_BY_TYPE[meta.type];
  const partsHtml = schema
    .map((part) => {
      const val = condition.params?.[part.key] ?? "";
      if (part.control === "select") {
        const options = part.optionsFrom === "field" ? meta.options : part.options;
        return `<span class="rule-part"><div class="select select--sm"><select data-w-cond-part="${idx}:${part.key}"><option value="" disabled ${val ? "" : "selected"}>Select…</option>${options.map((o) => `<option value="${o}" ${o === val ? "selected" : ""}>${o}</option>`).join("")}</select><i class="select__chevron" data-lucide="chevron-down"></i></div></span>`;
      }
      if (part.control === "unit") {
        return `<span class="rule-part"><div class="select select--sm"><select data-w-cond-part="${idx}:${part.key}">${TIME_UNITS.map((u) => `<option value="${u}" ${u === (val || "days") ? "selected" : ""}>${u}</option>`).join("")}</select><i class="select__chevron" data-lucide="chevron-down"></i></div></span>`;
      }
      if (part.control === "number") return `<span class="rule-part"><input class="input" type="number" data-w-cond-part="${idx}:${part.key}" value="${val}" placeholder="0" /></span>`;
      if (part.control === "date") return `<span class="rule-part"><input class="input" type="date" data-w-cond-part="${idx}:${part.key}" value="${val}" /></span>`;
      return `<span class="rule-part"><input class="input" type="text" data-w-cond-part="${idx}:${part.key}" value="${val}" placeholder="${part.placeholder || "Value"}" /></span>`;
    })
    .join("");
  return `
    <div class="rule-editor-row">
      <div class="select select--sm rule-editor-row__field"><select data-w-cond-field="${idx}">${Object.entries(CONDITION_FIELDS)
        .map(([group, fields]) => `<optgroup label="${group}">${fields.map((f) => `<option value="${f}" ${f === condition.field ? "selected" : ""}>${f}</option>`).join("")}</optgroup>`)
        .join("")}</select><i class="select__chevron" data-lucide="chevron-down"></i></div>
      <div class="select select--sm rule-editor-row__operator"><select data-w-cond-operator="${idx}">${operators.map((op) => `<option value="${op}" ${op === condition.operator ? "selected" : ""}>${op}</option>`).join("")}</select><i class="select__chevron" data-lucide="chevron-down"></i></div>
      <div class="rule-editor-row__parts">${partsHtml}</div>
      <button type="button" class="btn btn--ghost btn--icon btn--sm rule-editor-row__remove" data-w-cond-remove="${idx}" aria-label="Remove condition"><i data-lucide="x"></i></button>
    </div>`;
}
function stepWhoHTML() {
  const t = wizard.targeting;
  const audienceBlock = t.type === "audience"
    ? (() => {
        const a = t.audienceId ? getAudienceById(t.audienceId) : null;
        const r = a ? reachMetrics(a) : null;
        return `
      <div class="field"><label class="field__label">Select Audience</label>
        <div class="select select--sm"><select data-w-audience><option value="">— Select an audience —</option>${AUDIENCES.map((aud) => `<option value="${aud.id}" ${aud.id === t.audienceId ? "selected" : ""}>${aud.name} — ${aud.memberCount.toLocaleString()} members</option>`).join("")}</select><i class="select__chevron" data-lucide="chevron-down"></i></div>
      </div>
      ${
        a
          ? `<div class="event-summary-grid" style="margin-top: var(--space-4);">
        <div class="metric"><span class="metric__label">Members</span><div class="metric__value-row"><span class="metric__value tabular-nums" style="font-size: var(--text-lg);">${fmt(a.memberCount)}</span></div></div>
        <div class="metric"><span class="metric__label">Reachable</span><div class="metric__value-row"><span class="metric__value tabular-nums" style="font-size: var(--text-lg);">${fmt(r.reachable)}</span></div></div>
        <div class="metric"><span class="metric__label">Consent Eligible</span><div class="metric__value-row"><span class="metric__value tabular-nums" style="font-size: var(--text-lg);">${fmt(r.consentEligible)}</span></div></div>
      </div>
      <div class="cluster gap-2" style="margin-top: var(--space-4);"><a class="btn btn--outline btn--sm" href="audiences.html?open=${a.id}" target="_blank" rel="noopener">View Segment</a></div>`
          : ""
      }`;
      })()
    : (() => {
        const conditions = t.filters.length ? t.filters : (t.filters = [newConditionFor()]);
        const estSize = estimateAudienceSize(conditions.filter(isConditionComplete));
        const reachable = Math.round(estSize * 0.877);
        const consentEligible = Math.round(estSize * 0.793);
        return `
      <div class="rule-editor">${conditions.map((c, i) => conditionRowHtml(c, i) + (i < conditions.length - 1 ? `<div class="rule-connector">AND</div>` : "")).join("")}</div>
      <button type="button" class="btn btn--ghost btn--sm" data-w-cond-add style="margin-top: var(--space-3);"><i data-lucide="plus"></i> Add condition</button>
      <div class="event-summary-grid" style="margin-top: var(--space-5);">
        <div class="metric metric--primary"><span class="metric__label">Estimated Audience</span><div class="metric__value-row"><span class="metric__value tabular-nums" style="font-size: var(--text-lg);">${fmt(estSize)}</span></div></div>
        <div class="metric"><span class="metric__label">Reachable</span><div class="metric__value-row"><span class="metric__value tabular-nums" style="font-size: var(--text-lg);">${fmt(reachable)}</span></div></div>
        <div class="metric"><span class="metric__label">Consent Eligible</span><div class="metric__value-row"><span class="metric__value tabular-nums" style="font-size: var(--text-lg);">${fmt(consentEligible)}</span></div></div>
      </div>
      <div class="cluster gap-2" style="margin-top: var(--space-4);"><a class="btn btn--outline btn--sm" href="audiences.html#create" target="_blank" rel="noopener"><i data-lucide="save"></i> Save as Audience</a></div>
      <p class="event-empty-note" style="margin-top: var(--space-3);">This is an inline, campaign-only targeting definition — it is not a saved Audience unless you choose "Save as Audience".</p>`;
      })();

  return `
    <div class="tabs tabs--pill" role="tablist" aria-label="Targeting mode" style="margin-bottom: var(--space-5);">
      <button type="button" class="tabs__tab ${t.type === "audience" ? "is-active" : ""}" data-w-targeting-mode="audience" aria-selected="${t.type === "audience"}">Select Existing Segment</button>
      <button type="button" class="tabs__tab ${t.type === "filter" ? "is-active" : ""}" data-w-targeting-mode="filter" aria-selected="${t.type === "filter"}">Create Filter</button>
    </div>
    ${audienceBlock}`;
}

function templateOptionsHTML(selectedId, channel) {
  const options = templatesByChannel(channel);
  return `<option value="">— Select template —</option>${options.map((o) => `<option value="${o.id}" ${o.id === selectedId ? "selected" : ""}>${o.name} (${o.version})</option>`).join("")}`;
}
function stepWhatHTML() {
  const channel = wizard.channel;
  const typeTabs = MESSAGE_TYPES.map(
    (mt) => `<button type="button" class="tabs__tab ${wizard.messageType === mt ? "is-active" : ""}" data-w-message-type="${mt}" aria-selected="${wizard.messageType === mt}">${MESSAGE_TYPE_LABELS[mt]}</button>`
  ).join("");

  let body = "";
  if (wizard.messageType === "single") {
    body = `
      <div class="field"><label class="field__label">Template</label>
        <div class="select select--sm"><select data-w-template>${templateOptionsHTML(wizard.templateId, channel)}</select><i class="select__chevron" data-lucide="chevron-down"></i></div>
      </div>
      <div class="cluster gap-2" style="margin-top: var(--space-3);">
        ${wizard.templateId ? `<button type="button" class="btn btn--outline btn--sm" data-w-preview-template="${wizard.templateId}">Preview</button>` : ""}
        <a class="btn btn--outline btn--sm" href="content.html?channel=${encodeURIComponent(channel)}#create" target="_blank" rel="noopener"><i data-lucide="plus"></i> Create New Template</a>
      </div>
      <div data-w-template-preview style="margin-top: var(--space-3); display:none;"></div>`;
  } else if (wizard.messageType === "ab_test") {
    if (wizard.variants.length < 2) wizard.variants = [{ id: "A", templateId: null, distribution: 50 }, { id: "B", templateId: null, distribution: 50 }];
    body = `
      <div class="event-form-grid" style="margin-bottom: var(--space-4);">
        <div class="field"><label class="field__label">Test Audience</label><div class="cluster gap-2"><input class="input" type="number" min="1" max="100" data-w-ab-field="testAudiencePct" value="${wizard.abTest.testAudiencePct}" style="width:90px;" /><span class="cell-muted" style="align-self:center;">%</span></div></div>
        <div class="field"><label class="field__label">Test Goal</label><div class="select select--sm"><select data-w-ab-field="testGoal">${AB_TEST_GOALS.map((g) => `<option value="${g}" ${g === wizard.abTest.testGoal ? "selected" : ""}>${g}</option>`).join("")}</select><i class="select__chevron" data-lucide="chevron-down"></i></div></div>
        <div class="field"><label class="field__label">Test Duration</label><input class="input" type="text" data-w-ab-field="testDuration" value="${wizard.abTest.testDuration}" placeholder="e.g. 45 minutes" /></div>
      </div>
      <div class="table-wrap"><table class="table table--dense"><thead><tr><th>Variant</th><th>Template</th><th class="num">Distribution</th><th></th></tr></thead><tbody>
        ${wizard.variants
          .map(
            (v, i) => `<tr>
          <td class="cell-primary">Variant ${v.id}</td>
          <td><div class="select select--sm"><select data-w-variant-template="${i}">${templateOptionsHTML(v.templateId, channel)}</select><i class="select__chevron" data-lucide="chevron-down"></i></div></td>
          <td class="num"><input class="input" type="number" min="0" max="100" data-w-variant-dist="${i}" value="${v.distribution}" style="width:70px; text-align:right;" /></td>
          <td>${wizard.variants.length > 2 ? `<button type="button" class="btn btn--ghost btn--sm" data-w-variant-remove="${i}"><i data-lucide="x"></i></button>` : ""}</td>
        </tr>`
          )
          .join("")}
      </tbody></table></div>
      ${wizard.variants.length < 3 ? `<button type="button" class="btn btn--ghost btn--sm" data-w-variant-add style="margin-top: var(--space-3);"><i data-lucide="plus"></i> Add Variant</button>` : ""}
      <p class="event-empty-note" style="margin-top: var(--space-4);">After the test period: send the winning variant to the remaining audience. Statistical evaluation is a prototype representation only.</p>`;
  } else if (wizard.messageType === "split_delivery") {
    if (wizard.variants.length < 2) wizard.variants = [{ id: "A", templateId: null, distribution: 50 }, { id: "B", templateId: null, distribution: 50 }];
    const total = wizard.variants.reduce((s, v) => s + Number(v.distribution || 0), 0);
    body = `
      <div class="table-wrap"><table class="table table--dense"><thead><tr><th>Variant</th><th>Template</th><th class="num">Distribution</th><th></th></tr></thead><tbody>
        ${wizard.variants
          .map(
            (v, i) => `<tr>
          <td class="cell-primary">Variant ${v.id}</td>
          <td><div class="select select--sm"><select data-w-variant-template="${i}">${templateOptionsHTML(v.templateId, channel)}</select><i class="select__chevron" data-lucide="chevron-down"></i></div></td>
          <td class="num"><input class="input" type="number" min="0" max="100" data-w-variant-dist="${i}" value="${v.distribution}" style="width:70px; text-align:right;" /></td>
          <td>${wizard.variants.length > 2 ? `<button type="button" class="btn btn--ghost btn--sm" data-w-variant-remove="${i}"><i data-lucide="x"></i></button>` : ""}</td>
        </tr>`
          )
          .join("")}
      </tbody></table></div>
      ${wizard.variants.length < 3 ? `<button type="button" class="btn btn--ghost btn--sm" data-w-variant-add style="margin-top: var(--space-3);"><i data-lucide="plus"></i> Add Variant</button>` : ""}
      <div class="chart-bar-segmented" style="margin-top: var(--space-4);">${wizard.variants.map((v, i) => `<div class="chart-bar-segmented__seg" style="width:${v.distribution}%; background:${["var(--chart-green)", "var(--chart-blue)", "var(--chart-gold)"][i]};"></div>`).join("")}</div>
      <p class="${total === 100 ? "event-empty-note" : "event-form-error"}" style="margin-top: var(--space-2);">Total distribution: ${total}% ${total === 100 ? "" : "(must equal 100%)"}</p>
      <p class="event-empty-note" style="margin-top: var(--space-3);">All variants continue for the full campaign duration — no winner is selected.</p>`;
  }

  return `
    <div class="tabs tabs--pill" role="tablist" aria-label="Message type" style="margin-bottom: var(--space-5);">${typeTabs}</div>
    ${body}`;
}

function stepWhenHTML() {
  const s = wizard.schedule;
  const d = wizard.deliveryPreferences;
  return `
    <div class="event-form-grid">
      <div class="field"><label class="field__label">Start Date</label><input class="input" type="date" data-w-field="schedule.startDate" value="${s.startDate}" /></div>
      <div class="field"><label class="field__label">Start Time</label><input class="input" type="time" data-w-field="schedule.startTime" value="${s.startTime}" /></div>
      <div class="field"><label class="field__label">End Date</label><input class="input" type="date" data-w-field="schedule.endDate" value="${s.endDate}" /></div>
      <div class="field"><label class="field__label">End Time</label><input class="input" type="time" data-w-field="schedule.endTime" value="${s.endTime}" /></div>
    </div>
    <p class="event-empty-note" style="margin-top: var(--space-2);">Timezone: <strong>${s.timezone}</strong></p>

    <div class="section__header" style="padding: 0; margin: var(--space-6) 0 var(--space-3);"><h3 class="section__title" style="font-size: var(--text-sm);">Delivery Preferences</h3></div>
    <div class="event-form-grid">
      <div class="field"><label class="field__label">Frequency Cap</label>
        <div class="cluster gap-2"><input class="input" type="number" min="1" data-w-field="deliveryPreferences.frequencyCapAmount" value="${d.frequencyCapAmount}" style="width:80px;" /><span class="cell-muted" style="align-self:center;">message(s) per</span>
        <div class="select select--sm" style="width:130px;"><select data-w-field="deliveryPreferences.frequencyCapUnit">${FREQUENCY_UNITS.map((u) => `<option value="${u}" ${u === d.frequencyCapUnit ? "selected" : ""}>${u}</option>`).join("")}</select><i class="select__chevron" data-lucide="chevron-down"></i></div></div>
      </div>
      <div class="field"><label class="field__label">Quiet Hours (DND)</label>
        <div class="cluster gap-2"><input class="input" type="time" data-w-field="deliveryPreferences.quietHoursStart" value="${d.quietHoursStart}" /><span class="cell-muted" style="align-self:center;">to</span><input class="input" type="time" data-w-field="deliveryPreferences.quietHoursEnd" value="${d.quietHoursEnd}" /></div>
      </div>
      <div class="field"><label class="field__label">TTL / Expiration</label><input class="input" type="text" data-w-field="deliveryPreferences.ttl" value="${d.ttl}" placeholder="e.g. 24 hours" /></div>
    </div>
    <div class="stack gap-2" style="margin-top: var(--space-4);">
      <label class="cluster gap-2" style="align-items:center;"><input type="checkbox" data-w-checkbox="deliveryPreferences.respectChannelPreference" ${d.respectChannelPreference ? "checked" : ""} /><span style="font-size: var(--text-sm);">Respect customer channel preferences</span></label>
      <label class="cluster gap-2" style="align-items:center;"><input type="checkbox" data-w-checkbox="deliveryPreferences.respectConsent" ${d.respectConsent ? "checked" : ""} /><span style="font-size: var(--text-sm);">Require applicable marketing consent</span></label>
    </div>

    <div class="section__header" style="padding: 0; margin: var(--space-6) 0 var(--space-3);"><h3 class="section__title" style="font-size: var(--text-sm);">Measurement</h3></div>
    <div class="event-form-grid">
      <div class="field"><label class="field__label">Primary KPI</label><div class="select select--sm"><select data-w-field="primaryKpi"><option value="">— Select —</option>${PRIMARY_KPI_OPTIONS.map((k) => `<option value="${k}" ${k === wizard.primaryKpi ? "selected" : ""}>${k}</option>`).join("")}</select><i class="select__chevron" data-lucide="chevron-down"></i></div></div>
      <div class="field"><label class="field__label">Conversion Event</label><div class="select select--sm"><select data-w-field="conversionEvent"><option value="">— Select —</option>${CONVERSION_EVENT_OPTIONS.map((e) => `<option value="${e}" ${e === wizard.conversionEvent ? "selected" : ""}>${e}</option>`).join("")}</select><i class="select__chevron" data-lucide="chevron-down"></i></div></div>
      <div class="field field--full"><label class="field__label">Secondary KPIs</label><div class="event-checklist">${SECONDARY_KPI_OPTIONS.map((k) => `<label><input type="checkbox" data-w-secondary-kpi value="${k}" ${wizard.secondaryKpis.includes(k) ? "checked" : ""} /> <span>${k}</span></label>`).join("")}</div></div>
    </div>`;
}

function stepReviewHTML() {
  const audience = wizard.targeting.type === "audience" ? getAudienceById(wizard.targeting.audienceId) : null;
  const reach = targetingReach(wizard.targeting);
  const templates = wizard.messageType === "single" ? [wizard.templateId].filter(Boolean).map(getContentById) : wizard.variants.map((v) => getContentById(v.templateId)).filter(Boolean);
  const destination = getDestinationById(destinationIdForChannel(wizard.channel));
  const errors = validateAll();
  const rows = [
    ["Campaign Name", wizard.name || "—"],
    ["Messaging Channel", wizard.channel],
    ["Goal", wizard.goalCategory],
    ["Target Segment", audience ? audience.name : wizard.targeting.type === "filter" ? "Custom filter" : "—"],
    ["Estimated Reach", fmt(reach.total)],
    ["Eligible Reach", fmt(reach.consentEligible)],
    ["Message Type", MESSAGE_TYPE_LABELS[wizard.messageType]],
    ["Template(s)", templates.map((t) => t.name).join(", ") || "—"],
    ["Destination", destination ? destination.name : "—"],
    ["Start", wizard.schedule.startDate ? `${wizard.schedule.startDate} ${wizard.schedule.startTime}` : "Not scheduled"],
    ["End", wizard.schedule.endDate ? `${wizard.schedule.endDate} ${wizard.schedule.endTime}` : "—"],
    ["Timezone", wizard.schedule.timezone],
    ["Frequency Cap", `${wizard.deliveryPreferences.frequencyCapAmount} / ${wizard.deliveryPreferences.frequencyCapUnit}`],
    ["Quiet Hours", `${wizard.deliveryPreferences.quietHoursStart} – ${wizard.deliveryPreferences.quietHoursEnd}`],
    ["Primary KPI", wizard.primaryKpi || "—"],
  ];
  return `
    <div class="stack gap-3">${rows.map(([label, value]) => `<div class="identity-row"><div class="identity-row__main"><span class="identity-row__label">${label}</span><span style="font-size: var(--text-sm); color: var(--text-primary);">${value}</span></div></div>`).join("")}</div>
    ${errors.length ? `<div class="event-form-error" style="margin-top: var(--space-4);">${errors.join(" · ")}</div>` : ""}`;
}

const STEP_RENDERERS = [stepDetailsHTML, stepWhoHTML, stepWhatHTML, stepWhenHTML, stepReviewHTML];

function setDeep(obj, path, value) {
  const keys = path.split(".");
  let cur = obj;
  for (let i = 0; i < keys.length - 1; i++) cur = cur[keys[i]];
  cur[keys[keys.length - 1]] = value;
}
function getDeep(obj, path) {
  return path.split(".").reduce((cur, k) => cur?.[k], obj);
}

function wireStepInputs() {
  const body = document.querySelector("[data-wizard-step-body]");
  body.querySelectorAll("[data-w-field]").forEach((el) => {
    el.addEventListener("input", () => {
      setDeep(wizard, el.dataset.wField, el.value);
      if (el.dataset.wField === "channel") renderStep();
    });
  });
  body.querySelectorAll("[data-w-checkbox]").forEach((el) => {
    el.addEventListener("change", () => setDeep(wizard, el.dataset.wCheckbox, el.checked));
  });

  // WHO
  body.querySelectorAll("[data-w-targeting-mode]").forEach((btn) => {
    btn.addEventListener("click", () => {
      wizard.targeting.type = btn.dataset.wTargetingMode;
      renderStep();
    });
  });
  body.querySelector("[data-w-audience]")?.addEventListener("change", (e) => {
    wizard.targeting.audienceId = e.target.value || null;
    renderStep();
  });
  body.querySelectorAll("[data-w-cond-field]").forEach((el) => {
    el.addEventListener("change", (e) => {
      const idx = Number(el.dataset.wCondField);
      wizard.targeting.filters[idx] = newConditionFor(e.target.value);
      renderStep();
    });
  });
  body.querySelectorAll("[data-w-cond-operator]").forEach((el) => {
    el.addEventListener("change", (e) => {
      const idx = Number(el.dataset.wCondOperator);
      wizard.targeting.filters[idx].operator = e.target.value;
      wizard.targeting.filters[idx].params = {};
      renderStep();
    });
  });
  body.querySelectorAll("[data-w-cond-part]").forEach((el) => {
    el.addEventListener("input", (e) => {
      const [idxStr, key] = el.dataset.wCondPart.split(":");
      wizard.targeting.filters[Number(idxStr)].params[key] = e.target.value;
      renderStep();
    });
  });
  body.querySelectorAll("[data-w-cond-remove]").forEach((el) => {
    el.addEventListener("click", () => {
      wizard.targeting.filters.splice(Number(el.dataset.wCondRemove), 1);
      renderStep();
    });
  });
  body.querySelector("[data-w-cond-add]")?.addEventListener("click", () => {
    wizard.targeting.filters.push(newConditionFor());
    renderStep();
  });

  // WHAT
  body.querySelectorAll("[data-w-message-type]").forEach((btn) => {
    btn.addEventListener("click", () => {
      wizard.messageType = btn.dataset.wMessageType;
      renderStep();
    });
  });
  body.querySelector("[data-w-template]")?.addEventListener("change", (e) => {
    wizard.templateId = e.target.value || null;
    renderStep();
  });
  body.querySelector("[data-w-preview-template]")?.addEventListener("click", (e) => {
    const t = getContentById(e.target.closest("[data-w-preview-template]").dataset.wPreviewTemplate);
    const target = body.querySelector("[data-w-template-preview]");
    if (!t || !target) return;
    const key = { Email: "email", Push: "push", "Web Message": "webMessage", "In-App": "inApp", SMS: "sms", Zalo: "zalo" }[t.channel];
    const field = t[key] || {};
    target.textContent = field.body || field.message || field.text || JSON.stringify(field.elements || {});
    target.style.display = target.style.display === "none" ? "block" : "none";
    target.className = "event-form-readonly";
  });
  body.querySelectorAll("[data-w-ab-field]").forEach((el) => {
    el.addEventListener("input", () => {
      wizard.abTest[el.dataset.wAbField] = el.type === "number" ? Number(el.value) : el.value;
    });
  });
  body.querySelectorAll("[data-w-variant-template]").forEach((el) => {
    el.addEventListener("change", () => {
      wizard.variants[Number(el.dataset.wVariantTemplate)].templateId = el.value || null;
    });
  });
  body.querySelectorAll("[data-w-variant-dist]").forEach((el) => {
    el.addEventListener("input", () => {
      wizard.variants[Number(el.dataset.wVariantDist)].distribution = Number(el.value) || 0;
      renderStep();
    });
  });
  body.querySelectorAll("[data-w-variant-remove]").forEach((el) => {
    el.addEventListener("click", () => {
      wizard.variants.splice(Number(el.dataset.wVariantRemove), 1);
      renderStep();
    });
  });
  body.querySelector("[data-w-variant-add]")?.addEventListener("click", () => {
    const nextId = ["A", "B", "C"][wizard.variants.length];
    wizard.variants.push({ id: nextId, templateId: null, distribution: 0 });
    renderStep();
  });

  // WHEN secondary KPIs
  body.querySelectorAll("[data-w-secondary-kpi]").forEach((cb) => {
    cb.addEventListener("change", () => {
      wizard.secondaryKpis = [...body.querySelectorAll("[data-w-secondary-kpi]:checked")].map((el) => el.value);
    });
  });
}

function validateStep(step) {
  if (step === 0) return !!wizard.name.trim();
  if (step === 1) return (wizard.targeting.type === "audience" && !!wizard.targeting.audienceId) || (wizard.targeting.type === "filter" && wizard.targeting.filters.some(isConditionComplete));
  if (step === 2) {
    if (wizard.messageType === "single") return !!wizard.templateId;
    return wizard.variants.every((v) => v.templateId);
  }
  return true;
}
function validateAll() {
  const errors = [];
  if (!wizard.name.trim()) errors.push("Campaign Name is required.");
  const whoOk = (wizard.targeting.type === "audience" && wizard.targeting.audienceId) || (wizard.targeting.type === "filter" && wizard.targeting.filters.some(isConditionComplete));
  if (!whoOk) errors.push("A target segment or filter is required.");
  const whatOk = wizard.messageType === "single" ? wizard.templateId : wizard.variants.every((v) => v.templateId);
  if (!whatOk) errors.push("Select a template for every variant.");
  if ((wizard.messageType === "split_delivery") && wizard.variants.reduce((s, v) => s + Number(v.distribution || 0), 0) !== 100) errors.push("Split Delivery distribution must total 100%.");
  if (!wizard.primaryKpi) errors.push("Primary KPI is required.");
  return errors;
}

function renderStep() {
  renderStepNav();
  document.querySelector("[data-wizard-step-body]").innerHTML = STEP_RENDERERS[currentStep]();
  wireStepInputs();

  document.querySelector("[data-wizard-back]").disabled = currentStep === 0;
  const forward = document.querySelector("[data-wizard-forward-actions]");
  if (currentStep === STEPS.length - 1) {
    const errors = validateAll();
    const canSchedule = wizard.schedule.startDate;
    forward.innerHTML = `
      <button class="btn btn--outline btn--sm" data-wizard-save-draft>Save Draft</button>
      <button class="btn btn--primary btn--sm" data-wizard-activate ${errors.length ? "disabled" : ""}>${canSchedule ? "Schedule Campaign" : "Activate Campaign"}</button>`;
    document.querySelector("[data-wizard-save-draft]").addEventListener("click", () => saveWizard("Draft"));
    document.querySelector("[data-wizard-activate]").addEventListener("click", () => {
      if (!validateAll().length) saveWizard(canSchedule ? "Scheduled" : "Active");
    });
  } else {
    forward.innerHTML = `<button class="btn btn--primary btn--sm" data-wizard-next>Next</button>`;
    document.querySelector("[data-wizard-next]").addEventListener("click", () => {
      if (validateStep(currentStep)) {
        currentStep++;
        renderStep();
      } else {
        document.querySelector("[data-wizard-step-body]").insertAdjacentHTML("beforeend", `<div class="event-form-error">Please complete the required fields before continuing.</div>`);
      }
    });
  }
  refreshIcons();
}

function scheduleLabel() {
  const s = wizard.schedule;
  if (!s.startDate) return "Not scheduled";
  const d = new Date(`${s.startDate}T${s.startTime || "00:00"}`);
  const label = `${String(d.getDate()).padStart(2, "0")} ${["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"][d.getMonth()]} ${d.getFullYear()} — ${s.startTime || "00:00"}`;
  return s.endDate ? label : label;
}
function saveWizard(status) {
  const templateIds = wizard.messageType === "single" ? [wizard.templateId].filter(Boolean) : wizard.variants.map((v) => v.templateId).filter(Boolean);
  const record = {
    name: wizard.name.trim(),
    description: wizard.description.trim(),
    channel: wizard.channel,
    goalCategory: wizard.goalCategory,
    goal: wizard.goal.trim() || wizard.goalCategory,
    priority: wizard.priority,
    owner: wizard.owner.trim() || "CRM Automation",
    status,
    targeting: wizard.targeting,
    messageType: wizard.messageType,
    templateIds,
    variants: wizard.messageType === "single" ? [] : wizard.variants,
    abTest: wizard.messageType === "ab_test" ? wizard.abTest : null,
    schedule: { ...wizard.schedule, label: scheduleLabel() },
    deliveryPreferences: wizard.deliveryPreferences,
    primaryKpi: wizard.primaryKpi,
    secondaryKpis: wizard.secondaryKpis,
    conversionEvent: wizard.conversionEvent || "—",
  };
  let saved;
  if (editingCampaignId) {
    saved = updateCampaign(editingCampaignId, record);
  } else {
    saved = addCampaign(record);
  }
  renderSummary();
  renderList();
  openDetail(saved.id);
}

function openWizard(campaignId) {
  editingCampaignId = campaignId || null;
  const existing = campaignId ? getCampaignById(campaignId) : null;
  wizard = existing ? wizardFromCampaign(existing) : blankWizard();
  currentStep = 0;
  document.querySelector("[data-wizard-title]").textContent = existing ? `Edit Campaign — ${existing.name}` : "Create Campaign";
  showView("create");
  renderStep();
  history.replaceState(null, "", existing ? `campaigns.html?open=${existing.id}#edit` : "campaigns.html#create");
}

function initWizardNav() {
  document.querySelector("[data-wizard-back]").addEventListener("click", () => {
    if (currentStep > 0) {
      currentStep--;
      renderStep();
    }
  });
}

export function initCampaigns() {
  renderSummary();
  renderList();
  initSearchAndFilter();
  initWizardNav();

  document.querySelector("[data-create-campaign]").addEventListener("click", () => openWizard(null));
  document.querySelectorAll("[data-back-to-list]").forEach((btn) =>
    btn.addEventListener("click", () => {
      showView("list");
      history.replaceState(null, "", "campaigns.html");
    })
  );

  const openId = new URLSearchParams(location.search).get("open");
  if (openId && getCampaignById(openId)) {
    openDetail(openId);
  } else if (location.hash === "#create") {
    openWizard(null);
  }
  refreshIcons();
}
