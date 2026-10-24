import {
  NODE_TYPE_META,
  NODE_LIBRARY,
  TEMPLATES_BY_CHANNEL,
  CONSENT_FIELDS,
  GOAL_TYPES,
  EXIT_REASONS,
  EVENT_OPTIONS,
  WAIT_UNITS,
  HTTP_METHODS,
  PAYLOAD_TYPES,
  MOCK_MASKED_AUTH,
  ENTRY_TYPE_OPTIONS,
  JOURNEY_AUDIENCE_NAMES,
  JOURNEY_STATUSES,
  JOURNEY_OWNERS,
  describeEventSource,
  describeForwardTarget,
  loadJourneys,
  saveJourneyOverride,
  outgoingEdges,
  getNodeById,
  getEntryNode,
  simulateJourney,
  TEST_CUSTOMERS,
} from "../data/journeys.js";
import { AUDIENCES } from "../data/audiences.js";
import { CONDITION_FIELDS, FIELD_META, OPERATORS_BY_TYPE, getValueSchema, VALUE_BANDS, CONSENT_VALUES, TIME_UNITS } from "../data/audiences.js";

function refreshIcons() {
  if (window.lucide) window.lucide.createIcons();
}

/* ================================================================ */
/* Node content — shared between the canvas (Journey Builder) and    */
/* the read-only Flow tab on the All Journeys detail page.           */
/* ================================================================ */

function nodeCategoryClass(node) {
  return `journey-node--${node.category}`;
}

function nodeContent(node) {
  const meta = NODE_TYPE_META[node.type];
  const c = node.config || {};
  switch (node.type) {
    case "entry-placeholder":
      return { typeLabel: "ENTRY", title: "Choose Entry Trigger", detail: "Audience, Event, or Attribute" };
    case "entry-audience": {
      const aud = AUDIENCES.find((a) => a.name === c.audienceName);
      return { typeLabel: "ENTRY · AUDIENCE", title: c.audienceName || "—", detail: aud ? `Estimated Members: ${aud.memberCount.toLocaleString()}` : "" };
    }
    case "entry-event":
      return { typeLabel: "ENTRY · EVENT", title: c.eventName || "—", detail: `Source: ${c.source || "—"} · ${(c.dataTypes || []).join(" + ")} · ${(c.delivery || "").toUpperCase()}` };
    case "entry-attribute":
      return { typeLabel: "ENTRY · ATTRIBUTE", title: `${c.field || "—"} ${c.operator || ""} ${formatSimpleValue(c)}`.trim(), detail: "Attribute condition" };
    case "consent-check":
      return { typeLabel: "CONSENT CHECK", title: `${c.field} ${c.operator} ${c.value}`, detail: "Branches — YES continues, NO exits" };
    case "condition":
      return { typeLabel: "CONDITION", title: c.label || describeCondition(c), detail: "Branches — YES / NO" };
    case "wait":
      return {
        typeLabel: "WAIT",
        title: c.mode === "untilEvent" ? `Wait until: ${c.event}` : `Wait ${c.amount ?? "—"} ${c.unit ?? "days"}`,
        detail: c.mode === "untilEvent" ? `Timeout: ${c.timeoutDays ?? "—"} days` : "",
      };
    case "goal":
      return { typeLabel: "GOAL", title: c.goalType || "—", detail: `Measurement Window: ${c.measurementWindowDays ?? "—"} days` };
    case "exit":
      return { typeLabel: "EXIT", title: c.reason || "—", detail: "" };
    default:
      if (node.category === "communication") return { typeLabel: "COMMUNICATION", title: node.name, detail: `Template: ${c.template || "—"} · Consent: ${c.consentRequired || "—"}` };
      if (node.category === "audienceActivation") return { typeLabel: "AUDIENCE ACTIVATION", title: node.name, detail: `Audience: ${c.audienceName || "—"} · Mode: ${c.mode || "—"}` };
      if (node.category === "dataSystem") {
        if (node.type === "ds-webhook") {
          return { typeLabel: "DATA / SYSTEM · EVENT NOTIFICATION", title: node.name, detail: `${c.endpoint || "—"} · ${(c.delivery || "Stream").toUpperCase()}` };
        }
        if (node.type === "ds-http") {
          return { typeLabel: "DATA / SYSTEM · API OPERATION", title: node.name, detail: `${c.method || "POST"} ${c.endpoint || "—"}` };
        }
        if (node.type === "ds-n8n") {
          const t = describeForwardTarget(node.type);
          return { typeLabel: "DATA / SYSTEM", title: node.name, detail: `Event: ${c.eventName || "—"} · Data: ${t.dataTypes.join(" + ")} · Delivery: ${t.delivery.toUpperCase()}` };
        }
        if (node.type === "ds-crm-sync") {
          const t = describeForwardTarget(node.type);
          return { typeLabel: "DATA / SYSTEM", title: node.name, detail: `Data: ${t.dataTypes.join(" + ")} · Delivery: ${t.delivery.toUpperCase()}` };
        }
        return { typeLabel: "DATA / SYSTEM", title: node.name, detail: c.field ? `${c.field} → ${c.value ?? "—"}` : c.audienceName ? `Audience: ${c.audienceName}` : "Updates the customer's profile or audience membership." };
      }
      return { typeLabel: meta.label.toUpperCase(), title: node.name, detail: "" };
  }
}

function formatSimpleValue(c) {
  return c.value ?? "";
}
function describeCondition(c) {
  return `${c.field || "—"} ${c.operator || ""}`.trim();
}

function nodeCardInnerHTML(node) {
  const meta = NODE_TYPE_META[node.type];
  const { typeLabel, title, detail } = nodeContent(node);
  return `
    <div class="journey-node ${nodeCategoryClass(node)}" data-node-id="${node.id}">
      <span class="journey-node__icon"><i data-lucide="${meta.icon}"></i></span>
      <div class="journey-node__body">
        <div class="journey-node__type">${typeLabel}</div>
        <div class="journey-node__title">${title}</div>
        ${detail ? `<div class="journey-node__detail">${detail}</div>` : ""}
      </div>
    </div>`;
}

/* ================================================================ */
/* Read-only flow renderer — used by the All Journeys detail page's  */
/* Flow tab. A simple top-to-bottom summary, not an editable canvas. */
/* ================================================================ */
function connectorHTML() {
  return `<div class="journey-connector"><i data-lucide="chevron-down"></i></div>`;
}

function buildChainHTML(journey, nodeId, selectedId, visited = new Set()) {
  if (visited.has(nodeId)) return ""; // guard against accidental cycles
  visited.add(nodeId);
  const node = getNodeById(journey, nodeId);
  if (!node) return "";
  const selected = node.id === selectedId ? " is-selected" : "";
  let html = nodeCardInnerHTML(node).replace('class="journey-node ', `class="journey-node${selected} `);
  const out = outgoingEdges(journey, nodeId);

  if (!out.length) return html;
  if (out.length === 1) {
    html += connectorHTML();
    html += buildChainHTML(journey, out[0].to, selectedId, visited);
    return html;
  }
  const yes = out.find((e) => e.branch === "yes");
  const no = out.find((e) => e.branch === "no");
  const cols = [yes, no].filter(Boolean);
  html += `<div class="journey-branch">`;
  cols.forEach((edge) => {
    html += `<div class="journey-branch__col">
      <span class="journey-branch__label journey-branch__label--${edge.branch}">${edge.branch === "yes" ? "YES" : "NO"}</span>
      ${buildChainHTML(journey, edge.to, selectedId, visited)}
    </div>`;
  });
  html += `</div>`;
  return html;
}

/** Renders a journey's node tree read-only into `container`. options: { selectedNodeId, onNodeClick(id) } */
export function renderJourneyFlow(container, journey, options = {}) {
  const { selectedNodeId = null, onNodeClick } = options;
  container.innerHTML = `<div class="journey-flow">${buildChainHTML(journey, journey.entryId, selectedNodeId)}</div>`;
  container.querySelectorAll("[data-node-id]").forEach((el) => {
    el.setAttribute("tabindex", "0");
    el.setAttribute("role", "button");
    el.addEventListener("click", () => onNodeClick?.(el.dataset.nodeId));
    el.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        onNodeClick?.(el.dataset.nodeId);
      }
    });
  });
  refreshIcons();
}

/* ================================================================ */
/* Builder page — Drawflow-backed visual canvas                      */
/* ================================================================ */

function nid(journeyId, seqRef) {
  seqRef.n += 1;
  return `${journeyId}-x${seqRef.n}`;
}

function defaultConfigFor(type) {
  const meta = NODE_TYPE_META[type];
  switch (type) {
    case "entry-placeholder":
      return {};
    case "entry-audience":
      return { audienceName: JOURNEY_AUDIENCE_NAMES[0] };
    case "entry-event":
      return { eventName: EVENT_OPTIONS[0], ...describeEventSource(EVENT_OPTIONS[0]) };
    case "entry-attribute":
      return { field: "Lifecycle Stage", operator: "equals", params: { value: "Active Investor" } };
    case "wait":
      return { mode: "duration", amount: 1, unit: "days" };
    case "condition":
      return { field: "Lifecycle Stage", operator: "equals", params: { value: "Active Investor" }, label: "Lifecycle Stage equals Active Investor?" };
    case "ds-webhook":
      return { trigger: "Current Journey Event", endpoint: "https://example.com/webhook/events", method: "POST", payload: "Event payload", delivery: "Stream", status: "Prototype" };
    case "ds-http":
      return { method: "POST", endpoint: "https://api.example.com/customers", auth: MOCK_MASKED_AUTH, payloadType: "Profile", delivery: "Stream", status: "Prototype" };
    case "ds-n8n":
      return { eventName: EVENT_OPTIONS[0], status: "Prototype" };
    case "ds-crm-sync":
      return { status: "Prototype" };
    default:
      if (meta.category === "communication") {
        const channel = meta.channel;
        return { channel, template: TEMPLATES_BY_CHANNEL[channel][0], consentRequired: "Marketing Consent", status: "Prototype" };
      }
      if (meta.category === "audienceActivation") {
        return { destination: meta.destination, audienceName: JOURNEY_AUDIENCE_NAMES[0], mode: "Batch", status: "Prototype" };
      }
      if (meta.category === "dataSystem") {
        if (type === "ds-update-attr") return { field: "Preferred Channel", value: "Mobile App", status: "Prototype" };
        return { audienceName: JOURNEY_AUDIENCE_NAMES[0], status: "Prototype" };
      }
      return {};
  }
}

function makeNode(journeyId, type, seqRef) {
  const meta = NODE_TYPE_META[type];
  return { id: nid(journeyId, seqRef), type, category: meta.category, name: meta.label, config: defaultConfigFor(type) };
}

function blankJourney(seqRef) {
  const id = `jr-new-${Date.now()}`;
  const entry = { id: nid(id, seqRef), type: "entry-placeholder", category: "entry", name: "Choose Entry Trigger", config: {}, position: { x: 40, y: 40 } };
  const exitN = { id: nid(id, seqRef), type: "exit", category: "exit", name: "Exit", config: { reason: "Manual exit" }, position: { x: 40, y: 190 } };
  return {
    id,
    name: "Untitled Journey",
    description: "",
    status: "Draft",
    owner: JOURNEY_OWNERS[0],
    createdAt: mockToday(),
    updatedAt: mockToday(),
    entry,
    audienceLabel: JOURNEY_AUDIENCE_NAMES[0],
    goal: "—",
    nodes: [entry, exitN],
    edges: [{ id: `e-${Date.now()}`, from: entry.id, to: exitN.id, branch: null }],
    entryId: entry.id,
    metrics: { entered: 0, active: 0, completed: 0, exited: 0, goalRate: 0 },
  };
}

function mockToday() {
  return "20 Sep 2026";
}

function isBranchType(type) {
  return type === "consent-check" || type === "condition";
}
function nodeIoCounts(type) {
  const meta = NODE_TYPE_META[type];
  const inputs = meta.category === "entry" ? 0 : 1;
  const outputs = isBranchType(type) ? 2 : type === "exit" || type === "goal" ? 0 : 1;
  return { inputs, outputs };
}

let journey = null;
let selectedNodeId = null;
let snapshotJSON = "";
let seqRef = { n: 0 };
let flowEditor = null;
let dfIdToNodeId = {};
let nodeIdToDfId = {};
let isSyncingCanvas = false;

function isDirty() {
  return JSON.stringify(journey) !== snapshotJSON;
}

/* ---- Single-entry enforcement ---- */
// Entry types listed in the palette, not counting the placeholder (which
// is never itself draggable — it only ever exists as the journey's
// starting node, created once by blankJourney()).
const DRAGGABLE_ENTRY_TYPES = new Set(["entry-audience", "entry-event", "entry-attribute"]);

function hasEntryNode() {
  return journey.nodes.some((n) => n.category === "entry");
}

/* ---- Node Library (left) — drag source, no longer a click-to-insert list ---- */
function renderPalette() {
  const mount = document.querySelector("[data-journey-palette]");
  if (!mount) return;
  const entryExists = hasEntryNode();
  mount.innerHTML = NODE_LIBRARY.map((group) => {
    const isEntryGroup = group.category === "entry";
    return `
    <div>
      <div class="journey-palette__group-title">${group.label}</div>
      <div class="journey-palette__items">
        ${group.types
          .map((t) => {
            const disabled = isEntryGroup && entryExists;
            return `<div class="journey-palette__item${disabled ? " is-disabled" : ""}" draggable="${!disabled}" data-palette-type="${t}" title="${disabled ? "This journey already has an entry trigger." : ""}"><i data-lucide="${NODE_TYPE_META[t].icon}"></i>${NODE_TYPE_META[t].label}</div>`;
          })
          .join("")}
      </div>
      ${isEntryGroup && entryExists ? `<p class="journey-palette__hint">This journey already has an entry trigger. Each journey supports one entry trigger.</p>` : ""}
    </div>`;
  }).join("");
  refreshIcons();

  mount.querySelectorAll("[data-palette-type]:not(.is-disabled)").forEach((el) => {
    el.addEventListener("dragstart", (e) => {
      e.dataTransfer.effectAllowed = "copy";
      e.dataTransfer.setData("text/plain", el.dataset.paletteType);
    });
  });
}

/* ---- Auto-layout for journeys that don't yet carry positions        */
/*      (the 12 mock journeys) — top-to-bottom, branches side by side. */
function autoLayoutPositions(j) {
  const COL_W = 300;
  const ROW_H = 150;
  const positions = {};
  function place(nodeId, depth, lane, visited) {
    if (visited.has(nodeId)) return;
    visited.add(nodeId);
    if (!positions[nodeId]) positions[nodeId] = { x: 40 + lane * COL_W, y: 40 + depth * ROW_H };
    const out = outgoingEdges(j, nodeId);
    if (out.length === 1) {
      place(out[0].to, depth + 1, lane, visited);
    } else if (out.length >= 2) {
      const yes = out.find((e) => e.branch === "yes") || out[0];
      const no = out.find((e) => e.branch === "no") || out[1];
      if (yes) place(yes.to, depth + 1, lane, visited);
      if (no) place(no.to, depth + 1, lane + 1, visited);
    }
  }
  place(j.entryId, 0, 0, new Set());
  return positions;
}

function ensurePositions(j) {
  if (j.nodes.every((n) => n.position)) return;
  const layout = autoLayoutPositions(j);
  j.nodes.forEach((n) => {
    if (!n.position) n.position = layout[n.id] || { x: 40, y: 40 };
  });
}

/* ---- Canvas (center) — Drawflow instance sync'd to `journey`       */
function initFlowEditor() {
  const mount = document.getElementById("journey-canvas");
  flowEditor = new window.Drawflow(mount);
  flowEditor.reroute = false;
  flowEditor.zoom_max = 1.5;
  flowEditor.zoom_min = 0.4;
  flowEditor.start();

  flowEditor.on("nodeSelected", (dfId) => {
    if (isSyncingCanvas) return;
    selectedNodeId = dfIdToNodeId[dfId] || null;
    renderConfig();
  });
  flowEditor.on("nodeUnselected", () => {
    if (isSyncingCanvas) return;
    selectedNodeId = null;
    renderConfig();
  });
  flowEditor.on("nodeMoved", (dfId) => {
    if (isSyncingCanvas) return;
    const nodeId = dfIdToNodeId[dfId];
    const node = getNodeById(journey, nodeId);
    const dfNode = flowEditor.getNodeFromId(dfId);
    if (node && dfNode) node.position = { x: dfNode.pos_x, y: dfNode.pos_y };
  });
  flowEditor.on("connectionCreated", ({ output_id, input_id, output_class }) => {
    if (isSyncingCanvas) return;
    const sourceId = dfIdToNodeId[output_id];
    const targetId = dfIdToNodeId[input_id];
    if (!sourceId || !targetId) return;
    const sourceNode = getNodeById(journey, sourceId);
    const branch = sourceNode && isBranchType(sourceNode.type) ? (output_class === "output_2" ? "no" : "yes") : null;
    journey.edges.push({ id: `e-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, from: sourceId, to: targetId, branch });
  });
  flowEditor.on("connectionRemoved", ({ output_id, input_id }) => {
    if (isSyncingCanvas) return;
    const sourceId = dfIdToNodeId[output_id];
    const targetId = dfIdToNodeId[input_id];
    journey.edges = journey.edges.filter((e) => !(e.from === sourceId && e.to === targetId));
  });
  flowEditor.on("nodeRemoved", (dfId) => {
    if (isSyncingCanvas) return;
    const nodeId = dfIdToNodeId[dfId];
    if (!nodeId) return;
    journey.nodes = journey.nodes.filter((n) => n.id !== nodeId);
    journey.edges = journey.edges.filter((e) => e.from !== nodeId && e.to !== nodeId);
    delete dfIdToNodeId[dfId];
    delete nodeIdToDfId[nodeId];
    if (selectedNodeId === nodeId) {
      selectedNodeId = null;
      renderConfig();
    }
    updateEmptyHint();
    renderPalette();
  });
}

function loadJourneyIntoCanvas() {
  isSyncingCanvas = true;
  flowEditor.clear();
  dfIdToNodeId = {};
  nodeIdToDfId = {};

  ensurePositions(journey);

  journey.nodes.forEach((node) => {
    const { inputs, outputs } = nodeIoCounts(node.type);
    const wrapperClass = `journey-node--${node.category} journey-type--${node.type}`;
    const dfId = flowEditor.addNode(node.type, inputs, outputs, node.position.x, node.position.y, wrapperClass, {}, nodeCardInnerHTML(node));
    dfIdToNodeId[dfId] = node.id;
    nodeIdToDfId[node.id] = dfId;
  });

  journey.edges.forEach((edge) => {
    const sourceDf = nodeIdToDfId[edge.from];
    const targetDf = nodeIdToDfId[edge.to];
    if (sourceDf == null || targetDf == null) return;
    const sourceNode = getNodeById(journey, edge.from);
    const outputClass = sourceNode && isBranchType(sourceNode.type) ? (edge.branch === "no" ? "output_2" : "output_1") : "output_1";
    flowEditor.addConnection(sourceDf, targetDf, outputClass, "input_1");
  });

  isSyncingCanvas = false;
  refreshIcons();
  updateEmptyHint();
}

function updateEmptyHint() {
  const hint = document.querySelector("[data-canvas-empty-hint]");
  if (hint) hint.hidden = journey.nodes.length > 0;
}

function refreshNodeCard(nodeId) {
  const dfId = nodeIdToDfId[nodeId];
  if (dfId == null) return;
  const node = getNodeById(journey, nodeId);
  if (!node) return;
  const contentEl = document.querySelector(`#node-${dfId} .drawflow_content_node`);
  if (contentEl) contentEl.innerHTML = nodeCardInnerHTML(node);
  refreshIcons();
}

/** Converts the journey's entry-placeholder into a concrete entry type.
 * Input/output shape is identical across all entry types (0 in / 1 out),
 * so this only needs to update the data model + the node's own card —
 * no Drawflow node re-creation or edge rewiring required. */
function chooseEntryType(node, newType) {
  node.type = newType;
  node.name = NODE_TYPE_META[newType].label;
  node.config = defaultConfigFor(newType);
  refreshNodeCard(node.id);
  renderConfig();
}

function selectNodeVisually(nodeId) {
  document.querySelectorAll(".drawflow-node.selected").forEach((el) => el.classList.remove("selected"));
  const dfId = nodeIdToDfId[nodeId];
  if (dfId != null) document.getElementById(`node-${dfId}`)?.classList.add("selected");
}

function addNodeToCanvas(type, clientX, clientY) {
  if (NODE_TYPE_META[type].category === "entry" && hasEntryNode()) return; // one entry trigger per journey — belt-and-suspenders alongside the disabled palette state
  const rect = flowEditor.precanvas.getBoundingClientRect();
  const x = (clientX - rect.left) / flowEditor.zoom;
  const y = (clientY - rect.top) / flowEditor.zoom;

  const newNode = makeNode(journey.id, type, seqRef);
  newNode.position = { x, y };
  journey.nodes.push(newNode);

  const { inputs, outputs } = nodeIoCounts(type);
  const wrapperClass = `journey-node--${newNode.category} journey-type--${newNode.type}`;
  const dfId = flowEditor.addNode(newNode.type, inputs, outputs, x, y, wrapperClass, {}, nodeCardInnerHTML(newNode));
  dfIdToNodeId[dfId] = newNode.id;
  nodeIdToDfId[newNode.id] = dfId;

  selectedNodeId = newNode.id;
  selectNodeVisually(newNode.id);
  refreshIcons();
  refreshConfig();
  updateEmptyHint();
  renderPalette();
}

function initCanvasDropZone() {
  const wrap = document.querySelector("[data-journey-canvas-wrap]");
  wrap.addEventListener("dragover", (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
    wrap.classList.add("is-drop-target");
  });
  wrap.addEventListener("dragleave", (e) => {
    if (e.target === wrap) wrap.classList.remove("is-drop-target");
  });
  wrap.addEventListener("drop", (e) => {
    e.preventDefault();
    wrap.classList.remove("is-drop-target");
    const type = e.dataTransfer.getData("text/plain");
    if (!type || !NODE_TYPE_META[type]) return;
    addNodeToCanvas(type, e.clientX, e.clientY);
  });
}

/* ---- Zoom / pan controls ---- */
function applyView(zoom, canvasX, canvasY) {
  flowEditor.zoom = zoom;
  flowEditor.zoom_last_value = zoom; // prevents zoom_refresh's incremental rescale of canvas_x/y
  flowEditor.canvas_x = canvasX;
  flowEditor.canvas_y = canvasY;
  flowEditor.zoom_refresh();
}

function fitView() {
  if (!journey.nodes.length) return;
  const NODE_W = 236;
  const NODE_H = 110;
  const xs = journey.nodes.map((n) => n.position?.x ?? 0);
  const ys = journey.nodes.map((n) => n.position?.y ?? 0);
  const minX = Math.min(...xs) - 30;
  const minY = Math.min(...ys) - 30;
  const maxX = Math.max(...xs) + NODE_W + 30;
  const maxY = Math.max(...ys) + NODE_H + 30;
  const wrap = document.querySelector("[data-journey-canvas-wrap]");
  const viewW = wrap.clientWidth;
  const viewH = wrap.clientHeight;
  const contentW = Math.max(1, maxX - minX);
  const contentH = Math.max(1, maxY - minY);
  let zoom = Math.min(viewW / contentW, viewH / contentH);
  zoom = Math.min(Math.max(zoom, flowEditor.zoom_min), flowEditor.zoom_max);

  // Drawflow's precanvas is scaled around its own center (CSS default
  // transform-origin: 50% 50%, never overridden), not its top-left
  // corner — canvas_x/canvas_y have to be solved back through that
  // same center-origin transform, not a naive top-left translate.
  const desiredLeft = (viewW - contentW * zoom) / 2;
  const desiredTop = (viewH - contentH * zoom) / 2;
  const canvasX = desiredLeft - viewW / 2 - zoom * (minX - viewW / 2);
  const canvasY = desiredTop - viewH / 2 - zoom * (minY - viewH / 2);
  applyView(zoom, canvasX, canvasY);
}

function resetView() {
  applyView(1, 0, 0);
}

/* ---- Tablet/mobile — Palette and Config become slide-in drawers ---- */
function initMobileToggles() {
  const palette = document.querySelector("[data-journey-palette]");
  const config = document.querySelector("[data-journey-config]");
  const paletteToggle = document.querySelector("[data-toggle-palette]");
  const configToggle = document.querySelector("[data-toggle-config]");
  const scrim = document.querySelector("[data-workspace-scrim]");

  function closeDrawers() {
    palette?.classList.remove("is-open");
    config?.classList.remove("is-open");
    scrim?.classList.remove("is-open");
  }
  function openDrawer(el) {
    closeDrawers();
    el?.classList.add("is-open");
    scrim?.classList.add("is-open");
  }
  paletteToggle?.addEventListener("click", () => (palette.classList.contains("is-open") ? closeDrawers() : openDrawer(palette)));
  configToggle?.addEventListener("click", () => (config.classList.contains("is-open") ? closeDrawers() : openDrawer(config)));
  scrim?.addEventListener("click", closeDrawers);
}

function initCanvasControls() {
  document.querySelector("[data-canvas-zoom-in]").addEventListener("click", () => flowEditor.zoom_in());
  document.querySelector("[data-canvas-zoom-out]").addEventListener("click", () => flowEditor.zoom_out());
  document.querySelector("[data-canvas-fit-view]").addEventListener("click", fitView);
  document.querySelector("[data-canvas-reset-view]").addEventListener("click", resetView);
}

/* ---- Config panel (right) — unchanged behavior, now driven by the  */
/*      canvas's selection state instead of a linear list's.          */
function configField(label, controlHTML) {
  return `<div class="journey-config__row"><span class="journey-config__label">${label}</span>${controlHTML}</div>`;
}
function readOnlyValue(text) {
  return `<div class="journey-config__value">${text}</div>`;
}
function selectHTML(id, options, selected) {
  return `<div class="select select--sm"><select id="${id}">${options.map((o) => `<option value="${o}"${o === selected ? " selected" : ""}>${o}</option>`).join("")}</select><i class="select__chevron" data-lucide="chevron-down"></i></div>`;
}

function refreshConfig() {
  renderConfig();
}

function renderConfig() {
  const mount = document.querySelector("[data-journey-config]");
  if (!mount) return;
  const node = getNodeById(journey, selectedNodeId);
  if (!node) {
    mount.innerHTML = `
      <div class="journey-config__header">
        <div class="journey-node__type">JOURNEY SETTINGS</div>
      </div>
      ${configField("Owner", selectHTML("cfg-journey-owner", JOURNEY_OWNERS, journey.owner))}
      <div class="journey-config__row">
        <span class="journey-config__label">Description</span>
        <textarea class="input" id="cfg-journey-description" rows="3" placeholder="Describe what this journey does…">${journey.description || ""}</textarea>
      </div>
      <div class="journey-config__empty" style="padding-top: var(--space-6);">
        <i data-lucide="mouse-pointer-click"></i>
        <span>Select a step on the canvas to configure it.</span>
      </div>`;
    refreshIcons();
    mount.querySelector("#cfg-journey-owner")?.addEventListener("change", (e) => (journey.owner = e.target.value));
    mount.querySelector("#cfg-journey-description")?.addEventListener("input", (e) => (journey.description = e.target.value));
    return;
  }

  const meta = NODE_TYPE_META[node.type];
  let fieldsHTML = "";
  const c = node.config;

  switch (node.type) {
    case "entry-placeholder":
      fieldsHTML = `
        <p style="font-size: var(--text-sm); color: var(--text-secondary); margin: 0 0 var(--space-4);">Choose how customers enter this journey. Each journey supports exactly one entry trigger.</p>
        <div class="journey-entry-choices">
          ${ENTRY_TYPE_OPTIONS.map(
            (opt) => `
            <button type="button" class="journey-entry-choice" data-entry-choice="${opt.type}">
              <i data-lucide="${opt.icon}"></i>
              <span>
                <span class="journey-entry-choice__label">${opt.label}</span>
                <span class="journey-entry-choice__desc">${opt.description}</span>
              </span>
            </button>`
          ).join("")}
        </div>`;
      break;
    case "entry-audience":
      fieldsHTML =
        configField("Entry Type", readOnlyValue("Audience")) +
        configField("Audience", selectHTML("cfg-audience", JOURNEY_AUDIENCE_NAMES, c.audienceName)) +
        configField("Estimated Members", readOnlyValue((AUDIENCES.find((a) => a.name === c.audienceName)?.memberCount || 0).toLocaleString()));
      break;
    case "entry-event": {
      const src = describeEventSource(c.eventName);
      fieldsHTML =
        configField("Entry Type", readOnlyValue("Event")) +
        configField("Event", selectHTML("cfg-event", EVENT_OPTIONS, c.eventName)) +
        configField("Source", readOnlyValue(src.source)) +
        configField("Data Type", readOnlyValue(src.dataTypes.join(" + "))) +
        configField("Delivery", readOnlyValue(src.delivery.toUpperCase()));
      break;
    }
    case "entry-attribute":
      fieldsHTML = configField("Entry Type", readOnlyValue("Attribute")) + renderTypedCondition(c, CONDITION_FIELDS["Profile"], "cfg-attr");
      break;
    case "consent-check":
      fieldsHTML =
        configField("Consent Field", selectHTML("cfg-consent-field", CONSENT_FIELDS, c.field)) +
        configField("Operator", readOnlyValue("equals")) +
        configField("Value", selectHTML("cfg-consent-value", CONSENT_VALUES, c.value)) +
        configField("Branching", readOnlyValue("YES → continue &nbsp;·&nbsp; NO → Exit"));
      break;
    case "condition": {
      const allFields = Object.keys(FIELD_META);
      fieldsHTML = renderTypedCondition(c, allFields, "cfg-cond", true);
      break;
    }
    case "wait":
      fieldsHTML =
        configField("Mode", selectHTML("cfg-wait-mode", ["duration", "untilEvent"], c.mode)) +
        (c.mode === "untilEvent"
          ? configField("Wait Until Event", selectHTML("cfg-wait-event", EVENT_OPTIONS, c.event || EVENT_OPTIONS[0])) +
            configField("Timeout (days)", `<input class="input" type="number" min="1" id="cfg-wait-timeout" value="${c.timeoutDays ?? 7}" />`)
          : configField("Amount", `<input class="input" type="number" min="1" id="cfg-wait-amount" value="${c.amount ?? 1}" />`) + configField("Unit", selectHTML("cfg-wait-unit", WAIT_UNITS, c.unit || "days")));
      break;
    case "goal":
      fieldsHTML = configField("Goal", selectHTML("cfg-goal-type", GOAL_TYPES, c.goalType)) + configField("Measurement Window (days)", `<input class="input" type="number" min="1" id="cfg-goal-window" value="${c.measurementWindowDays ?? 7}" />`);
      break;
    case "exit":
      fieldsHTML = configField("Reason", selectHTML("cfg-exit-reason", EXIT_REASONS, c.reason));
      break;
    default:
      if (node.category === "communication") {
        fieldsHTML =
          configField("Channel", readOnlyValue(meta.channel)) +
          configField("Template", selectHTML("cfg-template", TEMPLATES_BY_CHANNEL[meta.channel], c.template)) +
          configField("Consent", selectHTML("cfg-consent-req", CONSENT_FIELDS, c.consentRequired)) +
          configField("Status", `<span class="badge badge--neutral">Prototype</span>`);
      } else if (node.category === "audienceActivation") {
        fieldsHTML =
          configField("Destination", readOnlyValue(meta.destination)) +
          configField("Audience", `<input class="input" id="cfg-activation-audience" value="${c.audienceName || ""}" placeholder="e.g. this journey's qualified customers" />`) +
          configField("Mode", selectHTML("cfg-activation-mode", ["Batch", "Stream"], c.mode)) +
          configField("Status", `<span class="badge badge--neutral">Prototype</span>`);
      } else if (node.category === "dataSystem") {
        if (node.type === "ds-webhook") {
          fieldsHTML =
            configField("System Action", readOnlyValue("Event notification")) +
            configField("Trigger", readOnlyValue(c.trigger || "Current Journey Event")) +
            configField("Endpoint", `<input class="input font-mono" id="cfg-webhook-endpoint" value="${c.endpoint || ""}" />`) +
            configField("Method", readOnlyValue(c.method || "POST")) +
            configField("Payload", readOnlyValue(c.payload || "Event payload")) +
            configField("Delivery", readOnlyValue((c.delivery || "Stream").toUpperCase())) +
            configField("Status", `<span class="badge badge--neutral">Prototype</span>`);
        } else if (node.type === "ds-http") {
          fieldsHTML =
            configField("System Action", readOnlyValue("API operation")) +
            configField("Method", selectHTML("cfg-http-method", HTTP_METHODS, c.method)) +
            configField("Endpoint", `<input class="input font-mono" id="cfg-http-endpoint" value="${c.endpoint || ""}" />`) +
            configField("Authentication", readOnlyValue(c.auth || MOCK_MASKED_AUTH)) +
            configField("Payload Type", selectHTML("cfg-http-payload", PAYLOAD_TYPES, c.payloadType)) +
            configField("Delivery", selectHTML("cfg-http-delivery", ["Stream", "Batch"], c.delivery)) +
            configField("Status", `<span class="badge badge--neutral">Prototype</span>`);
        } else if (node.type === "ds-n8n") {
          const t = describeForwardTarget(node.type);
          fieldsHTML =
            configField("Destination", readOnlyValue(t.destination)) +
            configField("Event", selectHTML("cfg-ds-event", EVENT_OPTIONS, c.eventName)) +
            configField("Data", readOnlyValue(t.dataTypes.join(" + "))) +
            configField("Delivery", readOnlyValue(t.delivery.toUpperCase())) +
            configField("Status", `<span class="badge badge--neutral">Prototype</span>`);
        } else if (node.type === "ds-crm-sync") {
          const t = describeForwardTarget(node.type);
          fieldsHTML =
            configField("Destination", readOnlyValue(t.destination)) +
            configField("Data", readOnlyValue(t.dataTypes.join(" + "))) +
            configField("Delivery", readOnlyValue(t.delivery.toUpperCase())) +
            configField("Status", `<span class="badge badge--neutral">Prototype</span>`);
        } else if (node.type === "ds-update-attr") {
          fieldsHTML = configField("Attribute", selectHTML("cfg-ds-field", CONDITION_FIELDS["Profile"], c.field)) + configField("New Value", `<input class="input" id="cfg-ds-value" value="${c.value ?? ""}" />`);
        } else {
          fieldsHTML = configField("Audience", selectHTML("cfg-ds-audience", JOURNEY_AUDIENCE_NAMES, c.audienceName));
        }
      }
  }

  mount.innerHTML = `
    <div class="journey-config__header">
      <span class="journey-node__icon"><i data-lucide="${meta.icon}"></i></span>
      <div>
        <div class="journey-node__type">${meta.label.toUpperCase()}</div>
        <div class="journey-node__title">${node.name}</div>
      </div>
    </div>
    ${fieldsHTML}`;
  refreshIcons();
  wireConfigInputs(node);
}

function renderTypedCondition(c, fieldOptions, prefix, showLabelInput = false) {
  const meta = FIELD_META[c.field] || FIELD_META[fieldOptions[0]];
  const operators = OPERATORS_BY_TYPE[meta.type] || [];
  const schema = getValueSchema(meta.type, c.operator || operators[0]);
  let valueHTML = "";
  schema.forEach((part) => {
    const val = c.params?.[part.key] ?? "";
    if (part.control === "select") {
      const opts = part.options || meta.options || VALUE_BANDS;
      valueHTML += `<div class="select select--sm" style="margin-top:4px;"><select data-part="${part.key}">${opts.map((o) => `<option value="${o}"${o === val ? " selected" : ""}>${o}</option>`).join("")}</select><i class="select__chevron" data-lucide="chevron-down"></i></div>`;
    } else if (part.control === "unit") {
      valueHTML += `<div class="select select--sm" style="margin-top:4px;"><select data-part="${part.key}">${TIME_UNITS.map((o) => `<option value="${o}"${o === val ? " selected" : ""}>${o}</option>`).join("")}</select><i class="select__chevron" data-lucide="chevron-down"></i></div>`;
    } else {
      valueHTML += `<input class="input" style="margin-top:4px;" type="${part.control === "number" ? "number" : part.control === "date" ? "date" : "text"}" data-part="${part.key}" value="${val}" placeholder="${part.placeholder || ""}" />`;
    }
  });

  return (
    configField("Field", selectHTML(`${prefix}-field`, fieldOptions, c.field || fieldOptions[0])) +
    configField("Operator", selectHTML(`${prefix}-operator`, operators, c.operator || operators[0])) +
    configField("Value", `<div data-cond-value>${valueHTML}</div>`) +
    (showLabelInput ? configField("Branch Label", `<input class="input" id="${prefix}-label" value="${c.label || ""}" />`) : "")
  );
}

function wireConfigInputs(node) {
  const mount = document.querySelector("[data-journey-config]");
  const c = node.config;

  function onChange(id, fn) {
    mount.querySelector(id)?.addEventListener("change", fn);
    mount.querySelector(id)?.addEventListener("input", fn);
  }

  switch (node.type) {
    case "entry-placeholder":
      mount.querySelectorAll("[data-entry-choice]").forEach((btn) => {
        btn.addEventListener("click", () => chooseEntryType(node, btn.dataset.entryChoice));
      });
      break;
    case "entry-audience":
      onChange("#cfg-audience", (e) => {
        c.audienceName = e.target.value;
        renderConfig();
        refreshNodeCard(node.id);
      });
      break;
    case "entry-event":
      onChange("#cfg-event", (e) => {
        c.eventName = e.target.value;
        Object.assign(c, describeEventSource(c.eventName));
        renderConfig();
        refreshNodeCard(node.id);
      });
      break;
    case "consent-check":
      onChange("#cfg-consent-field", (e) => {
        c.field = e.target.value;
        refreshNodeCard(node.id);
      });
      onChange("#cfg-consent-value", (e) => {
        c.value = e.target.value;
        refreshNodeCard(node.id);
      });
      break;
    case "wait":
      onChange("#cfg-wait-mode", () => {
        c.mode = mount.querySelector("#cfg-wait-mode").value;
        renderConfig();
        refreshNodeCard(node.id);
      });
      onChange("#cfg-wait-amount", (e) => {
        c.amount = Number(e.target.value);
        refreshNodeCard(node.id);
      });
      onChange("#cfg-wait-unit", (e) => {
        c.unit = e.target.value;
        refreshNodeCard(node.id);
      });
      onChange("#cfg-wait-event", (e) => {
        c.event = e.target.value;
        refreshNodeCard(node.id);
      });
      onChange("#cfg-wait-timeout", (e) => {
        c.timeoutDays = Number(e.target.value);
        refreshNodeCard(node.id);
      });
      break;
    case "goal":
      onChange("#cfg-goal-type", (e) => {
        c.goalType = e.target.value;
        refreshNodeCard(node.id);
      });
      onChange("#cfg-goal-window", (e) => {
        c.measurementWindowDays = Number(e.target.value);
        refreshNodeCard(node.id);
      });
      break;
    case "exit":
      onChange("#cfg-exit-reason", (e) => {
        c.reason = e.target.value;
        refreshNodeCard(node.id);
      });
      break;
    case "entry-attribute":
    case "condition":
      wireTypedCondition(node);
      break;
    default:
      if (node.category === "communication") {
        onChange("#cfg-template", (e) => {
          c.template = e.target.value;
          refreshNodeCard(node.id);
        });
        onChange("#cfg-consent-req", (e) => {
          c.consentRequired = e.target.value;
          refreshNodeCard(node.id);
        });
      } else if (node.category === "audienceActivation") {
        onChange("#cfg-activation-audience", (e) => {
          c.audienceName = e.target.value;
          refreshNodeCard(node.id);
        });
        onChange("#cfg-activation-mode", (e) => {
          c.mode = e.target.value;
          refreshNodeCard(node.id);
        });
      } else if (node.category === "dataSystem") {
        onChange("#cfg-webhook-endpoint", (e) => {
          c.endpoint = e.target.value;
          refreshNodeCard(node.id);
        });
        onChange("#cfg-http-method", (e) => {
          c.method = e.target.value;
          refreshNodeCard(node.id);
        });
        onChange("#cfg-http-endpoint", (e) => {
          c.endpoint = e.target.value;
          refreshNodeCard(node.id);
        });
        onChange("#cfg-http-payload", (e) => {
          c.payloadType = e.target.value;
          refreshNodeCard(node.id);
        });
        onChange("#cfg-http-delivery", (e) => {
          c.delivery = e.target.value;
          refreshNodeCard(node.id);
        });
        onChange("#cfg-ds-event", (e) => {
          c.eventName = e.target.value;
          refreshNodeCard(node.id);
        });
        onChange("#cfg-ds-field", (e) => {
          c.field = e.target.value;
          refreshNodeCard(node.id);
        });
        onChange("#cfg-ds-value", (e) => {
          c.value = e.target.value;
          refreshNodeCard(node.id);
        });
        onChange("#cfg-ds-audience", (e) => {
          c.audienceName = e.target.value;
          refreshNodeCard(node.id);
        });
      }
  }
}

function wireTypedCondition(node) {
  const mount = document.querySelector("[data-journey-config]");
  const prefix = node.type === "entry-attribute" ? "cfg-attr" : "cfg-cond";
  const c = node.config;

  mount.querySelector(`#${prefix}-field`)?.addEventListener("change", (e) => {
    c.field = e.target.value;
    const meta = FIELD_META[c.field];
    c.operator = (OPERATORS_BY_TYPE[meta.type] || [])[0];
    c.params = {};
    if (!c.label && node.type === "condition") c.label = `${c.field} ${c.operator}?`;
    renderConfig();
    refreshNodeCard(node.id);
  });
  mount.querySelector(`#${prefix}-operator`)?.addEventListener("change", (e) => {
    c.operator = e.target.value;
    c.params = {};
    renderConfig();
    refreshNodeCard(node.id);
  });
  mount.querySelectorAll("[data-part]").forEach((el) => {
    el.addEventListener("change", (e) => {
      c.params = c.params || {};
      c.params[e.target.dataset.part] = e.target.value;
      refreshNodeCard(node.id);
    });
  });
  mount.querySelector(`#${prefix}-label`)?.addEventListener("input", (e) => {
    c.label = e.target.value;
    refreshNodeCard(node.id);
  });
}

/* ---- Compact workspace header (name/status) + save/back/test ---- */
function renderHeader() {
  const nameInput = document.querySelector("[data-builder-name]");
  nameInput.value = journey.name === "Untitled Journey" ? "" : journey.name;
  nameInput.addEventListener("input", (e) => {
    journey.name = e.target.value || "Untitled Journey";
  });

  const statusSelect = document.querySelector("[data-builder-status]");
  statusSelect.innerHTML = JOURNEY_STATUSES.map((s) => `<option value="${s}"${s === journey.status ? " selected" : ""}>${s}</option>`).join("");
  statusSelect.addEventListener("change", (e) => (journey.status = e.target.value));
}

function persistAndExit() {
  journey.updatedAt = mockToday();
  const entryNode = getEntryNode(journey);
  if (entryNode) {
    journey.entry = entryNode;
    journey.audienceLabel = entryNode.type === "entry-event" ? "Event-based" : AUDIENCES.find((a) => a.name === entryNode.config.audienceName)?.memberCount.toLocaleString() || journey.audienceLabel;
  }
  journey.goal = journey.nodes.find((n) => n.type === "goal")?.config.goalType || "—";
  saveJourneyOverride(journey);
  snapshotJSON = JSON.stringify(journey);
  window.location.href = `all-journeys.html?open=${encodeURIComponent(journey.id)}`;
}

function goBackToJourneys() {
  if (isDirty()) {
    document.getElementById("journey-unsaved-modal")?.classList.add("is-open");
    document.body.style.overflow = "hidden";
  } else {
    window.location.href = "all-journeys.html";
  }
}

function initSaveCancel() {
  document.querySelector("[data-save-journey]").addEventListener("click", persistAndExit);
  document.querySelector("[data-builder-cancel]").addEventListener("click", goBackToJourneys);

  const unsavedModal = document.getElementById("journey-unsaved-modal");
  unsavedModal?.querySelector("[data-keep-editing]")?.addEventListener("click", () => {
    unsavedModal.classList.remove("is-open");
    document.body.style.overflow = "";
  });
  unsavedModal?.querySelector("[data-discard-changes]")?.addEventListener("click", () => {
    window.location.href = "all-journeys.html";
  });
}

/* ---- Test Journey — reuses the exact simulation shown on the All   */
/*      Journeys detail page, now also reachable from the workspace.  */
function initTestJourney() {
  const modal = document.getElementById("journey-test-modal");
  if (!modal) return;
  const customerSelect = modal.querySelector("[data-test-customer]");
  customerSelect.innerHTML = TEST_CUSTOMERS.map((c) => `<option value="${c.id}">${c.name} — ${c.crmId}</option>`).join("");

  document.querySelector("[data-open-test]")?.addEventListener("click", () => {
    modal.querySelector("[data-test-results]").hidden = true;
    modal.classList.add("is-open");
    document.body.style.overflow = "hidden";
  });

  modal.querySelector("[data-test-run]").addEventListener("click", () => {
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
}

export function initJourneyBuilder() {
  const editId = new URLSearchParams(location.search).get("edit");
  const journeys = loadJourneys();

  if (editId) {
    const existing = journeys.find((j) => j.id === editId);
    journey = JSON.parse(JSON.stringify(existing));
    const maxSeq = journey.nodes.reduce((max, n) => {
      const m = /-(?:n|x)(\d+)$/.exec(n.id);
      return m ? Math.max(max, Number(m[1])) : max;
    }, 0);
    seqRef.n = maxSeq;
  } else {
    journey = blankJourney(seqRef);
  }

  selectedNodeId = null;
  snapshotJSON = JSON.stringify(journey);

  renderHeader();
  renderPalette();
  initFlowEditor();
  loadJourneyIntoCanvas();
  initCanvasDropZone();
  initCanvasControls();
  renderConfig();
  initSaveCancel();
  initTestJourney();
  initMobileToggles();
}
