/**
 * module-status.js — UI utility
 *
 * Fetches /api/module-status from BFF and renders "Not Connected" banners
 * on pages whose backend module isn't wired yet.
 *
 * Usage in a page script:
 *
 *   import { checkModuleStatus } from '../utils/module-status.js';
 *
 *   export async function initCampaigns() {
 *     const ok = await checkModuleStatus('campaigns');
 *     if (!ok) return;   // banner already rendered, stop init
 *     // ... rest of init
 *   }
 */

const BFF = window.__CDP_CONFIG__?.bffUrl || 'http://localhost:3001';

let _statusCache = null;
let _fetchPromise = null;

/** Fetch module status once per page load, cache result */
export async function getModuleStatus() {
  if (_statusCache) return _statusCache;
  if (_fetchPromise) return _fetchPromise;

  _fetchPromise = fetch(`${BFF}/api/module-status`, {
    headers: { 'X-PHS-Role': 'admin' },
  })
    .then(r => r.ok ? r.json() : null)
    .catch(() => null)
    .then(data => { _statusCache = data; _fetchPromise = null; return data; });

  return _fetchPromise;
}

/**
 * Check a specific module. If not connected, render a banner into `mountSelector`
 * (defaults to `[data-page-content]` or `<main>`).
 *
 * Returns true if the module has real data (proceed with init).
 * Returns false if not connected (banner rendered, caller should return early).
 */
export async function checkModuleStatus(moduleName, mountSelector = null) {
  const status = await getModuleStatus();
  if (!status) return true; // BFF unreachable — let page try and fail naturally

  const mod = status.modules?.[moduleName];
  if (!mod) return true;

  // 'connected' or 'empty' (connected but no rows yet) → allow init
  if (mod.status === 'connected' || mod.status === 'empty' || mod.status === 'mock') return true;

  // 'not_connected' → render banner and stop
  renderNotConnectedBanner(moduleName, mod, mountSelector, status.useMock);
  return false;
}

const MODULE_META = {
  campaigns:    { label: 'Campaigns',    icon: 'send',         phase: 'Phase 6' },
  journeys:     { label: 'Journeys',     icon: 'git-branch',   phase: 'Phase 7' },
  audiences:    { label: 'Audiences',    icon: 'users',        phase: 'Phase 4' },
  customers:    { label: 'Customers',    icon: 'user',         phase: 'Phase 2' },
  dataQuality:  { label: 'Data Quality', icon: 'shield-check', phase: 'Phase 8' },
  dataCatalog:  { label: 'Data Catalog', icon: 'database',     phase: 'Phase 1' },
  events:       { label: 'Events',       icon: 'zap',          phase: 'Phase 5' },
  sources:      { label: 'Data Sources', icon: 'git-merge',    phase: 'Phase 1' },
  destinations: { label: 'Destinations', icon: 'send',         phase: 'Phase 1' },
};

function renderNotConnectedBanner(moduleName, mod, mountSelector, useMock) {
  const meta   = MODULE_META[moduleName] || { label: moduleName, icon: 'plug-zap', phase: '' };
  const target = mountSelector
    ? document.querySelector(mountSelector)
    : document.querySelector('[data-page-content]') || document.querySelector('main');

  if (!target) return;

  // Hide any existing content (skeleton tables, etc.)
  target.innerHTML = `
    <div style="
      display:flex;flex-direction:column;align-items:center;justify-content:center;
      min-height:420px;padding:var(--space-12) var(--space-6);text-align:center;
    ">
      <!-- Icon block -->
      <div style="
        width:72px;height:72px;border-radius:20px;
        background:linear-gradient(135deg,var(--surface-secondary),var(--surface-tertiary,var(--surface-secondary)));
        display:flex;align-items:center;justify-content:center;
        border:1px solid var(--border-subtle);
        margin-bottom:var(--space-5);
        box-shadow:0 2px 8px rgba(0,0,0,.06);
      ">
        <i data-lucide="${meta.icon}" style="width:30px;height:30px;color:var(--text-tertiary);"></i>
      </div>

      <!-- Title -->
      <h2 style="font-size:var(--text-lg);font-weight:600;color:var(--text-primary);margin:0 0 var(--space-2);">
        ${meta.label} — Not Connected
      </h2>

      <!-- Phase badge -->
      ${meta.phase ? `<span class="badge badge--neutral badge--dest-tag" style="margin-bottom:var(--space-4);font-size:11px;">${meta.phase} · Pending</span>` : ''}

      <!-- Reason -->
      <p style="
        font-size:var(--text-sm);color:var(--text-secondary);
        max-width:480px;line-height:1.65;margin:0 0 var(--space-6);
      ">${mod.note}</p>

      <!-- Actions -->
      <div style="display:flex;gap:var(--space-3);flex-wrap:wrap;justify-content:center;">
        <a href="administration.html" class="btn btn--primary btn--sm">
          <i data-lucide="settings-2" style="width:14px;height:14px;"></i>
          Go to Administration
        </a>
        <a href="administration.html#integrations" class="btn btn--outline btn--sm">
          <i data-lucide="plug" style="width:14px;height:14px;"></i>
          Integrations
        </a>
      </div>

      <!-- USE_MOCK hint -->
      <div style="
        margin-top:var(--space-8);padding:12px 16px;
        background:var(--surface-secondary);border-radius:8px;
        border:1px solid var(--border-subtle);
        font-size:var(--text-xs);color:var(--text-secondary);
        max-width:420px;line-height:1.6;
      ">
        <strong style="color:var(--text-primary);">Want to see demo data?</strong><br>
        Set <code style="background:var(--surface-primary);padding:1px 5px;border-radius:3px;font-size:11px;">USE_MOCK=true</code>
        in <code style="background:var(--surface-primary);padding:1px 5px;border-radius:3px;font-size:11px;">.env</code>
        and rebuild the BFF container to enable demo mode for all modules.
      </div>
    </div>`;

  if (window.lucide) window.lucide.createIcons();
}

/**
 * Renders a compact status bar at the top of a page showing which
 * modules are connected vs pending.
 * Call once from dashboard or admin page.
 */
export async function renderSystemStatusBar(mountSelector = '[data-system-status-bar]') {
  const el = document.querySelector(mountSelector);
  if (!el) return;

  const status = await getModuleStatus();
  if (!status) { el.hidden = true; return; }

  if (status.useMock) {
    el.innerHTML = `
      <div style="display:flex;align-items:center;gap:8px;padding:8px 16px;background:var(--surface-secondary);border-bottom:1px solid var(--border-subtle);font-size:12px;color:var(--text-secondary);">
        <i data-lucide="flask-conical" style="width:13px;height:13px;color:var(--color-warning);"></i>
        <span><strong>Demo Mode</strong> — USE_MOCK=true · All data is synthetic</span>
      </div>`;
    if (window.lucide) window.lucide.createIcons();
    return;
  }

  const mods = status.modules || {};
  const notConnected = Object.entries(mods).filter(([, v]) => v.status === 'not_connected');
  const connected    = Object.entries(mods).filter(([, v]) => v.status === 'connected' || v.status === 'empty');

  el.innerHTML = `
    <div style="display:flex;align-items:center;gap:12px;padding:8px 16px;background:var(--surface-secondary);border-bottom:1px solid var(--border-subtle);font-size:12px;overflow-x:auto;white-space:nowrap;">
      <span style="color:var(--text-secondary);font-weight:600;flex-shrink:0;">Live Mode</span>
      ${connected.map(([k]) => `
        <span style="display:flex;align-items:center;gap:4px;color:var(--color-success);">
          <i data-lucide="circle-check" style="width:11px;height:11px;"></i>
          ${MODULE_META[k]?.label || k}
        </span>`).join('')}
      ${notConnected.map(([k]) => `
        <span style="display:flex;align-items:center;gap:4px;color:var(--text-tertiary);">
          <i data-lucide="circle-dashed" style="width:11px;height:11px;"></i>
          ${MODULE_META[k]?.label || k}
        </span>`).join('')}
      <a href="administration.html" style="margin-left:auto;color:var(--text-secondary);text-decoration:none;flex-shrink:0;">
        <i data-lucide="settings" style="width:11px;height:11px;"></i> Admin
      </a>
    </div>`;
  if (window.lucide) window.lucide.createIcons();
}
