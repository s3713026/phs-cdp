import {
  DESTINATIONS,
  DESTINATION_CATEGORIES,
  DESTINATION_STATUSES,
  DATA_STREAMS,
  STREAM_META,
  STREAM_DELIVERY_OPTIONS,
  DELIVERY_MODES,
  DESTINATION_TYPES,
  STATUS_META,
  DESTINATION_ICONS,
  CAPABILITY_ROWS,
  isCapabilitySupported,
  resolveAudiences,
  resolveJourneys,
  resolveDataFlow,
  ADD_DESTINATION_CATALOG,
  getDestinationTemplate,
  getUsersThroughConnector,
  getConnectorActivity,
  summarizeActivity,
  formatActivityTimestamp,
  ACTIVITY_AUDIENCE_OPTIONS,
  DATE_RANGE_PRESETS,
  MOCK_TODAY,
  AUTH_TYPES,
  SYNC_FREQUENCIES,
  ADVANCED_FIELD_DEFS,
  getConnectionKind,
  getConnectionFields,
  DESTINATION_EVENT_CATALOG,
  PROVIDERS,
  getProvider,
  providerCapabilities,
  classifyDestinationType,
  dataSelectionSummary,
  mappingRowsForAccount,
  connectionAccountsForProvider,
  EVENT_CATEGORIES,
  eventsByCategory,
  EVENT_PROPERTIES,
  PROFILE_ATTRIBUTE_GROUPS,
  PROFILE_ATTRIBUTES,
  defaultProfileAttributeIds,
  CONSENT_TYPES,
  CONSENT_CHANNELS,
  MESSAGE_CHANNELS,
  AUDIENCE_MEMBERSHIP_MODES,
} from "../data/destinations.js";
import { AUDIENCES } from "../data/audiences.js";
import {
  SOURCES,
  SOURCE_TYPES,
  SOURCE_STATUSES,
  SOURCE_ICONS,
  SOURCE_DATA_STREAMS,
  SOURCE_PROVIDERS,
  sourceProviderCapabilities,
  resolveSourceDataFlow,
  ADD_SOURCE_CATALOG,
  getSourceTemplate,
  getUsersThroughSource,
  getSourceActivity,
  summarizeSourceActivity,
  formatSourceActivityTimestamp,
  sourceDataSelectionSummary,
} from "../data/sources.js";
import { getStoredColumns, initColumnManager, initFilterPanel, countActiveFilters } from "../components/connector-directory.js";
import { initAllDropdowns } from "../components/dropdown.js";
import { openSourceWizard, closeSourceWizard } from "./source-wizard.js";
import { openDestWizard, closeDestWizard, configFieldsForType, collectConfigFromForm } from "./dest-wizard.js";
import { getDestConfig } from "./dest-configs.js";

/* ---------------------------------------------------------------- */
/* Shared state                                                       */
/* ---------------------------------------------------------------- */
let destinations = [...DESTINATIONS].map(d => ({
  ...d,
  deliveryConfig:   d.deliveryConfig   || { mode: "Stream", retries: 3, timeout: 30 },
  connectionConfig: d.connectionConfig || {},
  consentConfig:    d.consentConfig    || { required: false, purposes: [] },
  advancedConfig:   d.advancedConfig   || {},
  mappingConfig:    d.mappingConfig    || { mappings: [] },
  connection:       d.connection       || {},
  provider:         d.provider         || d.name || "Unknown",
  category:         d.category         || "Other",
  destinationType:  d.destinationType  || d.category || "Other",
  purpose:          d.purpose          || "Data Integration",
}));

// ── BFF integration ────────────────────────────────────────────────────────
// Mock data is the source of truth for this prototype (see the Phase
// 17 "use mock data layer" direction) — this probe is intentionally
// non-blocking and never replaces `destinations` wholesale. The BFF
// mock client's response shape doesn't carry the connection/
// deliveryConfig/consentConfig fields the detail view depends on
// (those are only computed by the DESTINATIONS.forEach normalization
// in js/data/destinations.js), so swapping them in previously crashed
// the Configuration tab with "Cannot read properties of undefined
// (reading 'account')" on every row — a pre-existing bug, not
// something introduced by the Sources/Destinations page split.

// Map destinationDefinitionId → display metadata
function resolveDestMeta(defId) {
  const id = (defId || '').toUpperCase();
  if (id === 'MAUTIC')     return { provider: 'Mautic',     category: 'Marketing',    destinationType: 'Marketing Automation', purpose: 'Audience Activation' };
  if (id === 'POSTGRES')   return { provider: 'PostgreSQL',  category: 'Data',         destinationType: 'Warehouse',            purpose: 'Data Storage' };
  if (id === 'WEBHOOK')    return { provider: 'Webhook',     category: 'Integration',  destinationType: 'Webhook',              purpose: 'Event Forwarding' };
  if (id === 'BIGQUERY')   return { provider: 'BigQuery',    category: 'Data',         destinationType: 'Warehouse',            purpose: 'Analytics' };
  if (id === 'SNOWFLAKE')  return { provider: 'Snowflake',   category: 'Data',         destinationType: 'Warehouse',            purpose: 'Analytics' };
  if (id === 'S3')         return { provider: 'Amazon S3',   category: 'Storage',      destinationType: 'Object Storage',       purpose: 'File Storage' };
  if (id === 'AMPLITUDE')  return { provider: 'Amplitude',   category: 'Analytics',    destinationType: 'Analytics',            purpose: 'Product Analytics' };
  if (id === 'GA4' || id === 'GOOGLE_ANALYTICS_4') return { provider: 'Google Analytics 4', category: 'Analytics', destinationType: 'Analytics', purpose: 'Web Analytics' };
  if (id === 'FACEBOOK_PIXEL' || id === 'META') return { provider: 'Meta Ads', category: 'Advertising', destinationType: 'Advertising', purpose: 'Audience Targeting' };
  if (id === 'EMAIL')        return { provider: 'Email',        category: 'Engagement',  destinationType: 'Email',              purpose: 'Customer Engagement' };
  if (id === 'PUSH')         return { provider: 'Push',         category: 'Engagement',  destinationType: 'Push Notification',  purpose: 'Customer Engagement' };
  if (id === 'SMS')          return { provider: 'SMS',          category: 'Engagement',  destinationType: 'SMS',                purpose: 'Customer Engagement' };
  if (id === 'ONE_SIGNAL' || id === 'ONESIGNAL') return { provider: 'Push', category: 'Engagement', destinationType: 'Push Notification', purpose: 'Customer Engagement' };
  if (id === 'FIREBASE')   return { provider: 'Push',         category: 'Engagement',  destinationType: 'Push Notification',  purpose: 'Customer Engagement' };
  if (id === 'SLACK')      return { provider: 'Slack',        category: 'Integration', destinationType: 'Messaging',          purpose: 'Team Notifications' };
  if (id === 'HUBSPOT')    return { provider: 'CRM',          category: 'CRM / Business', destinationType: 'CRM',             purpose: 'Lead Management' };
  if (id === 'SALESFORCE') return { provider: 'CRM',          category: 'CRM / Business', destinationType: 'CRM',             purpose: 'Customer Management' };
  if (id === 'MIXPANEL')   return { provider: 'Analytics Platform', category: 'Analytics', destinationType: 'Analytics',      purpose: 'Product Analytics' };
  if (id === 'INTERCOM')   return { provider: 'CRM',          category: 'CRM / Business', destinationType: 'Customer Support', purpose: 'Customer Support' };
  return { provider: defId || 'Unknown', category: 'Integration', destinationType: 'Other', purpose: 'Data Integration' };
}

// Return the most sensible default dataStream for a given provider name.
function defaultDataStreamForProvider(provider) {
  const p = (provider || '').toLowerCase();
  if (p === 'mautic' || p === 'crm' || p.includes('salesforce') || p.includes('hubspot')) return 'Audience';
  if (p === 'push' || p === 'email' || p === 'sms' || p.includes('message') || p.includes('zalo') || p.includes('in-app')) return 'Message';
  if (p === 'postgresql' || p === 'bigquery' || p === 'snowflake' || p.includes('warehouse') || p.includes('amazon s3')) return 'Event';
  if (p === 'meta ads' || p === 'google ads' || p.includes('ads')) return 'Audience';
  if (p === 'analytics platform' || p.includes('mixpanel') || p.includes('amplitude') || p.includes('google analytics')) return 'Event';
  return 'Event'; // safe default — covers Webhook, HTTP API, unknown
}

async function loadDestinationsFromBFF() {
  if (typeof PHSAPI === 'undefined') return;
  try {
    const res = await PHSAPI.destinations.list();
    const list = Array.isArray(res) ? res : (res?.data ?? []);
    if (!list.length) return;                     // BFF empty → keep mock

    // BFF has data → replace mock entirely
    const now = new Date().toISOString().slice(0, 10);
    destinations = list.map(bff => {
      const mock = DESTINATIONS.find(d => d.id === bff.id) || {};
      const meta = resolveDestMeta(bff.destinationDefinitionId || bff.typeId);
      return {
        ...mock,
        id:               bff.id,
        name:             bff.name            || mock.name            || bff.id,
        provider:         meta.provider,
        category:         meta.category,
        destinationType:  meta.destinationType,
        purpose:          meta.purpose,
        type:             meta.provider,
        typeId:           bff.destinationDefinitionId || bff.typeId || mock.typeId,
        status:           bff.enabled         ? 'Connected'           : 'Disconnected',
        enabled:          bff.enabled         ?? mock.enabled         ?? true,
        dataStream:       DATA_STREAMS.includes(mock.dataStream) ? mock.dataStream : defaultDataStreamForProvider(meta.provider),
        dataSelection:    mock.dataSelection  || { mode: 'all', eventIds: [], eventProperties: {}, audienceIds: [], attributeIds: [], types: [], template: '' },
        connection:       (() => {
          // Build best-effort connection from available data
          const base = mock.connection || {};
          const cfg  = bff.config || {};
          const flat = typeof cfg === 'object' ? cfg : {};
          // Map known RudderStack config keys → UI connection keys
          const mapped = { ...base };
          // Account/name
          if (flat.account)     mapped.account     = flat.account;
          if (flat.name)        mapped.account     = mapped.account || flat.name;
          // URL-based providers
          if (flat.url)         mapped.account     = mapped.account || flat.url;
          if (flat.apiBaseUrl)  mapped.apiBaseUrl  = flat.apiBaseUrl;
          if (flat.baseUrl)     mapped.apiBaseUrl  = mapped.apiBaseUrl || flat.baseUrl;
          // Webhook
          if (flat.webhookUrl)  mapped.webhookUrl  = flat.webhookUrl;
          if (flat.url && meta.provider === 'Webhook') mapped.webhookUrl = mapped.webhookUrl || flat.url;
          if (flat.method)      mapped.method      = flat.method;
          if (flat.headers)     mapped.headers     = Array.isArray(flat.headers) ? flat.headers : [];
          // Auth
          if (flat.authType)    mapped.authType    = flat.authType;
          // Provider-specific: OneSignal/Firebase
          if (flat.appId)       mapped.account     = mapped.account || flat.appId;
          if (flat.apiKey)      mapped.account     = mapped.account || flat.apiKey;
          if (flat.restApiKey)  mapped.account     = mapped.account || flat.restApiKey;
          // Keep remaining RS config for provider config section
          Object.assign(mapped, flat);
          return mapped;
        })(),
        deliveryConfig:   mock.deliveryConfig || { mode: 'Stream', syncFrequency: null },
        connectionConfig: mock.connectionConfig || {},
        consentConfig:    mock.consentConfig  || { required: false, activationPolicy: 'Follows workspace data-use policy.' },
        advancedConfig:   mock.advancedConfig || { requestTimeout: '10000', maxAttempts: '3', noOfWorkers: '4', maxBatchSize: '1000' },
        mappingConfig:    mock.mappingConfig  || { mappings: [] },
        configuration:    mock.configuration  || [],
        audiences:        mock.audiences      || [],
        journeys:         mock.journeys       || [],
        dataFlowId:       mock.dataFlowId     || null,
        lastSync:         mock.lastSync       || '—',
        lastEdit:         mock.lastEdit       || now,
        createdAt:        mock.createdAt      || now,
        owner:            mock.owner          || 'System',
        usersBase7d:      mock.usersBase7d    || 0,
        error:            mock.error          || null,
        activity:         mock.activity       || [{ time: now, text: 'Loaded from RudderStack config' }],
      };
    });

    renderDestSummary();
    renderDestTable();
    console.log('[Destinations] BFF data loaded —', destinations.length, 'destinations (mock replaced)');
  } catch (e) {
    console.warn('[Destinations] BFF unavailable, using mock:', e.message);
  }
}

// Map sourceDefinitionId → display metadata
function resolveSourceMeta(defId) {
  const id = (defId || '').toLowerCase();
  if (id === 'javascript' || id === 'js') return { provider: 'JavaScript', category: 'Client-side', sourceType: 'Web' };
  if (id === 'android')   return { provider: 'Android',    category: 'Mobile',       sourceType: 'Mobile App' };
  if (id === 'ios')       return { provider: 'iOS',         category: 'Mobile',       sourceType: 'Mobile App' };
  if (id === 'node' || id === 'nodejs') return { provider: 'Node.js', category: 'Server-side', sourceType: 'Backend' };
  if (id === 'python')    return { provider: 'Python',      category: 'Server-side',  sourceType: 'Backend' };
  if (id === 'http' || id === 'http api') return { provider: 'HTTP API', category: 'Server-side', sourceType: 'API' };
  if (id === 'crm')       return { provider: 'CRM',         category: 'Business',     sourceType: 'CRM' };
  if (id === 'warehouse') return { provider: 'Warehouse',   category: 'Data',         sourceType: 'Warehouse' };
  return { provider: defId || 'Unknown', category: 'Other', sourceType: defId || 'Unknown' };
}

async function loadSourcesFromBFF() {
  if (typeof PHSAPI === 'undefined') return;
  try {
    const res = await PHSAPI.sources.list();
    const list = Array.isArray(res) ? res : (res?.data ?? []);
    if (!list.length) return;                     // BFF empty → keep mock

    // BFF has data → replace mock entirely
    const now = new Date().toISOString().slice(0, 10);
    sources = list.map(s => {
      const mock = SOURCES.find(m => m.id === s.id) || {};
      const meta = resolveSourceMeta(s.sourceDefinitionId || s.typeId);
      return {
        ...mock,
        id:               s.id,
        name:             s.name              || mock.name              || s.id,
        provider:         meta.provider,
        category:         meta.category,
        sourceType:       meta.sourceType,
        type:             meta.provider,
        status:           s.enabled           ? 'Connected'            : 'Disconnected',
        enabled:          s.enabled           ?? mock.enabled          ?? true,
        writeKey:         s.writeKey          || mock.writeKey         || '',
        destinationCount: Array.isArray(s.destinations) ? s.destinations.length : (mock.destinationCount || 0),
        destinations:     Array.isArray(s.destinations) ? s.destinations        : (Array.isArray(mock.destinations) ? mock.destinations : []),
        dataStream:       mock.dataStream     || 'Events',
        deliveryConfig:   mock.deliveryConfig || { mode: 'Stream', retries: 3, timeout: 30 },
        lastSync:         mock.lastSync       || '—',
        lastEdit:         mock.lastEdit       || now,
        createdAt:        mock.createdAt      || now,
        owner:            mock.owner          || 'System',
        eventsBase7d:     mock.eventsBase7d   || 0,
        error:            mock.error          || null,
        activity:         mock.activity       || [{ time: now, text: 'Loaded from RudderStack config' }],
      };
    });

    renderSourceSummary();
    renderSourceTable();
    console.log('[Sources] BFF data loaded —', sources.length, 'sources (mock replaced)');
  } catch (e) {
    console.warn('[Sources] BFF unavailable, using mock:', e.message);
  }
}
let sources = [...SOURCES].map(s => ({
  ...s,
  deliveryConfig:  s.deliveryConfig  || { mode: "Stream", retries: 3, timeout: 30 },
  provider:        s.provider        || s.name || "Unknown",
  category:        s.category        || "Other",
  sourceType:      s.sourceType      || s.category || "Other",
  destinations:    Array.isArray(s.destinations) ? s.destinations : [],
}));

const destFilterState = { query: "", status: [], destinationType: [], category: [], dataType: [], delivery: [] };
const sourceFilterState = { query: "", status: [], sourceType: [], category: [], dataType: [], delivery: [] };
let destDateFilter = { preset: "Last 7 days", from: "", to: "" };
let sourceDateFilter = { preset: "Last 7 days", from: "", to: "" };
let destVisibleColumns = [];
let sourceVisibleColumns = [];
let currentDestDetailId = null;
let currentSourceDetailId = null;
const destActivityFilter = { audienceName: "all", dataType: "all", status: "all" };
const sourceActivityFilter = { dataType: "all", status: "all" };

const ICON_LOOKUP = { ...DESTINATION_ICONS, ...SOURCE_ICONS };

function normalize(str) {
  return String(str).toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
}
function refreshIcons() {
  if (window.lucide) window.lucide.createIcons();
}
function makeInteractive(el, onActivate) {
  el.setAttribute("tabindex", "0");
  el.setAttribute("role", "button");
  el.addEventListener("click", onActivate);
  el.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onActivate();
    }
  });
}
function iconFor(name) {
  return ICON_LOOKUP[name] || "share-2";
}
function streamBadge(stream) {
  return `<span class="badge badge--neutral badge--dest-tag"><i data-lucide="${STREAM_META[stream]?.icon || "circle"}"></i>${stream}</span>`;
}
function deliveryBadge(mode) {
  return `<span class="badge badge--neutral badge--dest-tag">${mode}</span>`;
}
function statusBadge(status) {
  const meta = STATUS_META[status] || STATUS_META.Available;
  return `<span class="status-dot ${meta.dot}">${status}</span>`;
}
function fmt(n) {
  return n.toLocaleString();
}

/* ================================================================ */
/* DESTINATIONS — table columns                                       */
/* ================================================================ */
const DEST_COLUMNS = [
  { key: "destination", label: "Provider / Destination" },
  { key: "connectionAccount", label: "Connection Account" },
  { key: "sources", label: "Sources" },
  { key: "dataStream", label: "Data Stream" },
  { key: "dataSelection", label: "Data Selection" },
  { key: "delivery", label: "Delivery" },
  { key: "status", label: "Status" },
  { key: "users", label: "Users Through Connection" },
  { key: "lastSync", label: "Last Sync" },
  { key: "lastEdit", label: "Last Edit" },
  { key: "created", label: "Created" },
  { key: "destinationType", label: "Destination Type" },
  { key: "category", label: "Category" },
  { key: "owner", label: "Owner" },
];
// Default set leads with the RudderStack Destinations reference's own
// columns (Destination, Status, Sources) ahead of this prototype's
// richer existing fields, which stay available via Edit columns.
const DEST_DEFAULT_COLUMNS = ["destination", "connectionAccount", "status", "sources", "dataStream", "lastSync"];
const DEST_COLUMNS_STORAGE_KEY = "phs-cdp-destination-columns-v3";

// No explicit Source<->Destination connection graph exists in the mock
// data (RudderStack models this as admin-configured routing per
// source). Derived here from matching, non-Draft dataStream type as an
// honest stand-in — grounded in real fields, not a fabricated number.
// See the Connections/Sources/Destinations refactor report for this
// assumption, which needs confirming against real RudderStack config
// before this becomes anything other than illustrative.
function destinationsForSource(s) {
  return DESTINATIONS.filter((d) => d.dataStream === s.dataStream && d.status !== "Draft");
}
function sourcesForDestination(d) {
  return SOURCES.filter((s) => s.dataStream === d.dataStream && s.status !== "Draft");
}
function relatedCountHTML(list, singular, pluralOverride) {
  if (!list.length) return `<span class="cell-muted">—</span>`;
  const label = list.length === 1 ? singular : pluralOverride || `${singular}s`;
  return `<span class="tabular-nums">${list.length} ${label}</span>`;
}

// Avoids "Connector connector" when a template's own category is
// already literally "Connector" (or ends with that word).
function connectorDescription(template) {
  if (!template) return "Prototype connector";
  return /connector$/i.test(template.category) ? template.category : `${template.category} connector`;
}

function destCellHTML(key, d) {
  switch (key) {
    case "destination":
      return `<div class="dest-cell"><span class="dest-cell__icon"><i data-lucide="${iconFor(d.provider)}"></i></span><div><div class="dest-cell__name">${d.provider}</div><div class="dest-cell__type">${d.category}</div></div></div>`;
    case "connectionAccount":
      return `<span class="cell-primary">${d.name}</span>`;
    case "sources":
      return relatedCountHTML(sourcesForDestination(d), "source");
    case "destinationType":
      return `<span class="cell-muted">${d.destinationType}</span>`;
    case "category":
      return `<span class="cell-muted">${d.category}</span>`;
    case "dataStream":
      return streamBadge(d.dataStream);
    case "dataSelection":
      return `<span class="cell-muted">${dataSelectionSummary(d)}</span>`;
    case "delivery":
      return deliveryBadge(d.deliveryConfig.mode);
    case "status":
      return statusBadge(d.status);
    case "users": {
      const users = getUsersThroughConnector(d, destDateFilter);
      return `<div class="dest-users-cell"><span class="tabular-nums">${fmt(users)}</span><span class="dest-users-cell__period">${destDateFilter.preset}</span></div>`;
    }
    case "lastSync":
      return `<span class="cell-muted tabular-nums">${d.lastSync}</span>`;
    case "lastEdit":
      return `<span class="cell-muted tabular-nums">${d.lastEdit}</span>`;
    case "created":
      return `<span class="cell-muted tabular-nums">${d.createdAt}</span>`;
    case "owner":
      return `<span class="cell-muted">${d.owner}</span>`;
    default:
      return "";
  }
}

function renderTableHead(theadEl, columns, visibleKeys, numericKeys = []) {
  theadEl.innerHTML = `<tr>${columns
    .filter((c) => visibleKeys.includes(c.key))
    .map((c) => `<th${numericKeys.includes(c.key) ? ' class="num"' : ""}>${c.label}</th>`)
    .join("")}<th></th></tr>`;
}

function destRowActionsHTML(d) {
  const items = [`<button class="dropdown__item" data-row-action="view"><i data-lucide="eye"></i> View</button>`];
  if (d.status === "Available") {
    items.push(`<button class="dropdown__item" data-row-action="configure"><i data-lucide="settings-2"></i> Configure</button>`);
  } else {
    items.push(`<button class="dropdown__item" data-row-action="edit"><i data-lucide="pencil"></i> Edit</button>`);
    if (d.status === "Error") {
      items.push(`<button class="dropdown__item" data-row-action="reconnect"><i data-lucide="link-2"></i> Reconnect</button>`);
    } else if (d.status === "Connected") {
      items.push(`<button class="dropdown__item" data-row-action="pause"><i data-lucide="pause"></i> Pause</button>`);
    } else if (d.status === "Paused") {
      items.push(`<button class="dropdown__item" data-row-action="resume"><i data-lucide="play"></i> Resume</button>`);
    }
    items.push(`<button class="dropdown__item" data-row-action="test"><i data-lucide="plug-2"></i> Test Connection</button>`);
  }
  items.push(`<button class="dropdown__item dropdown__item--danger" data-row-action="delete" style="color:var(--color-error,#ef4444)"><i data-lucide="trash-2"></i> Delete</button>`);
  return `<button class="table-row-menu-trigger" data-row-menu-trigger aria-label="Row actions" onclick="event.stopPropagation()" data-row-menu-html='${encodeURIComponent(items.join(""))}' ><i data-lucide="more-horizontal"></i></button>`;
}


// ── Body-level row-action popover (avoids table overflow:hidden clipping) ─────
let _rowMenuPopover = null;
let _rowMenuCurrentBtn = null;

function ensureRowMenuPopover() {
  if (_rowMenuPopover) return _rowMenuPopover;
  const el = document.createElement("div");
  el.id = "row-action-popover";
  el.setAttribute("role", "menu");
  el.style.cssText = [
    "position:fixed","z-index:9999",
    "background:#ffffff",
    "border:1px solid #e5e7eb",
    "border-radius:8px",
    "box-shadow:0 4px 24px rgba(0,0,0,.15)",
    "padding:4px","min-width:160px","display:none",
  ].join(";");
  document.body.appendChild(el);
  document.addEventListener("click", (e) => {
    if (_rowMenuPopover && !_rowMenuPopover.contains(e.target) && e.target !== _rowMenuCurrentBtn)
      closeRowMenuPopover();
  });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeRowMenuPopover(); });
  _rowMenuPopover = el;
  return el;
}

function closeRowMenuPopover() {
  if (!_rowMenuPopover) return;
  _rowMenuPopover.style.display = "none";
  _rowMenuCurrentBtn = null;
}

function openRowMenuPopover(triggerBtn, htmlContent, onAction) {
  const popover = ensureRowMenuPopover();
  popover.innerHTML = htmlContent;
  popover.querySelectorAll("[data-row-action]").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      closeRowMenuPopover();
      const rowEl = triggerBtn.closest("[data-dest-row],[data-source-row]");
      onAction(rowEl, btn.dataset.rowAction);
    });
  });
  if (window.lucide) window.lucide.createIcons({ el: popover });
  const rect = triggerBtn.getBoundingClientRect();
  popover.style.display = "block";
  const pw = popover.offsetWidth, ph = popover.offsetHeight;
  const vw = window.innerWidth,   vh = window.innerHeight;
  let left = rect.right - pw;
  if (left < 8) left = rect.left;
  if (left + pw > vw - 8) left = vw - pw - 8;
  let top = rect.bottom + 4;
  if (top + ph > vh - 8) top = rect.top - ph - 4;
  popover.style.left = left + "px";
  popover.style.top  = top  + "px";
  _rowMenuCurrentBtn = triggerBtn;
}

function initTableRowMenus(container, onAction) {
  container.querySelectorAll("[data-row-menu-trigger]").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      if (_rowMenuCurrentBtn === btn && _rowMenuPopover?.style.display !== "none") {
        closeRowMenuPopover(); return;
      }
      const html = decodeURIComponent(btn.dataset.rowMenuHtml || "");
      if (!html) return;
      openRowMenuPopover(btn, html, onAction);
    });
  });
}

function passesDestFilters(d) {
  const q = normalize(destFilterState.query);
  const matchesSearch = !q || normalize(d.name).includes(q) || normalize(d.provider).includes(q) || normalize(d.category).includes(q) || normalize(d.destinationType).includes(q);
  const matchesStatus = !destFilterState.status.length || destFilterState.status.includes(d.status);
  const matchesType = !destFilterState.destinationType.length || destFilterState.destinationType.includes(d.destinationType);
  const matchesCategory = !destFilterState.category.length || destFilterState.category.includes(d.category);
  const matchesDataType = !destFilterState.dataType.length || destFilterState.dataType.includes(d.dataStream);
  const matchesDelivery = !destFilterState.delivery.length || destFilterState.delivery.includes(d.deliveryConfig.mode);
  return matchesSearch && matchesStatus && matchesType && matchesCategory && matchesDataType && matchesDelivery;
}

function renderDestSummary() {
  const mount = document.querySelector("[data-dest-summary]");
  if (!mount) return;
  const connected = destinations.filter((d) => d.status === "Connected").length;
  const available = destinations.filter((d) => d.status === "Available").length;
  const activeSyncs = destinations.filter((d) => d.status === "Connected" && (d.deliveryConfig.mode === "Batch" || d.deliveryConfig.mode === "Stream")).length;
  const errors = destinations.filter((d) => d.status === "Error").length;
  mount.innerHTML = `
    <div class="metric-row">
      <div class="metric metric--success"><span class="metric__label">Connected</span><div class="metric__value-row"><span class="metric__value" style="font-size: var(--text-xl);">${connected}</span></div></div>
      <div class="metric"><span class="metric__label">Available</span><div class="metric__value-row"><span class="metric__value" style="font-size: var(--text-xl);">${available}</span></div></div>
      <div class="metric metric--primary"><span class="metric__label">Active Syncs</span><div class="metric__value-row"><span class="metric__value" style="font-size: var(--text-xl);">${activeSyncs}</span></div></div>
      <div class="metric metric--danger"><span class="metric__label">Recent Errors</span><div class="metric__value-row"><span class="metric__value" style="font-size: var(--text-xl);">${errors}</span></div></div>
    </div>`;
}

function renderDestTable() {
  const thead = document.querySelector("[data-dest-thead]");
  const tbody = document.querySelector("[data-dest-table] tbody");
  if (!thead || !tbody) return;
  renderTableHead(thead, DEST_COLUMNS, destVisibleColumns, ["users"]);

  const filtered = destinations.filter(passesDestFilters);
  if (!filtered.length) {
    tbody.innerHTML = `<tr><td colspan="${destVisibleColumns.length + 1}" class="table__empty">No destinations match your search and filters.</td></tr>`;
    return;
  }
  tbody.innerHTML = filtered
    .map(
      (d) => `
    <tr data-dest-row="${d.id}">
      ${DEST_COLUMNS.filter((c) => destVisibleColumns.includes(c.key))
        .map((c) => `<td>${destCellHTML(c.key, d)}</td>`)
        .join("")}
      <td>${destRowActionsHTML(d)}</td>
    </tr>`
    )
    .join("");

  tbody.querySelectorAll("[data-dest-row]").forEach((row) => {
    row.style.cursor = "pointer";
    makeInteractive(row, () => openDestDetail(row.dataset.destRow));
  });
  initTableRowMenus(tbody, (rowEl, action) => {
    handleDestRowAction(rowEl.dataset.destRow, action);
  });
  refreshIcons();
}

function handleDestRowAction(id, action) {
  const d = findDestination(id);
  if (!d) return;
  if (action === "view" || action === "edit" || action === "configure") {
    openDestDetail(id);
    if (action === "edit" || action === "configure") setTimeout(() => openDestEdit(d), 150);
  } else if (action === "pause") {
    openDestDetail(id);
    setTimeout(() => openPause(d), 150);
  } else if (action === "resume") {
    d.status = "Connected";
    d.lastSync = MOCK_TODAY + " · 10:00";
    renderDestSummary();
    renderDestTable();
  } else if (action === "reconnect") {
    d.status = "Connected";
    delete d.error;
    d.lastSync = MOCK_TODAY + " · 10:00";
    renderDestSummary();
    renderDestTable();
  } else if (action === "test") {
    openTestConnectionModal();
  } else if (action === "delete") {
    if (confirm(`Delete "${d.name}"? This cannot be undone.`)) {
      const idx = destinations.findIndex(x => x.id === id);
      if (idx !== -1) destinations.splice(idx, 1);
      renderDestSummary();
      renderDestTable();
    }
  }
}

function initDestFilters() {
  const search = document.querySelector("[data-dest-search]");
  search.addEventListener("input", (e) => {
    destFilterState.query = e.target.value;
    renderDestTable();
  });

  const quickRange = document.querySelector("[data-dest-quickrange]");
  quickRange.innerHTML = DATE_RANGE_PRESETS.filter((p) => p !== "Custom range")
    .map((p) => `<option value="${p}"${p === destDateFilter.preset ? " selected" : ""}>${p}</option>`)
    .join("");
  quickRange.addEventListener("change", (e) => {
    destDateFilter = { preset: e.target.value, from: "", to: "" };
    renderDestTable();
  });

  initColumnManager({
    triggerEl: document.querySelector("[data-dest-columns-trigger]"),
    panelEl: document.querySelector("[data-dest-columns-panel]"),
    storageKey: DEST_COLUMNS_STORAGE_KEY,
    columns: DEST_COLUMNS,
    defaultKeys: DEST_DEFAULT_COLUMNS,
    requiredKey: "destination",
    onApply: (keys) => {
      destVisibleColumns = keys;
      renderDestTable();
    },
  });

  const filterFields = [
    { key: "status", label: "Status", type: "multiselect", options: DESTINATION_STATUSES },
    { key: "destinationType", label: "Destination Type", type: "multiselect", options: DESTINATION_TYPES },
    { key: "category", label: "Category", type: "multiselect", options: DESTINATION_CATEGORIES },
    { key: "dataType", label: "Data Stream", type: "multiselect", options: DATA_STREAMS },
    { key: "delivery", label: "Delivery", type: "multiselect", options: DELIVERY_MODES },
  ];
  const filterTrigger = document.querySelector("[data-dest-filter-trigger]");
  const filterCount = document.querySelector("[data-dest-filter-count]");
  function updateFilterCount() {
    const n = countActiveFilters(destFilterState, filterFields);
    filterCount.hidden = n === 0;
    filterCount.textContent = n;
  }
  initFilterPanel({
    triggerEl: filterTrigger,
    panelEl: document.querySelector("[data-dest-filter-panel]"),
    fields: filterFields,
    getState: () => destFilterState,
    onApply: (state) => {
      Object.assign(destFilterState, state);
      updateFilterCount();
      renderDestTable();
    },
    onClear: () => {
      filterFields.forEach((f) => (destFilterState[f.key] = []));
      updateFilterCount();
      renderDestTable();
    },
  });
  updateFilterCount();
}

/* ---------------------------------------------------------------- */
/* Destination detail                                                 */
/* ---------------------------------------------------------------- */
function findDestination(id) {
  return destinations.find((d) => d.id === id);
}

function showDestView(view) {
  document.querySelector("[data-view-destinations-list]").hidden = view !== "list";
  document.querySelector("[data-view-destinations-detail]").hidden = view !== "detail";
  window.scrollTo({ top: 0 });
}

function openDestDetail(id) {
  const d = findDestination(id);
  if (!d) return;
  currentDestDetailId = id;
  destActivityFilter.audienceName = "all";
  destActivityFilter.dataType = "all";
  destActivityFilter.status = "all";

  renderDestDetailHeader(d);
  renderDestOverviewTab(d);
  renderDestActivityTab(d);
  renderDestMappingTab(d);
  renderDestConfigurationTab(d);
  showDestView("detail");
  document.getElementById("dest-tab-overview")?.click();
  refreshIcons();
}

function renderDestDetailHeader(d) {
  const header = document.querySelector("[data-dest-detail-header]");
  header.innerHTML = `
    <div class="dest-detail__header">
      <span class="dest-detail__icon"><i data-lucide="${iconFor(d.provider)}"></i></span>
      <div>
        <div class="page-header__eyebrow"><i data-lucide="share-2" style="width:13px;height:13px;"></i> ${d.provider} · ${d.destinationType}</div>
        <h1 class="page-header__title">${d.name}</h1>
        <div class="cluster gap-2" style="margin-top: var(--space-2);">${statusBadge(d.status)}</div>
      </div>
    </div>`;

  const actions = document.querySelector("[data-dest-detail-actions]");
  const canSync = d.status === "Connected" && (d.deliveryConfig.mode === "Batch" || d.deliveryConfig.mode === "Stream");
  actions.innerHTML = `
    ${d.status === "Error" ? `<button class="btn btn--primary btn--sm" data-reconnect><i data-lucide="link-2"></i> Reconnect</button>` : ""}
    ${canSync ? `<button class="btn btn--outline btn--sm" data-sync-now><i data-lucide="refresh-cw"></i> Sync Now</button>` : ""}
    ${d.status === "Paused" ? `<button class="btn btn--outline btn--sm" data-resume><i data-lucide="play"></i> Resume</button>` : ""}
    ${d.status === "Connected" ? `<button class="btn btn--outline btn--sm" data-pause><i data-lucide="pause"></i> Pause</button>` : ""}
    <button class="btn btn--outline btn--sm" data-edit-config-open><i data-lucide="pencil"></i> Edit</button>`;
  refreshIcons();

  actions.querySelector("[data-sync-now]")?.addEventListener("click", () => openSyncNow(d));
  actions.querySelector("[data-pause]")?.addEventListener("click", () => openPause(d));
  actions.querySelector("[data-resume]")?.addEventListener("click", () => {
    d.status = "Connected";
    d.lastSync = MOCK_TODAY + " · 10:00";
    refreshDestAfterStatusChange(d);
  });
  actions.querySelector("[data-reconnect]")?.addEventListener("click", () => {
    d.status = "Connected";
    delete d.error;
    d.lastSync = MOCK_TODAY + " · 10:00";
    refreshDestAfterStatusChange(d);
  });
  actions.querySelector("[data-edit-config-open]")?.addEventListener("click", () => openDestEdit(d));
}

function refreshDestAfterStatusChange(d) {
  renderDestSummary();
  renderDestTable();
  renderDestDetailHeader(d);
  renderDestOverviewTab(d);
}

function renderDestOverviewTab(d) {
  const mount = document.querySelector("[data-tab-overview]");
  const audiences = resolveAudiences(d);
  const journeys = resolveJourneys(d);
  const flow = resolveDataFlow(d);
  const users = getUsersThroughConnector(d, destDateFilter);

  mount.innerHTML = `
    <section class="section">
      <div class="section__body dest-summary-grid">
        <div class="attr-item"><span class="attr-item__label">Provider</span><span class="attr-item__value">${d.provider}</span></div>
        <div class="attr-item"><span class="attr-item__label">Connection Account</span><span class="attr-item__value">${d.name}</span></div>
        <div class="attr-item"><span class="attr-item__label">Data Stream</span><span class="attr-item__value">${streamBadge(d.dataStream)}</span></div>
        <div class="attr-item"><span class="attr-item__label">Data Selection</span><span class="attr-item__value">${dataSelectionSummary(d)}</span></div>
        <div class="attr-item"><span class="attr-item__label">Delivery</span><span class="attr-item__value">${deliveryBadge(d.deliveryConfig.mode)}</span></div>
        <div class="attr-item"><span class="attr-item__label">Connection Status</span><span class="attr-item__value">${statusBadge(d.status)}</span></div>
        <div class="attr-item"><span class="attr-item__label">Category</span><span class="attr-item__value">${d.category}</span></div>
        <div class="attr-item"><span class="attr-item__label">Users Through Connection</span><span class="attr-item__value tabular-nums">${fmt(users)}</span></div>
        <div class="attr-item"><span class="attr-item__label">Reporting Period</span><span class="attr-item__value">${destDateFilter.preset}</span></div>
        <div class="attr-item"><span class="attr-item__label">Last Sync</span><span class="attr-item__value tabular-nums">${d.lastSync}</span></div>
        <div class="attr-item"><span class="attr-item__label">Last Edit</span><span class="attr-item__value tabular-nums">${d.lastEdit}</span></div>
        <div class="attr-item"><span class="attr-item__label">Created</span><span class="attr-item__value tabular-nums">${d.createdAt}</span></div>
        <div class="attr-item"><span class="attr-item__label">Owner</span><span class="attr-item__value">${d.owner}</span></div>
      </div>
    </section>

    ${
      d.status === "Error"
        ? `<section class="section"><div class="section__body">
        <div class="dest-consent-note" style="border-color: var(--color-danger-100); background: var(--color-danger-50); color: var(--color-danger-700);">
          <i data-lucide="shield-alert" style="color: var(--color-danger-600);"></i>
          <span><strong>${d.error}</strong> — last successful sync ${d.lastSuccessfulSync}.</span>
        </div></div></section>`
        : ""
    }

    <section class="section">
      <div class="dest-direction section__body">
        <span class="dest-direction__node"><i data-lucide="server"></i> PHS CDP</span>
        <span class="dest-direction__arrow"><i data-lucide="arrow-right"></i></span>
        <span class="dest-direction__node"><i data-lucide="${iconFor(d.provider)}"></i> ${d.provider} — ${d.name}</span>
      </div>
    </section>

    <section class="section">
      <div class="section__header"><div><h2 class="section__title">Capabilities</h2></div></div>
      <div class="section__body">
        <div class="dest-capability-list">
          ${CAPABILITY_ROWS.map((row) => {
            const supported = isCapabilitySupported(d, row);
            return `<div class="dest-capability-row"><span>${row}</span><span class="dest-capability-row__status dest-capability-row__status--${supported ? "yes" : "no"}"><i data-lucide="${supported ? "circle-check" : "circle-x"}"></i>${supported ? "Supported" : "Not Supported"}</span></div>`;
          }).join("")}
        </div>
      </div>
    </section>

    ${
      d.consentRequired
        ? `<section class="section"><div class="section__header"><div><h2 class="section__title">Consent</h2></div></div><div class="section__body">
        <div class="dest-consent-note"><i data-lucide="shield-check"></i><span><strong>${d.consentRequired}</strong> required before this destination is used for customer communication. Prototype representation only — this does not implement or claim legal compliance.</span></div>
      </div></section>`
        : d.destinationType === "Audience Destination"
        ? `<section class="section"><div class="section__header"><div><h2 class="section__title">Activation Purpose</h2></div></div><div class="section__body">
        <div class="dest-consent-note"><i data-lucide="info"></i><span>Purpose: ${d.purpose}. Consent is managed through audience eligibility and activation policy, not enforced directly by this destination.</span></div>
      </div></section>`
        : ""
    }

    <section class="section">
      <div class="section__header"><div><h2 class="section__title">Active Audiences</h2><p class="section__subtitle">Audiences currently activated to this destination.</p></div></div>
      <div class="section__body">
        ${
          audiences.length
            ? audiences
                .map(
                  (a) => `<div class="dest-related-row"><span class="dest-related-row__name">${a.name}</span><span class="dest-related-row__meta"><span class="badge ${a.status === "Active" ? "badge--success" : "badge--neutral"}">${a.status}</span><span class="tabular-nums">${fmt(a.memberCount)} members</span></span></div>`
                )
                .join("")
            : `<p class="dest-empty-note">No audiences are currently activated to this destination.</p>`
        }
      </div>
    </section>

    <section class="section">
      <div class="section__header"><div><h2 class="section__title">Used by Journeys</h2></div></div>
      <div class="section__body">
        ${
          journeys.length
            ? journeys.map((j) => `<div class="dest-related-row"><span class="dest-related-row__name">${j.name}</span><span class="dest-related-row__meta"><span class="badge ${j.status === "Active" ? "badge--success" : "badge--neutral"}">${j.status}</span></span></div>`).join("")
            : `<p class="dest-empty-note">No journeys currently activate to this destination.</p>`
        }
      </div>
    </section>

    <section class="section" style="margin-bottom: 0;">
      <div class="section__header"><div><h2 class="section__title">Data Flow</h2><p class="section__subtitle">Conceptual data movement — see Data Flows for the full map.</p></div></div>
      <div class="section__body">
        ${
          flow
            ? `<div class="dest-flow-ref"><span class="font-mono">PHS CDP</span><span class="dest-flow-ref__arrow"><i data-lucide="arrow-right"></i></span><span class="font-mono">${flow.name}</span><span style="margin-left: auto;" class="cluster gap-2"><span class="badge badge--neutral badge--dest-tag">${flow.dataTypes.join(" + ")}</span><span class="badge badge--neutral badge--dest-tag">${flow.deliveryMode.toUpperCase()}</span></span></div>`
            : `<p class="dest-empty-note">No conceptual Data Flow record exists for this destination yet.</p>`
        }
      </div>
    </section>`;
  refreshIcons();
}

function renderDestActivityTab(d) {
  const mount = document.querySelector("[data-tab-activity]");
  const entries = getConnectorActivity(d.id, { dateFilter: destDateFilter, ...destActivityFilter });
  const summary = summarizeActivity(entries);

  mount.innerHTML = `
    <section class="section">
      <div class="section__header"><div><h2 class="section__title">Activity</h2><p class="section__subtitle">Monitor data activated through this destination.</p></div></div>
      <div class="section__body">
        <div class="cluster gap-3" style="flex-wrap: wrap; margin-bottom: var(--space-5);">
          <div class="select select--sm" style="width: 150px;">
            <select data-activity-daterange>${DATE_RANGE_PRESETS.filter((p) => p !== "Custom range").map((p) => `<option value="${p}"${p === destDateFilter.preset ? " selected" : ""}>${p}</option>`).join("")}</select>
            <i class="select__chevron" data-lucide="chevron-down"></i>
          </div>
          <div class="select select--sm" style="width: 200px;">
            <select data-activity-audience><option value="all">All Audiences</option>${ACTIVITY_AUDIENCE_OPTIONS.map((a) => `<option value="${a}"${destActivityFilter.audienceName === a ? " selected" : ""}>${a}</option>`).join("")}</select>
            <i class="select__chevron" data-lucide="chevron-down"></i>
          </div>
          <div class="select select--sm" style="width: 140px;">
            <select data-activity-datatype><option value="all">All Data Streams</option>${DATA_STREAMS.map((t) => `<option value="${t}"${destActivityFilter.dataType === t ? " selected" : ""}>${t}</option>`).join("")}</select>
            <i class="select__chevron" data-lucide="chevron-down"></i>
          </div>
          <div class="select select--sm" style="width: 140px;">
            <select data-activity-status><option value="all">All Statuses</option><option value="Completed"${destActivityFilter.status === "Completed" ? " selected" : ""}>Completed</option><option value="Failed"${destActivityFilter.status === "Failed" ? " selected" : ""}>Failed</option></select>
            <i class="select__chevron" data-lucide="chevron-down"></i>
          </div>
        </div>
        <div class="dest-activity-summary">
          <div class="metric metric--primary"><span class="metric__label">Users</span><div class="metric__value-row"><span class="metric__value tabular-nums" style="font-size: var(--text-lg);">${fmt(summary.users)}</span></div></div>
          <div class="metric"><span class="metric__label">Events / Records</span><div class="metric__value-row"><span class="metric__value tabular-nums" style="font-size: var(--text-lg);">${fmt(summary.records)}</span></div></div>
          <div class="metric metric--success"><span class="metric__label">Successful</span><div class="metric__value-row"><span class="metric__value tabular-nums" style="font-size: var(--text-lg);">${summary.successRate.toFixed(1)}%</span></div></div>
          <div class="metric metric--danger"><span class="metric__label">Failed</span><div class="metric__value-row"><span class="metric__value tabular-nums" style="font-size: var(--text-lg);">${summary.failedRate.toFixed(1)}%</span></div></div>
        </div>
      </div>
    </section>
    <section class="section" style="margin-bottom: 0;">
      <div class="section__body">
        <div class="table-wrap">
          <table class="table table--dense">
            <thead><tr><th>Timestamp</th><th>Audience / Trigger</th><th>Data Type</th><th class="num">Users</th><th class="num">Records</th><th>Status</th></tr></thead>
            <tbody>
              ${
                entries.length
                  ? entries
                      .map(
                        (e) => `<tr>
                  <td class="cell-muted tabular-nums">${formatActivityTimestamp(e)}</td>
                  <td class="cell-primary">${e.trigger || "—"}</td>
                  <td>${streamBadge(e.dataType)}</td>
                  <td class="num tabular-nums">${fmt(e.users)}</td>
                  <td class="num tabular-nums">${fmt(e.records)}</td>
                  <td><span class="badge ${e.status === "Completed" ? "badge--success" : "badge--danger"}">${e.status}</span></td>
                </tr>`
                      )
                      .join("")
                  : `<tr><td colspan="6" class="table__empty">No activity in this period.</td></tr>`
              }
            </tbody>
          </table>
        </div>
      </div>
    </section>`;
  refreshIcons();

  mount.querySelector("[data-activity-daterange]").addEventListener("change", (e) => {
    destDateFilter = { preset: e.target.value, from: "", to: "" };
    document.querySelector("[data-dest-quickrange]").value = e.target.value;
    renderDestActivityTab(d);
    renderDestOverviewTab(d);
    renderDestTable();
  });
  mount.querySelector("[data-activity-audience]").addEventListener("change", (e) => {
    destActivityFilter.audienceName = e.target.value;
    renderDestActivityTab(d);
  });
  mount.querySelector("[data-activity-datatype]").addEventListener("change", (e) => {
    destActivityFilter.dataType = e.target.value;
    renderDestActivityTab(d);
  });
  mount.querySelector("[data-activity-status]").addEventListener("change", (e) => {
    destActivityFilter.status = e.target.value;
    renderDestActivityTab(d);
  });
}

function renderDestMappingTab(d) {
  const mount = document.querySelector("[data-tab-mapping]");
  const rows = mappingRowsForAccount(d);
  mount.innerHTML = `
    <section class="section" style="margin-bottom: 0;">
      <div class="section__header"><div><h2 class="section__title">Data Mapping</h2><p class="section__subtitle">Depends on this connection account's Data Stream (${d.dataStream}). Sensitive fields are shown as field names only.</p></div></div>
      <div class="section__body">
        <div class="table-wrap">
          <table class="table">
            <thead><tr><th>CDP Field</th><th>Destination Field</th></tr></thead>
            <tbody>${rows.length ? rows.map((m) => `<tr><td class="cell-primary">${m.cdp}</td><td class="cell-muted font-mono">${m.dest}</td></tr>`).join("") : `<tr><td colspan="2" class="table__empty">No fields selected yet.</td></tr>`}</tbody>
          </table>
        </div>
      </div>
    </section>`;
}

function connectionSummaryRows(d) {
  const fields = getConnectionFields(d.provider);
  const rows = [];
  fields.forEach((f) => {
    if (f.type === "authType") {
      rows.push({ label: f.label, value: d.connection.authType || "None" });
      if (d.connection.authType && d.connection.authType !== "None") rows.push({ label: "Credential", value: "••••••••••••", masked: true });
    } else if (f.type === "headers") {
      rows.push({ label: f.label, value: (d.connection.headers || []).length ? d.connection.headers.join(", ") : "Default" });
    } else {
      rows.push({ label: f.label, value: d.connection[f.key] || "—" });
    }
  });
  return rows;
}
function dataSelectionSummaryRows(d) {
  const sel = d.dataSelection || {};
  const rows = [{ label: "Data Stream", value: d.dataStream }];
  if (d.dataStream === "Profile") {
    rows.push({ label: "Attributes", value: (sel.attributeIds || []).map((id) => PROFILE_ATTRIBUTES.find((a) => a.id === id)?.label || id).join(", ") || "None selected" });
  } else if (d.dataStream === "Event") {
    rows.push({ label: "Events", value: sel.mode === "all" ? "All events" : (sel.eventIds || []).join(", ") || "None selected" });
  } else if (d.dataStream === "Audience") {
    rows.push({ label: "Audiences", value: sel.mode === "all" ? "All eligible audiences" : (sel.audienceIds || []).join(", ") || "None selected" });
    rows.push({ label: "Membership Mode", value: sel.membershipMode || "Dynamic" });
  } else if (d.dataStream === "Message") {
    rows.push({ label: "Channel", value: sel.channel || "—" });
    rows.push({ label: "Template", value: sel.template || "No template" });
    rows.push({ label: "Consent Requirement", value: sel.consentRequirement || "Marketing Consent" });
  } else if (d.dataStream === "Consent") {
    rows.push({ label: "Consent Types", value: (sel.types || []).join(", ") || "None selected" });
    rows.push({ label: "Channels", value: (sel.channels || []).join(", ") || "None selected" });
  }
  return rows;
}
function deliverySummaryRows(d) {
  const rows = [{ label: "Delivery Mode", value: d.deliveryConfig.mode }];
  if (d.deliveryConfig.mode === "Batch") rows.push({ label: "Sync Frequency", value: d.deliveryConfig.syncFrequency || "Every hour" });
  else if (d.deliveryConfig.mode === "Stream") rows.push({ label: "Delivery Speed", value: "Near real-time" });
  else rows.push({ label: "Delivery Speed", value: "Immediate" });
  return rows;
}
function consentSummaryRows(d) {
  if (d.consentConfig.required) {
    return [
      { label: "Consent Required", value: "Yes" },
      { label: "Consent Policy", value: (d.consentConfig.policy || []).join(", ") || "Marketing Consent" },
    ];
  }
  return [{ label: "Activation Policy", value: d.consentConfig.activationPolicy || "Follows workspace data-use policy." }];
}

function configListHTML(rows) {
  return `<div class="dest-config-list">${rows.map((c) => `<div class="dest-config-row"><span class="dest-config-row__label">${c.label}</span><span class="dest-config-row__value${c.masked ? " dest-config-row__value--masked" : ""}">${c.value || "—"}</span></div>`).join("")}</div>`;
}

function renderDestConfigurationTab(d) {
  const mount = document.querySelector("[data-tab-configuration]");
  mount.innerHTML = `
    <section class="section">
      <div class="section__header">
        <div><h2 class="section__title">Configuration</h2><p class="section__subtitle">Prototype configuration only — secrets are always masked and never real.</p></div>
        <button class="btn btn--outline btn--sm" data-edit-config-open-tab><i data-lucide="pencil"></i> Edit Destination</button>
      </div>
      <div class="section__body stack gap-6">
        <div><p class="subhead" style="margin-bottom: var(--space-2);">Connection</p>${configListHTML(connectionSummaryRows(d))}</div>
        <div><p class="subhead" style="margin-bottom: var(--space-2);">Data</p>${configListHTML(dataSelectionSummaryRows(d))}</div>
        <div><p class="subhead" style="margin-bottom: var(--space-2);">Delivery</p>${configListHTML(deliverySummaryRows(d))}</div>
        ${d.dataStream === "Consent" ? "" : `<div><p class="subhead" style="margin-bottom: var(--space-2);">${d.consentConfig.required ? "Consent" : "Activation Policy"}</p>${configListHTML(consentSummaryRows(d))}</div>`}
      </div>
    </section>
    <section class="section" style="margin-bottom: 0;">
      <div class="section__body">
        <button class="btn btn--outline btn--sm" data-tab-test-connection><i data-lucide="plug-2"></i> Test Connection</button>
      </div>
    </section>`;
  refreshIcons();
  mount.querySelector("[data-edit-config-open-tab]")?.addEventListener("click", () => openDestEdit(d));
  mount.querySelector("[data-tab-test-connection]")?.addEventListener("click", openTestConnectionModal);
}

/* ================================================================ */
/* Shared Destination Configuration form — the SAME schema and form   */
/* renders both Add Destination (mode "create") and the full-page     */
/* Edit Destination workspace (mode "edit"). Never build two forms.   */
/* ================================================================ */
/** Empty/default Data Selection for a freshly chosen Data Stream — used
 * both when Add Destination's stream picker changes and as the base
 * shape buildDestinationDraft() clones from for an existing account. */
function defaultDataSelectionFor(stream) {
  switch (stream) {
    case "Profile":
      return { attributeIds: defaultProfileAttributeIds() };
    case "Event":
      return { mode: "all", eventIds: [], eventProperties: {} };
    case "Audience":
      return { mode: "all", audienceIds: [], membershipMode: "Dynamic" };
    case "Message":
      return { channel: MESSAGE_CHANNELS[0], template: "", consentRequirement: "Marketing Consent" };
    case "Consent":
      return { types: [], channels: [] };
    default:
      return {};
  }
}
function cloneDataSelection(stream, sel = {}) {
  const base = defaultDataSelectionFor(stream);
  switch (stream) {
    case "Profile":
      return { attributeIds: [...(sel.attributeIds || base.attributeIds)] };
    case "Event":
      return { mode: sel.mode || base.mode, eventIds: [...(sel.eventIds || [])], eventProperties: JSON.parse(JSON.stringify(sel.eventProperties || {})) };
    case "Audience":
      return { mode: sel.mode || base.mode, audienceIds: [...(sel.audienceIds || [])], membershipMode: sel.membershipMode || base.membershipMode };
    case "Message":
      return { channel: sel.channel || base.channel, template: sel.template || "", consentRequirement: sel.consentRequirement || base.consentRequirement };
    case "Consent":
      return { types: [...(sel.types || [])], channels: [...(sel.channels || [])] };
    default:
      return {};
  }
}

function buildDestinationDraft(destination) {
  // Normalize dataStream: BFF dests without a mock may have 'All' or missing values
  const dataStream = DATA_STREAMS.includes(destination.dataStream)
    ? destination.dataStream
    : defaultDataStreamForProvider(destination.provider);
  // Normalize deliveryConfig to current shape
  const deliveryConfig = destination.deliveryConfig && destination.deliveryConfig.syncFrequency !== undefined
    ? { ...destination.deliveryConfig }
    : { mode: destination.deliveryConfig?.mode || 'Stream', syncFrequency: destination.deliveryConfig?.syncFrequency || null };
  // Normalize consentConfig to current shape
  const consentConfig = destination.consentConfig || { required: false, activationPolicy: '' };
  return {
    name: destination.name,
    provider: destination.provider,
    destinationType: destination.destinationType,
    category: destination.category,
    dataStream,
    dataSelection: cloneDataSelection(dataStream, destination.dataSelection),
    connection: { ...destination.connection, headers: [...(destination.connection?.headers || [])] },
    deliveryConfig,
    consentConfig: { ...consentConfig, policy: [...(consentConfig.policy || [])] },
    advancedConfig: { requestTimeout: '10000', maxAttempts: '3', noOfWorkers: '4', maxBatchSize: '1000', ...(destination.advancedConfig || {}) },
  };
}

function validateDestinationDraft(draft) {
  const kind = getConnectionKind(draft.provider);
  const errors = {};
  if (!draft.name || !draft.name.trim()) errors.name = "Connection Account Name is required.";
  const urlPattern = /^https?:\/\/.+/i;
  if (kind === "webhook") {
    if (!draft.connection.webhookUrl || !urlPattern.test(draft.connection.webhookUrl)) errors.webhookUrl = "Enter a valid URL (starting with http:// or https://).";
    if (!draft.connection.method) errors.method = "Method is required.";
  } else if (kind === "httpApi") {
    if (!draft.connection.baseUrl || !urlPattern.test(draft.connection.baseUrl)) errors.baseUrl = "Enter a valid URL (starting with http:// or https://).";
    if (!draft.connection.method) errors.method = "Method is required.";
  } else if (kind === "account") {
    if (!draft.connection.account || !draft.connection.account.trim()) errors.account = "Account is required.";
    // authType is optional — BFF dests from RudderStack may not have it configured in our UI
  } else if (kind === "accountUrl") {
    if (!draft.connection.account || !draft.connection.account.trim()) errors.account = "Account is required.";
  } else if (kind === "provider") {
    // provider kind (Email/Push/SMS) — account field is optional, provider handles auth via its own config
  }
  // Data Stream selection validation (section 20).
  const sel = draft.dataSelection;
  if (draft.dataStream === "Profile" && (!sel.attributeIds || !sel.attributeIds.length)) errors.dataSelection = "Select at least one profile attribute.";
  if (draft.dataStream === "Event" && sel.mode === "selected" && !sel.eventIds.length) errors.dataSelection = "Select at least one event, or choose All Events.";
  if (draft.dataStream === "Audience" && sel.mode === "selected" && !sel.audienceIds.length) errors.dataSelection = "Select at least one audience, or choose All eligible audiences.";
  // Message template is optional in edit mode — campaigns manage templates separately
  if (draft.dataStream === "Consent" && !sel.types.length) errors.dataSelection = "Select at least one consent type.";
  return errors;
}

function streamPickerHTML(draft, capabilities, locked) {
  if (locked) {
    return `
      <div class="dest-form-section">
        <p class="dest-form-section__title">Data Stream</p>
        <p class="dest-form-section__hint">A Connection Account carries exactly one Data Stream. To send a different kind of data, create a separate connection account for this provider.</p>
        <div class="dest-form-readonly"><i data-lucide="${STREAM_META[draft.dataStream]?.icon || "circle"}"></i> ${draft.dataStream} — ${STREAM_META[draft.dataStream]?.description || ""}</div>
        <button type="button" class="dest-setup-guide-link" data-dcf-create-another style="margin-top: var(--space-3);"><i data-lucide="plus-circle"></i> Create another connection</button>
      </div>`;
  }
  return `
    <div class="dest-form-section">
      <p class="dest-form-section__title">Data Stream</p>
      <p class="dest-form-section__hint">Choose exactly one. "Behavior" is not a Data Stream — it's a category inside Event.</p>
      <div class="dest-stream-picker">
        ${DATA_STREAMS.map((s) => {
          const supported = capabilities.includes(s);
          return `
          <label class="dest-stream-card${draft.dataStream === s ? " is-selected" : ""}${supported ? "" : " is-disabled"}">
            <input type="radio" name="dcf-stream" data-dcf-stream value="${s}" ${draft.dataStream === s ? "checked" : ""} ${supported ? "" : "disabled"} />
            <span class="dest-stream-card__icon"><i data-lucide="${STREAM_META[s].icon}"></i></span>
            <span class="dest-stream-card__name">${s}</span>
            <span class="dest-stream-card__desc">${STREAM_META[s].description}</span>
            ${supported ? "" : `<span class="dest-stream-card__note">Not supported by this provider</span>`}
          </label>`;
        }).join("")}
      </div>
    </div>`;
}

function dataSelectionSectionHTML(draft, errors) {
  const stream = draft.dataStream;
  const sel = draft.dataSelection;
  const err = errors.dataSelection ? `<p class="dest-form-error">${errors.dataSelection}</p>` : "";

  if (stream === "Profile") {
    return `
      <div class="dest-form-section">
        <p class="dest-form-section__title">Profile Attribute Selection</p>
        ${PROFILE_ATTRIBUTE_GROUPS.map(
          (g) => `
          <p class="field__label" style="margin: var(--space-3) 0 var(--space-2);">${g.group}</p>
          <div class="dest-form-check-grid">
            ${g.attributes
              .map(
                (a) =>
                  `<label${a.sensitive ? ' class="dest-attr--sensitive"' : ""}><input type="checkbox" data-dcf-attribute value="${a.id}" ${sel.attributeIds.includes(a.id) ? "checked" : ""} /> ${a.label}${a.sensitive ? ' <span class="badge badge--neutral badge--dest-tag">Sensitive</span>' : ""}${a.banded ? ' <span class="badge badge--neutral badge--dest-tag">Banded</span>' : ""}${a.note ? ` <span class="dest-form-section__hint" style="display:inline;">(${a.note})</span>` : ""}</label>`
              )
              .join("")}
          </div>`
        ).join("")}
        ${err}
      </div>`;
  }

  if (stream === "Event") {
    const groups = eventsByCategory();
    return `
      <div class="dest-form-section">
        <p class="dest-form-section__title">Event Selection</p>
        <div class="dest-form-check-grid">
          <label><input type="radio" name="dcf-event-mode" data-dcf-event-mode value="all" ${sel.mode === "all" ? "checked" : ""} /> All Events</label>
          <label><input type="radio" name="dcf-event-mode" data-dcf-event-mode value="selected" ${sel.mode === "selected" ? "checked" : ""} /> Selected Events</label>
        </div>
        ${
          sel.mode === "selected"
            ? EVENT_CATEGORIES.map(
                (cat) => `
              <div class="dest-form-subgroup">
                <p class="field__label" style="margin-bottom: var(--space-2); text-transform: uppercase; font-size: 11px; letter-spacing: 0.04em;">${cat}</p>
                <div class="dest-form-check-grid">
                  ${groups[cat]
                    .map((ev) => {
                      const checked = sel.eventIds.includes(ev);
                      const props = EVENT_PROPERTIES[ev];
                      return `
                      <label><input type="checkbox" data-dcf-event value="${ev}" ${checked ? "checked" : ""} /> ${ev}</label>
                      ${
                        checked && props
                          ? `<div class="dest-form-subgroup dest-form-check-grid" style="margin-left: var(--space-5);">${props
                              .map(
                                (p) =>
                                  `<label><input type="checkbox" data-dcf-event-property data-event="${ev}" value="${p.key}" ${(sel.eventProperties[ev] || []).includes(p.key) ? "checked" : ""} /> ${p.label}${p.banded ? ' <span class="badge badge--neutral badge--dest-tag">Banded</span>' : ""}</label>`
                              )
                              .join("")}</div>`
                          : ""
                      }`;
                    })
                    .join("")}
                </div>
              </div>`
              ).join("")
            : ""
        }
        ${err}
      </div>`;
  }

  if (stream === "Audience") {
    const activeAudiences = AUDIENCES.filter((a) => a.status === "Active").map((a) => a.name);
    return `
      <div class="dest-form-section">
        <p class="dest-form-section__title">Audience Selection</p>
        <div class="dest-form-check-grid">
          <label><input type="radio" name="dcf-audience-mode" data-dcf-audience-mode value="all" ${sel.mode === "all" ? "checked" : ""} /> All eligible audiences</label>
          <label><input type="radio" name="dcf-audience-mode" data-dcf-audience-mode value="selected" ${sel.mode === "selected" ? "checked" : ""} /> Selected audiences</label>
        </div>
        ${
          sel.mode === "selected"
            ? `<div class="dest-form-subgroup dest-form-check-grid">${activeAudiences.map((name) => `<label><input type="checkbox" data-dcf-audience value="${name}" ${sel.audienceIds.includes(name) ? "checked" : ""} /> ${name}</label>`).join("")}</div>`
            : ""
        }
        ${err}
        <p class="field__label" style="margin: var(--space-4) 0 var(--space-2);">Membership Mode</p>
        <div class="select select--sm" style="width: 220px;"><select data-dcf-membership-mode>${AUDIENCE_MEMBERSHIP_MODES.map((m) => `<option value="${m}"${sel.membershipMode === m ? " selected" : ""}>${m}</option>`).join("")}</select><i class="select__chevron" data-lucide="chevron-down"></i></div>
        <p class="dest-form-section__hint" style="margin-top: var(--space-2);">Dynamic: membership updates automatically. Batch Snapshot: periodic export.</p>
      </div>`;
  }

  if (stream === "Message") {
    return `
      <div class="dest-form-section">
        <p class="dest-form-section__title">Channel</p>
        <div class="dest-form-check-grid">
          ${MESSAGE_CHANNELS.map((c) => `<label><input type="radio" name="dcf-channel" data-dcf-channel value="${c}" ${sel.channel === c ? "checked" : ""} /> ${c}</label>`).join("")}
        </div>
        <p class="field__label" style="margin: var(--space-4) 0 var(--space-2);">Template</p>
        <div class="field__control"><input class="input" data-dcf-template value="${sel.template || ""}" placeholder="e.g. Birthday Greeting" /></div>
        ${err}
        <p class="field__label" style="margin: var(--space-4) 0 var(--space-2);">Consent Requirement</p>
        <div class="dest-form-readonly">${sel.consentRequirement}</div>
        <p class="dest-form-section__hint" style="margin-top: var(--space-2);">Message represents customer-facing communication, not a generic data export.</p>
      </div>`;
  }

  if (stream === "Consent") {
    return `
      <div class="dest-form-section">
        <p class="dest-form-section__title">Consent Types</p>
        <div class="dest-form-check-grid">${CONSENT_TYPES.map((t) => `<label><input type="checkbox" data-dcf-consent-type value="${t}" ${sel.types.includes(t) ? "checked" : ""} /> ${t}</label>`).join("")}</div>
        ${err}
        <p class="field__label" style="margin: var(--space-4) 0 var(--space-2);">Channels</p>
        <div class="dest-form-check-grid">${CONSENT_CHANNELS.map((c) => `<label><input type="checkbox" data-dcf-consent-channel value="${c}" ${sel.channels.includes(c) ? "checked" : ""} /> ${c}</label>`).join("")}</div>
        <p class="dest-form-section__hint" style="margin-top: var(--space-2);">Consent is customer permission / preference data — never classified as Behavior.</p>
      </div>`;
  }
  return "";
}

/** Wires the Data Selection inputs rendered by dataSelectionSectionHTML
 * — shared by the Destination form and the Source form, since both
 * read/write the same `draft.dataSelection` shape per Data Stream. */
function wireDataSelection(mount, draft, render) {
  mount.querySelectorAll("[data-dcf-attribute]").forEach((box) => box.addEventListener("change", () => { draft.dataSelection.attributeIds = [...mount.querySelectorAll("[data-dcf-attribute]:checked")].map((b) => b.value); }));
  mount.querySelectorAll("[data-dcf-event-mode]").forEach((r) => r.addEventListener("change", (e) => { draft.dataSelection.mode = e.target.value; render(); }));
  mount.querySelectorAll("[data-dcf-event]").forEach((box) =>
    box.addEventListener("change", () => {
      draft.dataSelection.eventIds = [...mount.querySelectorAll("[data-dcf-event]:checked")].map((b) => b.value);
      render();
    })
  );
  mount.querySelectorAll("[data-dcf-event-property]").forEach((box) =>
    box.addEventListener("change", () => {
      const ev = box.dataset.event;
      draft.dataSelection.eventProperties[ev] = [...mount.querySelectorAll(`[data-dcf-event-property][data-event="${ev}"]:checked`)].map((b) => b.value);
    })
  );
  mount.querySelectorAll("[data-dcf-audience-mode]").forEach((r) => r.addEventListener("change", (e) => { draft.dataSelection.mode = e.target.value; render(); }));
  mount.querySelectorAll("[data-dcf-audience]").forEach((box) => box.addEventListener("change", () => { draft.dataSelection.audienceIds = [...mount.querySelectorAll("[data-dcf-audience]:checked")].map((b) => b.value); }));
  mount.querySelector("[data-dcf-membership-mode]")?.addEventListener("change", (e) => (draft.dataSelection.membershipMode = e.target.value));
  mount.querySelectorAll("[data-dcf-channel]").forEach((r) => r.addEventListener("change", (e) => (draft.dataSelection.channel = e.target.value)));
  mount.querySelector("[data-dcf-template]")?.addEventListener("input", (e) => (draft.dataSelection.template = e.target.value));
  mount.querySelectorAll("[data-dcf-consent-type]").forEach((box) => box.addEventListener("change", () => { draft.dataSelection.types = [...mount.querySelectorAll("[data-dcf-consent-type]:checked")].map((b) => b.value); }));
  mount.querySelectorAll("[data-dcf-consent-channel]").forEach((box) => box.addEventListener("change", () => { draft.dataSelection.channels = [...mount.querySelectorAll("[data-dcf-consent-channel]:checked")].map((b) => b.value); }));
}

/** Connection field rendering shared by both the Destination form and
 * the lighter Source form — same field descriptors, same masking. */
function connectionFieldsHTML(fields, connection, errors) {
  return fields
    .map((f) => {
      if (f.type === "select") {
        return `<div class="field"><label class="field__label">${f.label}${f.required ? ' <span style="color: var(--color-danger-600);">*</span>' : ""}</label><div class="select select--sm"><select data-cf-connection="${f.key}">${f.options.map((o) => `<option value="${o}"${connection[f.key] === o ? " selected" : ""}>${o}</option>`).join("")}</select><i class="select__chevron" data-lucide="chevron-down"></i></div>${errors[f.key] ? `<p class="dest-form-error">${errors[f.key]}</p>` : ""}</div>`;
      }
      if (f.type === "authType") {
        return `
          <div class="field"><label class="field__label">${f.label}</label><div class="select select--sm"><select data-cf-connection="authType">${AUTH_TYPES.map((o) => `<option value="${o}"${connection.authType === o ? " selected" : ""}>${o}</option>`).join("")}</select><i class="select__chevron" data-lucide="chevron-down"></i></div>${errors.authType ? `<p class="dest-form-error">${errors.authType}</p>` : ""}</div>
          ${connection.authType && connection.authType !== "None" ? `<div class="field"><label class="field__label">Credential</label><div class="field__control"><input class="input" value="••••••••••••" disabled /></div></div>` : ""}`;
      }
      if (f.type === "headers") {
        return `<div class="field field--full"><label class="field__label">${f.label}</label><div class="field__control"><textarea class="input" data-cf-headers rows="2" placeholder="Content-Type: application/json">${(connection.headers || []).join("\n")}</textarea></div><p style="font-size: 11px; color: var(--text-tertiary); margin-top: var(--space-1);">One header per line.</p></div>`;
      }
      return `<div class="field${f.type === "url" ? " field--full" : ""}"><label class="field__label">${f.label}${f.required ? ' <span style="color: var(--color-danger-600);">*</span>' : ""}</label><div class="field__control"><input class="input" data-cf-connection="${f.key}" value="${connection[f.key] || ""}" placeholder="${f.placeholder || ""}" /></div>${errors[f.key] ? `<p class="dest-form-error">${errors[f.key]}</p>` : ""}</div>`;
    })
    .join("");
}
function wireConnectionFields(mount, connection, onAuthChange) {
  mount.querySelectorAll("[data-cf-connection]").forEach((el) => {
    const key = el.dataset.cfConnection;
    const evt = el.tagName === "SELECT" ? "change" : "input";
    el.addEventListener(evt, (e) => {
      connection[key] = e.target.value;
      if (key === "authType") onAuthChange();
    });
  });
  mount.querySelector("[data-cf-headers]")?.addEventListener("input", (e) => {
    connection.headers = e.target.value.split("\n").map((s) => s.trim()).filter(Boolean);
  });
}

function renderDestinationConfigForm(mount, { mode, destination, onCancel, onSave, onCreateAnotherConnection, saveLabel, externalFooter = false }) {
  const draft = buildDestinationDraft(destination);
  // Carry forward any provider-specific keys already stored on connection
  // (e.g. measurementId, apiKey, pixelId...) so the edit form shows current values
  let errors = {};
  const capabilities = providerCapabilities(draft.provider);

  function fieldError(key) {
    return errors[key] ? `<p class="dest-form-error">${errors[key]}</p>` : "";
  }

  function render() {
    const fields = getConnectionFields(draft.provider);

    mount.innerHTML = `
      <div class="dest-form-section">
        <p class="dest-form-section__title">Destination Details</p>
        <p class="dest-form-section__hint">The provider was chosen when this connection account was created and cannot be changed.</p>
        <div class="dest-form-grid">
          <div class="field field--full">
            <label class="field__label" for="dcf-name">Connection Account Name <span style="color: var(--color-danger-600);">*</span></label>
            <div class="field__control"><input class="input" id="dcf-name" data-dcf-name value="${draft.name}" placeholder="e.g. PHS ${draft.provider} — ${draft.dataStream}" /></div>
            ${fieldError("name")}
          </div>
          <div class="field"><label class="field__label">Provider</label><div class="dest-form-readonly"><i data-lucide="${iconFor(draft.provider)}"></i> ${draft.provider}</div></div>
          <div class="field"><label class="field__label">Destination Type</label><div class="dest-form-readonly">${draft.destinationType}</div></div>
          <div class="field"><label class="field__label">Category</label><div class="dest-form-readonly">${draft.category}</div></div>
        </div>
      </div>

      <div class="dest-form-section">
        <p class="dest-form-section__title">Connection</p>
        <div class="dest-form-grid">
          ${fields
            .map((f) => {
              if (f.type === "select") {
                return `<div class="field"><label class="field__label" for="dcf-${f.key}">${f.label}${f.required ? ' <span style="color: var(--color-danger-600);">*</span>' : ""}</label><div class="select select--sm"><select id="dcf-${f.key}" data-dcf-connection="${f.key}">${f.options.map((o) => `<option value="${o}"${draft.connection[f.key] === o ? " selected" : ""}>${o}</option>`).join("")}</select><i class="select__chevron" data-lucide="chevron-down"></i></div>${fieldError(f.key)}</div>`;
              }
              if (f.type === "authType") {
                return `
                  <div class="field"><label class="field__label" for="dcf-authType">${f.label}</label><div class="select select--sm"><select id="dcf-authType" data-dcf-connection="authType">${AUTH_TYPES.map((o) => `<option value="${o}"${draft.connection.authType === o ? " selected" : ""}>${o}</option>`).join("")}</select><i class="select__chevron" data-lucide="chevron-down"></i></div>${fieldError("authType")}</div>
                  ${draft.connection.authType && draft.connection.authType !== "None" ? `<div class="field"><label class="field__label">Credential</label><div class="field__control"><input class="input" value="••••••••••••" disabled /></div></div>` : ""}`;
              }
              if (f.type === "headers") {
                return `<div class="field field--full"><label class="field__label" for="dcf-headers">${f.label}</label><div class="field__control"><textarea class="input" id="dcf-headers" data-dcf-headers rows="2" placeholder="Content-Type: application/json">${(draft.connection.headers || []).join("\n")}</textarea></div><p style="font-size: 11px; color: var(--text-tertiary); margin-top: var(--space-1);">One header per line.</p></div>`;
              }
              return `<div class="field${f.type === "url" ? " field--full" : ""}"><label class="field__label" for="dcf-${f.key}">${f.label}${f.required ? ' <span style="color: var(--color-danger-600);">*</span>' : ""}</label><div class="field__control"><input class="input" id="dcf-${f.key}" data-dcf-connection="${f.key}" value="${draft.connection[f.key] || ""}" placeholder="${f.placeholder || ""}" /></div>${fieldError(f.key)}</div>`;
            })
            .join("")}
        </div>
      </div>

      ${(() => {
        const providerConfigHtml = configFieldsForType({ id: (draft.provider||'').toLowerCase(), name: draft.provider, category: draft.category });
        const isGenericFallback = providerConfigHtml.includes('No additional configuration required');
        if (isGenericFallback) return '';
        return `<div class="dest-form-section">
          <p class="dest-form-section__title">Provider Configuration</p>
          <p class="dest-form-section__hint">Settings specific to ${draft.provider}. These values are sent to the provider's API.</p>
          <div class="dest-form-grid" style="margin-top:var(--space-3);">${providerConfigHtml}</div>
        </div>`;
      })()}
      ${streamPickerHTML(draft, capabilities, mode === "edit")}

      ${dataSelectionSectionHTML(draft, errors)}

      <div class="dest-form-section">
        <p class="dest-form-section__title">Delivery</p>
        <div class="dest-form-grid">
          <div class="field">
            <label class="field__label" for="dcf-delivery-mode">Mode</label>
            <div class="select select--sm"><select id="dcf-delivery-mode" data-dcf-delivery-mode>${(STREAM_DELIVERY_OPTIONS[draft.dataStream] || ["Batch"]).map((m) => `<option value="${m}"${draft.deliveryConfig.mode === m ? " selected" : ""}>${m}</option>`).join("")}</select><i class="select__chevron" data-lucide="chevron-down"></i></div>
          </div>
          ${
            draft.deliveryConfig.mode === "Batch"
              ? `<div class="field"><label class="field__label" for="dcf-sync-frequency">Sync Frequency</label><div class="select select--sm"><select id="dcf-sync-frequency" data-dcf-sync-frequency>${SYNC_FREQUENCIES.map((f) => `<option value="${f}"${draft.deliveryConfig.syncFrequency === f ? " selected" : ""}>${f}</option>`).join("")}</select><i class="select__chevron" data-lucide="chevron-down"></i></div></div>`
              : `<div class="field"><label class="field__label">Delivery Speed</label><div class="dest-form-readonly">${draft.deliveryConfig.mode === "Stream" ? "Near real-time" : "Immediate"}</div></div>`
          }
        </div>
      </div>

      ${
        draft.dataStream === "Consent"
          ? ""
          : `<div class="dest-form-section">
        <p class="dest-form-section__title">${draft.dataStream === "Message" ? "Consent" : "Activation Policy"}</p>
        ${
          draft.dataStream === "Message"
            ? `<label class="cluster gap-2" style="font-size: var(--text-sm); margin-bottom: var(--space-3);"><input type="checkbox" data-dcf-consent-required ${draft.consentConfig.required ? "checked" : ""} /> Consent Required</label>
               ${
                 draft.consentConfig.required
                   ? `<div class="dest-form-check-grid">${["Marketing Consent", "Analytics Consent", "Personalization Consent"].map((p) => `<label><input type="checkbox" data-dcf-consent-policy value="${p}" ${draft.consentConfig.policy.includes(p) ? "checked" : ""} /> ${p}</label>`).join("")}</div>`
                   : ""
               }`
            : `<div class="dest-form-readonly">${draft.consentConfig.activationPolicy || "Follows workspace data-use policy."}</div><p class="dest-form-section__hint" style="margin-top: var(--space-2);">This destination does not send direct communications, so no legal consent basis is claimed here.</p>`
        }
      </div>`
      }

      <div class="dest-form-section dest-form-advanced-wrap">
        <details class="dest-form-advanced">
          <summary>Advanced</summary>
          <div class="dest-form-grid" style="margin-top: var(--space-4);">
            ${ADVANCED_FIELD_DEFS.filter(f => f.type === 'select' && f.options).map((f) => {
              const labels = f.optionLabels || f.options;
              return `<div class="field"><label class="field__label" for="dcf-adv-${f.key}">${f.label}</label><div class="select select--sm"><select id="dcf-adv-${f.key}" data-dcf-advanced="${f.key}">${f.options.map((o, i) => `<option value="${o}"${draft.advancedConfig[f.key] === o ? " selected" : ""}>${labels[i] || o}</option>`).join("")}</select><i class="select__chevron" data-lucide="chevron-down"></i></div>${f.hint ? `<p class="dest-form-section__hint" style="margin-top:2px;font-size:11px;">${f.hint}</p>` : ''}</div>`;
            }).join("")}
          </div>
          <p class="dest-form-section__hint" style="margin-top: var(--space-3);">Mock values only — not connected to any live infrastructure.</p>
        </details>
      </div>

      ${
        externalFooter
          ? ""
          : `<div class="dest-form-section" style="border-bottom: none;">
        <button type="button" class="btn btn--outline btn--sm" data-dcf-test-connection><i data-lucide="plug-2"></i> Test Connection</button>
        <div data-dcf-test-result style="margin-top: var(--space-3);"></div>
      </div>

      <div class="dest-form-footer">
        <button type="button" class="btn btn--ghost" data-dcf-cancel>Cancel</button>
        <button type="button" class="btn btn--primary" data-dcf-save>${saveLabel}</button>
      </div>`
      }`;
    refreshIcons();
    // Pre-populate provider-specific fields from existing connection config
    setTimeout(() => {
      const conn = draft.connection || {};
      const destItem = { id: (draft.provider||'').toLowerCase(), name: draft.provider||'' };
      const fields = getDestConfig(destItem);
      if (fields) {
        for (const f of fields) {
          if (f.type === 'section') continue;
          const fid = 'dc-' + f.key;
          const el = mount.querySelector('#' + fid);
          if (!el) continue;
          const val = conn[f.key];
          if (val === undefined || val === null || val === '') continue;
          if (f.type === 'toggle') {
            el.checked = !!val;
          } else {
            el.value = val;
          }
        }
      }
      // Wire taglist "+ Add" buttons
      mount.querySelectorAll('.taglist-add').forEach(btn => {
        btn.addEventListener('click', () => {
          const listId = btn.dataset.list;
          const list = document.getElementById(listId);
          if (!list) return;
          const row = document.createElement('div');
          row.className = 'taglist-row';
          row.style.cssText = 'display:flex;gap:var(--space-2)';
          row.innerHTML = '<input class="input" type="text" style="flex:1"><button type="button" class="btn btn--ghost btn--sm" style="color:var(--color-error)" onclick="this.closest(&quot;.taglist-row&quot;).remove()">✕</button>';
          list.insertBefore(row, btn.closest('.taglist-row'));
        });
      });
    }, 0);
    wire();
  }

  function wire() {
    mount.querySelector("[data-dcf-name]").addEventListener("input", (e) => (draft.name = e.target.value));
    mount.querySelectorAll("[data-dcf-connection]").forEach((el) => {
      const key = el.dataset.dcfConnection;
      const evt = el.tagName === "SELECT" ? "change" : "input";
      el.addEventListener(evt, (e) => {
        draft.connection[key] = e.target.value;
        if (key === "authType") render();
      });
    });
    mount.querySelector("[data-dcf-headers]")?.addEventListener("input", (e) => {
      draft.connection.headers = e.target.value.split("\n").map((s) => s.trim()).filter(Boolean);
    });
    mount.querySelectorAll("[data-dcf-stream]").forEach((r) =>
      r.addEventListener("change", (e) => {
        draft.dataStream = e.target.value;
        draft.destinationType = classifyDestinationType(draft);
        draft.dataSelection = defaultDataSelectionFor(draft.dataStream);
        draft.deliveryConfig = { mode: draft.dataStream === "Message" ? "Message" : STREAM_DELIVERY_OPTIONS[draft.dataStream][0], syncFrequency: "Every hour" };
        render();
      })
    );
    mount.querySelector("[data-dcf-create-another]")?.addEventListener("click", () => onCreateAnotherConnection?.());
    wireDataSelection(mount, draft, render);
    // Delivery
    mount.querySelector("[data-dcf-delivery-mode]")?.addEventListener("change", (e) => { draft.deliveryConfig.mode = e.target.value; if (e.target.value === "Batch" && !draft.deliveryConfig.syncFrequency) draft.deliveryConfig.syncFrequency = "Every hour"; render(); });
    mount.querySelector("[data-dcf-sync-frequency]")?.addEventListener("change", (e) => (draft.deliveryConfig.syncFrequency = e.target.value));
    // Consent-required (activation) / Advanced
    mount.querySelector("[data-dcf-consent-required]")?.addEventListener("change", (e) => { draft.consentConfig.required = e.target.checked; render(); });
    mount.querySelectorAll("[data-dcf-consent-policy]").forEach((box) => box.addEventListener("change", () => { draft.consentConfig.policy = [...mount.querySelectorAll("[data-dcf-consent-policy]:checked")].map((b) => b.value); }));
    mount.querySelectorAll("[data-dcf-advanced]").forEach((el) => el.addEventListener("change", (e) => (draft.advancedConfig[el.dataset.dcfAdvanced] = e.target.value)));
    mount.querySelector("[data-dcf-test-connection]")?.addEventListener("click", () => {
      mount.querySelector("[data-dcf-test-result]").innerHTML = testConnectionResultHTML();
      refreshIcons();
    });
    mount.querySelector("[data-dcf-cancel]")?.addEventListener("click", onCancel);
    mount.querySelector("[data-dcf-save]")?.addEventListener("click", trySave);
  }

  function trySave() {
    errors = validateDestinationDraft(draft);
    if (Object.keys(errors).length) {
      render();
      return false;
    }
    onSave(draft);
    return true;
  }

  function isDirty() {
    const original = buildDestinationDraft(destination);
    return JSON.stringify(original) !== JSON.stringify(draft);
  }

  render();
  return { trySave, isDirty, getDraft: () => draft };
}

/* ---------------------------------------------------------------- */
/* Shared modals — Test Connection, Edit Config, Sync Now, Pause      */
/* ---------------------------------------------------------------- */
function testConnectionResultHTML() {
  return `
    <div class="dest-test-result">
      <div class="dest-test-result__title"><i data-lucide="circle-check"></i> Connection successful <span class="badge badge--neutral" style="margin-left: auto;">Simulation</span></div>
      <div class="dest-config-list">
        <div class="dest-config-row"><span class="dest-config-row__label">Response</span><span class="dest-config-row__value">200 OK</span></div>
        <div class="dest-config-row"><span class="dest-config-row__label">Latency</span><span class="dest-config-row__value">128 ms</span></div>
        <div class="dest-config-row"><span class="dest-config-row__label">Timestamp</span><span class="dest-config-row__value">${MOCK_TODAY} · 10:00</span></div>
      </div>
      <p style="font-size: 11px; color: var(--text-tertiary); margin: 0;">Simulation — no real external request is executed.</p>
    </div>`;
}
function openTestConnectionModal() {
  const modal = document.getElementById("test-connection-modal");
  modal.querySelector("[data-test-connection-body]").innerHTML = testConnectionResultHTML();
  modal.classList.add("is-open");
  document.body.style.overflow = "hidden";
  refreshIcons();
}

function openEditConfig(entity) {
  const modal = document.getElementById("edit-config-modal");
  const fields = modal.querySelector("[data-edit-config-fields]");
  fields.innerHTML = entity.configuration
    .map(
      (c, i) => `
    <div class="field">
      <label class="field__label">${c.label}</label>
      ${
        c.masked
          ? `<div class="field__control"><input class="input" value="${c.value}" disabled /></div><p style="font-size:11px; color:var(--text-tertiary); margin:2px 0 0;">Masked secret — cannot be edited in this prototype.</p>`
          : `<div class="field__control"><input class="input" data-config-index="${i}" value="${c.value || ""}" /></div>`
      }
    </div>`
    )
    .join("");
  modal.classList.add("is-open");
  document.body.style.overflow = "hidden";

  modal.querySelector("[data-edit-config-save]").onclick = async () => {
    fields.querySelectorAll("[data-config-index]").forEach((input) => {
      entity.configuration[Number(input.dataset.configIndex)].value = input.value;
    });
    const now = new Date().toLocaleString('sv').replace('T', ' · ').slice(0, 18);
    entity.lastEdit = now;
    modal.classList.remove("is-open");
    document.body.style.overflow = "";
    const isDestination = destinations.includes(entity);
    if (isDestination) {
      if (typeof PHSAPI !== 'undefined') {
        try {
          await PHSAPI.destinations.update(entity.id, {
            name:    entity.name,
            config:  entity.connection || {},
            enabled: entity.enabled !== false,
          });
        } catch (e) { console.warn('[Destinations] BFF update failed:', e.message); }
      }
      renderDestConfigurationTab(entity);
      renderDestOverviewTab(entity);
      renderDestTable();
    } else {
      if (typeof PHSAPI !== 'undefined') {
        try {
          await PHSAPI.sources.update(entity.id, {
            name:    entity.name,
            config:  entity.connection || {},
            enabled: entity.enabled !== false,
          });
        } catch (e) { console.warn('[Sources] BFF update failed:', e.message); }
      }
      renderSourceConfigurationTab(entity);
      renderSourceOverviewTab(entity);
      renderSourceTable();
    }
  };
}

function openSyncNow(d) {
  const modal = document.getElementById("sync-now-modal");
  const body = modal.querySelector("[data-sync-now-body]");
  const audiences = resolveAudiences(d);
  const primaryAudience = audiences[0];
  body.innerHTML = `
    <div class="dest-config-list">
      <div class="dest-config-row"><span class="dest-config-row__label">Destination</span><span class="dest-config-row__value">${d.name}</span></div>
      ${primaryAudience ? `<div class="dest-config-row"><span class="dest-config-row__label">Audience</span><span class="dest-config-row__value">${primaryAudience.name}</span></div><div class="dest-config-row"><span class="dest-config-row__label">Records</span><span class="dest-config-row__value tabular-nums">${fmt(primaryAudience.memberCount)}</span></div>` : ""}
    </div>
    <div data-sync-status style="margin-top: var(--space-3);"></div>`;
  modal.classList.add("is-open");
  document.body.style.overflow = "hidden";

  modal.querySelector("[data-sync-now-confirm]").onclick = () => {
    const statusEl = body.querySelector("[data-sync-status]");
    statusEl.innerHTML = `<p class="cell-muted" style="font-size: var(--text-sm);"><i data-lucide="refresh-cw" style="width:13px;height:13px;vertical-align:-2px;"></i> Sync started…</p>`;
    refreshIcons();
    setTimeout(() => {
      d.lastSync = MOCK_TODAY + " · 10:00";
      statusEl.innerHTML = `<p style="font-size: var(--text-sm); color: var(--color-primary-700);"><i data-lucide="circle-check" style="width:13px;height:13px;vertical-align:-2px;"></i> Sync completed</p>`;
      refreshIcons();
      renderDestSummary();
      renderDestTable();
      renderDestDetailHeader(d);
      renderDestOverviewTab(d);
      renderDestActivityTab(d);
    }, 900);
  };
}

function openPause(entity) {
  const modal = document.getElementById("pause-modal");
  modal.querySelector("[data-pause-title]").textContent = `Pause activation for ${entity.name}?`;
  modal.classList.add("is-open");
  document.body.style.overflow = "hidden";
  modal.querySelector("[data-pause-confirm]").onclick = () => {
    entity.status = "Paused";
    modal.classList.remove("is-open");
    document.body.style.overflow = "";
    if (destinations.includes(entity)) refreshDestAfterStatusChange(entity);
    else refreshSourceAfterStatusChange(entity);
  };
}

/* ================================================================ */
/* SOURCES — mirrors the Destinations structure above                 */
/* ================================================================ */
const SOURCE_COLUMNS = [
  { key: "source", label: "Provider / Source" },
  { key: "connectionAccount", label: "Connection Account" },
  { key: "category", label: "Category" },
  { key: "destinations", label: "Destinations" },
  { key: "dataStream", label: "Data Stream" },
  { key: "dataSelection", label: "Data Selection" },
  { key: "sourceType", label: "Source Type" },
  { key: "delivery", label: "Delivery" },
  { key: "status", label: "Status" },
  { key: "users", label: "Users Through Connection" },
  { key: "lastReceived", label: "Last Received" },
  { key: "lastEdit", label: "Last Edit" },
  { key: "created", label: "Created" },
  { key: "owner", label: "Owner" },
];
// Default set leads with the RudderStack Sources reference's own
// columns (Source, Category, Status, Destinations) ahead of this
// prototype's richer existing fields, which stay available via Edit
// columns.
const SOURCE_DEFAULT_COLUMNS = ["source", "connectionAccount", "category", "status", "destinations"];
const SOURCE_COLUMNS_STORAGE_KEY = "phs-cdp-source-columns-v3";

function findSource(id) {
  return sources.find((s) => s.id === id);
}

function sourceCellHTML(key, s) {
  switch (key) {
    case "source":
      return `<div class="dest-cell"><span class="dest-cell__icon"><i data-lucide="${iconFor(s.provider)}"></i></span><div><div class="dest-cell__name">${s.provider}</div><div class="dest-cell__type">${s.category}</div></div></div>`;
    case "connectionAccount":
      return `<span class="cell-primary">${s.name}</span>`;
    case "sourceType":
      return `<span class="cell-muted">${s.sourceType}</span>`;
    case "category":
      return `<span class="cell-muted">${s.category}</span>`;
    case "destinations":
      return relatedCountHTML(destinationsForSource(s), "destination");
    case "dataStream":
      return streamBadge(s.dataStream);
    case "dataSelection":
      return `<span class="cell-muted">${sourceDataSelectionSummary(s)}</span>`;
    case "delivery":
      return deliveryBadge(s.deliveryConfig.mode);
    case "status":
      return statusBadge(s.status);
    case "users": {
      const users = getUsersThroughSource(s, sourceDateFilter);
      return `<div class="dest-users-cell"><span class="tabular-nums">${fmt(users)}</span><span class="dest-users-cell__period">${sourceDateFilter.preset}</span></div>`;
    }
    case "lastReceived":
      return `<span class="cell-muted tabular-nums">${s.lastReceived}</span>`;
    case "lastEdit":
      return `<span class="cell-muted tabular-nums">${s.lastEdit}</span>`;
    case "created":
      return `<span class="cell-muted tabular-nums">${s.createdAt}</span>`;
    case "owner":
      return `<span class="cell-muted">${s.owner}</span>`;
    default:
      return "";
  }
}

function sourceRowActionsHTML(s) {
  const items = [`<button class="dropdown__item" data-row-action="view"><i data-lucide="eye"></i> View</button>`];
  if (s.status === "Available") {
    items.push(`<button class="dropdown__item" data-row-action="configure"><i data-lucide="settings-2"></i> Configure</button>`);
  } else {
    items.push(`<button class="dropdown__item" data-row-action="edit"><i data-lucide="pencil"></i> Edit</button>`);
    if (s.status === "Error") items.push(`<button class="dropdown__item" data-row-action="reconnect"><i data-lucide="link-2"></i> Reconnect</button>`);
    else if (s.status === "Connected") items.push(`<button class="dropdown__item" data-row-action="pause"><i data-lucide="pause"></i> Pause</button>`);
    else if (s.status === "Paused") items.push(`<button class="dropdown__item" data-row-action="resume"><i data-lucide="play"></i> Resume</button>`);
    items.push(`<button class="dropdown__item" data-row-action="test"><i data-lucide="plug-2"></i> Test Connection</button>`);
  }
  items.push(`<button class="dropdown__item dropdown__item--danger" data-row-action="delete" style="color:var(--color-error,#ef4444)"><i data-lucide="trash-2"></i> Delete</button>`);
  return `<button class="table-row-menu-trigger" data-row-menu-trigger aria-label="Row actions" onclick="event.stopPropagation()" data-row-menu-html='${encodeURIComponent(items.join(""))}' ><i data-lucide="more-horizontal"></i></button>`;
}

function passesSourceFilters(s) {
  const q = normalize(sourceFilterState.query);
  const matchesSearch = !q || normalize(s.name).includes(q) || normalize(s.provider).includes(q) || normalize(s.category).includes(q) || normalize(s.sourceType).includes(q);
  const matchesStatus = !sourceFilterState.status.length || sourceFilterState.status.includes(s.status);
  const matchesType = !sourceFilterState.sourceType.length || sourceFilterState.sourceType.includes(s.sourceType);
  const matchesDataType = !sourceFilterState.dataType.length || sourceFilterState.dataType.includes(s.dataStream);
  const matchesDelivery = !sourceFilterState.delivery.length || sourceFilterState.delivery.includes(s.deliveryConfig.mode);
  return matchesSearch && matchesStatus && matchesType && matchesDataType && matchesDelivery;
}

function renderSourceSummary() {
  const mount = document.querySelector("[data-source-summary]");
  if (!mount) return;
  const connected = sources.filter((s) => s.status === "Connected").length;
  const available = sources.filter((s) => s.status === "Available").length;
  const activeSyncs = sources.filter((s) => s.status === "Connected").length;
  const errors = sources.filter((s) => s.status === "Error").length;
  mount.innerHTML = `
    <div class="metric-row">
      <div class="metric metric--success"><span class="metric__label">Connected</span><div class="metric__value-row"><span class="metric__value" style="font-size: var(--text-xl);">${connected}</span></div></div>
      <div class="metric"><span class="metric__label">Available</span><div class="metric__value-row"><span class="metric__value" style="font-size: var(--text-xl);">${available}</span></div></div>
      <div class="metric metric--primary"><span class="metric__label">Active Streams</span><div class="metric__value-row"><span class="metric__value" style="font-size: var(--text-xl);">${activeSyncs}</span></div></div>
      <div class="metric metric--danger"><span class="metric__label">Recent Errors</span><div class="metric__value-row"><span class="metric__value" style="font-size: var(--text-xl);">${errors}</span></div></div>
    </div>`;
}

function renderSourceTable() {
  const thead = document.querySelector("[data-source-thead]");
  const tbody = document.querySelector("[data-source-table] tbody");
  if (!thead || !tbody) return;
  renderTableHead(thead, SOURCE_COLUMNS, sourceVisibleColumns, ["users"]);

  const filtered = sources.filter(passesSourceFilters);
  if (!filtered.length) {
    tbody.innerHTML = `<tr><td colspan="${sourceVisibleColumns.length + 1}" class="table__empty">No sources match your search and filters.</td></tr>`;
    return;
  }
  tbody.innerHTML = filtered
    .map(
      (s) => `
    <tr data-source-row="${s.id}">
      ${SOURCE_COLUMNS.filter((c) => sourceVisibleColumns.includes(c.key))
        .map((c) => `<td>${sourceCellHTML(c.key, s)}</td>`)
        .join("")}
      <td>${sourceRowActionsHTML(s)}</td>
    </tr>`
    )
    .join("");

  tbody.querySelectorAll("[data-source-row]").forEach((row) => {
    row.style.cursor = "pointer";
    makeInteractive(row, () => openSourceDetail(row.dataset.sourceRow));
  });
  initTableRowMenus(tbody, (rowEl, action) => {
    handleSourceRowAction(rowEl.dataset.sourceRow, action);
  });
  refreshIcons();
}

function handleSourceRowAction(id, action) {
  const s = findSource(id);
  if (!s) return;
  if (action === "view" || action === "edit" || action === "configure") {
    openSourceDetail(id);
    if (action === "edit" || action === "configure") setTimeout(() => openEditConfig(s), 150);
  } else if (action === "pause") {
    openSourceDetail(id);
    setTimeout(() => openPause(s), 150);
  } else if (action === "resume" || action === "reconnect") {
    s.status = "Connected";
    s.lastReceived = MOCK_TODAY + " · 10:00";
    renderSourceSummary();
    renderSourceTable();
  } else if (action === "test") {
    openTestConnectionModal();
  } else if (action === "delete") {
    if (confirm(`Delete "${s.name}"? This cannot be undone.`)) {
      const idx = sources.findIndex(x => x.id === id);
      if (idx !== -1) sources.splice(idx, 1);
      renderSourceSummary();
      renderSourceTable();
    }
  }
}

function initSourceFilters() {
  const search = document.querySelector("[data-source-search]");
  search.addEventListener("input", (e) => {
    sourceFilterState.query = e.target.value;
    renderSourceTable();
  });

  const quickRange = document.querySelector("[data-source-quickrange]");
  quickRange.innerHTML = DATE_RANGE_PRESETS.filter((p) => p !== "Custom range")
    .map((p) => `<option value="${p}"${p === sourceDateFilter.preset ? " selected" : ""}>${p}</option>`)
    .join("");
  quickRange.addEventListener("change", (e) => {
    sourceDateFilter = { preset: e.target.value, from: "", to: "" };
    renderSourceTable();
  });

  initColumnManager({
    triggerEl: document.querySelector("[data-source-columns-trigger]"),
    panelEl: document.querySelector("[data-source-columns-panel]"),
    storageKey: SOURCE_COLUMNS_STORAGE_KEY,
    columns: SOURCE_COLUMNS,
    defaultKeys: SOURCE_DEFAULT_COLUMNS,
    requiredKey: "source",
    onApply: (keys) => {
      sourceVisibleColumns = keys;
      renderSourceTable();
    },
  });

  const filterFields = [
    { key: "status", label: "Status", type: "multiselect", options: SOURCE_STATUSES },
    { key: "sourceType", label: "Source Type", type: "multiselect", options: SOURCE_TYPES },
    { key: "dataType", label: "Data Stream", type: "multiselect", options: SOURCE_DATA_STREAMS },
    { key: "delivery", label: "Delivery", type: "multiselect", options: DELIVERY_MODES },
  ];
  const filterCount = document.querySelector("[data-source-filter-count]");
  function updateFilterCount() {
    const n = countActiveFilters(sourceFilterState, filterFields);
    filterCount.hidden = n === 0;
    filterCount.textContent = n;
  }
  initFilterPanel({
    triggerEl: document.querySelector("[data-source-filter-trigger]"),
    panelEl: document.querySelector("[data-source-filter-panel]"),
    fields: filterFields,
    getState: () => sourceFilterState,
    onApply: (state) => {
      Object.assign(sourceFilterState, state);
      updateFilterCount();
      renderSourceTable();
    },
    onClear: () => {
      filterFields.forEach((f) => (sourceFilterState[f.key] = []));
      updateFilterCount();
      renderSourceTable();
    },
  });
  updateFilterCount();
}

function showSourceView(view) {
  document.querySelector("[data-view-sources-list]").hidden = view !== "list";
  document.querySelector("[data-view-sources-detail]").hidden = view !== "detail";
  window.scrollTo({ top: 0 });
}

function openSourceDetail(id) {
  const s = findSource(id);
  if (!s) return;
  currentSourceDetailId = id;
  sourceActivityFilter.dataType = "all";
  sourceActivityFilter.status = "all";

  renderSourceDetailHeader(s);
  renderSourceOverviewTab(s);
  renderSourceActivityTab(s);
  renderSourceConfigurationTab(s);
  showSourceView("detail");
  document.getElementById("source-tab-overview")?.click();
  refreshIcons();
}

function renderSourceDetailHeader(s) {
  const header = document.querySelector("[data-source-detail-header]");
  header.innerHTML = `
    <div class="dest-detail__header">
      <span class="dest-detail__icon"><i data-lucide="${iconFor(s.provider)}"></i></span>
      <div>
        <div class="page-header__eyebrow"><i data-lucide="arrow-down-to-line" style="width:13px;height:13px;"></i> ${s.provider} · ${s.sourceType}</div>
        <h1 class="page-header__title">${s.name}</h1>
        <div class="cluster gap-2" style="margin-top: var(--space-2);">${statusBadge(s.status)}</div>
      </div>
    </div>`;

  const actions = document.querySelector("[data-source-detail-actions]");
  actions.innerHTML = `
    ${s.status === "Error" ? `<button class="btn btn--primary btn--sm" data-reconnect><i data-lucide="link-2"></i> Reconnect</button>` : ""}
    ${s.status === "Paused" ? `<button class="btn btn--outline btn--sm" data-resume><i data-lucide="play"></i> Resume</button>` : ""}
    ${s.status === "Connected" ? `<button class="btn btn--outline btn--sm" data-pause><i data-lucide="pause"></i> Pause</button>` : ""}
    <button class="btn btn--outline btn--sm" data-edit-config-open><i data-lucide="pencil"></i> Edit</button>`;
  refreshIcons();

  actions.querySelector("[data-pause]")?.addEventListener("click", () => openPause(s));
  actions.querySelector("[data-resume]")?.addEventListener("click", () => {
    s.status = "Connected";
    s.lastReceived = MOCK_TODAY + " · 10:00";
    refreshSourceAfterStatusChange(s);
  });
  actions.querySelector("[data-reconnect]")?.addEventListener("click", () => {
    s.status = "Connected";
    s.lastReceived = MOCK_TODAY + " · 10:00";
    refreshSourceAfterStatusChange(s);
  });
  actions.querySelector("[data-edit-config-open]")?.addEventListener("click", () => openEditConfig(s));
}

function refreshSourceAfterStatusChange(s) {
  renderSourceSummary();
  renderSourceTable();
  renderSourceDetailHeader(s);
  renderSourceOverviewTab(s);
}

function renderSourceOverviewTab(s) {
  const mount = document.querySelector("[data-source-tab-overview]");
  const flow = resolveSourceDataFlow(s);
  const users = getUsersThroughSource(s, sourceDateFilter);

  mount.innerHTML = `
    <section class="section">
      <div class="section__body dest-summary-grid">
        <div class="attr-item"><span class="attr-item__label">Provider</span><span class="attr-item__value">${s.provider}</span></div>
        <div class="attr-item"><span class="attr-item__label">Connection Account</span><span class="attr-item__value">${s.name}</span></div>
        <div class="attr-item"><span class="attr-item__label">Data Stream</span><span class="attr-item__value">${streamBadge(s.dataStream)}</span></div>
        <div class="attr-item"><span class="attr-item__label">Data Selection</span><span class="attr-item__value">${sourceDataSelectionSummary(s)}</span></div>
        <div class="attr-item"><span class="attr-item__label">Delivery</span><span class="attr-item__value">${deliveryBadge(s.deliveryConfig.mode)}</span></div>
        <div class="attr-item"><span class="attr-item__label">Connection Status</span><span class="attr-item__value">${statusBadge(s.status)}</span></div>
        <div class="attr-item"><span class="attr-item__label">Category</span><span class="attr-item__value">${s.category}</span></div>
        <div class="attr-item"><span class="attr-item__label">Users Through Connection</span><span class="attr-item__value tabular-nums">${fmt(users)}</span></div>
        <div class="attr-item"><span class="attr-item__label">Reporting Period</span><span class="attr-item__value">${sourceDateFilter.preset}</span></div>
        <div class="attr-item"><span class="attr-item__label">Last Received</span><span class="attr-item__value tabular-nums">${s.lastReceived}</span></div>
        <div class="attr-item"><span class="attr-item__label">Last Edit</span><span class="attr-item__value tabular-nums">${s.lastEdit}</span></div>
        <div class="attr-item"><span class="attr-item__label">Created</span><span class="attr-item__value tabular-nums">${s.createdAt}</span></div>
        <div class="attr-item"><span class="attr-item__label">Owner</span><span class="attr-item__value">${s.owner}</span></div>
      </div>
    </section>

    <section class="section">
      <div class="dest-direction section__body">
        <span class="dest-direction__node"><i data-lucide="${iconFor(s.provider)}"></i> ${s.provider} — ${s.name}</span>
        <span class="dest-direction__arrow"><i data-lucide="arrow-right"></i></span>
        <span class="dest-direction__node"><i data-lucide="server"></i> PHS CDP</span>
      </div>
    </section>

    <section class="section" style="margin-bottom: 0;">
      <div class="section__header"><div><h2 class="section__title">Data Flow</h2><p class="section__subtitle">Conceptual data movement — see Data Flows for the full map.</p></div></div>
      <div class="section__body">
        ${
          flow
            ? `<div class="dest-flow-ref"><span class="font-mono">${flow.name}</span><span class="dest-flow-ref__arrow"><i data-lucide="arrow-right"></i></span><span class="font-mono">PHS CDP</span><span style="margin-left: auto;" class="cluster gap-2"><span class="badge badge--neutral badge--dest-tag">${flow.dataTypes.join(" + ")}</span><span class="badge badge--neutral badge--dest-tag">${flow.deliveryMode.toUpperCase()}</span></span></div>`
            : `<p class="dest-empty-note">No conceptual Data Flow record exists for this source yet.</p>`
        }
      </div>
    </section>`;
  refreshIcons();
}

function renderSourceActivityTab(s) {
  const mount = document.querySelector("[data-source-tab-activity]");
  const entries = getSourceActivity(s.id, { dateFilter: sourceDateFilter, ...sourceActivityFilter });
  const summary = summarizeSourceActivity(entries);

  mount.innerHTML = `
    <section class="section">
      <div class="section__header"><div><h2 class="section__title">Activity</h2><p class="section__subtitle">Monitor data received through this source.</p></div></div>
      <div class="section__body">
        <div class="cluster gap-3" style="flex-wrap: wrap; margin-bottom: var(--space-5);">
          <div class="select select--sm" style="width: 150px;">
            <select data-source-activity-daterange>${DATE_RANGE_PRESETS.filter((p) => p !== "Custom range").map((p) => `<option value="${p}"${p === sourceDateFilter.preset ? " selected" : ""}>${p}</option>`).join("")}</select>
            <i class="select__chevron" data-lucide="chevron-down"></i>
          </div>
          <div class="select select--sm" style="width: 140px;">
            <select data-source-activity-datatype><option value="all">All Data Streams</option>${SOURCE_DATA_STREAMS.map((t) => `<option value="${t}"${sourceActivityFilter.dataType === t ? " selected" : ""}>${t}</option>`).join("")}</select>
            <i class="select__chevron" data-lucide="chevron-down"></i>
          </div>
        </div>
        <div class="dest-activity-summary">
          <div class="metric metric--primary"><span class="metric__label">Users</span><div class="metric__value-row"><span class="metric__value tabular-nums" style="font-size: var(--text-lg);">${fmt(summary.users)}</span></div></div>
          <div class="metric"><span class="metric__label">Records</span><div class="metric__value-row"><span class="metric__value tabular-nums" style="font-size: var(--text-lg);">${fmt(summary.records)}</span></div></div>
          <div class="metric metric--success"><span class="metric__label">Received</span><div class="metric__value-row"><span class="metric__value tabular-nums" style="font-size: var(--text-lg);">${summary.successRate.toFixed(1)}%</span></div></div>
        </div>
      </div>
    </section>
    <section class="section" style="margin-bottom: 0;">
      <div class="section__body">
        <div class="table-wrap">
          <table class="table table--dense">
            <thead><tr><th>Timestamp</th><th>Event</th><th>Data Type</th><th class="num">Users</th><th class="num">Records</th><th>Status</th></tr></thead>
            <tbody>
              ${
                entries.length
                  ? entries
                      .map(
                        (e) => `<tr>
                  <td class="cell-muted tabular-nums">${formatSourceActivityTimestamp(e)}</td>
                  <td class="cell-primary">${e.event || "—"}</td>
                  <td>${streamBadge(e.dataType)}</td>
                  <td class="num tabular-nums">${fmt(e.users)}</td>
                  <td class="num tabular-nums">${fmt(e.records)}</td>
                  <td><span class="badge ${e.status === "Received" ? "badge--success" : "badge--warning"}">${e.status}</span></td>
                </tr>`
                      )
                      .join("")
                  : `<tr><td colspan="6" class="table__empty">No activity in this period.</td></tr>`
              }
            </tbody>
          </table>
        </div>
      </div>
    </section>`;
  refreshIcons();

  mount.querySelector("[data-source-activity-daterange]").addEventListener("change", (e) => {
    sourceDateFilter = { preset: e.target.value, from: "", to: "" };
    document.querySelector("[data-source-quickrange]").value = e.target.value;
    renderSourceActivityTab(s);
    renderSourceOverviewTab(s);
    renderSourceTable();
  });
  mount.querySelector("[data-source-activity-datatype]").addEventListener("change", (e) => {
    sourceActivityFilter.dataType = e.target.value;
    renderSourceActivityTab(s);
  });
}

function renderSourceConfigurationTab(s) {
  const mount = document.querySelector("[data-source-tab-configuration]");
  mount.innerHTML = `
    <section class="section">
      <div class="section__header">
        <div><h2 class="section__title">Configuration</h2><p class="section__subtitle">Prototype configuration only — secrets are always masked and never real.</p></div>
        <button class="btn btn--outline btn--sm" data-edit-config-open-tab><i data-lucide="pencil"></i> Edit Configuration</button>
      </div>
      <div class="section__body">
        <div class="dest-config-list">
          ${s.configuration.map((c) => `<div class="dest-config-row"><span class="dest-config-row__label">${c.label}</span><span class="dest-config-row__value${c.masked ? " dest-config-row__value--masked" : ""}">${c.value || "—"}</span></div>`).join("")}
        </div>
      </div>
    </section>
    <section class="section" style="margin-bottom: 0;">
      <div class="section__body">
        <button class="btn btn--outline btn--sm" data-tab-test-connection><i data-lucide="plug-2"></i> Test Connection</button>
      </div>
    </section>`;
  refreshIcons();
  mount.querySelector("[data-edit-config-open-tab]")?.addEventListener("click", () => openEditConfig(s));
  mount.querySelector("[data-tab-test-connection]")?.addEventListener("click", openTestConnectionModal);
}

/* ================================================================ */
/* Source Configuration form — lighter parallel to                    */
/* renderDestinationConfigForm (Sources only ever carry Profile /      */
/* Event / Consent, never Audience / Message). Shares the same Data    */
/* Selection markup/wiring and connection-field rendering.             */
/* ================================================================ */
function buildSourceDraft(source) {
  return {
    name: source.name,
    provider: source.provider,
    category: source.category,
    dataStream: source.dataStream,
    dataSelection: cloneDataSelection(source.dataStream, source.dataSelection),
    connection: { ...source.connection, headers: [...(source.connection.headers || [])] },
    deliveryConfig: { ...source.deliveryConfig },
  };
}
function validateSourceDraft(draft) {
  const kind = getConnectionKind(draft.provider);
  const errors = {};
  if (!draft.name || !draft.name.trim()) errors.name = "Connection Account Name is required.";
  const urlPattern = /^https?:\/\/.+/i;
  if (kind === "webhook") {
    if (!draft.connection.webhookUrl || !urlPattern.test(draft.connection.webhookUrl)) errors.webhookUrl = "Enter a valid URL (starting with http:// or https://).";
    if (!draft.connection.method) errors.method = "Method is required.";
  } else if (kind === "httpApi") {
    if (!draft.connection.baseUrl || !urlPattern.test(draft.connection.baseUrl)) errors.baseUrl = "Enter a valid URL (starting with http:// or https://).";
    if (!draft.connection.method) errors.method = "Method is required.";
  } else {
    if (!draft.connection.account || !draft.connection.account.trim()) errors.account = "Account is required.";
  }
  const sel = draft.dataSelection;
  if (draft.dataStream === "Profile" && !(sel.attributeIds || []).length) errors.dataSelection = "Select at least one profile attribute.";
  if (draft.dataStream === "Event" && sel.mode === "selected" && !(sel.eventIds || []).length) errors.dataSelection = "Select at least one event, or choose All Events.";
  if (draft.dataStream === "Consent" && !(sel.types || []).length) errors.dataSelection = "Select at least one consent type.";
  return errors;
}
function renderSourceConfigForm(mount, { mode, source, onCancel, onSave, saveLabel }) {
  const draft = buildSourceDraft(source);
  let errors = {};

  function render() {
    const fields = getConnectionFields(draft.provider);
    mount.innerHTML = `
      <div class="dest-form-section">
        <p class="dest-form-section__title">Source Details</p>
        <p class="dest-form-section__hint">The provider was chosen when this connection account was created and cannot be changed.</p>
        <div class="dest-form-grid">
          <div class="field field--full">
            <label class="field__label">Connection Account Name <span style="color: var(--color-danger-600);">*</span></label>
            <div class="field__control"><input class="input" data-sf-name value="${draft.name}" placeholder="e.g. PHS ${draft.provider} — ${draft.dataStream}" /></div>
            ${errors.name ? `<p class="dest-form-error">${errors.name}</p>` : ""}
          </div>
          <div class="field"><label class="field__label">Provider</label><div class="dest-form-readonly"><i data-lucide="${iconFor(draft.provider)}"></i> ${draft.provider}</div></div>
          <div class="field"><label class="field__label">Category</label><div class="dest-form-readonly">${draft.category}</div></div>
        </div>
      </div>

      <div class="dest-form-section">
        <p class="dest-form-section__title">Connection</p>
        <div class="dest-form-grid">${connectionFieldsHTML(fields, draft.connection, errors)}</div>
      </div>

      ${
        mode === "edit"
          ? `<div class="dest-form-section">
        <p class="dest-form-section__title">Data Stream</p>
        <p class="dest-form-section__hint">A Connection Account carries exactly one Data Stream. Create a separate connection account to send a different kind of data.</p>
        <div class="dest-form-readonly"><i data-lucide="${STREAM_META[draft.dataStream].icon}"></i> ${draft.dataStream} — ${STREAM_META[draft.dataStream].description}</div>
      </div>`
          : ""
      }

      ${dataSelectionSectionHTML(draft, errors)}

      <div class="dest-form-section">
        <p class="dest-form-section__title">Delivery</p>
        <div class="dest-form-readonly">${draft.deliveryConfig.mode}</div>
      </div>

      <div class="dest-form-section" style="border-bottom: none;">
        <button type="button" class="btn btn--outline btn--sm" data-sf-test><i data-lucide="plug-2"></i> Test Connection</button>
        <div data-sf-test-result style="margin-top: var(--space-3);"></div>
      </div>

      <div class="dest-form-footer">
        <button type="button" class="btn btn--ghost" data-sf-cancel>Cancel</button>
        <button type="button" class="btn btn--primary" data-sf-save>${saveLabel}</button>
      </div>`;
    refreshIcons();
    wire();
  }

  function wire() {
    mount.querySelector("[data-sf-name]").addEventListener("input", (e) => (draft.name = e.target.value));
    wireConnectionFields(mount, draft.connection, render);
    wireDataSelection(mount, draft, render);
    mount.querySelector("[data-sf-test]").addEventListener("click", () => {
      mount.querySelector("[data-sf-test-result]").innerHTML = testConnectionResultHTML();
      refreshIcons();
    });
    mount.querySelector("[data-sf-cancel]").addEventListener("click", onCancel);
    mount.querySelector("[data-sf-save]").addEventListener("click", () => {
      errors = validateSourceDraft(draft);
      if (Object.keys(errors).length) {
        render();
        return;
      }
      onSave(draft);
    });
  }

  render();
  return { isDirty: () => JSON.stringify(buildSourceDraft(source)) !== JSON.stringify(draft) };
}

/* ================================================================ */
/* Full-screen Setup workspace — shared by Add Destination/Add Source */
/* Provider -> Data Stream -> Configure (Phase 12.4).                 */
/* ================================================================ */
let setupKind = "destination"; // "destination" | "source"
let setupSelectedName = null; // provider name
let setupStream = null;
let setupStep = 1; // 1 = pick stream, 2 = configure

function setupCatalog() {
  return setupKind === "destination" ? ADD_DESTINATION_CATALOG : ADD_SOURCE_CATALOG;
}
function setupTemplate(name) {
  return setupKind === "destination" ? getDestinationTemplate(name) : getSourceTemplate(name);
}
function setupCapabilities(name) {
  return setupKind === "destination" ? providerCapabilities(name) : sourceProviderCapabilities(name);
}
function setupStreams() {
  return setupKind === "destination" ? DATA_STREAMS : SOURCE_DATA_STREAMS;
}
function setupIconLookup(name) {
  return iconFor(name);
}

function openSetup(kind, { presetProvider } = {}) {
  setupKind = kind;
  setupSelectedName = presetProvider || null;
  setupStream = null;
  setupStep = 1;

  document.querySelector("[data-setup-title]").textContent = kind === "destination" ? "Add Destination" : "Add Source";
  document.querySelector("[data-setup-back-label]").textContent = kind === "destination" ? "Back to Destinations" : "Back to Sources";
  if (presetProvider) renderSetupWizard();
  else renderSetupBrowse();
  document.querySelector("[data-view-setup]").hidden = false;
  document.body.style.overflow = "hidden";
}

function closeSetup() {
  document.querySelector("[data-view-setup]").hidden = true;
  document.body.style.overflow = "";
  const url = new URL(location.href);
  if (url.searchParams.has("setup")) {
    url.searchParams.delete("setup");
    history.replaceState({}, "", url);
  }
}

function renderSetupBrowse(activeCategory = "All") {
  const body = document.querySelector("[data-setup-body]");
  const catalog = setupCatalog();
  const allNames = catalog.flatMap((g) => g.names);
  const popular = setupKind === "destination" ? ["Meta Ads", "Google Ads", "CRM", "Email", "Webhook", "n8n"] : ["PHS Mobile App", "PHS Website", "AppsFlyer", "CRM", "Trading API", "Webhook"];

  function cardHTML(name) {
    const template = setupTemplate(name);
    const capabilities = setupCapabilities(name);
    const desc = connectorDescription(template);
    return `
      <button type="button" class="dest-directory-card" data-setup-pick="${name}">
        <span class="dest-directory-card__icon"><i data-lucide="${setupIconLookup(name)}"></i></span>
        <div>
          <div class="dest-directory-card__name">${name}</div>
          <div class="dest-directory-card__desc">${desc}</div>
        </div>
        <div class="dest-directory-card__meta">
          ${capabilities.map((s) => `<span class="badge badge--neutral badge--dest-tag">${s}</span>`).join("")}
        </div>
      </button>`;
  }

  const categories = ["All", "Popular", ...catalog.map((g) => g.category)];
  let sections = "";
  if (activeCategory === "All") {
    sections += `<div class="dest-directory-section"><div class="dest-directory-section__title">Popular ${setupKind === "destination" ? "destinations" : "sources"}</div><div class="dest-directory-grid">${popular.map(cardHTML).join("")}</div></div>`;
    catalog.forEach((g) => {
      sections += `<div class="dest-directory-section"><div class="dest-directory-section__title">${g.category}</div><div class="dest-directory-grid">${g.names.map(cardHTML).join("")}</div></div>`;
    });
  } else if (activeCategory === "Popular") {
    sections += `<div class="dest-directory-section"><div class="dest-directory-grid">${popular.map(cardHTML).join("")}</div></div>`;
  } else {
    const group = catalog.find((g) => g.category === activeCategory);
    sections += `<div class="dest-directory-section"><div class="dest-directory-grid">${(group?.names || []).map(cardHTML).join("")}</div></div>`;
  }

  body.innerHTML = `
    <div class="dest-directory-search">
      <div class="search-field" style="max-width: 420px;">
        <i data-lucide="search"></i>
        <input class="input" type="text" placeholder="Search ${setupKind === "destination" ? "destinations" : "sources"}…" data-setup-search />
      </div>
    </div>
    <div class="dest-directory-nav">
      ${categories.map((c) => `<button type="button" class="dest-directory-nav__item${c === activeCategory ? " is-active" : ""}" data-setup-category="${c}">${c}</button>`).join("")}
    </div>
    <div data-setup-sections>${sections}</div>`;
  refreshIcons();

  function pick(name) {
    setupSelectedName = name;
    setupStream = null;
    setupStep = 1;
    renderSetupWizard();
  }
  body.querySelectorAll("[data-setup-category]").forEach((btn) => {
    btn.addEventListener("click", () => renderSetupBrowse(btn.dataset.setupCategory));
  });
  body.querySelectorAll("[data-setup-pick]").forEach((btn) => {
    btn.addEventListener("click", () => pick(btn.dataset.setupPick));
  });
  body.querySelector("[data-setup-search]").addEventListener("input", (e) => {
    const q = normalize(e.target.value);
    if (!q) {
      renderSetupBrowse(activeCategory);
      return;
    }
    const matches = allNames.filter((n) => normalize(n).includes(q));
    document.querySelector("[data-setup-sections]").innerHTML = `<div class="dest-directory-section"><div class="dest-directory-section__title">Results</div><div class="dest-directory-grid">${matches.length ? matches.map(cardHTML).join("") : ""}</div>${matches.length ? "" : '<p class="dest-empty-note">No matches.</p>'}</div>`;
    refreshIcons();
    document.querySelectorAll("[data-setup-pick]").forEach((btn) => {
      btn.addEventListener("click", () => pick(btn.dataset.setupPick));
    });
  });
}

function wizardStepsHTML() {
  const labels = ["Data Stream", "Configure"];
  return `<div class="dest-wizard-steps">${labels
    .map(
      (label, i) => `
    <div class="dest-wizard-step${setupStep === i + 1 ? " is-active" : ""}${setupStep > i + 1 ? " is-done" : ""}"><span class="dest-wizard-step__dot">${setupStep > i + 1 ? "✓" : i + 1}</span> ${label}</div>
    ${i < labels.length - 1 ? '<div class="dest-wizard-step__sep"></div>' : ""}`
    )
    .join("")}</div>`;
}

function emptyConnectionFor(providerName) {
  const kind = getConnectionKind(providerName);
  if (kind === "webhook") return { webhookUrl: "", method: "POST", headers: [], authType: "None" };
  if (kind === "httpApi") return { baseUrl: "", method: "POST", authType: "None", headers: [] };
  if (kind === "accountUrl") return { account: "", apiBaseUrl: "", authType: "None" };
  return { account: "", authType: "None" };
}

function buildSetupSeed() {
  const name = setupSelectedName;
  const stream = setupStream;
  const template = setupTemplate(name);
  const seedName = `PHS ${name} — ${stream}`;
  const connection = emptyConnectionFor(name);
  const deliveryConfig = { mode: stream === "Message" ? "Message" : STREAM_DELIVERY_OPTIONS[stream][0], syncFrequency: "Every hour" };
  if (setupKind === "destination") {
    const destinationType = classifyDestinationType({ dataStream: stream });
    return {
      name: seedName,
      provider: name,
      category: template ? template.category : "CRM / Business",
      destinationType,
      dataStream: stream,
      dataSelection: defaultDataSelectionFor(stream),
      connection,
      deliveryConfig,
      consentConfig:
        stream === "Message"
          ? { required: true, policy: ["Marketing Consent"] }
          : { required: false, activationPolicy: `Follows workspace data-use policy for ${destinationType.toLowerCase()}s.` },
      advancedConfig: { timeout: "30s", retryPolicy: "3 attempts", batchSize: "500", rateLimit: "100/min" },
    };
  }
  return {
    name: seedName,
    provider: name,
    category: template ? template.category : "Connector",
    dataStream: stream,
    dataSelection: defaultDataSelectionFor(stream),
    connection,
    deliveryConfig,
  };
}

function renderSetupWizard() {
  const body = document.querySelector("[data-setup-body]");
  const name = setupSelectedName;
  const capabilities = setupCapabilities(name);
  const streams = setupStreams();
  refreshIcons();

  if (setupStep === 1) {
    body.innerHTML = `
      ${wizardStepsHTML()}
      <div class="stack gap-4" style="max-width: 620px;">
        <div class="cluster gap-2"><span class="dest-cell__icon"><i data-lucide="${setupIconLookup(name)}"></i></span><strong style="font-size: var(--text-md);">${name}</strong></div>
        <p class="dest-form-section__hint">Choose exactly one Data Stream for this connection account. "Behavior" is not a Data Stream — it's a category inside Event.</p>
        <div class="dest-stream-picker">
          ${streams
            .map((s) => {
              const supported = capabilities.includes(s);
              return `
            <label class="dest-stream-card${setupStream === s ? " is-selected" : ""}${supported ? "" : " is-disabled"}">
              <input type="radio" name="setup-stream" data-setup-stream value="${s}" ${setupStream === s ? "checked" : ""} ${supported ? "" : "disabled"} />
              <span class="dest-stream-card__icon"><i data-lucide="${STREAM_META[s].icon}"></i></span>
              <span class="dest-stream-card__name">${s}</span>
              <span class="dest-stream-card__desc">${STREAM_META[s].description}</span>
              ${supported ? "" : `<span class="dest-stream-card__note">Not supported by this provider</span>`}
            </label>`;
            })
            .join("")}
        </div>
      </div>
      <div class="cluster gap-3" style="justify-content: flex-end; margin-top: var(--space-6); border-top: 1px solid var(--border-subtle); padding-top: var(--space-5);">
        <button type="button" class="btn btn--ghost" data-wizard-cancel>Cancel</button>
        <button type="button" class="btn btn--primary" data-wizard-continue ${setupStream ? "" : "disabled"}>Continue</button>
      </div>`;
    body.querySelector("[data-wizard-cancel]").addEventListener("click", () => renderSetupBrowse());
    body.querySelectorAll("[data-setup-stream]").forEach((r) =>
      r.addEventListener("change", (e) => {
        setupStream = e.target.value;
        renderSetupWizard();
      })
    );
    body.querySelector("[data-wizard-continue]")?.addEventListener("click", () => {
      if (!setupStream) return;
      setupStep = 2;
      renderSetupWizard();
    });
  } else {
    body.innerHTML = `${wizardStepsHTML()}<div data-setup-form-mount></div>`;
    const formMount = body.querySelector("[data-setup-form-mount]");
    const seed = buildSetupSeed();
    if (setupKind === "destination") {
      renderDestinationConfigForm(formMount, {
        mode: "create",
        destination: seed,
        saveLabel: "Create Destination",
        onCancel: () => {
          setupStep = 1;
          renderSetupWizard();
        },
        onSave: (draft) => finalizeNewDestination(draft),
      });
    } else {
      renderSourceConfigForm(formMount, {
        mode: "create",
        source: seed,
        saveLabel: "Create Source",
        onCancel: () => {
          setupStep = 1;
          renderSetupWizard();
        },
        onSave: (draft) => finalizeNewSource(draft),
      });
    }
  }
}

function finalizeNewDestination(draft) {
  const newDest = {
    id: `${setupSelectedName.toLowerCase().replace(/\s+/g, "-")}-${Date.now()}`,
    name: draft.name,
    provider: draft.provider,
    category: draft.category,
    destinationType: draft.destinationType,
    purpose: "Custom integration",
    status: "Connected",
    dataStream: draft.dataStream,
    dataSelection: draft.dataSelection,
    connection: draft.connection,
    deliveryConfig: draft.deliveryConfig,
    consentConfig: draft.consentConfig,
    advancedConfig: draft.advancedConfig,
    lastSync: MOCK_TODAY + " · 10:00",
    lastEdit: MOCK_TODAY,
    createdAt: MOCK_TODAY,
    owner: "Growth Team",
    usersBase7d: 0,
    configuration: [],
    audiences: [],
    journeys: [],
    dataFlowId: null,
    activity: [{ time: MOCK_TODAY + " · 10:00", text: "Destination connected" }],
  };
  destinations.push(newDest);
  renderDestSummary();
  renderDestTable();
  closeSetup();
  openDestDetail(newDest.id);
}

function finalizeNewSource(draft) {
  const newSource = {
    id: `${setupSelectedName.toLowerCase().replace(/\s+/g, "-")}-${Date.now()}`,
    name: draft.name,
    provider: draft.provider,
    sourceType: getSourceProviderTypeFallback(draft.provider),
    category: draft.category,
    status: "Connected",
    dataStream: draft.dataStream,
    dataSelection: draft.dataSelection,
    connection: draft.connection,
    deliveryConfig: draft.deliveryConfig,
    lastReceived: MOCK_TODAY + " · 10:00",
    lastEdit: MOCK_TODAY,
    createdAt: MOCK_TODAY,
    owner: "Growth Team",
    usersBase7d: 0,
    dataFlowId: null,
    configuration: [],
    activity: [],
  };
  sources.push(newSource);
  renderSourceSummary();
  renderSourceTable();
  closeSetup();
  openSourceDetail(newSource.id);
}
function getSourceProviderTypeFallback(providerName) {
  const existing = SOURCES.find((s) => s.provider === providerName);
  return existing ? existing.sourceType : "Connector";
}

/* ================================================================ */
/* Full-page Edit Destination workspace — reuses the SAME              */
/* renderDestinationConfigForm as Add Destination (mode "edit").       */
/* ================================================================ */
let destEditHandle = null;
let destEditingId = null;

// Reuses the app's existing `?open=<id>` deep-link convention (see
// initDestinationsPage below) rather than introducing a second router —
// `&edit=1` extends it so a browser refresh on the edit workspace
// still resolves to the same destination from centralized state.
function setDestUrl(id, { edit = false } = {}) {
  const url = new URL(location.href);
  url.searchParams.set("open", id);
  url.searchParams.delete("kind");
  if (edit) url.searchParams.set("edit", "1");
  else url.searchParams.delete("edit");
  history.pushState({ destId: id, edit }, "", url);
}

function activityDiffDescription(before, after) {
  const changes = [];
  if (before.name !== after.name) changes.push("Name updated");
  if (JSON.stringify(before.connection) !== JSON.stringify(after.connection)) {
    changes.push(before.connection.authType !== after.connection.authType ? "Authentication updated" : "Connection settings updated");
  }
  if (JSON.stringify(before.dataSelection) !== JSON.stringify(after.dataSelection)) changes.push("Data Selection updated");
  if (before.deliveryConfig.mode !== after.deliveryConfig.mode) changes.push(`Delivery Mode: ${before.deliveryConfig.mode} → ${after.deliveryConfig.mode}`);
  else if (JSON.stringify(before.deliveryConfig) !== JSON.stringify(after.deliveryConfig)) changes.push("Delivery settings updated");
  if (JSON.stringify(before.consentConfig) !== JSON.stringify(after.consentConfig)) changes.push("Consent settings updated");
  if (JSON.stringify(before.advancedConfig) !== JSON.stringify(after.advancedConfig)) changes.push("Advanced settings updated");
  return changes.length ? `Configuration updated — ${changes.join("; ")}` : "Configuration saved — no field changes";
}

// Applies the edited draft onto the SAME destination object (never a
// duplicate). lastSync / createdAt / usersBase7d are deliberately left
// untouched — editing configuration is not a data sync or a re-creation.
// dataStream is never touched here — it's locked after creation
// (section 24); the only way to change it is a new connection account.
async function applyDraftToDestination(d, draft) {
  const before = buildDestinationDraft(d);
  d.name = draft.name;
  // Collect provider-specific config fields (GA4, Amplitude, etc.)
  const providerConfigExtra = collectConfigFromForm({ id: (d.provider||'').toLowerCase(), name: d.provider });
  d.connection = { ...draft.connection, ...providerConfigExtra, headers: [...(draft.connection.headers || [])] };
  d.dataSelection = cloneDataSelection(d.dataStream, draft.dataSelection);
  d.deliveryConfig = { ...draft.deliveryConfig };
  d.consentConfig = { ...draft.consentConfig, policy: [...(draft.consentConfig?.policy || [])] };
  d.advancedConfig = { ...draft.advancedConfig };
  const now = new Date().toLocaleString('sv').replace('T', ' · ').slice(0, 18);
  d.lastEdit = now;
  d.activity = [{ time: now, text: activityDiffDescription(before, draft) }, ...(d.activity || [])];
  // Persist to BFF (RudderStack workspaceConfig)
  if (typeof PHSAPI !== 'undefined') {
    try {
      await PHSAPI.destinations.update(d.id, {
        name:    d.name,
        config:  d.connection,
        enabled: d.enabled !== false,
      });
    } catch (e) {
      console.warn('[Destinations] BFF save failed (in-memory only):', e.message);
    }
  }
}

function closeDestEdit() {
  document.querySelector("[data-view-dest-edit]").hidden = true;
  document.body.style.overflow = "";
  destEditHandle = null;
}

function finishCloseDestEdit() {
  const id = destEditingId || currentDestDetailId;
  closeDestEdit();
  destEditingId = null;
  if (id) {
    setDestUrl(id);
    openDestDetail(id);
  }
}

function attemptCloseDestEdit() {
  if (destEditHandle && destEditHandle.isDirty()) {
    const modal = document.getElementById("dest-edit-unsaved-modal");
    modal.classList.add("is-open");
    document.body.style.overflow = "hidden";
    return;
  }
  finishCloseDestEdit();
}

function openDestEdit(d) {
  destEditingId = d.id;
  currentDestDetailId = d.id;
  setDestUrl(d.id, { edit: true });

  document.querySelector("[data-dest-edit-subtitle]").innerHTML = `<i data-lucide="${iconFor(d.provider)}"></i> ${d.provider} — ${d.name}`;
  document.querySelector("[data-dest-edit-test-result]").innerHTML = "";

  const body = document.querySelector("[data-dest-edit-body]");
  destEditHandle = renderDestinationConfigForm(body, {
    mode: "edit",
    destination: d,
    saveLabel: "Save Changes",
    externalFooter: true,
    onCancel: attemptCloseDestEdit,
    onSave: async (draft) => {
      await applyDraftToDestination(d, draft);
      renderDestSummary();
      renderDestTable();
      finishCloseDestEdit();
    },
    onCreateAnotherConnection: () => {
      closeDestEdit();
      openSetup("destination", { presetProvider: d.provider });
    },
  });

  document.querySelector("[data-view-dest-edit]").hidden = false;
  document.body.style.overflow = "hidden";
  refreshIcons();
}

function initDestEditWorkspace() {
  document.querySelector("[data-dest-edit-back]").addEventListener("click", attemptCloseDestEdit);
  document.querySelector("[data-dest-edit-cancel]").addEventListener("click", attemptCloseDestEdit);
  document.querySelector("[data-dest-edit-save]").addEventListener("click", () => destEditHandle?.trySave());
  document.querySelector("[data-dest-edit-test-connection]").addEventListener("click", () => {
    document.querySelector("[data-dest-edit-test-result]").innerHTML = testConnectionResultHTML();
    refreshIcons();
  });
  document.getElementById("dest-edit-unsaved-modal").querySelector("[data-dest-edit-discard]").addEventListener("click", () => {
    document.getElementById("dest-edit-unsaved-modal").classList.remove("is-open");
    finishCloseDestEdit();
  });
}

/* ------------------------------------------------------------------ */
/* Page entry points — Directory / Connections / Sources / Destinations*/
/* are now four separate pages (RudderStack-aligned IA). All four      */
/* reuse the SAME render/detail/setup functions above; only which      */
/* subset runs, and which DOM a given page actually has, differs.      */
/* ------------------------------------------------------------------ */

function setupQueryParam(kind) {
  // "?setup=1" opens the catalog browse step; "?setup=<Provider>"
  // (as sent by Directory's cards) jumps straight to the BFF wizard.
  const raw = new URLSearchParams(location.search).get("setup");
  if (!raw) return;
  const presetProvider = raw === "1" ? null : raw;
  if (kind === "source") {
    openSourceWizard({
      presetProvider,
      onClose: () => {},
      onCreated: (src) => { loadSourcesFromBFF(); },
    });
  } else {
    openDestWizard({
      presetProvider,
      onClose: () => {},
      onCreated: () => { loadDestinationsFromBFF(); },
    });
  }
}

export function initDestinationsPage() {
  destVisibleColumns = getStoredColumns(DEST_COLUMNS_STORAGE_KEY, DEST_DEFAULT_COLUMNS);

  loadDestinationsFromBFF().then(() => {
    renderDestSummary();
    initDestFilters();
    renderDestTable();
  });

  document.querySelector("[data-back-to-dest-list]")?.addEventListener("click", () => {
    const url = new URL(location.href);
    url.searchParams.delete("open");
    url.searchParams.delete("edit");
    history.pushState({}, "", url);
    showDestView("list");
  });

  document.querySelector("[data-add-destination]")?.addEventListener("click", () => {
    openDestWizard({
      onClose: () => {},
      onCreated: (dest) => {
        // Reload destinations from BFF after creation
        loadDestinationsFromBFF();
      }
    });
  });
  document.querySelector("[data-setup-back]")?.addEventListener("click", closeSetup);

  initDestEditWorkspace();

  const openId = new URLSearchParams(location.search).get("open");
  const openEdit = new URLSearchParams(location.search).get("edit") === "1";
  if (openId && findDestination(openId)) {
    openDestDetail(openId);
    if (openEdit) openDestEdit(findDestination(openId));
  } else {
    setupQueryParam("destination");
  }
}

export function initSourcesPage() {
  sourceVisibleColumns = getStoredColumns(SOURCE_COLUMNS_STORAGE_KEY, SOURCE_DEFAULT_COLUMNS);

  renderSourceSummary();
  initSourceFilters();
  renderSourceTable();

  // Load real sources from BFF (non-blocking, re-renders on success)
  loadSourcesFromBFF();

  document.querySelector("[data-back-to-source-list]")?.addEventListener("click", () => showSourceView("list"));
  document.querySelector("[data-add-source]")?.addEventListener("click", () => {
    openSourceWizard({
      onClose: () => {},
      onCreated: (src) => {
        // Reload sources from BFF after creation
        loadSourcesFromBFF();
      }
    });
  });
  document.querySelector("[data-setup-back]")?.addEventListener("click", closeSetup);

  const openId = new URLSearchParams(location.search).get("open");
  if (openId && findSource(openId)) {
    openSourceDetail(openId);
  } else {
    setupQueryParam("source");
  }
}

/* ------------------------------------------------------------------ */
/* Directory — browse available connector TYPES only (never a         */
/* configured instance). Picking a card hands off to the Sources/      */
/* Destinations page's own Add flow via ?setup=<provider>, rather than */
/* duplicating the setup wizard's overlay + modals on this page too.   */
/* ------------------------------------------------------------------ */
let directoryKind = "source";

function directoryCardHTML(kind, name) {
  const template = kind === "destination" ? getDestinationTemplate(name) : getSourceTemplate(name);
  const capabilities = kind === "destination" ? providerCapabilities(name) : sourceProviderCapabilities(name);
  const desc = connectorDescription(template);
  return `
    <a class="dest-directory-card" href="${kind === "destination" ? "destinations.html" : "sources.html"}?setup=${encodeURIComponent(name)}">
      <span class="dest-directory-card__icon"><i data-lucide="${iconFor(name)}"></i></span>
      <div>
        <div class="dest-directory-card__name">${name}</div>
        <div class="dest-directory-card__desc">${desc}</div>
      </div>
      <div class="dest-directory-card__meta">
        ${capabilities.map((s) => `<span class="badge badge--neutral badge--dest-tag">${s}</span>`).join("")}
      </div>
    </a>`;
}

function renderDirectoryBrowse(activeCategory = "All") {
  const body = document.querySelector("[data-directory-body]");
  if (!body) return;
  const catalog = directoryKind === "destination" ? ADD_DESTINATION_CATALOG : ADD_SOURCE_CATALOG;
  const allNames = catalog.flatMap((g) => g.names);

  const categories = ["All", ...catalog.map((g) => g.category)];
  let sections = "";
  if (activeCategory === "All") {
    catalog.forEach((g) => {
      sections += `<div class="dest-directory-section"><div class="dest-directory-section__title">${g.category}</div><div class="dest-directory-grid">${g.names.map((n) => directoryCardHTML(directoryKind, n)).join("")}</div></div>`;
    });
  } else {
    const group = catalog.find((g) => g.category === activeCategory);
    sections += `<div class="dest-directory-section"><div class="dest-directory-grid">${(group?.names || []).map((n) => directoryCardHTML(directoryKind, n)).join("")}</div></div>`;
  }

  body.innerHTML = `
    <div class="dest-directory-search">
      <div class="search-field" style="max-width: 420px;">
        <i data-lucide="search"></i>
        <input class="input" type="text" placeholder="Search ${directoryKind === "destination" ? "destinations" : "sources"}…" data-directory-search />
      </div>
    </div>
    <div class="dest-directory-nav">
      ${categories.map((c) => `<button type="button" class="dest-directory-nav__item${c === activeCategory ? " is-active" : ""}" data-directory-category="${c}">${c}</button>`).join("")}
    </div>
    <div data-directory-sections>${sections}</div>`;
  refreshIcons();

  body.querySelectorAll("[data-directory-category]").forEach((btn) => {
    btn.addEventListener("click", () => renderDirectoryBrowse(btn.dataset.directoryCategory));
  });
  body.querySelector("[data-directory-search]").addEventListener("input", (e) => {
    const q = normalize(e.target.value);
    if (!q) {
      renderDirectoryBrowse(activeCategory);
      return;
    }
    const matches = allNames.filter((n) => normalize(n).includes(q));
    document.querySelector("[data-directory-sections]").innerHTML = `<div class="dest-directory-section"><div class="dest-directory-section__title">Results</div><div class="dest-directory-grid">${matches.length ? matches.map((n) => directoryCardHTML(directoryKind, n)).join("") : ""}</div>${matches.length ? "" : '<p class="dest-empty-note">No matches.</p>'}</div>`;
    refreshIcons();
  });
}

export function initDirectoryPage() {
  const tabs = Array.from(document.querySelectorAll("[data-directory-tabs] .tabs__tab"));
  tabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      tabs.forEach((t) => t.setAttribute("aria-selected", String(t === tab)));
      directoryKind = tab.dataset.directoryKind;
      renderDirectoryFromBff();
    });
  });
  renderDirectoryFromBff();
}


// ─── Directory — BFF-backed catalog (87 sources + 254 destinations from RS GitHub) ───

let _bffDirectoryCache = null;

async function fetchBffDirectory() {
  if (_bffDirectoryCache) return _bffDirectoryCache;
  try {
    const BASE = (typeof PHSAPI !== 'undefined' && PHSAPI.BASE) || 'http://localhost:3001/api';
    const res  = await fetch(`${BASE}/directory`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    _bffDirectoryCache = await res.json();
    return _bffDirectoryCache;
  } catch (e) {
    console.warn('[Directory] BFF fetch failed, using static catalog:', e.message);
    return null;
  }
}

function bffLogoUrl(item) {
  // Prefer logo URL from catalog (pre-mapped in BFF rsCatalogFetcher.js)
  if (item.logo) return item.logo;
  // Fallback: derive slug from folder name
  const slug = (item.folder || item.name || '').toLowerCase()
    .replace(/[^a-z0-9]/g, '');
  return slug ? `https://cdn.simpleicons.org/${slug}` : null;
}

function bffDirectoryCardHTML(kind, item) {
  const name       = item.name || item.id || 'Unknown';
  const logoSrc    = bffLogoUrl(item);
  const initials   = name.replace(/[^A-Za-z0-9]/g,' ').split(' ').filter(Boolean)
    .slice(0,2).map(w=>w[0].toUpperCase()).join('');
  const configured = item.configured ? '<span class="badge badge--success" style="font-size:10px;margin-left:4px">Active</span>' : '';
  const popular    = (item.tags||[]).includes('Popular') ? '<span class="badge badge--neutral" style="font-size:10px;margin-left:4px">Popular</span>' : '';
  const href       = kind === 'destination'
    ? `destinations.html?setup=${encodeURIComponent(item.id||name)}`
    : `sources.html?setup=${encodeURIComponent(item.id||name)}`;
  const imgTag = logoSrc
    ? `<img src="${logoSrc}" alt="${name}" style="width:28px;height:28px;object-fit:contain" onerror="this.style.display='none';this.nextElementSibling.style.display='flex'">`
    : '';
  const fallbackEl = `<span style="display:${logoSrc?'none':'flex'};width:28px;height:28px;background:var(--brand,#6366f1);color:#fff;border-radius:6px;align-items:center;justify-content:center;font-size:11px;font-weight:700">${initials||'?'}</span>`;
  return `
    <a class="dest-directory-card" href="${href}" title="${name}">
      <span class="dest-directory-card__icon" style="width:36px;height:36px;display:flex;align-items:center;justify-content:center;flex-shrink:0">
        ${imgTag}${fallbackEl}
      </span>
      <div style="flex:1;min-width:0">
        <div class="dest-directory-card__name">${name}${configured}${popular}</div>
        <div class="dest-directory-card__desc" style="color:var(--text-muted,#6b7280);font-size:12px">${item.category || ''}</div>
      </div>
    </a>`;
}

async function renderDirectoryFromBff(activeCategory = 'All') {
  const body = document.querySelector('[data-directory-body]');
  if (!body) return;

  // Show loading state
  body.innerHTML = `<div style="padding:48px;text-align:center;color:var(--text-muted,#6b7280)">
    <div class="skeleton-row" style="height:18px;background:var(--border,#e5e7eb);border-radius:4px;margin:0 auto 10px;width:60%;animation:skeleton-pulse 1.4s ease infinite"></div>
    <div class="skeleton-row" style="height:18px;background:var(--border,#e5e7eb);border-radius:4px;margin:0 auto 10px;width:40%;animation:skeleton-pulse 1.4s ease infinite"></div>
  </div>`;

  const catalog = await fetchBffDirectory();
  if (!catalog) {
    // BFF unreachable → fall back to static
    renderDirectoryBrowse(activeCategory);
    return;
  }

  const grouped = directoryKind === 'destination'
    ? catalog.grouped?.destinations
    : catalog.grouped?.sources;

  const allItems = directoryKind === 'destination'
    ? (catalog.data?.destinations || [])
    : (catalog.data?.sources      || []);

  const total = allItems.length;

  // Build category filter pills
  const categories = ['All', ...(grouped || []).map(g => g.category)];
  const filtered   = activeCategory === 'All'
    ? (grouped || [])
    : (grouped || []).filter(g => g.category === activeCategory);

  let sections = '';
  for (const g of filtered) {
    sections += `
      <div class="dest-directory-section">
        <div class="dest-directory-section__title">${g.category} <span style="color:var(--text-muted,#9ca3af);font-weight:400;font-size:13px">(${g.items.length})</span></div>
        <div class="dest-directory-grid">${g.items.map(item => bffDirectoryCardHTML(directoryKind, item)).join('')}</div>
      </div>`;
  }

  body.innerHTML = `
    <div class="dest-directory-search" style="margin-bottom:16px">
      <input type="search" class="input input--sm" placeholder="Search ${total} ${directoryKind}s..."
             data-directory-search style="width:100%;max-width:400px">
    </div>
    <div class="dest-directory-nav" style="display:flex;flex-wrap:wrap;gap:8px;margin-bottom:24px">
      ${categories.map(c => `<button type="button" class="dest-directory-nav__item${c === activeCategory ? ' is-active' : ''}" data-bff-category="${c}">${c}</button>`).join('')}
    </div>
    <div data-directory-sections>${sections}</div>`;

  // Wire category pills
  body.querySelectorAll('[data-bff-category]').forEach(btn => {
    btn.addEventListener('click', () => renderDirectoryFromBff(btn.dataset.bffCategory));
  });

  // Wire search
  body.querySelector('[data-directory-search]').addEventListener('input', e => {
    const q = e.target.value.toLowerCase().trim();
    if (!q) { renderDirectoryFromBff(activeCategory); return; }
    const matches = allItems.filter(item =>
      (item.name || '').toLowerCase().includes(q) ||
      (item.category || '').toLowerCase().includes(q)
    );
    body.querySelector('[data-directory-sections]').innerHTML = matches.length
      ? `<div class="dest-directory-section"><div class="dest-directory-grid">${matches.map(item => bffDirectoryCardHTML(directoryKind, item)).join('')}</div></div>`
      : `<p class="dest-empty-note">No matches for "${e.target.value}".</p>`;
    refreshIcons();
  });

  refreshIcons();
  console.log(`[Directory] BFF loaded — ${total} ${directoryKind}s`);
}
