import { PIPELINE_STAGES, pipelineSummary } from "../data/pipelines.js";

function refreshIcons() {
  if (window.lucide) window.lucide.createIcons();
}

function renderSummary() {
  const mount = document.querySelector("[data-pl-summary]");
  if (!mount) return;
  const s = pipelineSummary();
  mount.innerHTML = `
    <div class="metric-row">
      <div class="metric metric--primary">
        <span class="metric__label">Processing Stages</span>
        <div class="metric__value-row"><span class="metric__value tabular-nums" style="font-size: var(--text-xl);">${s.stageCount}</span></div>
      </div>
      <div class="metric">
        <span class="metric__label">Data Types Covered</span>
        <div class="metric__value-row"><span class="metric__value tabular-nums" style="font-size: var(--text-xl);">${s.dataTypeCount}</span></div>
      </div>
      <div class="metric">
        <span class="metric__label">Inbound Flows</span>
        <div class="metric__value-row"><span class="metric__value tabular-nums" style="font-size: var(--text-xl);">${s.inboundFlowCount}</span></div>
      </div>
      <div class="metric">
        <span class="metric__label">Outbound Flows</span>
        <div class="metric__value-row"><span class="metric__value tabular-nums" style="font-size: var(--text-xl);">${s.outboundFlowCount}</span></div>
      </div>
    </div>`;
}

function renderStageFlow() {
  const mount = document.querySelector("[data-pl-flow]");
  if (!mount) return;
  mount.innerHTML = PIPELINE_STAGES.map((stage, i) => {
    const node = `
      <div class="stream-pipeline__node" style="min-width: 180px; flex-direction: column; gap: var(--space-1); padding: var(--space-3) var(--space-4);">
        <i data-lucide="${stage.icon}" style="width: 15px; height: 15px;"></i>
        <span>${stage.name}</span>
      </div>`;
    const arrow = i < PIPELINE_STAGES.length - 1 ? `<span class="stream-pipeline__arrow"><i data-lucide="arrow-right"></i></span>` : "";
    return node + arrow;
  }).join("");
  refreshIcons();
}

function renderStageTable() {
  const tbody = document.querySelector("[data-pl-table] tbody");
  if (!tbody) return;
  tbody.innerHTML = PIPELINE_STAGES.map(
    (stage, i) => `
    <tr>
      <td class="num cell-muted tabular-nums">${i + 1}</td>
      <td class="cell-primary"><i data-lucide="${stage.icon}" style="width: 14px; height: 14px; margin-right: var(--space-2); vertical-align: -2px; color: var(--text-tertiary);"></i>${stage.name}</td>
      <td class="cell-muted">${stage.description}</td>
      <td><a class="badge badge--primary" href="${stage.ownerHref}" style="text-decoration:none;">${stage.ownerModule}</a></td>
    </tr>`
  ).join("");
  refreshIcons();
}

export function initPipelines() {
  renderSummary();
  renderStageFlow();
  renderStageTable();
}
