import {
  AUDIENCES,
  AUDIENCE_TYPES,
  AUDIENCE_STATUSES,
  AUDIENCE_OWNERS,
  AUDIENCE_EXAMPLES,
  CONDITION_FIELDS,
  FIELD_META,
  OPERATORS_BY_TYPE,
  getValueSchema,
  formatConditionValue,
  isConditionComplete,
  MONTHS,
  TIME_UNITS,
  CONSENT_VALUES,
  VALUE_BANDS,
  ACTIVATION_DESTINATIONS,
  estimateAudienceSize,
  daysUntilNextBirthday,
  daysSinceLastBirthday,
} from "../data/audiences.js";
import { getFieldCatalog } from "../services/catalogService.js";

// ── Dynamic field catalog (merged từ BFF + local fallback) ───────────────
let _catalogGrouped = null;  // populated on first use

async function ensureCatalog() {
  if (_catalogGrouped) return _catalogGrouped;
  try {
    const catalog = await getFieldCatalog();
    // Merge Mautic fields vào CONDITION_FIELDS categories
    _catalogGrouped = { ...CONDITION_FIELDS };
    if (catalog.grouped) {
      for (const [cat, fields] of Object.entries(catalog.grouped)) {
        const labels = fields.map(f => f.label || f.field);
        if (_catalogGrouped[cat]) {
          // Thêm field chưa có
          for (const lbl of labels) {
            if (!_catalogGrouped[cat].includes(lbl)) _catalogGrouped[cat].push(lbl);
          }
        } else {
          _catalogGrouped[cat] = labels;
        }
      }
    }
  } catch {
    _catalogGrouped = CONDITION_FIELDS;
  }
  return _catalogGrouped;
}

// Local, mutable copy — Save Audience appends to this, not to the
// imported const, so the module's own data file stays the source of
// truth for the *initial* mock set.
const audiences = [...AUDIENCES];

// ── BFF loader — replaces inline mock list when BFF is reachable ──────────
// Normalize audience object từ BFF — đảm bảo không crash dù thiếu field
function normalizeAudience(a) {
  return {
    // identity
    id:             a.id           || `aud_${Date.now()}`,
    mauticId:       a.mauticId     || null,
    // display
    name:           a.name         || 'Untitled Audience',
    description:    a.description  || '',
    type:           a.type         || 'static',
    status:         (() => { const s = a.status || 'active'; return s.charAt(0).toUpperCase() + s.slice(1); })(),
    // stats
    memberCount:    a.memberCount  ?? a.size ?? 0,
    size:           a.size         ?? a.memberCount ?? 0,
    // metadata
    owner:          a.owner        || 'system',
    tags:           a.tags         || [],
    notes:          a.notes        || '',
    createdBy:      a.createdBy    || 'system',
    createdAt:      a.createdAt    || new Date().toISOString(),
    updatedAt:      a.updatedAt    || new Date().toISOString(),
    updatedDaysAgo: a.updatedDaysAgo ?? 0,
    source:         a.source       || 'mautic',
    // UI display fields
    lastEvaluated:  a.lastEvaluated  || 'Not evaluated',
    evaluationMode: a.evaluationMode || 'Automatic',
    dataFreshness:  a.dataFreshness  || 'Near real-time',
    // conditions & members
    conditions:     a.conditions   || [],
    composition:    a.composition  || {},
    sampleMembers:  a.sampleMembers|| [],
    logic:          a.logic        || 'ALL',
    group:          a.group        || null,
  };
}

async function loadAudiencesFromBFF() {
  if (typeof PHSAPI === 'undefined') return;
  try {
    const res = await PHSAPI.audiences.list({ limit: 100 });
    const list = res.data || res.audiences || [];
    if (list.length) {
      audiences.length = 0;
      list.forEach(a => audiences.push(normalizeAudience(a)));
    }
  } catch (e) {
    console.warn('[Audiences] BFF unavailable, using inline mock data:', e.message);
  }
}

const filterState = { query: "", type: "all", status: "all", owner: "all", updated: "any" };
let builderState = null;
let builderMode = "create"; // "create" | "edit"
let editingAudienceId = null;
let builderSnapshot = null; // JSON snapshot taken on entering edit mode, for unsaved-changes detection
let currentDetailId = null;

function normalize(str) {
  return str.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
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

function statusBadgeClass(status) {
  const s = (status || '').toLowerCase();
  return s === 'active' ? 'badge--success' : s === 'paused' ? 'badge--warning' : 'badge--neutral';
}

function showView(view) {
  document.querySelector("[data-view-list]").hidden = view !== "list";
  document.querySelector("[data-view-detail]").hidden = view !== "detail";
  document.querySelector("[data-view-builder]").hidden = view !== "builder";
  window.scrollTo({ top: 0 });
}

/* ---------------------------------------------------------------- */
/* List view — summary, toolbar, table                               */
/* ---------------------------------------------------------------- */

function renderSummary() {
  const mount = document.querySelector("[data-audience-summary]");
  if (!mount) return;
  const total = audiences.length;
  const active = audiences.filter((a) => (a.status||"").toLowerCase() === "active").length;
  const recentlyUpdated = audiences.filter((a) => a.updatedDaysAgo <= 7).length;
  mount.innerHTML = `
    <div class="metric-row">
      <div class="metric"><span class="metric__label">Total Audiences</span><div class="metric__value-row"><span class="metric__value" style="font-size: var(--text-xl);">${total}</span></div></div>
      <div class="metric"><span class="metric__label">Active Audiences</span><div class="metric__value-row"><span class="metric__value" style="font-size: var(--text-xl);">${active}</span></div></div>
      <div class="metric"><span class="metric__label">Recently Updated</span><div class="metric__value-row"><span class="metric__value" style="font-size: var(--text-xl);">${recentlyUpdated}</span></div></div>
      <div class="metric"><span class="metric__label">Customers in Audiences</span><div class="metric__value-row"><span class="metric__value" style="font-size: var(--text-xl);">1.24M</span></div></div>
    </div>`;
}

function passesFilters(a) {
  const q = normalize(filterState.query);
  const matchesSearch = !q || normalize(a.name).includes(q) || normalize(a.description).includes(q) || normalize(a.owner).includes(q);
  const matchesType = filterState.type === "all" || a.type === filterState.type;
  const matchesStatus = filterState.status === "all" || a.status === filterState.status;
  const matchesOwner = filterState.owner === "all" || a.owner === filterState.owner;
  const matchesUpdated =
    filterState.updated === "any"
      ? true
      : filterState.updated === "today"
      ? a.updatedDaysAgo === 0
      : filterState.updated === "7d"
      ? a.updatedDaysAgo <= 7
      : filterState.updated === "30d"
      ? a.updatedDaysAgo <= 30
      : true;
  return matchesSearch && matchesType && matchesStatus && matchesOwner && matchesUpdated;
}

function renderList() {
  const tbody = document.querySelector("[data-audience-table] tbody");
  if (!tbody) return;
  const filtered = audiences.filter(passesFilters);

  if (!filtered.length) {
    tbody.innerHTML = `<tr><td colspan="7" class="table__empty">No audiences match your search and filters.</td></tr>`;
    return;
  }

  tbody.innerHTML = filtered
    .map(
      (a) => `
    <tr data-audience-row="${a.id}">
      <td class="cell-primary">${a.name}</td>
      <td class="cell-muted" style="max-width: 320px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${a.description}</td>
      <td><span class="badge badge--neutral">${a.type}</span></td>
      <td class="num tabular-nums">${a.memberCount.toLocaleString("en-US")}</td>
      <td class="cell-muted">${a.updatedAt}</td>
      <td><span class="badge ${statusBadgeClass(a.status)}">${a.status}</span></td>
      <td class="cell-muted">${a.owner}</td>
    </tr>`
    )
    .join("");

  tbody.querySelectorAll("[data-audience-row]").forEach((row) => {
    row.style.cursor = "pointer";
    makeInteractive(row, () => openDetail(row.dataset.audienceRow));
  });
}

function initToolbar() {
  const search = document.querySelector("[data-audience-search]");
  const typeSelect = document.querySelector("[data-filter-type]");
  const statusSelect = document.querySelector("[data-filter-status]");
  const ownerSelect = document.querySelector("[data-filter-owner]");
  const updatedSelect = document.querySelector("[data-filter-updated]");

  typeSelect.innerHTML = `<option value="all">All types</option>` + AUDIENCE_TYPES.map((t) => `<option value="${t}">${t}</option>`).join("");
  statusSelect.innerHTML = `<option value="all">All statuses</option>` + AUDIENCE_STATUSES.map((s) => `<option value="${s}">${s}</option>`).join("");
  ownerSelect.innerHTML = `<option value="all">All owners</option>` + AUDIENCE_OWNERS.map((o) => `<option value="${o}">${o}</option>`).join("");
  updatedSelect.innerHTML = `
    <option value="any">Any time</option>
    <option value="today">Today</option>
    <option value="7d">Last 7 days</option>
    <option value="30d">Last 30 days</option>`;

  search.addEventListener("input", () => {
    filterState.query = search.value;
    renderList();
  });
  typeSelect.addEventListener("change", () => {
    filterState.type = typeSelect.value;
    renderList();
  });
  statusSelect.addEventListener("change", () => {
    filterState.status = statusSelect.value;
    renderList();
  });
  ownerSelect.addEventListener("change", () => {
    filterState.owner = ownerSelect.value;
    renderList();
  });
  updatedSelect.addEventListener("change", () => {
    filterState.updated = updatedSelect.value;
    renderList();
  });
}

/* ---------------------------------------------------------------- */
/* Detail view — header, summary strip, 4 tabs                       */
/* ---------------------------------------------------------------- */

function renderDetailHeader(a) {
  const mount = document.querySelector("[data-detail-header]");
  mount.innerHTML = `
    <div class="cluster gap-3" style="flex-wrap: wrap;">
      <h1 class="page-header__title" style="font-size: var(--text-xl);">${a.name}</h1>
      <span class="badge ${statusBadgeClass(a.status)}">${a.status}</span>
      <span class="badge badge--neutral">${a.type}</span>
    </div>
    <div class="cluster gap-3" style="flex-wrap: wrap; font-size: var(--text-sm); color: var(--text-tertiary); margin-top: var(--space-2);">
      <span>Owner: ${a.owner}</span>
      <span>·</span>
      <span>Updated ${a.updatedAt}</span>
    </div>
    <p style="font-size: var(--text-sm); color: var(--text-secondary); max-width: 640px; margin-top: var(--space-2);">${a.description}</p>
  `;
}

function renderDetailSummary(a) {
  const mount = document.querySelector("[data-detail-summary]");
  mount.innerHTML = `
    <div class="metric-row">
      <div class="metric"><span class="metric__label">Estimated Members</span><div class="metric__value-row"><span class="metric__value" style="font-size: var(--text-xl);">${a.memberCount.toLocaleString("en-US")}</span></div></div>
      <div class="metric"><span class="metric__label">Last Evaluated</span><div class="metric__value-row"><span class="metric__value" style="font-size: var(--text-md);">${a.lastEvaluated}</span></div></div>
      <div class="metric"><span class="metric__label">Evaluation</span><div class="metric__value-row"><span class="metric__value" style="font-size: var(--text-md);">${a.evaluationMode}</span></div></div>
      <div class="metric"><span class="metric__label">Data Freshness</span><div class="metric__value-row"><span class="metric__value" style="font-size: var(--text-md);">${a.dataFreshness}</span></div></div>
    </div>`;
}

function renderOverviewTab(a) {
  const mount = document.querySelector("[data-tab-overview]");
  const compositionHtml = Object.entries(a.composition)
    .map(
      ([dim, rows]) => `
    <div>
      <p class="subhead">${dim}</p>
      <div class="chart-hbars">
        ${rows
          .map(
            (r) => `
          <div class="chart-hbar">
            <span class="chart-hbar__label">${r.label}</span>
            <div class="chart-hbar__track"><div class="chart-hbar__fill" style="width: ${r.pct}%; background: var(--chart-green);"></div></div>
            <span class="chart-hbar__value tabular-nums">${r.pct}%</span>
          </div>`
          )
          .join("")}
      </div>
    </div>`
    )
    .join("");

  mount.innerHTML = `
    <div class="attr-grid" style="margin-bottom: var(--space-8);">
      <div class="attr-item"><span class="attr-item__label">Created</span><span class="attr-item__value">${a.createdAt}</span></div>
      <div class="attr-item"><span class="attr-item__label">Owner</span><span class="attr-item__value">${a.owner}</span></div>
      <div class="attr-item"><span class="attr-item__label">Evaluation Mode</span><span class="attr-item__value">${a.evaluationMode}</span></div>
      <div class="attr-item"><span class="attr-item__label">Data Freshness</span><span class="attr-item__value">${a.dataFreshness}</span></div>
    </div>
    <p class="subhead" style="margin-bottom: var(--space-4);">Audience composition</p>
    <div class="stack gap-6">${compositionHtml}</div>
  `;
}

function renderDefinitionTab(a) {
  const mount = document.querySelector("[data-tab-definition]");
  if (!a.conditions.length) {
    mount.innerHTML = `<p class="table__empty">This audience has no defined conditions.</p>`;
    return;
  }
  const rowsHtml = a.conditions
    .map((c, i) => {
      const display = formatConditionValue(c);
      const row = `<div class="rule-row"><span class="rule-row__field">${c.field}</span><span class="rule-row__operator">${c.operator}</span>${
        display ? `<span class="rule-row__value">${display}</span>` : ""
      }</div>`;
      return i < a.conditions.length - 1 ? row + `<div class="rule-connector">AND</div>` : row;
    })
    .join("");
  mount.innerHTML = `
    <div class="rule-logic">${a.logic} <strong>conditions</strong> must match</div>
    <div class="stack gap-2">${rowsHtml}</div>
  `;
}

function renderMembersTab(a) {
  const mount = document.querySelector("[data-tab-members]");
  mount.innerHTML = `
    <p class="section__subtitle" style="margin-bottom: var(--space-4);">Sample profiles only — not the full membership list. Click a customer to open their Customer 360 profile.</p>
    <div class="table-wrap">
      <table class="table table--dense">
        <thead>
          <tr>
            <th>Customer</th>
            <th>CRM ID</th>
            <th>Customer Tier</th>
            <th>Lifecycle</th>
            <th>Location</th>
            <th>Last Active</th>
            <th class="cell-check"></th>
          </tr>
        </thead>
        <tbody>
          ${a.sampleMembers
            .map(
              (m) => `
            <tr data-member-row data-detail-row>
              <td class="cell-primary">${m.name}</td>
              <td class="cell-muted font-mono">${m.crmId}</td>
              <td><span class="badge badge--neutral">${m.tier}</span></td>
              <td>${m.lifecycle}</td>
              <td class="cell-muted">${m.location}</td>
              <td class="cell-muted">${m.lastActive}</td>
              <td><i class="row-affordance" data-lucide="chevron-right"></i></td>
            </tr>`
            )
            .join("")}
        </tbody>
      </table>
    </div>
  `;
  mount.querySelectorAll("[data-member-row]").forEach((row) => {
    row.style.cursor = "pointer";
    // Opens the real Customer 360 page (Phase 9) — not a rebuilt
    // profile view. Deep-linking to the specific clicked customer
    // isn't wired since that would require modifying Customer 360,
    // which is out of scope this phase.
    row.addEventListener("click", () => {
      window.location.href = "customer-360.html";
    });
  });
  refreshIcons();
}

function renderActivationTab(a) {
  const mount = document.querySelector("[data-tab-activation]");
  mount.innerHTML = `
    <p class="section__subtitle" style="margin-bottom: var(--space-4);">Activation destinations are shown as prototype integrations and do not represent live production connections.</p>
    <div class="table-wrap">
      <table class="table table--dense">
        <thead>
          <tr>
            <th>Destination</th>
            <th>Type</th>
            <th>Status</th>
            <th>Last Sync</th>
            <th class="num">Records</th>
          </tr>
        </thead>
        <tbody>
          ${ACTIVATION_DESTINATIONS.map(
            (d) => `
            <tr>
              <td class="cell-primary">${d.destination}</td>
              <td class="cell-muted">${d.type}</td>
              <td><span class="badge ${d.status === "Connected" ? "badge--success" : "badge--neutral"}">${d.status}</span></td>
              <td class="cell-muted">${d.lastSync}</td>
              <td class="num tabular-nums">${a.memberCount.toLocaleString("en-US")}</td>
            </tr>`
          ).join("")}
        </tbody>
      </table>
    </div>
  `;
}

function resetDetailTabs() {
  const tablist = document.querySelector("[data-detail-tabs]");
  const tabs = Array.from(tablist.querySelectorAll(".tabs__tab"));
  tabs.forEach((t, i) => {
    const selected = i === 0;
    t.setAttribute("aria-selected", String(selected));
    const panel = document.getElementById(t.getAttribute("aria-controls"));
    if (panel) panel.hidden = !selected;
  });
}

function openDetail(id) {
  const a = audiences.find((x) => x.id === id);
  if (!a) return;
  currentDetailId = id;
  renderDetailHeader(a);
  renderDetailSummary(a);
  renderOverviewTab(a);
  renderDefinitionTab(a);
  renderMembersTab(a);
  renderActivationTab(a);
  resetDetailTabs();
  showView("detail");
}

/* ---------------------------------------------------------------- */
/* Create Audience builder — typed condition rows                    */
/* ---------------------------------------------------------------- */

function defaultParamsFor(field, operator) {
  const meta = FIELD_META[field];
  const schema = getValueSchema(meta.type, operator);
  const params = {};
  schema.forEach((part) => {
    if (part.control === "select") {
      const options = part.optionsFrom === "field" ? meta.options : part.options;
      params[part.key] = options?.[0] || "";
    } else if (part.control === "unit") {
      params[part.key] = "days";
    } else if (part.control === "month") {
      params[part.key] = 1;
    } else if (part.control === "day") {
      params[part.key] = 1;
    }
    // number / date / text parts are left blank — the user must
    // enter them, and Save validates that they did.
  });
  return params;
}

function newCondition() {
  const field = CONDITION_FIELDS.Profile[0];
  const operator = OPERATORS_BY_TYPE[FIELD_META[field].type][0];
  return { field, operator, params: defaultParamsFor(field, operator) };
}

function resetBuilderState() {
  builderState = { conditions: [newCondition()], group: null };
}

function fieldOptionsHtml(selected, sourceGrouped) {
  // sourceGrouped: từ _catalogGrouped (merged BFF + local) hoặc fallback CONDITION_FIELDS
  const groups = sourceGrouped || _catalogGrouped || CONDITION_FIELDS;
  return Object.entries(groups)
    .map(([group, fields]) => {
      const opts = fields.map(f => {
        const label = typeof f === 'string' ? f : (f.label || f.field);
        const value = typeof f === 'string' ? f : (f.field || f.label);
        return `<option value="${value}" ${value === selected ? "selected" : ""}>${label}</option>`;
      }).join("");
      return `<optgroup label="${group}">${opts}</optgroup>`;
    })
    .join("");
}

function monthOptionsHtml(selected) {
  return (
    `<option value="" disabled ${selected ? "" : "selected"}>Month</option>` +
    MONTHS.map((m, i) => `<option value="${i + 1}" ${Number(selected) === i + 1 ? "selected" : ""}>${m}</option>`).join("")
  );
}

function dayOptionsHtml(selected) {
  return (
    `<option value="" disabled ${selected ? "" : "selected"}>Day</option>` +
    Array.from({ length: 31 }, (_, i) => i + 1)
      .map((d) => `<option value="${d}" ${Number(selected) === d ? "selected" : ""}>${d}</option>`)
      .join("")
  );
}

function renderPartControl(part, condition, path) {
  const params = condition.params || {};
  const value = params[part.key] ?? "";
  const attrs = `data-part="${part.key}" data-path="${path}"`;
  let controlHtml;

  switch (part.control) {
    case "select": {
      const options = part.optionsFrom === "field" ? FIELD_META[condition.field]?.options || [] : part.options || [];
      controlHtml = `
        <div class="select select--sm">
          <select ${attrs}>
            <option value="" disabled ${value ? "" : "selected"}>Select…</option>
            ${options.map((o) => `<option value="${o}" ${o === value ? "selected" : ""}>${o}</option>`).join("")}
          </select>
          <i class="select__chevron" data-lucide="chevron-down"></i>
        </div>`;
      break;
    }
    case "number":
      controlHtml = `<input class="input" type="number" ${attrs} value="${value}" placeholder="0" />`;
      break;
    case "date":
      controlHtml = `<input class="input" type="date" ${attrs} value="${value}" />`;
      break;
    case "unit":
      controlHtml = `
        <div class="select select--sm">
          <select ${attrs}>${TIME_UNITS.map((u) => `<option value="${u}" ${u === (value || "days") ? "selected" : ""}>${u}</option>`).join("")}</select>
          <i class="select__chevron" data-lucide="chevron-down"></i>
        </div>`;
      break;
    case "month":
      controlHtml = `
        <div class="select select--sm">
          <select ${attrs}>${monthOptionsHtml(value)}</select>
          <i class="select__chevron" data-lucide="chevron-down"></i>
        </div>`;
      break;
    case "day":
      controlHtml = `
        <div class="select select--sm">
          <select ${attrs}>${dayOptionsHtml(value)}</select>
          <i class="select__chevron" data-lucide="chevron-down"></i>
        </div>`;
      break;
    default:
      controlHtml = `<input class="input" type="text" ${attrs} value="${String(value).replace(/"/g, "&quot;")}" placeholder="${part.placeholder || "Value"}" />`;
  }

  const prefix = part.prefix ? `<span class="rule-part__label">${part.prefix}</span>` : "";
  const suffix = part.suffix ? `<span class="rule-part__label">${part.suffix}</span>` : "";
  return `<span class="rule-part">${prefix}${controlHtml}${suffix}</span>`;
}

// Birthday is a recurring annual date — no birth year exists in the
// data model. This renders a live, correctly-computed example
// against Nguyễn Minh Anh's real (unmasked) birthday, 14 Feb, so the
// year-boundary behavior is genuinely demonstrated, not just claimed.
function birthdayExampleHtml(condition) {
  const p = condition.params || {};
  if (condition.operator === "within next" && p.amount) {
    const days = daysUntilNextBirthday(2, 14);
    const matches = days <= Number(p.amount);
    return `Example: Nguyễn Minh Anh (14 Feb) is ${days} day${days === 1 ? "" : "s"} away → <strong>${matches ? "matches" : "does not match"}</strong>.`;
  }
  if (condition.operator === "within previous" && p.amount) {
    const days = daysSinceLastBirthday(2, 14);
    const matches = days <= Number(p.amount);
    return `Example: Nguyễn Minh Anh's last birthday (14 Feb) was ${days} day${days === 1 ? "" : "s"} ago → <strong>${matches ? "matches" : "does not match"}</strong>.`;
  }
  return "";
}

function conditionRowHtml(condition, path) {
  const meta = FIELD_META[condition.field];
  const schema = getValueSchema(meta.type, condition.operator);
  const operators = OPERATORS_BY_TYPE[meta.type];
  const partsHtml = schema.map((part) => renderPartControl(part, condition, path)).join("");

  const noteHtml =
    meta.type === "birthday"
      ? `<p class="rule-editor-note"><strong>Recurring annual date.</strong> Birthday is evaluated using month and day only — no birth year is stored or compared. <span data-birthday-note="${path}">${birthdayExampleHtml(
          condition
        )}</span></p>`
      : meta.type === "identity"
      ? `<p class="rule-editor-note">Identity conditions check for presence or a reference match only — raw values are never displayed here.</p>`
      : "";

  return `
    <div class="rule-editor-row" data-row-path="${path}">
      <div class="select select--sm rule-editor-row__field">
        <select data-role="field" data-path="${path}">${fieldOptionsHtml(condition.field)}</select>
        <i class="select__chevron" data-lucide="chevron-down"></i>
      </div>
      <div class="select select--sm rule-editor-row__operator">
        <select data-role="operator" data-path="${path}">${operators
    .map((op) => `<option value="${op}" ${op === condition.operator ? "selected" : ""}>${op}</option>`)
    .join("")}</select>
        <i class="select__chevron" data-lucide="chevron-down"></i>
      </div>
      <div class="rule-editor-row__parts">${partsHtml}</div>
      <button type="button" class="btn btn--ghost btn--icon btn--sm rule-editor-row__remove" data-remove="${path}" aria-label="Remove condition">
        <i data-lucide="x"></i>
      </button>
      ${noteHtml}
    </div>`;
}

function resolvePath(path) {
  const [scope, idxStr] = path.split(":");
  const idx = Number(idxStr);
  const arr = scope === "group" ? builderState.group?.conditions : builderState.conditions;
  return { arr, idx };
}

function renderBuilderConditions() {
  const mount = document.querySelector("[data-builder-conditions]");
  if (!mount) return;

  const mainRowsHtml = builderState.conditions.length
    ? builderState.conditions
        .map((c, i) => {
          const row = conditionRowHtml(c, `main:${i}`);
          return i < builderState.conditions.length - 1 ? row + `<div class="rule-connector">AND</div>` : row;
        })
        .join("")
    : `<p class="table__empty">No conditions yet — add one to define this audience.</p>`;

  let groupHtml = "";
  if (builderState.group) {
    const groupRows = builderState.group.conditions.length
      ? builderState.group.conditions
          .map((c, i) => {
            const row = conditionRowHtml(c, `group:${i}`);
            return i < builderState.group.conditions.length - 1 ? row + `<div class="rule-connector">OR</div>` : row;
          })
          .join("")
      : `<p class="table__empty">No conditions in this group yet.</p>`;

    groupHtml = `
      <div class="rule-connector">AND</div>
      <div class="rule-group">
        <span class="rule-group__label"><i data-lucide="layers"></i>ANY of the following</span>
        <div class="rule-editor">${groupRows}</div>
        <div class="rule-builder-actions">
          <button type="button" class="btn btn--ghost btn--sm" data-add-group-condition><i data-lucide="plus"></i>Add condition</button>
          <button type="button" class="btn btn--ghost btn--sm" data-remove-group><i data-lucide="trash-2"></i>Remove group</button>
        </div>
      </div>`;
  }

  mount.innerHTML = `
    <div class="rule-logic">ALL <strong>conditions</strong> must match</div>
    <div class="rule-editor">${mainRowsHtml}</div>
    ${groupHtml}
  `;

  refreshIcons();
  updateEstimate();
  clearBuilderValidation();
}

function allBuilderConditions() {
  return [...builderState.conditions, ...(builderState.group ? builderState.group.conditions : [])];
}

function updateEstimate() {
  const complete = allBuilderConditions().filter(isConditionComplete);
  const size = estimateAudienceSize(complete);
  const valueEl = document.querySelector("[data-estimate-value]");
  const metaEl = document.querySelector("[data-estimate-meta]");
  if (valueEl) valueEl.textContent = size.toLocaleString("en-US");
  if (metaEl) metaEl.textContent = "Updated just now";
}

function initBuilderConditionEvents() {
  const mount = document.querySelector("[data-builder-conditions]");
  if (!mount) return;

  // Typing in a text/number/date part updates state + the live
  // estimate without rebuilding the row, so focus/cursor position is
  // never lost mid-keystroke.
  mount.addEventListener("input", (e) => {
    const el = e.target.closest("[data-part]");
    if (!el || el.tagName === "SELECT") return;
    const path = el.dataset.path;
    const { arr, idx } = resolvePath(path);
    if (!arr || !arr[idx]) return;
    const condition = arr[idx];
    condition.params = condition.params || {};
    condition.params[el.dataset.part] = el.value;
    updateEstimate();
    const noteEl = document.querySelector(`[data-birthday-note="${path}"]`);
    if (noteEl) noteEl.innerHTML = birthdayExampleHtml(condition);
  });

  // Field/operator changes reshape the row (different operators,
  // different value controls) — those always come from a <select>,
  // which only fires "change" on a discrete choice, so a full row
  // rebuild here never interrupts typing.
  mount.addEventListener("change", (e) => {
    const el = e.target.closest("[data-path]");
    if (!el) return;
    const path = el.dataset.path;
    const { arr, idx } = resolvePath(path);
    if (!arr || !arr[idx]) return;
    const condition = arr[idx];
    const role = el.dataset.role;
    const part = el.dataset.part;

    if (role === "field") {
      condition.field = el.value;
      condition.operator = OPERATORS_BY_TYPE[FIELD_META[condition.field].type][0];
      condition.params = defaultParamsFor(condition.field, condition.operator);
      rerenderRow(path, condition);
      return;
    }
    if (role === "operator") {
      condition.operator = el.value;
      condition.params = defaultParamsFor(condition.field, condition.operator);
      rerenderRow(path, condition);
      return;
    }
    if (part) {
      condition.params = condition.params || {};
      condition.params[part] = el.value;
      updateEstimate();
      const noteEl = document.querySelector(`[data-birthday-note="${path}"]`);
      if (noteEl) noteEl.innerHTML = birthdayExampleHtml(condition);
    }
  });

  mount.addEventListener("click", (e) => {
    const removeBtn = e.target.closest("[data-remove]");
    if (removeBtn) {
      const { arr, idx } = resolvePath(removeBtn.dataset.remove);
      if (arr) arr.splice(idx, 1);
      renderBuilderConditions();
      return;
    }
    if (e.target.closest("[data-add-group-condition]")) {
      builderState.group.conditions.push(newCondition());
      renderBuilderConditions();
      return;
    }
    if (e.target.closest("[data-remove-group]")) {
      builderState.group = null;
      renderBuilderConditions();
    }
  });
}

function rerenderRow(path, condition) {
  const mount = document.querySelector("[data-builder-conditions]");
  const rowEl = mount.querySelector(`[data-row-path="${path}"]`);
  if (rowEl) {
    rowEl.outerHTML = conditionRowHtml(condition, path);
    refreshIcons();
  }
  updateEstimate();
}

/* ---------------------------------------------------------------- */
/* Example templates                                                 */
/* ---------------------------------------------------------------- */

function renderExamples() {
  const mount = document.querySelector("[data-audience-examples]");
  if (!mount) return;
  mount.innerHTML = AUDIENCE_EXAMPLES.map(
    (ex, i) => `
    <button type="button" class="rule-example" data-example-index="${i}">
      <span class="rule-example__name">${ex.name}</span>
      <span class="rule-example__purpose">${ex.purpose}</span>
    </button>`
  ).join("");

  mount.querySelectorAll("[data-example-index]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const example = AUDIENCE_EXAMPLES[Number(btn.dataset.exampleIndex)];
      builderState.conditions = example.conditions.map((c) => ({ field: c.field, operator: c.operator, params: { ...c.params } }));
      builderState.group = null;
      const nameInput = document.querySelector("[data-builder-name]");
      if (!nameInput.value.trim()) nameInput.value = example.name;
      renderBuilderConditions();
    });
  });
}

/* ---------------------------------------------------------------- */
/* Validation + save                                                 */
/* ---------------------------------------------------------------- */

function clearBuilderValidation() {
  const banner = document.querySelector("[data-builder-banner]");
  if (banner) banner.hidden = true;
  document.querySelectorAll(".rule-editor-row--invalid").forEach((row) => {
    row.classList.remove("rule-editor-row--invalid");
    row.querySelector(".rule-error")?.remove();
  });
  const nameField = document.querySelector("[data-builder-name]")?.closest(".field");
  nameField?.classList.remove("field--error");
  nameField?.querySelector(".field__error")?.remove();
}

function validateBuilder() {
  const nameOk = document.querySelector("[data-builder-name]").value.trim().length > 0;
  const invalidPaths = [];
  builderState.conditions.forEach((c, i) => {
    if (!isConditionComplete(c)) invalidPaths.push(`main:${i}`);
  });
  if (builderState.group) {
    builderState.group.conditions.forEach((c, i) => {
      if (!isConditionComplete(c)) invalidPaths.push(`group:${i}`);
    });
  }
  const hasConditions = allBuilderConditions().length > 0;
  return { nameOk, hasConditions, invalidPaths, valid: nameOk && hasConditions && invalidPaths.length === 0 };
}

function showBuilderValidation({ nameOk, hasConditions, invalidPaths }) {
  const nameField = document.querySelector("[data-builder-name]").closest(".field");
  nameField.classList.toggle("field--error", !nameOk);
  if (!nameOk && !nameField.querySelector(".field__error")) {
    const err = document.createElement("span");
    err.className = "field__error";
    err.innerHTML = `<i data-lucide="alert-circle"></i>Audience name is required.`;
    nameField.appendChild(err);
  }

  const banner = document.querySelector("[data-builder-banner]");
  if (!hasConditions) {
    banner.hidden = false;
    banner.innerHTML = `<i data-lucide="alert-circle"></i>Add at least one condition before saving.`;
  } else {
    banner.hidden = true;
  }

  document.querySelectorAll(".rule-editor-row").forEach((row) => {
    const invalid = invalidPaths.includes(row.dataset.rowPath);
    row.classList.toggle("rule-editor-row--invalid", invalid);
    if (invalid && !row.querySelector(".rule-error")) {
      const err = document.createElement("span");
      err.className = "rule-error";
      err.innerHTML = `<i data-lucide="alert-circle"></i>This condition needs a value before it can be saved.`;
      row.appendChild(err);
    }
  });

  refreshIcons();
}

function togglePreview() {
  const panel = document.querySelector("[data-preview-panel]");
  if (panel) panel.hidden = !panel.hidden;
}

/** Shows/hides the parts of the builder that differ between creating
 * a brand-new audience and editing an existing one: heading text,
 * the Examples section (not relevant once you're editing a specific,
 * named audience), and which Save button is visible. */
function setBuilderMode(mode) {
  builderMode = mode;
  const isEdit = mode === "edit";

  document.querySelector("[data-builder-eyebrow]").textContent = isEdit ? "Audiences · Edit" : "Audiences · New";
  document.querySelector("[data-builder-heading]").textContent = isEdit ? "Edit Audience" : "Create Audience";
  document.querySelector("[data-builder-subtitle]").textContent = isEdit
    ? "Update this audience's details and conditions. Changes apply once you save."
    : "Define who belongs in this audience using profile, identity, behavior, engagement and consent conditions.";

  document.querySelector("[data-examples-section]").hidden = isEdit;
  document.querySelector("[data-save-draft]").hidden = isEdit;
  document.querySelector("[data-save-audience]").hidden = isEdit;
  document.querySelector("[data-save-changes]").hidden = !isEdit;
  document.querySelector("[data-unsaved-banner]").hidden = true;
}

function snapshotBuilder() {
  const name = document.querySelector("[data-builder-name]").value;
  const description = document.querySelector("[data-builder-description]").value;
  const type = document.querySelector("[data-builder-type]").value;
  return JSON.stringify({ name, description, type, conditions: builderState.conditions, group: builderState.group });
}

function hasUnsavedChanges() {
  return builderMode === "edit" && builderSnapshot !== null && snapshotBuilder() !== builderSnapshot;
}

function openBuilder() {
  resetBuilderState();
  editingAudienceId = null;
  document.querySelector("[data-builder-name]").value = "";
  document.querySelector("[data-builder-description]").value = "";
  document.querySelector("[data-builder-type]").value = AUDIENCE_TYPES[0];
  const preview = document.querySelector("[data-preview-panel]");
  if (preview) preview.hidden = true;
  clearBuilderValidation();
  setBuilderMode("create");
  renderBuilderConditions();
  showView("builder");
}

function openEditBuilder(audience) {
  editingAudienceId = audience.id;
  builderState = {
    conditions: audience.conditions.map((c) => ({ field: c.field, operator: c.operator, params: { ...c.params } })),
    group: audience.group
      ? { conditions: audience.group.conditions.map((c) => ({ field: c.field, operator: c.operator, params: { ...c.params } })) }
      : null,
  };
  document.querySelector("[data-builder-name]").value = audience.name;
  document.querySelector("[data-builder-description]").value = audience.description === "No description provided." ? "" : audience.description;
  document.querySelector("[data-builder-type]").value = audience.type;
  const preview = document.querySelector("[data-preview-panel]");
  if (preview) preview.hidden = true;
  clearBuilderValidation();
  setBuilderMode("edit");
  renderBuilderConditions();
  builderSnapshot = snapshotBuilder();
  showView("builder");
}

function buildAudienceFromForm(status) {
  const name = document.querySelector("[data-builder-name]").value.trim();
  const description = document.querySelector("[data-builder-description]").value.trim() || "No description provided.";
  const type = document.querySelector("[data-builder-type]").value;
  const conditions = builderState.conditions.map((c) => ({ field: c.field, operator: c.operator, params: { ...c.params } }));
  const memberCount = estimateAudienceSize(allBuilderConditions());
  return { name, description, type, conditions, memberCount, status };
}

async function saveAudience(status) {
  const validation = validateBuilder();
  if (!validation.valid) {
    showBuilderValidation(validation);
    return;
  }
  clearBuilderValidation();

  const draft = buildAudienceFromForm(status);

  const saveBtn = document.querySelector("[data-save-audience]");
  if (saveBtn) { saveBtn.disabled = true; saveBtn.textContent = "Saving…"; }

  try {
    const created = await PHSAPI.audiences.create({
      name: draft.name,
      description: draft.description,
      type: draft.type,
      conditions: draft.conditions,
      status: status === "Draft" ? "draft" : "active",
    });

    const newAudience = normalizeAudience({
      ...created,
      evaluationMode: "Automatic",
      dataFreshness:  status === "Draft" ? "Not yet evaluated" : "Near real-time",
      lastEvaluated:  "Just now",
    });

    audiences.unshift(newAudience);
    renderSummary();
    renderList();
    showView("list");
  } catch (err) {
    console.error("[saveAudience] API error:", err);
    alert("Unable to save audience: " + (err.message || "Unknown error"));
  } finally {
    if (saveBtn) { saveBtn.disabled = false; saveBtn.textContent = "Save Audience"; }
  }
}

/** Save Changes — mutates the SAME audience object used by the List,
 * Detail, Definition, Members and Activation tabs (no second copy of
 * the data), then returns to Detail showing the fresh values. Status
 * is left as-is per product rule: editing an Active audience must
 * not silently pause or draft it. */
async function saveChanges() {
  const validation = validateBuilder();
  if (!validation.valid) {
    showBuilderValidation(validation);
    return;
  }
  clearBuilderValidation();

  const audience = audiences.find((a) => a.id === editingAudienceId);
  if (!audience) {
    showView("list");
    return;
  }

  const draft = buildAudienceFromForm(audience.status);

  const saveBtn = document.querySelector("[data-save-changes]");
  if (saveBtn) { saveBtn.disabled = true; saveBtn.textContent = "Saving…"; }

  try {
    const updated = await PHSAPI.audiences.update(audience.id, {
      name: draft.name,
      description: draft.description,
      type: draft.type,
      conditions: draft.conditions,
    });

    // Merge updated fields back into local object
    audience.name        = updated.name        ?? draft.name;
    audience.description = updated.description ?? draft.description;
    audience.type        = updated.type        ?? draft.type;
    audience.conditions  = updated.conditions  ?? draft.conditions;
    audience.memberCount = updated.memberCount ?? draft.memberCount;
    audience.updatedAt   = updated.updatedAt   ?? new Date().toISOString();
    audience.updatedDaysAgo = 0;
    audience.lastEvaluated  = "Just now";

    builderSnapshot = null;
    renderSummary();
    renderList();
    openDetail(audience.id);
  } catch (err) {
    console.error("[saveChanges] API error:", err);
    alert("Unable to save changes: " + (err.message || "Unknown error"));
  } finally {
    if (saveBtn) { saveBtn.disabled = false; saveBtn.textContent = "Save Changes"; }
  }
}

/** Cancel (edit mode) / Back (create mode). In edit mode, if the form
 * differs from the snapshot taken on entry, show the inline unsaved-
 * changes banner instead of leaving immediately. */
function handleBuilderCancel() {
  if (hasUnsavedChanges()) {
    document.querySelector("[data-unsaved-banner]").hidden = false;
    return;
  }
  leaveBuilder();
}

function leaveBuilder() {
  builderSnapshot = null;
  if (builderMode === "edit" && editingAudienceId) {
    openDetail(editingAudienceId);
  } else {
    showView("list");
  }
}

/* ---------------------------------------------------------------- */
/* Init                                                               */
/* ---------------------------------------------------------------- */

export function initAudiences({ openBuilderOnLoad = false } = {}) {
  console.log("[initAudiences] called, openBuilderOnLoad=", openBuilderOnLoad);
  const typeSelect = document.querySelector("[data-builder-type]");
  if (typeSelect) typeSelect.innerHTML = AUDIENCE_TYPES.map((t) => `<option value="${t}">${t}</option>`).join("");

  // Fetch field catalog + audience list from BFF in parallel, then init UI
  Promise.all([
    ensureCatalog().catch(err => console.warn("[init] catalog failed:", err.message)),
    loadAudiencesFromBFF().catch(err => console.error("[init] loadAudiencesFromBFF REJECTED:", err)),
  ]).then(() => {
    console.log("[init] .then() fired — binding event listeners");
    initToolbar();
    renderSummary();
    renderList();
    renderExamples();
    initBuilderConditionEvents();

    document.querySelector("[data-create-audience]")?.addEventListener("click", openBuilder);
    document.querySelector("[data-back-to-list]")?.addEventListener("click", () => showView("list"));
    document.querySelector("[data-edit-audience]")?.addEventListener("click", () => {
      const audience = audiences.find((a) => a.id === currentDetailId);
      if (audience) openEditBuilder(audience);
    });

    document.querySelector("[data-delete-audience]")?.addEventListener("click", async () => {
      const audience = audiences.find((a) => a.id === currentDetailId);
      if (!audience) return;

      const confirmed = window.confirm(`Delete "${audience.name}"?\n\nThis will remove the audience from Mautic. This action cannot be undone.`);
      if (!confirmed) return;

      const btn = document.querySelector("[data-delete-audience]");
      if (btn) { btn.disabled = true; btn.textContent = "Deleting…"; }

      try {
        if (audience.mauticId && typeof PHSAPI !== 'undefined') {
          await PHSAPI.audiences.delete(audience.id);
        }
        // Xóa khỏi local array
        const idx = audiences.findIndex((a) => a.id === audience.id);
        if (idx !== -1) audiences.splice(idx, 1);
        renderSummary();
        renderList();
        showView("list");
      } catch (err) {
        console.error("[deleteAudience] error:", err);
        alert("Unable to delete audience: " + (err.message || "Unknown error"));
        if (btn) { btn.disabled = false; btn.textContent = "Delete"; }
      }
    });
    document.querySelector("[data-builder-cancel]")?.addEventListener("click", handleBuilderCancel);
    document.querySelector("[data-keep-editing]")?.addEventListener("click", () => {
      document.querySelector("[data-unsaved-banner]").hidden = true;
    });
    document.querySelector("[data-discard-changes]")?.addEventListener("click", leaveBuilder);
    document.querySelector("[data-add-condition]")?.addEventListener("click", () => {
      builderState.conditions.push(newCondition());
      renderBuilderConditions();
    });
    document.querySelector("[data-add-condition-group]")?.addEventListener("click", () => {
      if (!builderState.group) builderState.group = { conditions: [newCondition()] };
      renderBuilderConditions();
    });
    document.querySelector("[data-clear-conditions]")?.addEventListener("click", () => {
      builderState.conditions = [];
      builderState.group = null;
      renderBuilderConditions();
    });
    document.querySelector("[data-preview-audience]")?.addEventListener("click", togglePreview);
    console.log("[init] binding save buttons, save-audience el:", document.querySelector("[data-save-audience]"));
    document.querySelector("[data-save-draft]")?.addEventListener("click", () => { console.log("[click] save-draft"); saveAudience("Draft"); });
    document.querySelector("[data-save-audience]")?.addEventListener("click", () => { console.log("[click] save-audience"); saveAudience("Active"); });
    document.querySelector("[data-save-changes]")?.addEventListener("click", saveChanges);
  });
  if (openBuilderOnLoad) {
    openBuilder();
  } else {
    showView("list");
  }
}
