/**
 * PHS CDP BFF — Sources mock data.
 *
 * Schema mirrors js/data/sources.js on the UI exactly so that any
 * loadSourcesFromBFF() call can replace inline data without breaking
 * render functions.
 *
 * Each entry is a "Connection Account" with exactly ONE Data Stream.
 * Fields:
 *   id, name, provider, sourceType, category, status, dataStream,
 *   dataSelection, deliveryConfig, lastReceived, dataFlowId, usersBase7d,
 *   configuration[], activity[]
 *
 * deliveryConfig for sources:
 *   Event   → { mode: 'Stream' }
 *   Profile → { mode: 'Batch', syncFrequency: 'Every 6 hours' }
 */

function activity(entries) {
  return entries.map(([time, text]) => ({ time, text }));
}

const SOURCES = [
  {
    id: 'phs-mobile-app',
    name: 'PHS Mobile App — Event',
    provider: 'PHS Mobile App',
    sourceType: 'Mobile App',
    category: 'Mobile',
    status: 'Connected',
    dataStream: 'Event',
    dataSelection: { mode: 'all', eventIds: [], eventProperties: {} },
    deliveryConfig: { mode: 'Stream' },
    lastReceived: '23 Sep 2026 · 10:45',
    dataFlowId: 'flow-in-mobile',
    usersBase7d: 382419,
    configuration: [
      { label: 'SDK Version', value: 'PHS Mobile SDK v4.2' },
      { label: 'Connection', value: 'Connected' },
      { label: 'Write Key', value: '••••••••••••', masked: true },
    ],
    activity: activity([
      ['23 Sep 2026 · 10:45', 'Event stream healthy'],
      ['23 Sep 2026 · 06:00', '892,104 events received'],
    ]),
  },
  {
    id: 'phs-website',
    name: 'PHS Website — Event',
    provider: 'PHS Website',
    sourceType: 'Web',
    category: 'Web',
    status: 'Connected',
    dataStream: 'Event',
    dataSelection: { mode: 'all', eventIds: [], eventProperties: {} },
    deliveryConfig: { mode: 'Stream' },
    lastReceived: '23 Sep 2026 · 10:41',
    dataFlowId: 'flow-in-web',
    usersBase7d: 312480,
    configuration: [
      { label: 'Site', value: 'phs.com.vn' },
      { label: 'Connection', value: 'Connected' },
      { label: 'Site Token', value: '••••••••••••', masked: true },
    ],
    activity: activity([
      ['23 Sep 2026 · 10:41', 'Event stream healthy'],
      ['23 Sep 2026 · 06:00', '312,480 events received'],
    ]),
  },
  {
    id: 'appsflyer',
    name: 'PHS AppsFlyer — Events',
    provider: 'AppsFlyer',
    sourceType: 'Partner',
    category: 'Partner',
    status: 'Connected',
    dataStream: 'Event',
    dataSelection: { mode: 'all', eventIds: [], eventProperties: {} },
    deliveryConfig: { mode: 'Stream' },
    lastReceived: '23 Sep 2026 · 10:20',
    dataFlowId: 'flow-in-appsflyer',
    usersBase7d: 124820,
    configuration: [
      { label: 'Account', value: 'PHS Attribution Account' },
      { label: 'Connection', value: 'Connected' },
      { label: 'Pull API Key', value: '••••••••••••', masked: true },
    ],
    activity: activity([
      ['23 Sep 2026 · 10:20', 'Attribution events received'],
      ['22 Sep 2026 · 10:18', '124,820 events received'],
    ]),
  },
  {
    id: 'crm-source',
    name: 'PHS CRM — Profile',
    provider: 'CRM',
    sourceType: 'Connector',
    category: 'Connector',
    status: 'Connected',
    dataStream: 'Profile',
    dataSelection: {
      attributeIds: ['accountId', 'customerTier', 'lifecycleStage', 'location', 'preferredChannel', 'preferredLanguage', 'birthday'],
    },
    deliveryConfig: { mode: 'Batch', syncFrequency: 'Every 6 hours' },
    lastReceived: '23 Sep 2026 · 06:00',
    dataFlowId: 'flow-in-crm',
    usersBase7d: 1284392,
    configuration: [
      { label: 'Instance', value: 'PHS CRM Instance' },
      { label: 'Connection', value: 'Connected' },
      { label: 'Service Account Key', value: '••••••••••••', masked: true },
    ],
    activity: activity([
      ['23 Sep 2026 · 06:00', '1,284,392 profiles received'],
      ['22 Sep 2026 · 06:00', 'Batch import completed'],
    ]),
  },
  {
    id: 'webhook-source',
    name: 'PHS Webhook — Event',
    provider: 'Webhook',
    sourceType: 'Webhook',
    category: 'Webhook',
    status: 'Connected',
    dataStream: 'Event',
    dataSelection: { mode: 'all', eventIds: [], eventProperties: {} },
    deliveryConfig: { mode: 'Stream' },
    lastReceived: '23 Sep 2026 · 10:33',
    dataFlowId: 'flow-in-webhook',
    usersBase7d: 96340,
    configuration: [
      { label: 'Endpoint', value: 'https://hooks.phs-cdp.example/in/behavior-events' },
      { label: 'Connection', value: 'Connected' },
      { label: 'Webhook Secret', value: '••••••••••••', masked: true },
    ],
    activity: activity([
      ['23 Sep 2026 · 10:33', '96,340 events received'],
      ['22 Sep 2026 · 09:12', '96,340 events received'],
    ]),
  },
  {
    id: 'trading-api',
    name: 'PHS Trading API — Event',
    provider: 'Trading API',
    sourceType: 'API',
    category: 'API',
    status: 'Connected',
    dataStream: 'Event',
    dataSelection: { mode: 'all', eventIds: [], eventProperties: {} },
    deliveryConfig: { mode: 'Stream' },
    lastReceived: '23 Sep 2026 · 10:44',
    dataFlowId: 'flow-in-trading',
    usersBase7d: 214600,
    configuration: [
      { label: 'System', value: 'Core Trading Platform' },
      { label: 'Connection', value: 'Connected' },
      { label: 'Internal Service Token', value: '••••••••••••', masked: true },
    ],
    activity: activity([
      ['23 Sep 2026 · 10:44', 'Order activity stream healthy'],
      ['23 Sep 2026 · 06:00', '214,600 events received'],
    ]),
  },
  {
    id: 'partner-api',
    name: 'PHS Partner API — Profile',
    provider: 'Partner API',
    sourceType: 'Partner',
    category: 'Partner',
    status: 'Available',
    dataStream: 'Profile',
    dataSelection: {
      attributeIds: ['accountId', 'customerTier', 'lifecycleStage', 'riskProfile', 'location', 'preferredChannel', 'preferredLanguage', 'birthday'],
    },
    deliveryConfig: { mode: 'Batch', syncFrequency: 'Every 6 hours' },
    lastReceived: '—',
    dataFlowId: null,
    usersBase7d: 0,
    configuration: [
      { label: 'Endpoint', value: 'https://partner.example.com/api/v1/export' },
      { label: 'Connection', value: 'Not yet connected' },
      { label: 'API Key', value: '••••••••••••', masked: true },
    ],
    activity: [],
  },
  {
    id: 'partner-api-events',
    name: 'PHS Partner API — Events',
    provider: 'Partner API',
    sourceType: 'Partner',
    category: 'Partner',
    status: 'Error',
    dataStream: 'Event',
    dataSelection: { mode: 'all', eventIds: [], eventProperties: {} },
    deliveryConfig: { mode: 'Stream' },
    lastReceived: '24 Sep 2026 · 09:58',
    dataFlowId: null,
    usersBase7d: 0,
    configuration: [
      { label: 'Endpoint', value: 'https://partner.example.com/api/v1/events' },
      { label: 'Connection', value: 'Error — validation service unavailable' },
      { label: 'API Key', value: '••••••••••••', masked: true },
    ],
    activity: [],
  },
  {
    id: 'zalo-source',
    name: 'PHS Zalo — Profile',
    provider: 'Zalo',
    sourceType: 'Connector',
    category: 'Connector',
    status: 'Connected',
    dataStream: 'Profile',
    dataSelection: { attributeIds: ['accountId', 'customerTier', 'location'] },
    deliveryConfig: { mode: 'Batch', syncFrequency: 'Every 6 hours' },
    lastReceived: '23 Sep 2026 · 06:00',
    dataFlowId: 'flow-in-zalo',
    usersBase7d: 71204,
    configuration: [
      { label: 'Account', value: 'PHS Official Account' },
      { label: 'Connection', value: 'Connected' },
      { label: 'OA Access Token', value: '••••••••••••', masked: true },
    ],
    activity: activity([
      ['23 Sep 2026 · 06:00', '71,204 profiles received'],
      ['22 Sep 2026 · 06:00', 'Batch import completed'],
    ]),
  },
  {
    id: 'n8n-source',
    name: 'PHS n8n — Event',
    provider: 'n8n',
    sourceType: 'Connector',
    category: 'Connector',
    status: 'Connected',
    dataStream: 'Event',
    dataSelection: { mode: 'all', eventIds: [], eventProperties: {} },
    deliveryConfig: { mode: 'Stream' },
    lastReceived: '23 Sep 2026 · 09:40',
    dataFlowId: null,
    usersBase7d: 22140,
    configuration: [
      { label: 'Workflow', value: 'PHS Automation Workspace' },
      { label: 'Connection', value: 'Connected' },
      { label: 'Webhook Secret', value: '••••••••••••', masked: true },
    ],
    activity: activity([
      ['23 Sep 2026 · 09:40', 'Workflow events received'],
      ['22 Sep 2026 · 09:40', '22,140 events received'],
    ]),
  },
];

module.exports = { SOURCES };
