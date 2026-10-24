/**
 * PHS CDP — Unified API Client
 *
 * Single module that all frontend pages use to communicate with the BFF.
 * Never call BFF endpoints directly from page JS — always go through this module.
 *
 * Usage:
 *   <script src="/js/api.js"></script>
 *   const customers = await PHSAPI.customers.list({ page: 1, limit: 20 });
 *
 * Configuration:
 *   Set window.PHS_API_BASE in an environment config file, or rely on the
 *   auto-detection below (localhost:3001 when developing locally).
 */

(function (global) {
  'use strict';

  // ─── Base URL resolution ──────────────────────────────────────────────────
  // Priority: window.PHS_API_BASE → localhost:3001 (dev ports) → same-origin /api
  const BASE =
    (global.PHS_API_BASE) ||
    (location.protocol === 'file:' || [5500, 5501, 3000, 4173, 8080, 8811, 8888].includes(+location.port)
      ? 'http://localhost:3001/api'
      : '/api');

  // ─── Role injection ───────────────────────────────────────────────────────
  // In production replace this with a real auth token approach.
  // For PoC / demo, use a stored role or default to 'operator'.
  function getRole() {
    return sessionStorage.getItem('phs_role') || 'operator';
  }

  // ─── Core fetch wrapper ───────────────────────────────────────────────────
  async function request(method, path, { params, body } = {}) {
    const url = new URL(BASE + path, location.href);
    if (params) {
      Object.entries(params).forEach(([k, v]) => {
        if (v !== undefined && v !== null && v !== '') {
          url.searchParams.set(k, v);
        }
      });
    }

    const headers = {
      'Content-Type': 'application/json',
      'X-PHS-Role': getRole(),
    };

    const opts = { method, headers };
    if (body) opts.body = JSON.stringify(body);

    let res;
    try {
      res = await fetch(url.toString(), opts);
    } catch (networkErr) {
      throw new PHSApiError(0, 'Unable to connect to the PHS platform. Please check your network connection.', networkErr.message);
    }

    // 204 No Content (e.g. DELETE) — no body to parse
    if (res.status === 204) return null;

    let data;
    try {
      data = await res.json();
    } catch {
      // Non-JSON response — only an error if status is not ok
      if (!res.ok) throw new PHSApiError(res.status, 'An unexpected response was received from the server.');
      return null;
    }

    if (!res.ok) {
      // Handle { error: { message } } and { message } and { error: "string" }
      const errMsg = data.message
        || (data.error && typeof data.error === 'object' ? data.error.message : data.error)
        || 'An unexpected error occurred.';
      throw new PHSApiError(res.status, errMsg, data);
    }

    return data;
  }

  const get   = (path, opts)  => request('GET',    path, opts);
  const post  = (path, body)  => request('POST',   path, { body });
  const put   = (path, body)  => request('PUT',    path, { body });
  const patch = (path, body)  => request('PATCH',  path, { body });
  const del   = (path)        => request('DELETE', path);
  const del_body = (path, body) => request('DELETE', path, { body }); // DELETE with JSON body

  // ─── Error class ─────────────────────────────────────────────────────────
  class PHSApiError extends Error {
    constructor(status, message, detail) {
      super(message);
      this.name    = 'PHSApiError';
      this.status  = status;
      this.detail  = detail;
    }
  }

  // ─── Customers ────────────────────────────────────────────────────────────
  const customers = {
    /** List customers with optional filters: { page, limit, search, lifecycle, tier } */
    list:  (params) => get('/customers', { params }),

    /** Full Customer 360 profile */
    get:   (id) => get(`/customers/${id}`),

    /** Customer's event history */
    events: (id, params) => get(`/customers/${id}/events`, { params }),

    /** Audience memberships */
    audiences: (id) => get(`/customers/${id}/audiences`),

    /** Transaction history (value bands, no exact amounts) */
    transactions: (id, params) => get(`/customers/${id}/transactions`, { params }),

    /** Consent record */
    consent: (id) => get(`/customers/${id}/consent`),

    /** Update profile attributes */
    update: (id, body) => patch(`/customers/${id}`, body),
  };

  // ─── Audiences ────────────────────────────────────────────────────────────
  const audiences = {
    /** List audiences: { page, limit, status, type, owner } */
    list:    (params) => get('/audiences', { params }),

    /** Audience detail */
    get:     (id) => get(`/audiences/${id}`),

    /** Create audience from condition builder payload */
    create:  (body) => post('/audiences', body),

    /** Update audience name / conditions */
    update:  (id, body) => patch(`/audiences/${id}`, body),

    /** Delete (soft-delete) */
    delete:  (id) => del(`/audiences/${id}`),

    /** Real-time preview — size breakdown, lifecycle distribution, sample profiles */
    preview: (id) => get(`/audiences/${id}/preview`),

    /** Paginated member list */
    members: (id, params) => get(`/audiences/${id}/members`, { params }),
  };

  // ─── Events ──────────────────────────────────────────────────────────────
  const events = {
    /** Event catalog with volume and usage stats */
    catalog: (params) => get('/events/catalog', { params }),

    /** Latest events snapshot */
    stream:  (params) => get('/events/stream', { params }),

    /**
     * Subscribe to live event stream (Server-Sent Events).
     * Returns an EventSource. Caller is responsible for closing it.
     *
     * @example
     * const es = PHSAPI.events.subscribe();
     * es.addEventListener('event', e => console.log(JSON.parse(e.data)));
     * es.onerror = () => es.close();
     */
    subscribe: () => {
      const url = BASE + '/events/stream/sse';
      return new EventSource(url);
    },
  };

  // ─── Data Sources ────────────────────────────────────────────────────────
  const sources = {
    list:   (params)       => get('/sources', { params }),
    get:    (id)           => get(`/sources/${id}`),
    create: (body)         => post('/sources', body),
    update: (id, body)     => put(`/sources/${id}`, body),
    toggle: (id, enabled)  => request('PATCH', `/sources/${id}`, { body: { enabled } }),
    delete: (id)           => del(`/sources/${id}`),
  };

  // ─── Destinations (Activation Channels) ──────────────────────────────────
  const destinations = {
    list:   (params)       => get('/destinations', { params }),
    get:    (id)           => get(`/destinations/${id}`),
    create: (body)         => post('/destinations', body),
    update: (id, body)     => put(`/destinations/${id}`, body),
    toggle: (id, enabled)  => request('PATCH', `/destinations/${id}`, { body: { enabled } }),
    delete: (id)           => del(`/destinations/${id}`),
  };

  // ─── Campaigns ───────────────────────────────────────────────────────────
  const campaigns = {
    list:   (params) => get('/campaigns', { params }),
    get:    (id)     => get(`/campaigns/${id}`),
    create: (body)   => post('/campaigns', body),
  };

  // ─── Journeys ────────────────────────────────────────────────────────────
  const journeys = {
    list:   (params) => get('/journeys', { params }),
    get:    (id)     => get(`/journeys/${id}`),
    create: (body)   => post('/journeys', body),
    update: (id, body) => patch(`/journeys/${id}`, body),
  };

  // ─── Data Quality ────────────────────────────────────────────────────────
  const dataQuality = {
    /** Overall quality scores and dimensions */
    overview: () => get('/data-quality'),
    /** Active issues list */
    issues:   (params) => get('/data-quality/issues', { params }),
    /** Per-source health */
    sources:  () => get('/data-quality/sources'),
  };

  // ─── Consent ─────────────────────────────────────────────────────────────
  const directory = {
    /** Full connector catalog (sources + destinations) */
    all:          () => get('/directory'),
    sources:      () => get('/directory/sources'),
    destinations: () => get('/directory/destinations'),
  };

  // ─── Connections (RudderStack workspaceConfig CRUD) ──────────────────────
  const connections = {
    /** Full config: sources + destinations with enriched metadata */
    all:               ()           => get('/connections'),
    // Sources
    listSources:       ()           => get('/connections/sources'),
    getSource:         (id)         => get(`/connections/sources/${id}`),
    createSource:      (body)       => post('/connections/sources', body),
    updateSource:      (id, body)   => put(`/connections/sources/${id}`, body),
    deleteSource:      (id)         => del(`/connections/sources/${id}`),
    // Destinations
    listDestinations:  (params)     => get('/connections/destinations', { params }),
    getDestination:    (id)         => get(`/connections/destinations/${id}`),
    createDestination: (body)       => post('/connections/destinations', body),
    updateDestination: (id, body)   => put(`/connections/destinations/${id}`, body),
    deleteDestination: (id)         => del(`/connections/destinations/${id}`),
    // Link / Unlink
    link:              (srcId, dstId) => post('/connections/link',   { sourceId: srcId, destinationId: dstId }),
    unlink:            (srcId, dstId) => del_body('/connections/link', { sourceId: srcId, destinationId: dstId }),
    // Reload RudderStack
    reload:            ()           => post('/connections/reload', {}),
  };

  const consent = {
    /** Workspace-level consent summary */
    overview: () => get('/consent'),
    /** Consent for a specific customer */
    customer: (id) => get(`/consent/customers/${id}`),
  };

  // ─── Utility helpers ─────────────────────────────────────────────────────

  /**
   * Render an error into a container element with a retry button.
   *
   * @param {HTMLElement} el  - Container to render into
   * @param {Error}       err - Any error (PHSApiError or generic)
   * @param {Function}   [retry] - Optional retry callback wired to button
   */
  function renderError(el, err, retry) {
    const isApi   = err instanceof PHSApiError;
    const msg     = err.message || 'Something went wrong. Please try again.';
    const retryHtml = retry
      ? `<button onclick="(${retry.toString()})()" class="btn btn-sm btn-outline" style="margin-top:12px">Try again</button>`
      : '';
    el.innerHTML = `
      <div class="api-error-state" style="padding:32px;text-align:center;color:var(--text-muted,#6b7280)">
        <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24"
             fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"
             stroke-linejoin="round" style="margin:0 auto 12px;display:block;opacity:.5">
          <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/>
          <line x1="12" y1="16" x2="12.01" y2="16"/>
        </svg>
        <p style="margin:0 0 4px;font-weight:500">${isApi && err.status === 403 ? 'Access denied' : 'Unable to load data'}</p>
        <p style="margin:0;font-size:13px">${msg}</p>
        ${retryHtml}
      </div>`;
  }

  /**
   * Render a loading skeleton into a container.
   * Replaces loading states before the API call completes.
   *
   * @param {HTMLElement} el
   * @param {number}      [rows=5]
   */
  function renderLoading(el, rows = 5) {
    const skeletons = Array.from({ length: rows }, () =>
      `<div class="skeleton-row" style="height:18px;background:var(--border,#e5e7eb);border-radius:4px;margin-bottom:10px;animation:skeleton-pulse 1.4s ease infinite;"></div>`
    ).join('');
    el.innerHTML = `
      <style>@keyframes skeleton-pulse{0%,100%{opacity:1}50%{opacity:.4}}</style>
      <div style="padding:24px">${skeletons}</div>`;
  }

  /**
   * Format a number as Vietnamese currency band string.
   * The BFF already returns bands ("₫10M – ₫50M"); this handles
   * raw numbers in case of future backend changes.
   */
  function formatVND(value) {
    if (typeof value === 'string') return value; // already formatted band
    if (typeof value !== 'number') return '—';
    if (value >= 1e9)  return `₫${(value / 1e9).toFixed(1)}B`;
    if (value >= 1e6)  return `₫${(value / 1e6).toFixed(0)}M`;
    if (value >= 1e3)  return `₫${(value / 1e3).toFixed(0)}K`;
    return `₫${value}`;
  }

  /**
   * Return a CSS class name for a lifecycle stage badge.
   */
  function lifecycleClass(stage) {
    const map = {
      'active_investor': 'badge-success',
      'new_account':     'badge-info',
      'prospect':        'badge-neutral',
      'lead':            'badge-warning',
      'dormant':         'badge-muted',
      'churn_risk':      'badge-danger',
      'vip':             'badge-premium',
    };
    return map[(stage || '').toLowerCase().replace(/\s+/g, '_')] || 'badge-neutral';
  }

  /**
   * Relative time string — "2 minutes ago", "3 days ago", etc.
   */
  function timeAgo(isoString) {
    if (!isoString) return '—';
    const diff = Date.now() - new Date(isoString).getTime();
    const s = Math.floor(diff / 1000);
    if (s <  60)   return `${s}s ago`;
    if (s < 3600)  return `${Math.floor(s / 60)}m ago`;
    if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
    return `${Math.floor(s / 86400)}d ago`;
  }

  // ─── Public API ───────────────────────────────────────────────────────────
  global.PHSAPI = {
    // Namespaces
    customers,
    audiences,
    events,
    sources,
    destinations,
    campaigns,
    journeys,
    dataQuality,
    consent,
    directory,
    connections,

    // Utilities
    renderError,
    renderLoading,
    formatVND,
    lifecycleClass,
    timeAgo,

    // Error class (for instanceof checks in page JS)
    Error: PHSApiError,

    // Config
    BASE,
    getRole,
    setRole: (role) => sessionStorage.setItem('phs_role', role),
  };

})(window);
