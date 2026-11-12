import { renderLineChart } from "../components/chart.js";
import { CUSTOMERS } from "../data/customers.js";

function cssVar(name) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}
function formatCompact(n) {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(2) + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(1) + "K";
  return String(Math.round(n));
}

// ── Growth Chart ──────────────────────────────────────────────────────────
let currentGrowthPeriod = "30d";
let growthCache = {};   // period → BFF response (avoid re-fetching)

async function loadAndRenderGrowthChart(period) {
  const mount = document.querySelector("[data-growth-chart]");
  if (!mount) return;

  // Show loading state on chart area
  mount.style.opacity = "0.4";

  try {
    let data = growthCache[period];
    if (!data) {
      if (typeof PHSAPI !== "undefined") {
        data = await PHSAPI.dashboard.growth(period);
        growthCache[period] = data;
      }
    }

    if (data && Array.isArray(data.labels)) {
      renderLineChart(mount, {
        labels: data.labels,
        formatValue: formatCompact,
        series: [
          { name: "Total Profiles",     color: cssVar("--chart-green"), values: data.total,     area: true },
          { name: "Known Profiles",     color: cssVar("--chart-blue"),  values: data.known },
          { name: "Anonymous Profiles", color: cssVar("--chart-teal"),  values: data.anonymous },
        ],
      });

      // Show live/mock badge on chart header if available
      const badge = document.querySelector("[data-growth-source-badge]");
      if (badge) {
        badge.textContent  = data.source === "rudderstack" ? "● LIVE" : "○ Demo";
        badge.style.color  = data.source === "rudderstack" ? "var(--color-success)" : "var(--color-warning)";
        badge.style.fontSize = "var(--text-xs)";
      }
    }
  } catch (err) {
    console.warn("[Dashboard] Growth chart BFF unavailable:", err.message);
  } finally {
    mount.style.opacity = "";
  }
}

function initGrowthPeriodToggle() {
  const tablist = document.querySelector("[data-growth-period]");
  if (!tablist) return;
  const tabs = Array.from(tablist.querySelectorAll(".tabs__tab"));
  tabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      tabs.forEach((t) => t.setAttribute("aria-selected", String(t === tab)));
      currentGrowthPeriod = tab.dataset.period;
      loadAndRenderGrowthChart(currentGrowthPeriod);
    });
  });
}

// ── Utility controls ──────────────────────────────────────────────────────
function initDateRangeDropdown() {
  const label = document.querySelector("[data-range-label]");
  document.querySelectorAll("[data-range-option]").forEach((option) => {
    option.addEventListener("click", () => {
      if (label) label.textContent = option.textContent;
    });
  });
}

function initRefresh() {
  const btn   = document.querySelector("[data-refresh-btn]");
  const stamp = document.querySelector("[data-updated-stamp]");
  if (!btn) return;
  btn.addEventListener("click", async () => {
    if (btn.classList.contains("is-loading")) return;
    btn.classList.add("is-loading");
    btn.disabled = true;
    // Clear cache so next render fetches fresh data
    growthCache = {};
    await Promise.all([
      loadDashboardMetricsFromBFF(),
      loadAndRenderGrowthChart(currentGrowthPeriod),
    ]);
    btn.classList.remove("is-loading");
    btn.disabled = false;
    if (stamp) stamp.textContent = "just now";
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

// ── Detail drawer ─────────────────────────────────────────────────────────
function initDetailDrawer() {
  const overlay = document.getElementById("detail-drawer");
  if (!overlay) return;
  const eyebrow = overlay.querySelector("[data-drawer-eyebrow]");
  const title   = overlay.querySelector("[data-drawer-title]");
  const body    = overlay.querySelector("[data-drawer-body]");

  function fieldRow(label, value) {
    return `<div class="cluster gap-2" style="justify-content:space-between;">
      <span class="cell-muted">${label}</span>
      <span class="font-mono">${value}</span>
    </div>`;
  }

  function open(row) {
    eyebrow.textContent = "Customer Activity";
    title.textContent   = row.dataset.event;
    body.innerHTML = `
      <div class="stack gap-2" style="font-size: var(--text-sm);">
        ${fieldRow("Customer",  row.dataset.customer)}
        ${fieldRow("Channel",   row.dataset.channel)}
        ${fieldRow("Timestamp", row.dataset.timestamp)}
        ${fieldRow("Status",    row.dataset.status || "—")}
      </div>`;
    overlay.classList.add("is-open");
    document.body.style.overflow = "hidden";
  }

  // Static rows (if any) + delegation for dynamically injected rows
  document.querySelectorAll("[data-detail-row]").forEach((row) => {
    row.addEventListener("click", () => open(row));
    row.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") { e.preventDefault(); open(row); }
    });
  });

  // Event delegation for activity rows rendered by renderCustomerActivity()
  document.addEventListener("click", (e) => {
    const row = e.target.closest("[data-detail-row]");
    if (row && !row._hasDirectListener) open(row);
  });
  document.addEventListener("keydown", (e) => {
    if (e.key !== "Enter" && e.key !== " ") return;
    const row = e.target.closest("[data-detail-row]");
    if (row && !row._hasDirectListener) { e.preventDefault(); open(row); }
  });

  overlay.addEventListener("click", (e) => { if (e.target === overlay) close(); });
  overlay.querySelectorAll("[data-drawer-close]").forEach((btn) => btn.addEventListener("click", close));
  function close() {
    overlay.classList.remove("is-open");
    document.body.style.overflow = "";
  }
}

// ── Profile Samples — real customers from BFF or fallback mock ────────────
async function renderProfileSamples() {
  const mount = document.querySelector("[data-profile-samples]");
  if (!mount) return;

  let samples = [];

  try {
    if (typeof PHSAPI !== "undefined") {
      const res = await PHSAPI.customers.list({ limit: 5, page: 1 });
      const list = res?.data ?? res ?? [];
      if (Array.isArray(list) && list.length > 0) {
        samples = list.slice(0, 5).map((c, i) => ({
          label: `User ${i + 1}`,
          customerId: c.id || c.customerId,
        }));
      }
    }
  } catch (err) {
    console.warn("[Dashboard] Profile samples BFF unavailable:", err.message);
  }

  // Fallback to mock customers if BFF returned nothing
  if (samples.length === 0) {
    samples = CUSTOMERS.slice(0, 5).map((c, i) => ({
      label: `User ${i + 1}`,
      customerId: c.id,
    }));
  }

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

// ── Active Customers metric ───────────────────────────────────────────────
function renderActiveCustomers(count) {
  document.querySelectorAll('[data-metric="active-customers"]').forEach((el) => {
    el.textContent = formatCompact(count);
  });
}

// ── Lifecycle Bars ────────────────────────────────────────────────────────
const LIFECYCLE_META = {
  prospect:        { label: "Prospect",         color: "var(--chart-teal)" },
  lead:            { label: "Lead",             color: "var(--chart-blue)" },
  ekyc:            { label: "eKYC",             color: "var(--color-primary-700)" },
  account_opening: { label: "Account Opening",  color: "var(--chart-blue)" },
  funding:         { label: "Funded",           color: "var(--chart-green)" },
  first_trade:     { label: "First Trade",      color: "var(--chart-green)" },
  active_investor: { label: "Active Investor",  color: "var(--chart-green)" },
  vip:             { label: "VIP",              color: "var(--chart-gold)" },
  dormant:         { label: "Dormant",          color: "var(--chart-neutral)" },
  churn_risk:      { label: "Churn Risk",       color: "var(--color-danger)" },
  reactivation:    { label: "Reactivation",     color: "var(--chart-gold)" },
};

function renderLifecycleBars(breakdown, totalProfiles) {
  const container = document.querySelector("[data-lifecycle-chart]");
  if (!container || !Array.isArray(breakdown) || breakdown.length === 0) return;

  const total = totalProfiles || breakdown.reduce((s, r) => s + Number(r.cnt || 0), 0) || 1;
  const maxCnt = Math.max(...breakdown.map((r) => Number(r.cnt || 0)), 1);

  container.innerHTML = breakdown
    .map((row) => {
      const stage = (row.lifecycle_stage || row.stage || "").toLowerCase();
      const cnt   = Number(row.cnt || 0);
      const meta  = LIFECYCLE_META[stage] || { label: stage, color: "var(--chart-teal)" };
      const pctOfTotal = ((cnt / total) * 100).toFixed(1);
      const barWidth   = ((cnt / maxCnt) * 100).toFixed(1);
      return `
      <div class="chart-hbar">
        <span class="chart-hbar__label">${meta.label}<span class="chart-hbar__sublabel">${pctOfTotal}% of total</span></span>
        <div class="chart-hbar__track">
          <div class="chart-hbar__fill" style="width: ${barWidth}%; background: ${meta.color};"></div>
        </div>
        <span class="chart-hbar__value tabular-nums">${cnt.toLocaleString()}</span>
      </div>`;
    })
    .join("");

  // Update subtitle
  const subtitle = document.querySelector("[data-lifecycle-subtitle]");
  if (subtitle) subtitle.textContent = `Distribution of ${Number(total).toLocaleString()} profiles across PHS lifecycle stages.`;
}

// ── Customer Activity rows ────────────────────────────────────────────────
const BADGE_STATUS = {
  completed : "badge--success",
  received  : "badge--neutral",
  opened    : "badge--info",
  failed    : "badge--danger",
  pending   : "badge--warning",
};

function timeAgo(ts) {
  if (!ts) return "—";
  const diff = Math.floor((Date.now() - new Date(ts).getTime()) / 1000);
  if (diff < 60)   return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

function renderCustomerActivity(events) {
  const tbody = document.querySelector("[data-activity-tbody]");
  if (!tbody) return;

  if (!Array.isArray(events) || events.length === 0) {
    tbody.innerHTML = `<tr><td colspan="5" class="cell-muted" style="text-align:center;padding:var(--space-6);">No recent activity</td></tr>`;
    return;
  }

  tbody.innerHTML = events.map((ev) => {
    const ago       = timeAgo(ev.created_at || ev.timestamp);
    const eventName = ev.event_name || ev.eventName || ev.event || "Unknown Event";
    const source    = ev.source || ev.channel || "Unknown";
    const rawStatus = (ev.status || "received").toLowerCase();
    const badgeCls  = BADGE_STATUS[rawStatus] || "badge--neutral";
    const statusLabel = rawStatus.charAt(0).toUpperCase() + rawStatus.slice(1);
    const custId    = ev.customer_id || ev.customerId || "—";
    const custName  = ev.customer_name || ev.customerName || (custId !== "—" ? `ID ${custId}` : "Anonymous");

    return `
    <tr tabindex="0" role="button" data-detail-row
        data-timestamp="${ago}"
        data-customer="${custName}"
        data-event="${eventName}"
        data-channel="${source}"
        data-status="${statusLabel}">
      <td class="cell-muted">${ago}</td>
      <td class="cell-primary">${eventName}</td>
      <td class="cell-muted">${source}</td>
      <td><span class="badge ${badgeCls}">${statusLabel}</span></td>
      <td><i class="row-affordance" data-lucide="chevron-right"></i></td>
    </tr>`;
  }).join("");

  // Re-init Lucide icons for new rows
  if (window.lucide) window.lucide.createIcons();
}

// ── BFF — primary metrics overlay ────────────────────────────────────────
async function loadDashboardMetricsFromBFF() {
  if (typeof PHSAPI === "undefined") return;
  try {
    const dash = await PHSAPI.dashboard.summary();

    // Customers
    if (dash.customers?.total) {
      document.querySelectorAll('[data-metric="total-profiles"]').forEach(el => {
        el.textContent = dash.customers.total.toLocaleString();
      });
      document.querySelectorAll('[data-metric="known-profiles"]').forEach(el => {
        el.textContent = dash.customers.known.toLocaleString();
      });
      document.querySelectorAll('[data-metric="anonymous-profiles"]').forEach(el => {
        el.textContent = dash.customers.anonymous.toLocaleString();
      });
    }

    // Audiences
    if (dash.audiences?.total != null) {
      document.querySelectorAll('[data-metric="audiences"]').forEach(el => {
        el.textContent = dash.audiences.total.toLocaleString();
      });
    }

    // Data Quality
    if (dash.dataQuality?.score != null) {
      document.querySelectorAll('[data-metric="dq-score"]').forEach(el => {
        el.textContent = dash.dataQuality.score + "%";
      });
    }

    // Events today (from RudderStack via BFF)
    const eventsToday = dash.recentActivity?.eventsToday;
    if (eventsToday != null) {
      // KPI card
      document.querySelectorAll('[data-metric="events-today"], [data-kpi-events-today]').forEach(el => {
        el.textContent = eventsToday.toLocaleString();
      });

      // Activity trend chart — build 7-day sparkline from the single "today" figure
      // We use the BFF number for today and scale previous days proportionally.
      // A proper time-series endpoint can replace this later.
      renderActivityTrendFromCount(eventsToday);
    }

    // DAU — use identifyEventsToday as proxy for active users
    const dau = dash.recentActivity?.identifyEventsToday;
    if (dau != null) {
      document.querySelectorAll('[data-kpi-dau]').forEach(el => {
        el.textContent = dau.toLocaleString();
      });
    }

    // Live/Mock badge
    const mode = dash.mode || (dash.customers?.source === "mautic" ? "live" : "mock");
    document.querySelectorAll('[data-metric="data-source"]').forEach(el => {
      el.textContent = mode === "live" ? "● LIVE" : "○ Demo";
      el.style.color = mode === "live" ? "var(--color-success)" : "var(--color-warning)";
    });

    // Active Customers
    if (dash.activeCustomers != null) {
      renderActiveCustomers(dash.activeCustomers);
    }

    // Lifecycle breakdown bars
    if (Array.isArray(dash.lifecycleBreakdown) && dash.lifecycleBreakdown.length > 0) {
      renderLifecycleBars(dash.lifecycleBreakdown, dash.customers?.total);
    }

    // Customer Activity table
    if (Array.isArray(dash.recentCustomerActivity) && dash.recentCustomerActivity.length > 0) {
      renderCustomerActivity(dash.recentCustomerActivity);
    }

    console.info(
      "[Dashboard] BFF data loaded. Mode:", mode,
      "| Customers:", dash.customers?.total,
      "| Active:", dash.activeCustomers,
      "| Lifecycle stages:", dash.lifecycleBreakdown?.length,
      "| Events today:", eventsToday,
      "| Audiences:", dash.audiences?.total,
      "| DQ Score:", dash.dataQuality?.score + "%"
    );
  } catch (e) {
    console.warn("[Dashboard] BFF metrics unavailable, using static data:", e.message);
  }
}

// ── Activity Trend — 7-day sparkline derived from BFF eventsToday ──────────
// Uses a stable jitter so the shape is deterministic per session.
function hashString(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) >>> 0;
  return h;
}

function dateLabel(daysAgo) {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  return daysAgo === 0 ? "Today" : d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function renderActivityTrendFromCount(todayTotal) {
  const mount = document.querySelector("[data-activity-trend-chart]");
  if (!mount) return;
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

// ── Init ───────────────────────────────────────────────────────────────────
export function initDashboard() {
  initGrowthPeriodToggle();
  initDateRangeDropdown();
  initRefresh();
  initExport();
  initDetailDrawer();

  // Non-blocking: load everything from BFF in parallel
  Promise.all([
    loadDashboardMetricsFromBFF(),           // KPIs + events today + activity trend
    loadAndRenderGrowthChart(currentGrowthPeriod),  // growth chart
    renderProfileSamples(),                  // profile sample grid
  ]).catch((err) => {
    console.warn("[Dashboard] Init error:", err.message);
  });
}
