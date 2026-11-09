/**
 * mockGuard.js — shared helper
 * When USE_MOCK=false, never fall through to mock data.
 * Instead return a structured "not connected" response so the UI
 * can show an empty state with an explanation.
 */

const USE_MOCK = process.env.USE_MOCK === 'true';

/**
 * Returns true if the caller should use mock data.
 * Always false when USE_MOCK=false — no silent fallback.
 */
function shouldUseMock() {
  return USE_MOCK;
}

/**
 * Build a standard "module not connected" response payload.
 * The UI checks for `_dataStatus: 'not_connected'` and shows an empty state.
 *
 * @param {string} module   — human-readable module name, e.g. "Campaigns"
 * @param {string} backend  — which backend should power it, e.g. "Mautic" | "CDP Postgres"
 * @param {string} [reason] — optional extra context
 */
function notConnected(module, backend, reason = '') {
  return {
    data:        [],
    total:       0,
    _dataStatus: 'not_connected',
    _module:     module,
    _backend:    backend,
    _reason:     reason || `${module} requires a live ${backend} connection. USE_MOCK=false — no mock data returned.`,
  };
}

/**
 * Send a 200 "empty / not connected" response.
 * Use this at the end of a route when no real data was available
 * and USE_MOCK=false prevents falling back to mock.
 */
function sendNotConnected(res, module, backend, reason = '') {
  return res.json(notConnected(module, backend, reason));
}

module.exports = { shouldUseMock, notConnected, sendNotConnected, USE_MOCK };
