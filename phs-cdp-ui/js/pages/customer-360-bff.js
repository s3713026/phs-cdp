/**
 * PHS CDP — Customer 360 BFF Integration Layer
 *
 * Replaces the ES-module import of inline mock data with live BFF calls.
 * The HTML page includes this script BEFORE customer-360.js so the BFF-aware
 * functions are available when the page module initialises.
 *
 * This file is NOT a module (loaded as plain <script>) so it can patch
 * window-level globals that the module also reads.
 *
 * Mount order in customer-360.html:
 *   1. api.js              ← PHSAPI client
 *   2. customer-360-bff.js ← this file, patches module behaviour
 *   3. (module) customer-360.js  ← existing page module, unchanged
 */

(function () {
  'use strict';

  if (typeof PHSAPI === 'undefined') {
    console.warn('[C360-BFF] PHSAPI not found. BFF integration skipped.');
    return;
  }

  // ── Customer list cache for the switcher dropdown ─────────────────────────
  let _customerListCache = null;

  async function fetchCustomerList(query) {
    try {
      const res = await PHSAPI.customers.list({ search: query, limit: 20 });
      _customerListCache = res.data || res.customers || [];
      return _customerListCache;
    } catch (err) {
      console.error('[C360-BFF] Failed to load customer list:', err.message);
      return _customerListCache || [];
    }
  }

  // ── Main customer fetch ───────────────────────────────────────────────────
  async function fetchCustomer(id) {
    try {
      return await PHSAPI.customers.get(id);
    } catch (err) {
      console.error(`[C360-BFF] Failed to load customer ${id}:`, err.message);
      return null;
    }
  }

  // ── Expose on window so the module can call them ──────────────────────────
  window.PHSC360 = {
    fetchCustomer,
    fetchCustomerList,
    getCache: () => _customerListCache,
  };

  // Pre-warm the customer list so the switcher feels instant
  fetchCustomerList('').then(list => {
    console.log(`[C360-BFF] Pre-warmed ${list.length} customers`);
  });

})();
