/*
  Live Events (Monitor) — an operational inspection view of events as
  they arrive, filtered by date range / category / source / event /
  status. Reads from the same canonical Event Catalog + explorer
  activity log as Event Definitions (js/data/events.js) — never a
  second log. Formerly "Event Explorer" under Events; moved under the
  new Monitor section.
*/
import {
  EVENT_CATALOG,
  EVENT_CATEGORIES,
  EVENT_CATEGORY_META,
  EVENT_SOURCES,
  EXPLORER_STATUSES,
  DATE_RANGE_PRESETS,
  getExplorerEvents,
  summarizeExplorerEvents,
  formatExplorerTimestamp,
  formatExplorerEventTime,
  formatExplorerReceivedTime,
  getEventByName,
} from "../data/events.js";

const filterState = { preset: "Last 7 days", category: "all", source: "all", eventName: "all", status: "all", query: "" };

// ── BFF live event stream ─────────────────────────────────────────────────
// Subscribes to the BFF SSE endpoint when PHSAPI is available.
// Falls back gracefully to the polling mock data already on this page.
let _bffEventSource = null;
let _liveBuffer = []; // accumulates events from SSE; flushed on next renderAll()

function startBFFStream() {
  if (typeof PHSAPI === 'undefined' || _bffEventSource) return;
  try {
    _bffEventSource = PHSAPI.events.subscribe();
    _bffEventSource.addEventListener('event', (e) => {
      try {
        const evt = JSON.parse(e.data);
        // Avoid duplicates: check by id
        if (!_liveBuffer.find(x => String(x.id) === String(evt.id))) {
          _liveBuffer.unshift(evt); // newest first
          if (_liveBuffer.length > 200) _liveBuffer.length = 200;
          renderAll(); // re-render table with latest data
        }
      } catch (_) {}
    });
    _bffEventSource.onerror = () => {
      console.warn('[LiveEvents] SSE connection lost, retrying...');
    };
    console.log('[LiveEvents] BFF SSE stream connected');
  } catch (e) {
    console.warn('[LiveEvents] BFF SSE unavailable:', e.message);
  }
}

function stopBFFStream() {
  if (_bffEventSource) {
    _bffEventSource.close();
    _bffEventSource = null;
    _liveBuffer = [];
  }
}

function refreshIcons() {
  if (window.lucide) window.lucide.createIcons();
}
function fmt(n) {
  return n.toLocaleString();
}
function categoryBadge(category) {
  return `<span class="badge badge--neutral badge--dest-tag"><i data-lucide="${EVENT_CATEGORY_META[category]?.icon || "circle"}"></i>${category}</span>`;
}
function statusBadge(status) {
  const map = { Received: "badge--success", Processed: "badge--primary", Rejected: "badge--neutral", Warning: "badge--warning" };
  return `<span class="badge ${map[status] || "badge--neutral"}">${status}</span>`;
}

/**
 * Format a Date object → "21 Oct 2026 · 23:11:05"
 * Used for BFF events so we never touch formatExplorerTimestamp() with foreign objects.
 */
function formatBFFTimestamp(ts) {
  if (!(ts instanceof Date) || isNaN(ts)) return '—';
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const d   = ts.getDate();
  const mon = months[ts.getMonth()];
  const y   = ts.getFullYear();
  const hh  = String(ts.getHours()).padStart(2, '0');
  const mm  = String(ts.getMinutes()).padStart(2, '0');
  const ss  = String(ts.getSeconds()).padStart(2, '0');
  return `${d} ${mon} ${y} · ${hh}:${mm}:${ss}`;
}

function renderSummary(entries) {
  const summary = summarizeExplorerEvents(entries);
  document.querySelector("[data-summary-events]").textContent = fmt(summary.events);
  document.querySelector("[data-summary-customers]").textContent = fmt(summary.uniqueCustomers);
  document.querySelector("[data-summary-definitions]").textContent = EVENT_CATALOG.filter((e) => e.status === "Active").length;
  document.querySelector("[data-summary-sources]").textContent = EVENT_SOURCES.length;
}

function renderTable(entries) {
  const tbody = document.querySelector("[data-explorer-table] tbody");
  if (!entries.length) {
    tbody.innerHTML = `<tr><td colspan="7" class="table__empty">No events match your search and filters.</td></tr>`;
    return;
  }
  tbody.innerHTML = entries
    .slice(0, 200)
    .map(
      (e) => `
    <tr data-explorer-row="${e.id}">
      <td class="cell-muted tabular-nums">${e._isBFF ? e._formattedTs : formatExplorerTimestamp(e)}</td>
      <td class="cell-primary">${e.eventName}</td>
      <td>${categoryBadge(e.category)}</td>
      <td class="cell-muted">${e.source}</td>
      <td class="cell-muted font-mono">${e.customerMasked}</td>
      <td class="cell-muted">${e.properties}</td>
      <td>${statusBadge(e.status)}</td>
    </tr>`
    )
    .join("");
  tbody.querySelectorAll("[data-explorer-row]").forEach((row) => {
    row.style.cursor = "pointer";
    row.addEventListener("click", () => openDrawer(row.dataset.explorerRow, entries));
  });
  refreshIcons();
}

/**
 * Map a BFF event (from RudderStack PostgreSQL) to the explorer entry format.
 * Stores _formattedTs so renderTable() never passes a BFF object to
 * formatExplorerTimestamp() (which expects mock format and returns NaN).
 */
function mapBFFEvent(evt) {
  const sourceLabel = {
    'phs-web-source':    'Web App',
    'phs-mobile-source': 'Mobile App',
    'phs-server-source': 'Server Side',
  }[evt.sourceId] || evt.sourceId || 'Unknown';

  const ts = evt.receivedAt ? new Date(evt.receivedAt) : new Date();
  const customerId = evt.customerId || '';
  const masked = customerId.length > 6
    ? customerId.slice(0, 3) + '***' + customerId.slice(-3)
    : customerId || 'anonymous';

  const props = evt.properties && Object.keys(evt.properties).length
    ? Object.entries(evt.properties).map(([k, v]) => `${k}: ${v}`).join(', ')
    : '—';

  return {
    id:             String(evt.id),
    eventName:      evt.name || 'Unknown',
    category:       evt.category || 'Behavior',
    source:         sourceLabel,
    customerMasked: masked,
    properties:     props,
    status:         'Received',
    _ts:            ts,
    _formattedTs:   formatBFFTimestamp(ts),   // ← pre-formatted, safe for renderTable
    _isBFF:         true,
  };
}

function filterBFFEvents(bffEntries) {
  return bffEntries.filter(e => {
    if (filterState.source !== 'all' && e.source !== filterState.source) return false;
    if (filterState.eventName !== 'all' && e.eventName !== filterState.eventName) return false;
    if (filterState.status !== 'all' && e.status !== filterState.status) return false;
    if (filterState.query) {
      const q = filterState.query.toLowerCase();
      if (!e.eventName.toLowerCase().includes(q) && !e.customerMasked.toLowerCase().includes(q)) return false;
    }
    return true;
  });
}

function renderAll() {
  // If BFF has delivered events, use them; otherwise fall back to mock
  if (_liveBuffer.length > 0) {
    const bffEntries = _liveBuffer.map(mapBFFEvent);
    const filtered = filterBFFEvents(bffEntries);
    renderSummary(filtered.length > 0 ? filtered : bffEntries);
    renderTable(filtered);
    return;
  }

  // Fallback: mock data
  const entries = getExplorerEvents({
    dateFilter: { preset: filterState.preset },
    category: filterState.category,
    source: filterState.source,
    eventName: filterState.eventName,
    status: filterState.status,
    query: filterState.query,
  });
  renderSummary(entries);
  renderTable(entries);
}

function openDrawer(entryId, entries) {
  const entry = entries.find((e) => e.id === entryId);
  if (!entry) return;
  const def = getEventByName(entry.eventName);
  const drawer = document.getElementById("event-detail-drawer");
  document.querySelector("[data-drawer-title]").textContent = entry.eventName;

  const tsDisplay = entry._isBFF ? entry._formattedTs : formatExplorerEventTime(entry);
  const rcDisplay = entry._isBFF ? entry._formattedTs : formatExplorerReceivedTime(entry);

  const properties = (def?.properties || []).map((p) => {
    let value = "—";
    if (p.key === "timestamp") value = tsDisplay;
    else if (entry.properties && entry.properties !== "—") value = entry.properties;
    return { label: p.key, value: p.sensitive ? "••••••" : value };
  });

  drawer.querySelector("[data-drawer-body]").innerHTML = `
    <div class="event-drawer-header">
      ${categoryBadge(entry.category)}
      ${statusBadge(entry.status)}
    </div>
    <div class="event-config-list" style="margin-bottom: var(--space-5);">
      <div class="event-config-row"><span class="event-config-row__label">Event Time</span><span class="event-config-row__value tabular-nums">${tsDisplay}</span></div>
      <div class="event-config-row"><span class="event-config-row__label">Received</span><span class="event-config-row__value tabular-nums">${rcDisplay}</span></div>
      <div class="event-config-row"><span class="event-config-row__label">Source</span><span class="event-config-row__value">${entry.source}</span></div>
      <div class="event-config-row"><span class="event-config-row__label">Customer</span><span class="event-config-row__value font-mono">${entry.customerMasked}</span></div>
    </div>
    <p class="subhead" style="margin-bottom: var(--space-2);">Properties</p>
    <div class="event-config-list">
      ${properties.length ? properties.map((p) => `<div class="event-config-row"><span class="event-config-row__label font-mono">${p.label}</span><span class="event-config-row__value">${p.value}</span></div>`).join("") : `<p class="event-empty-note">No property detail captured for this occurrence.</p>`}
    </div>
    ${def ? `<a class="dest-setup-guide-link" href="event-definitions.html?open=${def.id}" style="margin-top: var(--space-5);"><i data-lucide="list-tree"></i> View event definition</a>` : ""}`;
  drawer.classList.add("is-open");
  document.body.style.overflow = "hidden";
  refreshIcons();
}

function initFilters() {
  const dateSel = document.querySelector("[data-explorer-daterange]");
  dateSel.innerHTML = DATE_RANGE_PRESETS.filter((p) => p !== "Custom range").map((p) => `<option value="${p}"${p === filterState.preset ? " selected" : ""}>${p}</option>`).join("");
  dateSel.addEventListener("change", (e) => {
    filterState.preset = e.target.value;
    renderAll();
  });

  const catSel = document.querySelector("[data-explorer-category]");
  catSel.innerHTML = `<option value="all">All Categories</option>${EVENT_CATEGORIES.map((c) => `<option value="${c}">${c}</option>`).join("")}`;
  catSel.addEventListener("change", (e) => {
    filterState.category = e.target.value;
    renderAll();
  });

  const sourceSel = document.querySelector("[data-explorer-source]");
  sourceSel.innerHTML = `<option value="all">All Sources</option>${EVENT_SOURCES.map((s) => `<option value="${s}">${s}</option>`).join("")}`;
  sourceSel.addEventListener("change", (e) => {
    filterState.source = e.target.value;
    renderAll();
  });

  const eventSel = document.querySelector("[data-explorer-event]");
  eventSel.innerHTML = `<option value="all">All Events</option>${EVENT_CATALOG.map((ev) => `<option value="${ev.name}">${ev.name}</option>`).join("")}`;
  eventSel.addEventListener("change", (e) => {
    filterState.eventName = e.target.value;
    renderAll();
  });

  const statusSel = document.querySelector("[data-explorer-status]");
  statusSel.innerHTML = `<option value="all">All Statuses</option>${EXPLORER_STATUSES.map((s) => `<option value="${s}">${s}</option>`).join("")}`;
  statusSel.addEventListener("change", (e) => {
    filterState.status = e.target.value;
    renderAll();
  });

  document.querySelector("[data-explorer-search]").addEventListener("input", (e) => {
    filterState.query = e.target.value;
    renderAll();
  });
}

export function initLiveEvents() {
  initFilters();

  // Deep-link support for "View Live Events" from Event Streams
  const presetSource = new URLSearchParams(location.search).get("source");
  if (presetSource && EVENT_SOURCES.includes(presetSource)) {
    filterState.source = presetSource;
    document.querySelector("[data-explorer-source]").value = presetSource;
  }

  renderAll();

  // Load initial snapshot from BFF (non-blocking)
  if (typeof PHSAPI !== 'undefined') {
    PHSAPI.events.stream({ limit: 100 })
      .then(res => {
        if (res?.data?.length) {
          _liveBuffer = res.data;
          renderAll();
        }
      })
      .catch(() => {}); // silently fall back to mock
  }

  // Start BFF real-time stream if available (non-blocking)
  startBFFStream();

  // Stop stream when user navigates away
  window.addEventListener('beforeunload', stopBFFStream, { once: true });
}
