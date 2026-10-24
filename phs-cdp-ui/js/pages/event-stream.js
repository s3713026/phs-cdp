/*
  Event Stream — conceptual ingestion health by source. Reuses the
  real inbound Data Flow record for each source (js/data/dataflows.js)
  rather than building a second flow visualization; adds only the
  event-specific health numbers (events/min, latency, last received).
*/
import { EVENT_SOURCES, streamHealthForSource } from "../data/events.js";
import { SYSTEM_ICONS, INBOUND_FLOWS } from "../data/dataflows.js";

function refreshIcons() {
  if (window.lucide) window.lucide.createIcons();
}
function fmt(n) {
  return n.toLocaleString();
}

function cardHTML(sourceName) {
  const health = streamHealthForSource(sourceName);
  const flow = INBOUND_FLOWS.find((f) => f.systemName === sourceName);
  const deliveryLabel = flow ? flow.deliveryMode : "Stream";
  const connectionStatus = flow ? flow.status : "Connected";
  return `
    <div class="event-stream-card">
      <div class="event-stream-card__head">
        <span class="event-stream-card__icon"><i data-lucide="${SYSTEM_ICONS[sourceName] || "share-2"}"></i></span>
        <div>
          <div class="event-stream-card__name">${sourceName}</div>
          <div class="event-stream-card__today">${fmt(health.eventsToday)} events today</div>
        </div>
      </div>
      <div class="event-stream-card__flow">
        <i data-lucide="arrow-right"></i>
        <span>${deliveryLabel}</span>
        <span class="badge ${connectionStatus === "Connected" ? "badge--success" : "badge--neutral"}" style="margin-left:auto;">${connectionStatus}</span>
      </div>
      <div class="event-stream-card__stats">
        <div><div class="event-stream-stat__label">Events / min</div><div class="event-stream-stat__value tabular-nums">${fmt(health.eventsPerMinute)}</div></div>
        <div><div class="event-stream-stat__label">Last Received</div><div class="event-stream-stat__value tabular-nums">${health.lastReceivedSec}s ago</div></div>
        <div><div class="event-stream-stat__label">Latency</div><div class="event-stream-stat__value tabular-nums">${health.latencySec}s</div></div>
      </div>
      <div class="cluster gap-2" style="align-items:center;">
        <span class="status-dot ${health.status === "Healthy" ? "status-dot--success" : "status-dot--warning"}">${health.status}</span>
      </div>
    </div>`;
}

export function initEventStream() {
  const grid = document.querySelector("[data-stream-grid]");
  grid.innerHTML = EVENT_SOURCES.map(cardHTML).join("");
  refreshIcons();
}
