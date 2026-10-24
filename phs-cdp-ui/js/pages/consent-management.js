/*
  Consent Management (Governance) — consent purposes, legal basis and
  channel coverage. Reuses the same Consent taxonomy Activation's
  Consent data stream already uses (js/data/destinations.js) and the
  Consent Updated event already in the canonical Event Catalog
  (js/data/events.js) for recent activity — never a second consent
  model or a second event log.
*/
import { CONSENT_TYPES, CONSENT_CHANNELS } from "../data/destinations.js";
import { getExplorerEvents, formatExplorerTimestamp } from "../data/events.js";

function refreshIcons() {
  if (window.lucide) window.lucide.createIcons();
}
function hashString(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) >>> 0;
  return h;
}

const LEGAL_BASIS = { Marketing: "Consent", Analytics: "Legitimate Interest", Personalization: "Consent" };

function distributionFor(purpose) {
  const h = hashString(purpose);
  const granted = 55 + (h % 30);
  const denied = 5 + (h % 15);
  const pending = Math.max(0, 100 - granted - denied);
  return { granted, denied, pending };
}

function renderSummary() {
  const totals = CONSENT_TYPES.reduce(
    (acc, p) => {
      const d = distributionFor(p);
      acc.granted += d.granted;
      acc.denied += d.denied;
      acc.pending += d.pending;
      return acc;
    },
    { granted: 0, denied: 0, pending: 0 }
  );
  const n = CONSENT_TYPES.length;
  document.querySelector("[data-consent-summary]").innerHTML = `
    <div class="metric metric--success"><span class="metric__label">Avg Granted</span><div class="metric__value-row"><span class="metric__value tabular-nums" style="font-size: var(--text-xl);">${Math.round(totals.granted / n)}%</span></div></div>
    <div class="metric"><span class="metric__label">Avg Denied</span><div class="metric__value-row"><span class="metric__value tabular-nums" style="font-size: var(--text-xl);">${Math.round(totals.denied / n)}%</span></div></div>
    <div class="metric"><span class="metric__label">Avg Pending</span><div class="metric__value-row"><span class="metric__value tabular-nums" style="font-size: var(--text-xl);">${Math.round(totals.pending / n)}%</span></div></div>
    <div class="metric metric--primary"><span class="metric__label">Consent Purposes</span><div class="metric__value-row"><span class="metric__value tabular-nums" style="font-size: var(--text-xl);">${n}</span></div></div>`;
}

function renderPolicies() {
  const tbody = document.querySelector("[data-policy-table] tbody");
  tbody.innerHTML = CONSENT_TYPES.map((purpose) => {
    const d = distributionFor(purpose);
    const h = hashString(purpose + "-reviewed");
    const day = 5 + (h % 20);
    return `<tr>
      <td class="cell-primary">${purpose} Consent</td>
      <td class="cell-muted">${LEGAL_BASIS[purpose] || "Consent"}</td>
      <td class="cell-muted">${CONSENT_CHANNELS.join(", ")}</td>
      <td class="num tabular-nums">${d.granted}%</td>
      <td class="num tabular-nums">${d.denied}%</td>
      <td class="num tabular-nums">${d.pending}%</td>
      <td><span class="badge badge--success">Active</span></td>
      <td class="cell-muted tabular-nums">${String(day).padStart(2, "0")} Sep 2026</td>
    </tr>`;
  }).join("");
  refreshIcons();
}

function renderActivity() {
  const entries = getExplorerEvents({ dateFilter: { preset: "Last 30 days" }, eventName: "Consent Updated" }).slice(0, 20);
  const tbody = document.querySelector("[data-activity-table] tbody");
  tbody.innerHTML = entries.length
    ? entries
        .map(
          (e) => `<tr>
      <td class="cell-muted tabular-nums">${formatExplorerTimestamp(e)}</td>
      <td class="cell-primary font-mono">${e.customerMasked}</td>
      <td class="cell-muted">${e.properties}</td>
      <td class="cell-muted">${e.source}</td>
    </tr>`
        )
        .join("")
    : `<tr><td colspan="4" class="table__empty">No recent consent activity.</td></tr>`;
}

export function initConsentManagement() {
  renderSummary();
  renderPolicies();
  renderActivity();
}
