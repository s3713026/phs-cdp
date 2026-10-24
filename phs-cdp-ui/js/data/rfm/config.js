/*
  PHS CDP — shared RFM configuration.

  WHY localStorage: this app is a traditional multi-page app (every
  .html is a full page load), not a single-page app — in-memory JS
  state cannot survive navigating from the RFM Analytics page to
  Customer 360. localStorage is the only mechanism available to make
  "a configuration change in Analytics is reflected in Customer 360"
  true, and it is the SAME pattern already established in this app
  (js/pages/customer-360.js's recommendation-status store). This is
  explicitly BROWSER-LOCAL persistence only — it does not survive a
  different browser, device, or a cleared site data action, and there
  is no multi-user/cross-session sharing. That limitation is disclosed
  in the Analytics page UI, not just here in a comment.

  Both the RFM Analytics page and Customer 360's RFM view call
  loadRfmConfig() and hand the result to js/data/rfm/engine.js — the
  engine is the only place RFM numbers are computed either way.
*/

import { REFERENCE_DATE } from "./fixtures.js";

const STORAGE_KEY = "phs-cdp-rfm-config-v1";

export const DEFAULT_RFM_CONFIG = {
  lookbackDays: 30,
  assetTypes: [], // empty = all supported asset types
  managementChannel: "All", // "All" | "Self-directed" | "Broker-managed"
  branchId: "All",
  brokerId: "All",
  rMetric: "lastOrder", // "lastOrder" | "lastLogin"
  mMetric: "transactionValue", // "transactionValue" | "brokerageFee" | "nav"
  referenceDate: REFERENCE_DATE, // fixed in this prototype — not independently user-editable
};

let memoryFallback = { ...DEFAULT_RFM_CONFIG };

export function loadRfmConfig() {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_RFM_CONFIG };
    const parsed = JSON.parse(raw);
    return { ...DEFAULT_RFM_CONFIG, ...parsed };
  } catch {
    return { ...memoryFallback };
  }
}

export function saveRfmConfig(config) {
  const merged = { ...DEFAULT_RFM_CONFIG, ...config };
  memoryFallback = merged;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(merged));
  } catch {
    // localStorage unavailable (private browsing, quota, etc.) — the
    // in-memory fallback above still works for the current page, it
    // just won't carry over to a different page load.
  }
  return merged;
}

export function resetRfmConfig() {
  return saveRfmConfig({ ...DEFAULT_RFM_CONFIG });
}
