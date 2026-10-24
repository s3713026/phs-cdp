/*
  Campaigns (Activation) — the activation configuration layer.

  Audience / Segment
        |
     Campaign
        |
   +---------+
   |         |
Template  Delivery
   |         |
   +----+----+
        |
   Activation
        |
   Measurement

  Campaign owns: target audience, goal, messaging channel, message/
  template selection, experimentation mode (single/A-B/split), simple
  schedule, delivery preferences, status. It owns exactly ONE primary
  messaging channel per campaign — multi-channel sequencing (Push ->
  wait -> Email -> Zalo) is Journey Builder's job, never duplicated
  here (see js/pages/campaigns.js journeyBoundaryNote()).

  References existing Audiences (js/data/audiences.js), Templates
  (js/data/content.js — the Template/Content store) and Destinations
  (js/data/destinations.js) by id. A Campaign never copies an audience
  definition, a template body, or a destination's connection config.

  Data source: 100% local mock data, synchronous, zero fetch/BFF calls.
  // TODO: Replace the mock campaign provider with a BFF endpoint when
  // the backend contract exists. CAMPAIGNS / getCampaignById() /
  // addCampaign() / updateCampaignStatus() / duplicateCampaign() are
  // the functions to swap — the UI should not need to change.
*/
import { getAudienceById, reachMetrics, estimateAudienceSize } from "./audiences.js";
import { getDestinationById } from "./destinations.js";

export const CAMPAIGN_STATUSES = ["Draft", "Scheduled", "Active", "Paused", "Completed"];
export const GOAL_CATEGORIES = ["Acquisition", "Activation", "Engagement", "Conversion", "Retention", "Reactivation"];
export const CAMPAIGN_CHANNELS = ["Email", "Push", "Web Message", "In-App", "SMS", "Zalo"];
export const CAMPAIGN_PRIORITIES = ["P0", "P1", "P2"];
export const MESSAGE_TYPES = ["single", "ab_test", "split_delivery"];
export const MESSAGE_TYPE_LABELS = { single: "Single Message", ab_test: "A/B Test", split_delivery: "Split Delivery" };
export const AB_TEST_GOALS = ["Clicks", "Views", "Conversion Event"];
export const FREQUENCY_UNITS = ["24 hours", "7 days", "30 days"];
export const PRIMARY_KPI_OPTIONS = ["First Trade Conversion", "Account Activation Rate", "eKYC Completion Rate", "Reactivation Rate", "Engagement Rate", "Deposit Conversion"];
export const SECONDARY_KPI_OPTIONS = ["Delivery Rate", "Open Rate", "Click Rate", "Conversion Rate"];
export const CONVERSION_EVENT_OPTIONS = ["First Trade", "Account Funded", "eKYC Completed", "Deposit", "Login", "App Open"];

const CHANNEL_DESTINATION = { Email: "email", Push: "push", "Web Message": "web-message", "In-App": "in-app", SMS: "sms", Zalo: "zalo" };

function hashString(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) >>> 0;
  return h;
}
function pad2(n) {
  return String(n).padStart(2, "0");
}
const MONTHS_ABBR = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
function today() {
  const d = new Date();
  return `${pad2(d.getDate())} ${MONTHS_ABBR[d.getMonth()]} ${d.getFullYear()}`;
}

export function destinationIdForChannel(channel) {
  return CHANNEL_DESTINATION[channel];
}
export function channelDestination(channel) {
  return getDestinationById(destinationIdForChannel(channel));
}

/* ------------------------------------------------------------------ */
/* WHO — targeting. Reuses an existing Audience by id, OR an inline,   */
/* campaign-only filter (never a second saved Audience unless the      */
/* user explicitly chooses "Save as Audience", which hands off to the  */
/* real Audience creation flow instead of duplicating it here).        */
/* ------------------------------------------------------------------ */
export function targetingReach(targeting) {
  if (targeting.type === "audience") {
    const a = getAudienceById(targeting.audienceId);
    if (!a) return { total: 0, reachable: 0, consentEligible: 0 };
    const r = reachMetrics(a);
    return { total: a.memberCount, reachable: r.reachable, consentEligible: r.consentEligible };
  }
  const total = estimateAudienceSize(targeting.filters || []);
  return { total, reachable: Math.round(total * 0.877), consentEligible: Math.round(total * 0.793) };
}

/* ------------------------------------------------------------------ */
/* Seed campaigns (section 6). `goal` is the specific descriptive goal */
/* shown in the list/detail; `goalCategory` is the constrained enum    */
/* (GOAL_CATEGORIES) used by the Create Campaign form and Goal filter. */
/* ------------------------------------------------------------------ */
export const CAMPAIGNS = [
  {
    id: "cmp_first_trade",
    name: "First Trade Activation",
    description: "Activate funded customers who have not completed their first trade.",
    channel: "Push",
    goalCategory: "Conversion",
    goal: "First Trade Conversion",
    priority: "P0",
    owner: "CRM Automation",
    status: "Draft",
    targeting: { type: "audience", audienceId: "aud-012", filters: [] },
    messageType: "single",
    templateIds: ["cnt-003"],
    variants: [],
    abTest: null,
    schedule: { startDate: "", startTime: "", endDate: "", endTime: "", timezone: "Asia/Ho_Chi_Minh", label: "Not scheduled" },
    deliveryPreferences: { frequencyCapAmount: 1, frequencyCapUnit: "24 hours", quietHoursStart: "22:00", quietHoursEnd: "07:00", respectConsent: true, respectChannelPreference: true, ttl: "24 hours" },
    primaryKpi: "First Trade Conversion",
    secondaryKpis: ["Delivery Rate", "Open Rate", "Click Rate"],
    conversionEvent: "First Trade",
    createdAt: "28 Sep 2026",
    updatedAt: "05 Oct 2026",
  },
  {
    id: "cmp_welcome_account",
    name: "Welcome New Account",
    description: "Welcome newly registered customers and introduce core product features.",
    channel: "Email",
    goalCategory: "Activation",
    goal: "Account Activation",
    priority: "P1",
    owner: "CRM Automation",
    status: "Active",
    targeting: { type: "audience", audienceId: "aud-007", filters: [] },
    messageType: "single",
    templateIds: ["cnt-001"],
    variants: [],
    abTest: null,
    schedule: { startDate: "2026-08-18", startTime: "00:00", endDate: "", endTime: "", timezone: "Asia/Ho_Chi_Minh", label: "Always On" },
    deliveryPreferences: { frequencyCapAmount: 1, frequencyCapUnit: "24 hours", quietHoursStart: "22:00", quietHoursEnd: "07:00", respectConsent: true, respectChannelPreference: true, ttl: "—" },
    primaryKpi: "Account Activation Rate",
    secondaryKpis: ["Delivery Rate", "Open Rate"],
    conversionEvent: "Login",
    createdAt: "18 Aug 2026",
    updatedAt: "20 Sep 2026",
  },
  {
    id: "cmp_ekyc_reminder",
    name: "eKYC Reminder",
    description: "Remind customers with an incomplete eKYC step to finish verification.",
    channel: "Zalo",
    goalCategory: "Activation",
    goal: "eKYC Completion",
    priority: "P1",
    owner: "CRM Automation",
    status: "Active",
    targeting: { type: "audience", audienceId: "aud-013", filters: [] },
    messageType: "single",
    templateIds: ["cnt-008"],
    variants: [],
    abTest: null,
    schedule: { startDate: "2026-10-07", startTime: "09:00", endDate: "", endTime: "", timezone: "Asia/Ho_Chi_Minh", label: "07 Oct 2026 — 09:00" },
    deliveryPreferences: { frequencyCapAmount: 1, frequencyCapUnit: "7 days", quietHoursStart: "22:00", quietHoursEnd: "07:00", respectConsent: false, respectChannelPreference: true, ttl: "—" },
    primaryKpi: "eKYC Completion Rate",
    secondaryKpis: ["Delivery Rate", "Click Rate"],
    conversionEvent: "eKYC Completed",
    createdAt: "10 Sep 2026",
    updatedAt: "01 Oct 2026",
  },
  {
    id: "cmp_reactivation",
    name: "Reactivation",
    description: "Re-engage dormant customers with no recent login or trading activity.",
    channel: "Email",
    goalCategory: "Reactivation",
    goal: "Reactivation",
    priority: "P2",
    owner: "CRM Automation",
    status: "Draft",
    targeting: { type: "audience", audienceId: "aud-003", filters: [] },
    messageType: "single",
    templateIds: ["cnt-006"],
    variants: [],
    abTest: null,
    schedule: { startDate: "", startTime: "", endDate: "", endTime: "", timezone: "Asia/Ho_Chi_Minh", label: "Not scheduled" },
    deliveryPreferences: { frequencyCapAmount: 1, frequencyCapUnit: "24 hours", quietHoursStart: "22:00", quietHoursEnd: "07:00", respectConsent: true, respectChannelPreference: true, ttl: "—" },
    primaryKpi: "Reactivation Rate",
    secondaryKpis: ["Delivery Rate", "Open Rate", "Click Rate"],
    conversionEvent: "Login",
    createdAt: "22 Sep 2026",
    updatedAt: "28 Sep 2026",
  },
  {
    id: "cmp_high_engagement",
    name: "High Engagement Product Nurture",
    description: "Nurture highly engaged customers with product content to deepen engagement.",
    channel: "Push",
    goalCategory: "Engagement",
    goal: "Engagement",
    priority: "P2",
    owner: "CRM Automation",
    status: "Scheduled",
    targeting: { type: "audience", audienceId: "aud-008", filters: [] },
    messageType: "ab_test",
    templateIds: ["cnt-003"],
    variants: [
      { id: "A", templateId: "cnt-003", distribution: 50 },
      { id: "B", templateId: "cnt-003", distribution: 50 },
    ],
    abTest: { testAudiencePct: 10, testGoal: "Clicks", testDuration: "45 minutes", winnerAction: "Send winning variant to remaining audience" },
    schedule: { startDate: "2026-10-10", startTime: "09:00", endDate: "", endTime: "", timezone: "Asia/Ho_Chi_Minh", label: "10 Oct 2026 — 09:00" },
    deliveryPreferences: { frequencyCapAmount: 1, frequencyCapUnit: "24 hours", quietHoursStart: "22:00", quietHoursEnd: "07:00", respectConsent: true, respectChannelPreference: true, ttl: "—" },
    primaryKpi: "Engagement Rate",
    secondaryKpis: ["Delivery Rate", "Click Rate"],
    conversionEvent: "App Open",
    createdAt: "25 Sep 2026",
    updatedAt: "02 Oct 2026",
  },
];

export function getCampaignById(id) {
  return CAMPAIGNS.find((c) => c.id === id);
}
export function campaignAudience(c) {
  return c.targeting.type === "audience" ? getAudienceById(c.targeting.audienceId) : null;
}
export function campaignDestination(c) {
  return channelDestination(c.channel);
}
export function nextCampaignId(name) {
  const slug = (name || "campaign").toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 24) || "campaign";
  let id = `cmp_${slug}`;
  let n = 1;
  while (getCampaignById(id)) id = `cmp_${slug}_${++n}`;
  return id;
}
export function addCampaign(record) {
  const campaign = { id: nextCampaignId(record.name), createdAt: today(), updatedAt: today(), ...record };
  CAMPAIGNS.push(campaign);
  return campaign;
}
export function updateCampaignStatus(id, status) {
  const c = getCampaignById(id);
  if (!c) return;
  c.status = status;
  c.updatedAt = today();
  return c;
}
export function updateCampaign(id, patch) {
  const c = getCampaignById(id);
  if (!c) return;
  Object.assign(c, patch, { updatedAt: today() });
  return c;
}
export function duplicateCampaign(id) {
  const source = getCampaignById(id);
  if (!source) return;
  const copy = JSON.parse(JSON.stringify(source));
  copy.id = nextCampaignId(`${source.name} copy`);
  copy.name = `${source.name} — Copy`;
  copy.status = "Draft";
  copy.createdAt = today();
  copy.updatedAt = today();
  CAMPAIGNS.push(copy);
  return copy;
}

export const STATUS_TRANSITION_COPY = {
  Paused: { title: "Pause this campaign?", body: "Pausing the campaign will stop future activation while preserving its configuration." },
  Active: { title: "Activate this campaign?", body: "Activating will begin sending to eligible audience members according to the configured trigger." },
  Completed: { title: "Mark this campaign as completed?", body: "Completed campaigns stop future activation and are retained for reporting." },
  Draft: { title: "Move this campaign back to Draft?", body: "The campaign will stop any scheduled activation and return to configuration." },
  Scheduled: { title: "Schedule this campaign?", body: "The campaign will begin activation at its configured trigger time." },
};

/* ------------------------------------------------------------------ */
/* Performance — deterministic synthetic prototype data. First Trade   */
/* Activation matches the spec's literal figures exactly; other        */
/* campaigns use smaller, scaled synthetic values. Draft/Scheduled      */
/* campaigns haven't run yet — all funnel fields are null ("—").       */
/* ------------------------------------------------------------------ */
export function performanceFor(c) {
  const reach = targetingReach(c.targeting);
  if (c.id === "cmp_first_trade") {
    return { audience: 12420, eligible: 9842, sent: 9842, delivered: 9710, opened: 4812, clicked: 1420, converted: 827, conversionRate: 8.4 };
  }
  if (c.status === "Draft" || c.status === "Scheduled") {
    return { audience: reach.total, eligible: reach.consentEligible, sent: null, delivered: null, opened: null, clicked: null, converted: null, conversionRate: null };
  }
  const h = hashString(c.id + "-perf");
  const sent = reach.consentEligible;
  const delivered = Math.round(sent * (0.93 + (h % 5) / 100));
  const opened = Math.round(delivered * (0.3 + (h % 15) / 100));
  const clicked = Math.round(opened * (0.18 + (h % 10) / 100));
  const converted = Math.round(clicked * (0.1 + (h % 8) / 100));
  const conversionRate = sent ? +((converted / sent) * 100).toFixed(1) : 0;
  return { audience: reach.total, eligible: reach.consentEligible, sent, delivered, opened, clicked, converted, conversionRate };
}
