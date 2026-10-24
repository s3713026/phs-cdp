import { renderLineChart } from "../components/chart.js";
import { EVENT_CATALOG, getEventByName } from "../data/events.js";
import { CUSTOMERS } from "../data/customers.js";

function cssVar(name) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}
function hashString(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) >>> 0;
  return h;
}

function formatCompact(n) {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(2) + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(1) + "K";
  return String(Math.round(n));
}

function dateLabel(daysAgo) {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  return daysAgo === 0 ? "Today" : d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

const GROWTH_DATA = {
  "7d": {
    offsets: [6, 5, 4, 3, 2, 1, 0],
    total: [1265000, 1268500, 1271200, 1274800, 1277900, 1281300, 1284392],
    known: [812000, 814600, 816900, 819200, 821500, 823100, 824615],
    anonymous: [453000, 453900, 454300, 455600, 456400, 458200, 459777],
  },
  "30d": {
    offsets: [30, 24, 18, 12, 6, 0],
    total: [1198000, 1215400, 1232800, 1251900, 1268700, 1284392],
    known: [768000, 781200, 793500, 805800, 815900, 824615],
    anonymous: [430000, 434200, 439300, 446100, 452800, 459777],
  },
  "90d": {
    offsets: [90, 72, 54, 36, 18, 0],
    total: [1042000, 1089500, 1132800, 1178900, 1231500, 1284392],
    known: [652000, 683400, 715800, 748200, 786500, 824615],
    anonymous: [390000, 406100, 417000, 430700, 445000, 459777],
  },
};

function renderGrowthChart(period) {
  const mount = document.querySelector("[data-growth-chart]");
  if (!mount) return;
  const d = GROWTH_DATA[period];
  renderLineChart(mount, {
    labels: d.offsets.map(dateLabel),
    formatValue: formatCompact,
    series: [
      { name: "Total Profiles", color: cssVar("--chart-green"), values: d.total, area: true },
      { name: "Known Profiles", color: cssVar("--chart-blue"), values: d.known },
      { name: "Anonymous Profiles", color: cssVar("--chart-teal"), values: d.anonymous },
    ],
  });
}

function initGrowthPeriodToggle() {
  const tablist = document.querySelector("[data-growth-period]");
  if (!tablist) return;
  const tabs = Array.from(tablist.querySelectorAll(".tabs__tab"));
  tabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      tabs.forEach((t) => t.setAttribute("aria-selected", String(t === tab)));
      renderGrowthChart(tab.dataset.period);
    });
  });
}

function initDateRangeDropdown() {
  const trigger = document.querySelector("[data-range-trigger]");
  const label = document.querySelector("[data-range-label]");
  if (!trigger || !label) return;
  document.querySelectorAll("[data-range-option]").forEach((option) => {
    option.addEventListener("click", () => {
      label.textContent = option.textContent;
    });
  });
}

function initRefresh() {
  const btn = document.querySelector("[data-refresh-btn]");
  const stamp = document.querySelector("[data-updated-stamp]");
  if (!btn) return;
  btn.addEventListener("click", () => {
    if (btn.classList.contains("is-loading")) return;
    btn.classList.add("is-loading");
    btn.disabled = true;
    setTimeout(() => {
      btn.classList.remove("is-loading");
      btn.disabled = false;
      if (stamp) stamp.textContent = "just now";
    }, 700);
  });
}

function initExport() {
  const btn = document.querySelector("[data-export-btn]");
  if (!btn) return;
  const label = btn.querySelector("[data-export-label]");
  const defaultText = label ? label.textContent : "";
  btn.addEventListener("click", () => {
    if (btn.disabled) return;
    btn.disabled = true;
    if (label) label.textContent = "Exporting…";
    setTimeout(() => {
      btn.disabled = false;
      if (label) label.textContent = defaultText;
    }, 900);
  });
}

/* ------------------------------------------------------------------ */
/* Events Today — a real sum over the canonical Event Catalog's own    */
/* per-event daily stats (js/data/events.js statsFor()), not a second,  */
/* independently-invented figure. Keeps the Customer Overview KPI       */
/* internally consistent with Data Catalog / Event Definitions.        */
/* ------------------------------------------------------------------ */
function renderEventsToday() {
  const el = document.querySelector("[data-kpi-events-today]");
  if (!el) return;
  const total = EVENT_CATALOG.reduce((sum, e) => sum + (e.stats?.eventsToday || 0), 0);
  el.textContent = total.toLocaleString();
}

/* Daily Active Users — the canonical "App Open" event's own
   uniqueCustomersToday stat. Deliberately NOT the same number as
   Active Customers or Monthly Active Users — see dashboard.html's
   Engagement section note. */
function renderDAU() {
  const el = document.querySelector("[data-kpi-dau]");
  if (!el) return;
  const appOpen = getEventByName("App Open");
  el.textContent = appOpen ? appOpen.stats.uniqueCustomersToday.toLocaleString() : "—";
}

/* Activity trend (last 7 days) — the same total-events-today figure
   used above, projected backward with the same deterministic
   hash-jitter pattern used throughout this prototype (e.g.
   js/data/event-streams.js), so it is derived, not invented. */
function renderActivityTrend() {
  const mount = document.querySelector("[data-activity-trend-chart]");
  if (!mount) return;
  const todayTotal = EVENT_CATALOG.reduce((sum, e) => sum + (e.stats?.eventsToday || 0), 0);
  const labels = [];
  const values = [];
  for (let daysAgo = 6; daysAgo >= 0; daysAgo--) {
    labels.push(dateLabel(daysAgo));
    if (daysAgo === 0) {
      values.push(todayTotal);
    } else {
      const h = hashString(`activity-trend-${daysAgo}`);
      const jitter = 0.88 + (h % 20) / 100; // 0.88–1.07
      values.push(Math.round(todayTotal * jitter));
    }
  }
  renderLineChart(mount, {
    labels,
    formatValue: formatCompact,
    series: [{ name: "Events", color: cssVar("--chart-green"), values, area: true }],
  });
}

/* ------------------------------------------------------------------ */
/* Profile Samples — a compact icon grid, not a directory. Each of the  */
/* 5 cells is backed by a real, distinct Customer 360 record (see       */
/* js/data/customers.js), so every sample genuinely opens its own       */
/* matching detail view. The grid itself only ever shows generic        */
/* "User N" labels — no names, ids, or other identifying data appear    */
/* here; identifying detail only appears after navigating into the      */
/* linked Customer 360 page.                                            */
/* ------------------------------------------------------------------ */
function renderProfileSamples() {
  const mount = document.querySelector("[data-profile-samples]");
  if (!mount) return;

  const samples = CUSTOMERS.slice(0, 5).map((c, i) => ({
    label: `User ${i + 1}`,
    customerId: c.id,
  }));

  mount.innerHTML = samples
    .map(
      (s) => `
      <button type="button" class="profile-sample" data-sample-row="${s.customerId}">
        <span class="profile-sample__icon"><i data-lucide="user"></i></span>
        <span class="profile-sample__label">${s.label}</span>
      </button>`
    )
    .join("");

  if (window.lucide) window.lucide.createIcons();
  mount.querySelectorAll("[data-sample-row]").forEach((cell) => {
    cell.addEventListener("click", () => {
      location.href = `customer-360.html?id=${cell.dataset.sampleRow}`;
    });
  });
}

/* Shared detail drawer — populated from whichever Customer Activity
   row was clicked. */
function initDetailDrawer() {
  const overlay = document.getElementById("detail-drawer");
  if (!overlay) return;
  const eyebrow = overlay.querySelector("[data-drawer-eyebrow]");
  const title = overlay.querySelector("[data-drawer-title]");
  const body = overlay.querySelector("[data-drawer-body]");

  function fieldRow(label, value) {
    return `<div class="cluster gap-2" style="justify-content:space-between;"><span class="cell-muted">${label}</span><span class="font-mono">${value}</span></div>`;
  }

  function open(row) {
    eyebrow.textContent = "Customer Activity";
    title.textContent = row.dataset.event;
    body.innerHTML = `
      <div class="stack gap-2" style="font-size: var(--text-sm);">
        ${fieldRow("Customer", row.dataset.customer)}
        ${fieldRow("Channel", row.dataset.channel)}
        ${fieldRow("Timestamp", row.dataset.timestamp)}
        ${fieldRow("Status", row.dataset.status || "—")}
      </div>`;
    overlay.classList.add("is-open");
    document.body.style.overflow = "hidden";
  }

  document.querySelectorAll("[data-detail-row]").forEach((row) => {
    row.addEventListener("click", () => open(row));
    row.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        open(row);
      }
    });
  });

  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) close();
  });
  overlay.querySelectorAll("[data-drawer-close]").forEach((btn) =>
    btn.addEventListener("click", () => close())
  );
  function close() {
    overlay.classList.remove("is-open");
    document.body.style.overflow = "";
  }
}

// ── BFF integration ────────────────────────────────────────────────────────
async function loadDashboardMetricsFromBFF() {
  if (typeof PHSAPI === 'undefined') return;
  try {
    // Fetch audience summary count for the header metric
    const [audienceRes, dqRes] = await Promise.all([
      PHSAPI.audiences.list({ limit: 1 }),
      PHSAPI.dataQuality.overview(),
    ]);
    const totalAudiences = audienceRes.pagination?.total ?? audienceRes.total;
    const dqScore = dqRes?.score;

    if (totalAudiences != null) {
      document.querySelectorAll('[data-metric="audiences"]').forEach(el => {
        el.textContent = totalAudiences.toLocaleString();
      });
    }
    if (dqScore != null) {
      document.querySelectorAll('[data-metric="dq-score"]').forEach(el => {
        el.textContent = dqScore + '%';
      });
    }
  } catch (e) {
    console.warn('[Dashboard] BFF metrics unavailable:', e.message);
  }
}

export function initDashboard() {
  renderGrowthChart("30d");
  initGrowthPeriodToggle();
  initDateRangeDropdown();
  initRefresh();
  initExport();
  renderEventsToday();
  renderDAU();
  renderActivityTrend();
  renderProfileSamples();
  initDetailDrawer();
  // Overlay live metrics from BFF (non-blocking)
  loadDashboardMetricsFromBFF();
}
