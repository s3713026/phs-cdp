/**
 * empty-state.js — shared UI helper
 * Renders a "not connected" or "no data" empty state inside a container.
 *
 * Usage:
 *   import { renderEmptyState, checkNotConnected } from '../utils/empty-state.js';
 *
 *   const data = await PHSAPI.campaigns.list();
 *   if (checkNotConnected(data)) {
 *     renderEmptyState('#campaigns-mount', data);
 *     return;
 *   }
 */

/**
 * Returns true if the API response signals "not connected / no real data".
 */
export function checkNotConnected(response) {
  if (!response) return true;
  return response._dataStatus === 'not_connected';
}

/**
 * Icons per module (lucide names)
 */
const MODULE_ICONS = {
  Campaigns:     'send',
  Journeys:      'git-branch',
  Audiences:     'users',
  Customers:     'user',
  'Data Quality': 'shield-check',
  'Data Catalog': 'database',
  default:       'plug-zap',
};

const BACKEND_DOCS = {
  Mautic:         'https://docs.mautic.org/en/5.x/api',
  'CDP Postgres': null,
  RudderStack:    null,
};

/**
 * Renders an empty state card into `selector`.
 *
 * @param {string} selector    — CSS selector for the mount element
 * @param {object} apiResponse — the response object from the API (may be null)
 * @param {object} [opts]
 * @param {string} [opts.module]   — override module name
 * @param {string} [opts.action]   — CTA button label, e.g. 'Configure Mautic'
 * @param {string} [opts.actionFn] — function name to call on CTA click (string, eval'd)
 */
export function renderEmptyState(selector, apiResponse, opts = {}) {
  const el = typeof selector === 'string' ? document.querySelector(selector) : selector;
  if (!el) return;

  const module  = opts.module  || apiResponse?._module  || 'This module';
  const backend = apiResponse?._backend || '';
  const reason  = opts.reason  || apiResponse?._reason  || `${module} requires a live backend connection.`;
  const isNotConnected = checkNotConnected(apiResponse);
  const icon = MODULE_ICONS[module] || MODULE_ICONS.default;

  if (isNotConnected) {
    el.innerHTML = `
      <div class="empty-state empty-state--not-connected" style="
        display:flex;flex-direction:column;align-items:center;justify-content:center;
        padding:var(--space-16) var(--space-6);text-align:center;min-height:320px;
      ">
        <div style="
          width:64px;height:64px;border-radius:16px;
          background:var(--surface-secondary);
          display:flex;align-items:center;justify-content:center;
          margin-bottom:var(--space-5);
          border:1px solid var(--border-subtle);
        ">
          <i data-lucide="${icon}" style="width:28px;height:28px;color:var(--text-tertiary);"></i>
        </div>
        <h3 style="font-size:var(--text-base);font-weight:600;color:var(--text-primary);margin:0 0 var(--space-2);">
          ${module} — Not Connected
        </h3>
        ${backend ? `<p style="font-size:var(--text-sm);color:var(--text-secondary);margin:0 0 var(--space-3);">Requires: <strong>${backend}</strong></p>` : ''}
        <p style="font-size:var(--text-sm);color:var(--text-secondary);margin:0 0 var(--space-5);max-width:420px;line-height:1.6;">
          ${reason}
        </p>
        <div style="display:flex;gap:var(--space-3);align-items:center;flex-wrap:wrap;justify-content:center;">
          ${opts.action && opts.actionFn ? `
            <button class="btn btn--primary btn--sm" onclick="${opts.actionFn}">
              <i data-lucide="settings" style="width:14px;height:14px;"></i>
              ${opts.action}
            </button>` : ''}
          <a href="administration.html" class="btn btn--outline btn--sm">
            <i data-lucide="settings-2" style="width:14px;height:14px;"></i>
            Go to Administration
          </a>
        </div>
        <p style="font-size:11px;color:var(--text-tertiary);margin-top:var(--space-6);">
          Set <code style="background:var(--surface-secondary);padding:1px 4px;border-radius:3px;">USE_MOCK=true</code>
          in <code style="background:var(--surface-secondary);padding:1px 4px;border-radius:3px;">.env</code>
          to use demo data while this module is in development.
        </p>
      </div>`;
  } else {
    // Generic empty (data loaded, just nothing there yet)
    el.innerHTML = `
      <div class="empty-state" style="
        display:flex;flex-direction:column;align-items:center;justify-content:center;
        padding:var(--space-16) var(--space-6);text-align:center;min-height:320px;
      ">
        <div style="
          width:64px;height:64px;border-radius:16px;background:var(--surface-secondary);
          display:flex;align-items:center;justify-content:center;margin-bottom:var(--space-5);
        ">
          <i data-lucide="${icon}" style="width:28px;height:28px;color:var(--text-tertiary);"></i>
        </div>
        <h3 style="font-size:var(--text-base);font-weight:600;color:var(--text-primary);margin:0 0 var(--space-2);">
          No ${module} Yet
        </h3>
        <p style="font-size:var(--text-sm);color:var(--text-secondary);margin:0 0 var(--space-5);max-width:380px;">
          ${opts.emptyMessage || `Create your first ${module.toLowerCase()} to get started.`}
        </p>
        ${opts.createLabel && opts.createFn ? `
          <button class="btn btn--primary btn--sm" onclick="${opts.createFn}">
            <i data-lucide="plus" style="width:14px;height:14px;"></i>
            ${opts.createLabel}
          </button>` : ''}
      </div>`;
  }

  if (window.lucide) window.lucide.createIcons();
}

/**
 * Wraps a standard data-loading pattern:
 *   1. Show skeleton
 *   2. Fetch
 *   3. If not connected → renderEmptyState
 *   4. Else → call renderFn(data)
 *
 * @param {string}   selector  — mount element selector
 * @param {Function} fetchFn   — async function returning API response
 * @param {Function} renderFn  — called with response when data is real
 * @param {object}   [opts]    — forwarded to renderEmptyState
 */
export async function loadOrEmptyState(selector, fetchFn, renderFn, opts = {}) {
  const el = typeof selector === 'string' ? document.querySelector(selector) : selector;
  if (!el) return;

  // Show skeleton
  el.innerHTML = `<div style="padding:var(--space-8);text-align:center;">
    <div class="skeleton" style="height:120px;border-radius:8px;"></div>
  </div>`;

  try {
    const data = await fetchFn();
    if (checkNotConnected(data)) {
      renderEmptyState(el, data, opts);
    } else {
      renderFn(data);
    }
  } catch (err) {
    renderEmptyState(el, {
      _dataStatus: 'not_connected',
      _module: opts.module || 'Module',
      _reason: `Failed to load: ${err.message}`,
    }, opts);
  }
}
