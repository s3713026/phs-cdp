import { INTEGRATIONS, STATUS_BADGE, getIntegrationById, integrationsSummary } from "../data/integrations.js";

function refreshIcons() {
  if (window.lucide) window.lucide.createIcons();
}

function statusBadge(status) {
  return `<span class="badge ${STATUS_BADGE[status] || "badge--neutral"}">${status}</span>`;
}

function envBadge(env) {
  return env === "Planned" ? `<span class="badge badge--info">${env}</span>` : `<span class="badge badge--neutral">${env}</span>`;
}

/* ------------------------------------------------------------------ */
/* Summary                                                             */
/* ------------------------------------------------------------------ */
function renderSummary() {
  const mount = document.querySelector("[data-int-summary]");
  if (!mount) return;
  const s = integrationsSummary();
  mount.innerHTML = `
    <div class="metric-row">
      <div class="metric metric--primary">
        <span class="metric__label">Integrations</span>
        <div class="metric__value-row"><span class="metric__value tabular-nums" style="font-size: var(--text-xl);">${s.total}</span></div>
      </div>
      <div class="metric metric--success">
        <span class="metric__label">Connected</span>
        <div class="metric__value-row"><span class="metric__value tabular-nums" style="font-size: var(--text-xl);">${s.connected}</span></div>
      </div>
      <div class="metric metric--danger">
        <span class="metric__label">Needs Attention</span>
        <div class="metric__value-row"><span class="metric__value tabular-nums" style="font-size: var(--text-xl);">${s.attention}</span></div>
      </div>
      <div class="metric">
        <span class="metric__label">Planned</span>
        <div class="metric__value-row"><span class="metric__value tabular-nums" style="font-size: var(--text-xl);">${s.planned}</span></div>
      </div>
    </div>`;
}

/* ------------------------------------------------------------------ */
/* Table                                                                */
/* ------------------------------------------------------------------ */
function renderTable() {
  const tbody = document.querySelector("[data-int-table] tbody");
  if (!tbody) return;
  tbody.innerHTML = INTEGRATIONS.map(
    (i) => `
    <tr data-int-row="${i.id}" tabindex="0" role="button">
      <td class="cell-primary">
        <i data-lucide="${i.icon}" style="width: 14px; height: 14px; margin-right: var(--space-2); vertical-align: -2px; color: var(--text-tertiary);"></i>
        ${i.name}
        ${i.demo ? `<span class="badge badge--neutral" style="margin-left: var(--space-2);">Demo</span>` : ""}
      </td>
      <td class="cell-muted">${i.type}</td>
      <td>${envBadge(i.environment)}</td>
      <td>${statusBadge(i.status)}</td>
      <td class="cell-muted">${i.lastCheck || "Never"}</td>
      <td class="cell-muted">${i.owner}</td>
      <td><i class="row-affordance" data-lucide="chevron-right"></i></td>
    </tr>`
  ).join("");

  tbody.querySelectorAll("[data-int-row]").forEach((row) => {
    row.style.cursor = "pointer";
    const open = () => openDetail(row.dataset.intRow);
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

/* ------------------------------------------------------------------ */
/* Detail drawer                                                       */
/* ------------------------------------------------------------------ */
function fieldRow(label, value) {
  return `<div class="identity-row"><div class="identity-row__main"><span class="identity-row__label">${label}</span><span style="font-size: var(--text-sm); color: var(--text-primary);">${value}</span></div></div>`;
}

function renderCheckResult(integration) {
  const box = document.querySelector("[data-int-check-result]");
  if (!box) return;
  if (integration.neverVerified) {
    box.innerHTML = `
      <div class="dataflow-note" style="margin-top: var(--space-4);">
        <i data-lucide="circle-slash"></i>
        <span>No live RudderStack connection is configured in this prototype. This is a planned/demo integration only — status cannot change to Connected until a real deployment is configured and verified.</span>
      </div>`;
  } else if (integration.status === "Connected") {
    box.innerHTML = `
      <div class="dataflow-note" style="margin-top: var(--space-4);">
        <i data-lucide="check-check"></i>
        <span>Simulated check succeeded. This is demo/mock data — no live network request was made.</span>
      </div>`;
  } else {
    box.innerHTML = `
      <div class="dataflow-note" style="margin-top: var(--space-4);">
        <i data-lucide="circle-alert"></i>
        <span>Simulated check reproduced the current ${integration.status.toLowerCase()} status. This is demo/mock data — no live network request was made.</span>
      </div>`;
  }
  refreshIcons();
}

function openDetail(id) {
  const integration = getIntegrationById(id);
  if (!integration) return;

  const overlay = document.getElementById("integration-drawer");
  const eyebrow = overlay.querySelector("[data-drawer-eyebrow]");
  const title = overlay.querySelector("[data-drawer-title]");
  const body = overlay.querySelector("[data-drawer-body]");

  eyebrow.textContent = "Integration";
  title.textContent = integration.name;

  const deploymentNote = integration.neverVerified
    ? `
    <div class="dataflow-note" style="margin-top: var(--space-5);">
      <i data-lucide="info"></i>
      <span>Deployment model not yet selected. Endpoint and authentication configuration depend on whether a RudderStack Cloud or self-hosted (open-source) deployment is chosen — no configuration fields are shown until this is confirmed.</span>
    </div>`
    : "";

  body.innerHTML = `
    <p style="font-size: var(--text-sm); color: var(--text-secondary); margin-bottom: var(--space-5);">${integration.description}</p>
    <div class="stack gap-1" style="margin-bottom: var(--space-2);">
      ${fieldRow("Type", integration.type)}
      ${fieldRow("Environment", envBadge(integration.environment))}
      ${fieldRow("Configuration Status", statusBadge(integration.status))}
      ${fieldRow("Last Connection Check", integration.lastCheck || "Never")}
      ${fieldRow("Owner", integration.owner)}
    </div>
    ${deploymentNote}
    <div data-int-check-result></div>
    <div style="margin-top: var(--space-6);">
      <button type="button" class="btn btn--outline" data-int-check-btn>
        <i data-lucide="plug-2"></i>
        Check Connection
      </button>
    </div>
  `;

  body.querySelector("[data-int-check-btn]").addEventListener("click", (e) => {
    const btn = e.currentTarget;
    if (btn.classList.contains("is-loading")) return;
    btn.classList.add("is-loading");
    btn.disabled = true;
    setTimeout(() => {
      btn.classList.remove("is-loading");
      btn.disabled = false;
      renderCheckResult(integration);
    }, 600);
  });

  refreshIcons();
  overlay.classList.add("is-open");
  document.body.style.overflow = "hidden";
}

function initDrawer() {
  const overlay = document.getElementById("integration-drawer");
  if (!overlay) return;
  function close() {
    overlay.classList.remove("is-open");
    document.body.style.overflow = "";
  }
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) close();
  });
  overlay.querySelectorAll("[data-drawer-close]").forEach((btn) => btn.addEventListener("click", close));
}

export function initIntegrations() {
  renderSummary();
  renderTable();
  initDrawer();
}
