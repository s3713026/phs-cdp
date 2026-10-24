import {
  FLOWS,
  DIRECTIONS,
  DATA_TYPES,
  DATA_TYPE_META,
  DELIVERY_MODES,
  DELIVERY_MODE_META,
  STATUSES,
  STATUS_META,
  SYSTEM_TYPES,
  SYSTEM_ICONS,
  SYSTEM_TYPE_BY_NAME,
  ADD_FLOW_SYSTEMS,
  getFlowById,
} from "../data/dataflows.js";
import { SOURCES, SOURCE_ICONS } from "../data/sources.js";
import { DESTINATIONS, DESTINATION_ICONS, STATUS_META as CONN_STATUS_META } from "../data/destinations.js";
import {
  connectedDestinationsForSource,
  connectedSourcesForDestination,
  linksForSource,
  linksForDestination,
  linkStatus,
  setLiveData,
} from "../data/connection-map.js";

// Local, mutable copy — Save Data Flow appends to this, not to the
// imported const, so the data file stays the source of truth for the
// *initial* mock set.
let flows = [...FLOWS];

// Live sources/destinations loaded from BFF (RudderStack workspaceConfig).
// Falls back to mock data when BFF is unreachable.
let cmSources = [...SOURCES];
let cmDestinations = [...DESTINATIONS];

/**
 * Load real Sources and Destinations from the BFF, which reads them from
 * RudderStack's workspaceConfig.json.  The returned items are normalised
 * into the same shape the Connection Map expects so the rest of the page
 * can stay unchanged.
 */
async function loadFromBFF() {
  if (typeof PHSAPI === "undefined") return;
  try {
    const [srcRes, dstRes] = await Promise.all([
      PHSAPI.sources.list(),
      PHSAPI.destinations.list(),
    ]);

    const rawSources = srcRes?.data ?? srcRes ?? [];
    const rawDests   = dstRes?.data ?? dstRes ?? [];

    if (Array.isArray(rawSources) && rawSources.length > 0) {
      const now = new Date().toISOString().slice(0, 10);
      cmSources = rawSources.map((s) => {
        // Merge with matching mock entry (if any) so we keep display icons, etc.
        const mock = SOURCES.find((m) => m.id === s.id) || {};
        return {
          // Safe defaults first
          sourceType: "Connector",
          category: "Event",
          dataStream: "All",
          lastReceived: "—",
          lastEdit: now,
          createdAt: now,
          owner: "System",
          usersBase7d: 0,
          dataFlowId: null,
          configuration: [],
          activity: [],
          connection: {},
          ...mock,
          // BFF authoritative fields last
          id: s.id,
          name: s.name,
          type: mock.type || s.type || s.typeId || "Unknown",
          provider: mock.provider || s.type || s.typeId || "UNKNOWN",
          status: s.enabled ? "Connected" : "Disconnected",
          enabled: s.enabled,
          writeKey: s.writeKey,
          destinations: s.destinations ?? mock.destinations ?? 0,
        };
      });
    }

    if (Array.isArray(rawDests) && rawDests.length > 0) {
      const now = new Date().toISOString().slice(0, 10);
      cmDestinations = rawDests.map((d) => {
        const mock = DESTINATIONS.find((m) => m.id === d.id) || {};
        return {
          // Safe defaults
          category: "Storage",
          destinationType: "Warehouse",
          purpose: "Data Integration",
          dataStream: "All",
          dataSelection: { schema: "all", tables: "all", events: "all" },
          connection: {},
          deliveryConfig: { mode: "Stream", retries: 3, timeout: 30 },
          consentConfig: { required: false, purposes: [] },
          advancedConfig: {},
          configuration: [],
          audiences: [],
          journeys: [],
          dataFlowId: null,
          lastSync: "—",
          lastEdit: now,
          createdAt: now,
          owner: "System",
          usersBase7d: 0,
          error: null,
          activity: [{ time: now, text: "Loaded from RudderStack config" }],
          ...mock,
          // BFF authoritative
          id: d.id,
          name: d.name,
          provider: mock.provider || d.typeId || d.type || "UNKNOWN",
          type: mock.type || d.type || d.typeId || "Unknown",
          typeId: d.typeId || d.type,
          status: d.enabled ? "Connected" : "Disconnected",
          enabled: d.enabled,
          config: d.config || mock.config || {},
        };
      });
    }

    // Build live Source→Destination links from workspaceConfig (sources[].destinations[])
    // BFF exposes these as destinationIds inside each source object.
    const bffLinks = [];
    rawSources.forEach((s) => {
      const destIds = Array.isArray(s.destinations) ? s.destinations : [];
      destIds.forEach((destId) => {
        if (typeof destId === "string") {
          bffLinks.push({ sourceId: s.id, destinationId: destId, dataType: "Event" });
        } else if (destId && typeof destId === "object" && destId.id) {
          bffLinks.push({ sourceId: s.id, destinationId: destId.id, dataType: destId.dataType || "Event" });
        }
      });
    });

    // Push live data to connection-map so linkStatus/connectedXxx use real state
    setLiveData(cmSources, cmDestinations, bffLinks.length > 0 ? bffLinks : null);

    console.log(
      `[DataFlows] BFF loaded: ${cmSources.length} sources, ${cmDestinations.length} destinations, ${bffLinks.length} links`
    );
  } catch (err) {
    console.warn("[DataFlows] BFF unavailable — using mock data:", err.message);
  }
}

const filterState = { query: "", direction: "all", dataType: "all", delivery: "all", status: "all", systemType: "all" };

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

function passesFilters(f) {
  const q = normalize(filterState.query);
  const matchesSearch = !q || normalize(f.name).includes(q) || normalize(f.systemType).includes(q);
  const matchesDirection = filterState.direction === "all" || f.direction === filterState.direction;
  const matchesDataType = filterState.dataType === "all" || f.dataTypes.includes(filterState.dataType);
  const matchesDelivery = filterState.delivery === "all" || f.deliveryMode === filterState.delivery;
  const matchesStatus = filterState.status === "all" || f.status === filterState.status;
  const matchesSystemType = filterState.systemType === "all" || f.systemType === filterState.systemType;
  return matchesSearch && matchesDirection && matchesDataType && matchesDelivery && matchesStatus && matchesSystemType;
}

/* ---------------------------------------------------------------- */
/* Summary                                                            */
/* ---------------------------------------------------------------- */
function renderSummary() {
  const mount = document.querySelector("[data-flow-summary]");
  if (!mount) return;
  const total = flows.length;
  const inbound = flows.filter((f) => f.direction === "Inbound").length;
  const outbound = flows.filter((f) => f.direction === "Outbound").length;
  const connected = flows.filter((f) => f.status === "Connected" || f.status === "Ready").length;
  mount.innerHTML = `
    <div class="metric-row">
      <div class="metric"><span class="metric__label">Total Flows</span><div class="metric__value-row"><span class="metric__value" style="font-size: var(--text-xl);">${total}</span></div></div>
      <div class="metric metric--primary"><span class="metric__label">Inbound Sources</span><div class="metric__value-row"><span class="metric__value" style="font-size: var(--text-xl);">${inbound}</span></div></div>
      <div class="metric metric--primary"><span class="metric__label">Outbound Destinations</span><div class="metric__value-row"><span class="metric__value" style="font-size: var(--text-xl);">${outbound}</span></div></div>
      <div class="metric metric--success"><span class="metric__label">Active / Ready</span><div class="metric__value-row"><span class="metric__value" style="font-size: var(--text-xl);">${connected}</span></div></div>
    </div>`;
}

/* ------------------------------------------------------------------ */
/* Connection map — interactive Source <-> Destination visualization.  */
/* Separate data model from FLOWS above: this reads the real SOURCES/  */
/* DESTINATIONS records (the same ones Sources/Destinations pages      */
/* manage) plus the explicit SOURCE_DESTINATION_LINKS relationship set */
/* (js/data/connection-map.js) — never inferred from matching names or */
/* data types. Nodes are rendered as ordinary DOM (reusing the existing*/
/* .flow-node styling); only the connector lines are SVG, positioned   */
/* by measuring real rendered node rects — no drag/graph-editor layer. */
/* ------------------------------------------------------------------ */
const DATASTREAM_ICON = {
  Event: "zap",
  Profile: "user-round",
  Audience: "users-round",
  Consent: "shield-check",
  Message: "message-square",
};

const cmFilterState = { query: "", type: "all", status: "all" };
let cmHover = null; // { kind: 'source'|'destination', id }
let cmResizeObserver = null;

function cmStatusDotClass(status) {
  return (CONN_STATUS_META[status] || {}).dot || "";
}

function cmPathStatusClass(status) {
  // "Active"/"Pending"/"Paused"/"Error" -> cm-path--active etc.
  return `cm-path--${status.toLowerCase()}`;
}

function cmNodeHTML(kind, record) {
  const isSource = kind === "source";
  const icon = (isSource ? SOURCE_ICONS[record.provider] : DESTINATION_ICONS[record.provider]) || "share-2";
  const typeLabel = isSource ? record.sourceType : record.category;
  const dsIcon = DATASTREAM_ICON[record.dataStream] || "circle-dot";
  const attr = isSource ? `data-cm-source="${record.id}"` : `data-cm-dest="${record.id}"`;
  return `
    <div class="flow-node" ${attr} tabindex="0" role="button" aria-label="${record.provider} — ${record.status}">
      <div class="flow-node__head">
        <span class="flow-node__icon"><i data-lucide="${icon}"></i></span>
        <div class="flow-node__name-wrap">
          <div class="flow-node__name">${record.provider}</div>
          <div class="flow-node__type">${typeLabel}</div>
        </div>
      </div>
      <div class="flow-node__badges"><span class="badge badge--neutral badge--flow-type"><i data-lucide="${dsIcon}"></i>${record.dataStream}</span></div>
      <div class="flow-node__foot"><span class="status-dot ${cmStatusDotClass(record.status)}">${record.status}</span></div>
    </div>`;
}

function cmPassesCommon(record, isSource) {
  const q = normalize(cmFilterState.query);
  const matchesQuery = !q || normalize(record.provider).includes(q) || normalize(record.name).includes(q);
  const matchesType = cmFilterState.type === "all" || record.category === cmFilterState.type;
  if (!matchesQuery || !matchesType) return false;
  if (cmFilterState.status === "all") return true;
  const links = isSource ? linksForSource(record.id) : linksForDestination(record.id);
  return links.some((l) => linkStatus(l) === cmFilterState.status);
}

function cmVisibleSources() {
  return cmSources.filter((s) => cmPassesCommon(s, true));
}
function cmVisibleDestinations() {
  return cmDestinations.filter((d) => cmPassesCommon(d, false));
}

function renderConnectionMap() {
  const sourcesCol = document.querySelector("[data-cm-sources-col]");
  const destCol = document.querySelector("[data-cm-dest-col]");
  const emptyEl = document.querySelector("[data-cm-empty]");
  const mapEl = document.querySelector("[data-cm-map]");
  if (!sourcesCol || !destCol || !mapEl) return;

  const visSources = cmVisibleSources();
  const visDest = cmVisibleDestinations();

  mapEl.hidden = visSources.length === 0 && visDest.length === 0;
  if (emptyEl) emptyEl.hidden = !mapEl.hidden;

  sourcesCol.innerHTML = visSources.length
    ? visSources.map((s) => cmNodeHTML("source", s)).join("")
    : `<p class="table__empty" style="padding: var(--space-4) 0;">No sources match.</p>`;
  destCol.innerHTML = visDest.length
    ? visDest.map((d) => cmNodeHTML("destination", d)).join("")
    : `<p class="table__empty" style="padding: var(--space-4) 0;">No destinations match.</p>`;

  refreshIcons();
  cmWireNodes();
  requestAnimationFrame(cmDrawPaths);
}

function cmWireNodes() {
  document.querySelectorAll("[data-cm-source]").forEach((el) => {
    const id = el.dataset.cmSource;
    el.addEventListener("mouseenter", () => cmSetHover("source", id));
    el.addEventListener("focus", () => cmSetHover("source", id));
    el.addEventListener("mouseleave", cmClearHover);
    el.addEventListener("blur", cmClearHover);
    el.addEventListener("click", () => cmOpenDetail("source", id));
    el.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        cmOpenDetail("source", id);
      }
    });
  });
  document.querySelectorAll("[data-cm-dest]").forEach((el) => {
    const id = el.dataset.cmDest;
    el.addEventListener("mouseenter", () => cmSetHover("destination", id));
    el.addEventListener("focus", () => cmSetHover("destination", id));
    el.addEventListener("mouseleave", cmClearHover);
    el.addEventListener("blur", cmClearHover);
    el.addEventListener("click", () => cmOpenDetail("destination", id));
    el.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        cmOpenDetail("destination", id);
      }
    });
  });
}

/* Path status for a Source->CDP or CDP->Destination segment is driven
 * by that ONE endpoint's own connector status — a segment represents
 * "is this source/destination itself healthy", not a specific pair,
 * since one source/destination can anchor several relationships. Same
 * status vocabulary as linkStatus() in connection-map.js so
 * cmPathStatusClass() below still applies unchanged. */
function cmConnectorPathStatus(record) {
  if (record.status === "Error") return "Error";
  if (record.status === "Paused") return "Paused";
  if (record.status === "Connected") return "Active";
  return "Pending";
}

/* ---- Path geometry — measured from real rendered node rects -------- */
/* Every path is Source -> PHS CDP OR PHS CDP -> Destination; nothing
 * is drawn directly Source-to-Destination, so a hovered node's own
 * segment and its counterparts' segments can be highlighted
 * independently, and the CDP node reads as the actual processing hub
 * instead of a shape the lines pass behind. One segment per connected
 * Source/Destination (not per relationship pair) keeps a source or
 * destination with several counterparts from drawing overlapping
 * duplicate lines into the same edge. */
function cmDrawPaths() {
  const svg = document.querySelector("[data-cm-paths]");
  const mapEl = document.querySelector("[data-cm-map]");
  const cdpEl = document.querySelector("[data-cm-cdp]");
  if (!svg || !mapEl || !cdpEl) return;
  const mapRect = mapEl.getBoundingClientRect();
  svg.setAttribute("width", mapRect.width);
  svg.setAttribute("height", mapRect.height);
  svg.setAttribute("viewBox", `0 0 ${mapRect.width} ${mapRect.height}`);

  const visSourceIds = new Set(Array.from(document.querySelectorAll("[data-cm-source]")).map((el) => el.dataset.cmSource));
  const visDestIds = new Set(Array.from(document.querySelectorAll("[data-cm-dest]")).map((el) => el.dataset.cmDest));

  const cdpRect = cdpEl.getBoundingClientRect();
  const cdpLeftX = cdpRect.left - mapRect.left;
  const cdpRightX = cdpRect.right - mapRect.left;
  // Anchor Y is clamped to the CDP box's own vertical range (inset a
  // touch so curves don't run into its rounded corners) — every
  // source/destination gets an anchor at its own height where
  // possible, which is what naturally spreads multiple anchor points
  // along the left/right edges instead of bundling them at one spot.
  const inset = 14;
  const anchorMinY = cdpRect.top - mapRect.top + inset;
  const anchorMaxY = cdpRect.bottom - mapRect.top - inset;
  function cdpAnchorY(y) {
    if (anchorMaxY <= anchorMinY) return (anchorMinY + anchorMaxY) / 2;
    return Math.min(anchorMaxY, Math.max(anchorMinY, y));
  }

  const segments = [];

  SOURCES.forEach((s) => {
    if (!visSourceIds.has(s.id)) return;
    const hasVisibleDestination = connectedDestinationsForSource(s.id).some((x) => visDestIds.has(x.destination.id));
    if (!hasVisibleDestination) return;
    const sEl = document.querySelector(`[data-cm-source="${s.id}"]`);
    if (!sEl) return;
    const sRect = sEl.getBoundingClientRect();
    const x1 = sRect.right - mapRect.left;
    const y1 = sRect.top + sRect.height / 2 - mapRect.top;
    const x2 = cdpLeftX;
    const y2 = cdpAnchorY(y1);
    const cx1 = x1 + (x2 - x1) * 0.5;
    const cx2 = x2 - (x2 - x1) * 0.5;
    segments.push({
      id: `in:${s.id}`,
      status: cmConnectorPathStatus(s),
      d: `M${x1},${y1} C${cx1},${y1} ${cx2},${y2} ${x2},${y2}`,
    });
  });

  DESTINATIONS.forEach((d) => {
    if (!visDestIds.has(d.id)) return;
    const hasVisibleSource = connectedSourcesForDestination(d.id).some((x) => visSourceIds.has(x.source.id));
    if (!hasVisibleSource) return;
    const dEl = document.querySelector(`[data-cm-dest="${d.id}"]`);
    if (!dEl) return;
    const dRect = dEl.getBoundingClientRect();
    const x2 = dRect.left - mapRect.left;
    const y2 = dRect.top + dRect.height / 2 - mapRect.top;
    const x1 = cdpRightX;
    const y1 = cdpAnchorY(y2);
    const cx1 = x1 + (x2 - x1) * 0.5;
    const cx2 = x2 - (x2 - x1) * 0.5;
    segments.push({
      id: `out:${d.id}`,
      status: cmConnectorPathStatus(d),
      d: `M${x1},${y1} C${cx1},${y1} ${cx2},${y2} ${x2},${y2}`,
    });
  });

  svg.innerHTML = segments
    .map((p) => `<path class="cm-path ${cmPathStatusClass(p.status)}" data-cm-path="${p.id}" d="${p.d}" fill="none"></path>`)
    .join("");
}

/* ---- Hover highlight ------------------------------------------------ */
function cmSetHover(kind, id) {
  cmHover = { kind, id };
  const connected =
    kind === "source"
      ? new Set(connectedDestinationsForSource(id).map((x) => x.destination.id))
      : new Set(connectedSourcesForDestination(id).map((x) => x.source.id));

  document.querySelectorAll("[data-cm-source]").forEach((el) => {
    const sid = el.dataset.cmSource;
    const active = (kind === "source" && sid === id) || (kind === "destination" && connected.has(sid));
    el.classList.toggle("is-cm-active", active);
    el.classList.toggle("is-cm-dimmed", !active);
  });
  document.querySelectorAll("[data-cm-dest]").forEach((el) => {
    const did = el.dataset.cmDest;
    const active = (kind === "destination" && did === id) || (kind === "source" && connected.has(did));
    el.classList.toggle("is-cm-active", active);
    el.classList.toggle("is-cm-dimmed", !active);
  });
  document.querySelectorAll("[data-cm-path]").forEach((el) => {
    // "in:<sourceId>" (Source -> CDP) or "out:<destinationId>" (CDP ->
    // Destination). Hovering a Source highlights its OWN inbound leg
    // plus the outbound leg of each of its connected Destinations (and
    // symmetrically for hovering a Destination) — never a direct
    // Source-to-Destination line, since none exist any more.
    const [segKind, segId] = el.dataset.cmPath.split(":");
    const relevant =
      kind === "source"
        ? (segKind === "in" && segId === id) || (segKind === "out" && connected.has(segId))
        : (segKind === "out" && segId === id) || (segKind === "in" && connected.has(segId));
    el.classList.toggle("is-cm-active", relevant);
    el.classList.toggle("is-cm-dimmed", !relevant);
  });

  cmShowTooltip(kind, id, connected.size);
}

function cmClearHover() {
  cmHover = null;
  document.querySelectorAll("[data-cm-source], [data-cm-dest], [data-cm-path]").forEach((el) => {
    el.classList.remove("is-cm-active", "is-cm-dimmed");
  });
  cmHideTooltip();
}

function cmShowTooltip(kind, id, count) {
  const tip = document.querySelector("[data-cm-tooltip]");
  const mapEl = document.querySelector("[data-cm-map]");
  if (!tip || !mapEl) return;
  const el = kind === "source" ? document.querySelector(`[data-cm-source="${id}"]`) : document.querySelector(`[data-cm-dest="${id}"]`);
  if (!el) return;
  const record = kind === "source" ? SOURCES.find((s) => s.id === id) : DESTINATIONS.find((d) => d.id === id);
  const counterpartLabel = kind === "source" ? "destination" : "source";
  const text = count
    ? `${record.provider} · ${count} connected ${counterpartLabel}${count === 1 ? "" : "s"}`
    : `${record.provider} · No configured ${counterpartLabel}s`;
  tip.textContent = text;

  const mapRect = mapEl.getBoundingClientRect();
  const elRect = el.getBoundingClientRect();
  tip.style.left = `${elRect.left - mapRect.left}px`;
  tip.style.top = `${elRect.top - mapRect.top - 8}px`;
  tip.hidden = false;
}
function cmHideTooltip() {
  const tip = document.querySelector("[data-cm-tooltip]");
  if (tip) tip.hidden = true;
}

/* ---- Click -> persistent selection detail drawer --------------------- */
function cmFieldRow(label, valueHTML) {
  return `<div class="cluster gap-2" style="justify-content:space-between; align-items:flex-start;"><span class="cell-muted">${label}</span><span style="text-align:right;">${valueHTML}</span></div>`;
}
function cmCounterpartRowHTML(name, status) {
  return `<div class="identity-row"><div class="identity-row__main"><span style="font-size: var(--text-sm); color: var(--text-primary);">${name}</span></div><div class="identity-row__meta"><span class="badge ${cmStatusBadgeForLinkStatus(status)}">${status}</span></div></div>`;
}
function cmStatusBadgeForLinkStatus(status) {
  return { Active: "badge--success", Pending: "badge--neutral", Paused: "badge--warning", Error: "badge--danger" }[status] || "badge--neutral";
}

function cmOpenDetail(kind, id) {
  const overlay = document.getElementById("cm-detail-drawer");
  if (!overlay) return;
  const record = kind === "source" ? SOURCES.find((s) => s.id === id) : DESTINATIONS.find((d) => d.id === id);
  if (!record) return;

  const eyebrow = overlay.querySelector("[data-drawer-eyebrow]");
  const title = overlay.querySelector("[data-drawer-title]");
  const body = overlay.querySelector("[data-drawer-body]");
  const link = overlay.querySelector("[data-cm-detail-link]");

  eyebrow.textContent = kind === "source" ? "Source" : "Destination";
  title.textContent = record.provider;
  link.href = kind === "source" ? `sources.html?open=${id}` : `destinations.html?open=${id}`;

  const counterparts = kind === "source" ? connectedDestinationsForSource(id) : connectedSourcesForDestination(id);
  const counterpartLabel = kind === "source" ? "Connected Destinations" : "Connected Sources";

  body.innerHTML = `
    <div class="stack gap-1" style="margin-bottom: var(--space-5);">
      ${cmFieldRow("Connection Account", record.name)}
      ${cmFieldRow("Category", kind === "source" ? record.sourceType : record.category)}
      ${cmFieldRow("Status", `<span class="status-dot ${cmStatusDotClass(record.status)}">${record.status}</span>`)}
      ${cmFieldRow("Data Stream", record.dataStream)}
    </div>
    <p class="subhead" style="margin-bottom: var(--space-2);">${counterpartLabel} (${counterparts.length})</p>
    ${
      counterparts.length
        ? `<div class="identity-list">${counterparts
            .map((c) => cmCounterpartRowHTML(kind === "source" ? c.destination.provider : c.source.provider, c.status))
            .join("")}</div>`
        : `<p class="table__empty" style="padding: var(--space-6) 0;">No configured ${kind === "source" ? "destinations" : "sources"}.</p>`
    }`;

  overlay.classList.add("is-open");
  document.body.style.overflow = "hidden";
  refreshIcons();
}

function initConnectionMapDrawer() {
  const overlay = document.getElementById("cm-detail-drawer");
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

/* ---- Search + filters (map-local, separate from the Flows table's) -- */
function initConnectionMapFilters() {
  const typeSelect = document.querySelector("[data-cm-filter-type]");
  const statusSelect = document.querySelector("[data-cm-filter-status]");
  const searchInput = document.querySelector("[data-cm-search]");

  if (typeSelect) {
    const types = Array.from(new Set([...SOURCES.map((s) => s.category), ...DESTINATIONS.map((d) => d.category)])).sort();
    typeSelect.innerHTML = `<option value="all">All types</option>` + types.map((t) => `<option value="${t}">${t}</option>`).join("");
    typeSelect.addEventListener("change", (e) => {
      cmFilterState.type = e.target.value;
      renderConnectionMap();
    });
  }
  if (statusSelect) {
    statusSelect.innerHTML =
      `<option value="all">All relationship statuses</option>` +
      ["Active", "Pending", "Paused", "Error"].map((s) => `<option value="${s}">${s}</option>`).join("");
    statusSelect.addEventListener("change", (e) => {
      cmFilterState.status = e.target.value;
      renderConnectionMap();
    });
  }
  if (searchInput) {
    searchInput.addEventListener("input", (e) => {
      cmFilterState.query = e.target.value;
      renderConnectionMap();
    });
  }
}

function initConnectionMapResize() {
  const mapEl = document.querySelector("[data-cm-map]");
  if (!mapEl || typeof ResizeObserver === "undefined") return;
  cmResizeObserver = new ResizeObserver(() => {
    cmHideTooltip();
    cmDrawPaths();
  });
  cmResizeObserver.observe(mapEl);
}

/* ---------------------------------------------------------------- */
/* Secondary table view                                               */
/* ---------------------------------------------------------------- */
function renderTable() {
  const tbody = document.querySelector("[data-flow-table] tbody");
  if (!tbody) return;
  const filtered = flows.filter(passesFilters);

  if (!filtered.length) {
    tbody.innerHTML = `<tr><td colspan="7" class="table__empty">No data flows match your search and filters.</td></tr>`;
    return;
  }

  tbody.innerHTML = filtered
    .map((f) => {
      const flowLabel = f.direction === "Inbound" ? `${f.name} → PHS CDP` : `PHS CDP → ${f.name}`;
      const deliveryMeta = DELIVERY_MODE_META[f.deliveryMode];
      const statusMeta = STATUS_META[f.status];
      return `
      <tr data-flow-row="${f.id}">
        <td class="cell-primary">${flowLabel}</td>
        <td><span class="badge badge--neutral">${f.direction.toUpperCase()}</span></td>
        <td>${f.dataTypes.map((dt) => `<span class="badge badge--neutral badge--flow-type"><i data-lucide="${DATA_TYPE_META[dt].icon}"></i>${DATA_TYPE_META[dt].label}</span>`).join(" ")}</td>
        <td><span class="badge badge--neutral badge--flow-delivery"><i data-lucide="${deliveryMeta.icon}"></i>${deliveryMeta.label}</span></td>
        <td><span class="status-dot ${statusMeta.dot}">${f.status}</span></td>
        <td class="cell-muted tabular-nums">${f.lastSync}</td>
        <td class="num tabular-nums">${f.recordCount.toLocaleString()}</td>
      </tr>`;
    })
    .join("");

  document.querySelectorAll("[data-flow-row]").forEach((row) => {
    row.style.cursor = "pointer";
    row.addEventListener("click", () => openFlowDrawer(row.dataset.flowRow));
  });
  refreshIcons();
}

function renderAll() {
  renderTable();
}

/* ---------------------------------------------------------------- */
/* Detail drawer                                                      */
/* ---------------------------------------------------------------- */
function fieldRow(label, valueHTML) {
  return `<div class="cluster gap-2" style="justify-content:space-between; align-items:flex-start;"><span class="cell-muted">${label}</span><span style="text-align:right;">${valueHTML}</span></div>`;
}

function openFlowDrawer(id) {
  const f = getFlowById(id);
  if (!f) return;
  const overlay = document.getElementById("df-detail-drawer");
  if (!overlay) return;

  const eyebrow = overlay.querySelector("[data-drawer-eyebrow]");
  const title = overlay.querySelector("[data-drawer-title]");
  const body = overlay.querySelector("[data-drawer-body]");
  const icon = SYSTEM_ICONS[f.systemName] || "circle";
  const statusMeta = STATUS_META[f.status];
  const deliveryMeta = DELIVERY_MODE_META[f.deliveryMode];
  const directionArrow = f.direction === "Inbound" ? `${f.name} → PHS CDP` : `PHS CDP → ${f.name}`;
  const layerLabel = f.direction === "Inbound" ? "Ingestion" : "Activation";
  const layerValue = f.direction === "Inbound" ? f.ingestionType : f.activationType;
  const endpointLabel = f.direction === "Inbound" ? "Source Endpoint" : "Destination Endpoint";

  eyebrow.innerHTML = `<i data-lucide="${f.direction === "Inbound" ? "arrow-down-to-line" : "arrow-up-from-line"}" style="width:12px;height:12px;"></i> ${f.direction.toUpperCase()} DATA FLOW`;
  title.innerHTML = `<span class="cluster gap-2"><span class="flow-node__icon"><i data-lucide="${icon}"></i></span>${f.name}</span>`;

  body.innerHTML = `
    <p style="font-size: var(--text-sm); color: var(--text-secondary); margin-bottom: var(--space-5);">${f.description}</p>
    <div class="stack gap-3" style="font-size: var(--text-sm); margin-bottom: var(--space-5);">
      ${fieldRow("Direction", `<span class="font-mono">${directionArrow}</span>`)}
      ${fieldRow("System Type", f.systemType)}
      ${fieldRow("Data Type", badgesHTMLTypesOnly(f))}
      ${fieldRow("Delivery Mode", `<span class="badge badge--neutral badge--flow-delivery"><i data-lucide="${deliveryMeta.icon}"></i>${deliveryMeta.label}</span>`)}
      ${fieldRow("Status", `<span class="status-dot ${statusMeta.dot}">${f.status}</span>`)}
      ${fieldRow("Last Sync", `<span class="tabular-nums">${f.lastSync}</span>`)}
      ${fieldRow("Records", `<span class="tabular-nums">${f.recordCount.toLocaleString()} ${f.recordLabel}</span>`)}
      ${fieldRow(layerLabel, layerValue)}
    </div>
    <p class="subhead" style="margin-bottom: var(--space-2);">Connection (prototype only)</p>
    <div class="dataflow-connection">
      <div class="dataflow-connection__row">
        <span class="dataflow-connection__label">${endpointLabel}</span>
        <span class="dataflow-connection__value">${f.endpoint}</span>
      </div>
      <div class="dataflow-connection__row">
        <span class="dataflow-connection__label">${f.credentialLabel}</span>
        <span class="dataflow-connection__value dataflow-connection__value--masked">••••••••••</span>
      </div>
    </div>
    <p style="font-size: var(--text-xs); color: var(--text-tertiary); margin-top: var(--space-4);">
      <i data-lucide="info" style="width:12px;height:12px; vertical-align: -2px;"></i>
      Prototype only — this connection is not linked to any live PHS system.
    </p>`;

  overlay.classList.add("is-open");
  document.body.style.overflow = "hidden";
  refreshIcons();
}

function badgesHTMLTypesOnly(f) {
  return f.dataTypes.map((dt) => `<span class="badge badge--neutral badge--flow-type"><i data-lucide="${DATA_TYPE_META[dt].icon}"></i>${DATA_TYPE_META[dt].label}</span>`).join(" ");
}

/* ---------------------------------------------------------------- */
/* Filters + search                                                   */
/* ---------------------------------------------------------------- */
function populateSelect(el, options, formatLabel = (v) => v) {
  el.innerHTML = `<option value="all">All</option>` + options.map((o) => `<option value="${o}">${formatLabel(o)}</option>`).join("");
}

function initFilters() {
  const searchInput = document.querySelector("[data-flow-search]");
  const directionSelect = document.querySelector("[data-filter-direction]");
  const dataTypeSelect = document.querySelector("[data-filter-datatype]");
  const deliverySelect = document.querySelector("[data-filter-delivery]");
  const statusSelect = document.querySelector("[data-filter-status]");
  const systemTypeSelect = document.querySelector("[data-filter-systemtype]");

  populateSelect(directionSelect, DIRECTIONS);
  populateSelect(dataTypeSelect, DATA_TYPES);
  populateSelect(deliverySelect, DELIVERY_MODES);
  populateSelect(statusSelect, STATUSES);
  populateSelect(systemTypeSelect, SYSTEM_TYPES);

  searchInput?.addEventListener("input", (e) => {
    filterState.query = e.target.value;
    renderAll();
  });
  directionSelect?.addEventListener("change", (e) => {
    filterState.direction = e.target.value;
    renderAll();
  });
  dataTypeSelect?.addEventListener("change", (e) => {
    filterState.dataType = e.target.value;
    renderAll();
  });
  deliverySelect?.addEventListener("change", (e) => {
    filterState.delivery = e.target.value;
    renderAll();
  });
  statusSelect?.addEventListener("change", (e) => {
    filterState.status = e.target.value;
    renderAll();
  });
  systemTypeSelect?.addEventListener("change", (e) => {
    filterState.systemType = e.target.value;
    renderAll();
  });
}

/* ---------------------------------------------------------------- */
/* Add Data Flow                                                      */
/* ---------------------------------------------------------------- */
function initAddFlowModal() {
  const modal = document.getElementById("df-add-modal");
  if (!modal) return;

  const directionSelect = modal.querySelector("[data-add-direction]");
  const systemSelect = modal.querySelector("[data-add-system]");
  const deliverySelect = modal.querySelector("[data-add-delivery]");
  const statusSelect = modal.querySelector("[data-add-status]");
  const dataTypeWrap = modal.querySelector("[data-add-datatypes]");
  const saveBtn = modal.querySelector("[data-add-save]");
  const errorEl = modal.querySelector("[data-add-error]");

  populateSelect(directionSelect, DIRECTIONS);
  directionSelect.removeChild(directionSelect.firstElementChild); // no "All" option in a create form
  populateSelect(systemSelect, ADD_FLOW_SYSTEMS);
  systemSelect.removeChild(systemSelect.firstElementChild);
  populateSelect(deliverySelect, DELIVERY_MODES);
  deliverySelect.removeChild(deliverySelect.firstElementChild);
  populateSelect(statusSelect, ["Connected", "Ready", "Paused"]);
  statusSelect.removeChild(statusSelect.firstElementChild);

  dataTypeWrap.innerHTML = DATA_TYPES.map(
    (dt) => `
    <label class="cluster gap-2" style="font-size: var(--text-sm); font-weight: var(--weight-regular);">
      <input type="checkbox" value="${dt}" data-add-datatype />
      <span class="badge badge--neutral badge--flow-type"><i data-lucide="${DATA_TYPE_META[dt].icon}"></i>${DATA_TYPE_META[dt].label}</span>
    </label>`
  ).join("");
  refreshIcons();

  saveBtn.addEventListener("click", () => {
    const direction = directionSelect.value;
    const systemName = systemSelect.value;
    const deliveryMode = deliverySelect.value;
    const status = statusSelect.value;
    const dataTypes = Array.from(dataTypeWrap.querySelectorAll("[data-add-datatype]:checked")).map((c) => c.value);

    if (!dataTypes.length) {
      errorEl.hidden = false;
      errorEl.textContent = "Select at least one data type.";
      return;
    }
    errorEl.hidden = true;

    const systemType = SYSTEM_TYPE_BY_NAME[systemName] || "Integration";
    const newFlow = {
      id: `flow-${direction.toLowerCase()}-${systemName.toLowerCase().replace(/\s+/g, "-")}-${Date.now()}`,
      name: systemName,
      direction,
      systemType,
      systemName,
      dataTypes,
      deliveryMode,
      status,
      lastSync: "Just now",
      recordCount: 0,
      recordLabel: deliveryMode === "Stream" ? "events" : "records",
      ingestionType: direction === "Inbound" ? "API Ingestion" : undefined,
      activationType: direction === "Outbound" ? "Audience Activation" : undefined,
      description: `${direction === "Inbound" ? "Inbound" : "Outbound"} flow connecting ${systemName} to the PHS CDP. Configured via the prototype Add Data Flow form.`,
      endpoint: `https://${systemName.toLowerCase().replace(/\s+/g, "-")}.example.com/api/v1`,
      credentialLabel: "API Key",
    };

    flows = [...flows, newFlow];
    renderSummary();
    renderAll();

    // reset form for next use, then close the modal
    dataTypeWrap.querySelectorAll("[data-add-datatype]").forEach((c) => (c.checked = false));
    modal.classList.remove("is-open");
    document.body.style.overflow = "";
  });
}

/* ---------------------------------------------------------------- */
/* Init                                                                */
/* ---------------------------------------------------------------- */
export async function initDataFlows() {
  // Render immediately with mock data so the page isn't blank while BFF loads
  renderSummary();
  initFilters();
  initAddFlowModal();
  renderAll();

  initConnectionMapFilters();
  initConnectionMapDrawer();
  renderConnectionMap();
  initConnectionMapResize();

  // Then load real Sources/Destinations from BFF and refresh the Connection Map
  await loadFromBFF();
  renderConnectionMap();
}
