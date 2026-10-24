/*
  PHS CDP — Customer 360 Campaigns & Journeys enrollment data.

  Customer-360-scoped prototype data. The campaign/journey NAMES,
  channels and goals below are pulled read-only from the real shared
  catalogs (js/data/campaigns.js CAMPAIGNS, js/data/journeys.js
  JOURNEYS) via their existing getCampaignById/getJourneyById lookups
  — only the static arrays and those two pure functions are imported;
  no mutating function (addCampaign, updateCampaignStatus,
  saveJourneyOverride, simulateJourney, …) is called from here.

  Everything ABOUT this customer's relationship to that campaign/
  journey — enrollment status, timestamps, current step, delivery/
  engagement/exit status, outcome — is synthetic prototype data local
  to this file. It is illustrative only and is not reflected in, derived
  from, or written back to the live Campaigns or Journey Builder
  modules. Do not treat these as real execution records.

  Audience membership is NEVER used to infer campaign/journey
  enrollment here — customers.js's `audiences[]` entries are plain
  display-name strings and do not share a key with campaigns.js's
  `targeting.audienceId`, so no such inference would even be possible
  without guessing; enrollment is only ever an explicit record below.
*/
import { getCampaignById } from "./campaigns.js";
import { getJourneyById } from "./journeys.js";

export const ENROLLMENT_STATUSES = ["Enrolled", "In Progress", "Completed", "Exited", "Not Enrolled", "Unknown"];

export const CAMPAIGN_ENROLLMENTS = [
  {
    customerId: "PHS-CUS-1002831", // Nguyễn Minh Anh
    campaignId: "cmp_high_engagement",
    status: "Enrolled",
    enrolledAt: "10 Sep 2026",
    lastInteractionAt: "17 Sep 2026",
    deliveryStatus: "Delivered",
    engagementStatus: "Opened",
    exitStatus: null,
    outcome: "Not recorded",
  },
  {
    customerId: "PHS-CUS-1002832", // Trần Quốc Bảo
    campaignId: "cmp_welcome_account",
    status: "Completed",
    enrolledAt: "02 May 2026",
    lastInteractionAt: "05 May 2026",
    deliveryStatus: "Delivered",
    engagementStatus: "Opened",
    exitStatus: "Goal achieved",
    outcome: "Not recorded",
  },
  {
    customerId: "PHS-CUS-1002833", // Lê Hoàng Nam
    campaignId: "cmp_welcome_account",
    status: "In Progress",
    enrolledAt: "16 Sep 2026",
    lastInteractionAt: "16 Sep 2026",
    deliveryStatus: "Delivered",
    engagementStatus: "Not opened",
    exitStatus: null,
    outcome: "Not recorded",
  },
  {
    customerId: "PHS-CUS-1002833", // Lê Hoàng Nam — also targeted by the eKYC reminder campaign
    campaignId: "cmp_ekyc_reminder",
    status: "Enrolled",
    enrolledAt: "16 Sep 2026",
    lastInteractionAt: null,
    deliveryStatus: "Pending",
    engagementStatus: "Unknown",
    exitStatus: null,
    outcome: "Not recorded",
  },
  {
    customerId: "PHS-CUS-1002834", // Phạm Thu Hà
    campaignId: "cmp_high_engagement",
    status: "Completed",
    enrolledAt: "01 Sep 2026",
    lastInteractionAt: "17 Sep 2026",
    deliveryStatus: "Delivered",
    engagementStatus: "Clicked",
    exitStatus: "Goal achieved",
    outcome: "Not recorded",
  },
  {
    customerId: "PHS-CUS-1002835", // Demo Profile 5 — historical, from when she first registered
    campaignId: "cmp_welcome_account",
    status: "Completed",
    enrolledAt: "05 Jan 2025",
    lastInteractionAt: "08 Jan 2025",
    deliveryStatus: "Delivered",
    engagementStatus: "Opened",
    exitStatus: "Goal achieved",
    outcome: "Not recorded",
  },
  // Golden Customer fixture (js/data/customer-360-golden.js) — same
  // real campaign catalog, read-only. Welcome + eKYC reminder both
  // Completed (matches her clean, quick funnel); High Engagement
  // Product Nurture still In Progress (matches her current "High
  // Engagement" audience membership and engagement.lastCampaign).
  {
    customerId: "PHS-CUS-GOLDEN-001",
    campaignId: "cmp_welcome_account",
    status: "Completed",
    enrolledAt: "06 Jul 2026",
    lastInteractionAt: "07 Jul 2026",
    deliveryStatus: "Delivered",
    engagementStatus: "Opened",
    exitStatus: "Goal achieved",
    outcome: "Not recorded",
  },
  {
    customerId: "PHS-CUS-GOLDEN-001",
    campaignId: "cmp_ekyc_reminder",
    status: "Completed",
    enrolledAt: "08 Jul 2026",
    lastInteractionAt: "09 Jul 2026",
    deliveryStatus: "Delivered",
    engagementStatus: "Opened",
    exitStatus: "Goal achieved",
    outcome: "Not recorded",
  },
  {
    customerId: "PHS-CUS-GOLDEN-001",
    campaignId: "cmp_high_engagement",
    status: "In Progress",
    enrolledAt: "15 Aug 2026",
    lastInteractionAt: "17 Sep 2026",
    deliveryStatus: "Delivered",
    engagementStatus: "Clicked",
    exitStatus: null,
    outcome: "Not recorded",
  },
];

export const JOURNEY_ENROLLMENTS = [
  {
    customerId: "PHS-CUS-1002831", // Nguyễn Minh Anh
    journeyId: "jr-high-value",
    status: "In Progress",
    enrolledAt: "12 Aug 2026",
    currentStep: "Push: Portfolio Insight",
    lastInteractionAt: "17 Sep 2026",
    exitStatus: null,
    outcome: "Not recorded",
  },
  {
    customerId: "PHS-CUS-1002833", // Lê Hoàng Nam
    journeyId: "jr-new-investor",
    status: "In Progress",
    enrolledAt: "16 Sep 2026",
    currentStep: "Wait 1 Day",
    lastInteractionAt: "16 Sep 2026",
    exitStatus: null,
    outcome: "Not recorded",
  },
  {
    customerId: "PHS-CUS-1002834", // Phạm Thu Hà — matches her own summary ("no trade in the last 30 days")
    journeyId: "jr-reengage-high-engagement",
    status: "In Progress",
    enrolledAt: "01 Sep 2026",
    currentStep: "Email: Resume Trading Nudge",
    lastInteractionAt: "15 Sep 2026",
    exitStatus: null,
    outcome: "Not recorded",
  },
  // Golden Customer fixture — a completed onboarding journey, a
  // completed event-triggered post-trade journey (fired by her first
  // trade on 16 Jul 2026), and a still-In-Progress engagement journey
  // (matches her App-primary preferred channel).
  {
    customerId: "PHS-CUS-GOLDEN-001",
    journeyId: "jr-new-investor",
    status: "Completed",
    enrolledAt: "06 Jul 2026",
    currentStep: "Completed",
    lastInteractionAt: "16 Jul 2026",
    exitStatus: "Goal achieved",
    outcome: "Not recorded",
  },
  {
    customerId: "PHS-CUS-GOLDEN-001",
    journeyId: "jr-post-trade",
    status: "Completed",
    enrolledAt: "16 Jul 2026",
    currentStep: "Completed",
    lastInteractionAt: "18 Jul 2026",
    exitStatus: "Goal achieved",
    outcome: "Not recorded",
  },
  {
    customerId: "PHS-CUS-GOLDEN-001",
    journeyId: "jr-mobile-engagement",
    status: "In Progress",
    enrolledAt: "15 Aug 2026",
    currentStep: "Push: Morning Market Brief",
    lastInteractionAt: "17 Sep 2026",
    exitStatus: null,
    outcome: "Not recorded",
  },
];

/* Explicit "Not Enrolled" cases — where a customer plausibly matches a
 * journey's target profile but no enrollment record exists, stated
 * honestly rather than left blank or guessed at. Demo Profile 5's
 * existing `engagement.lastCampaign` field already reads "Dormant
 * Investor Re-engagement" (the real name of jr-dormant); that shared
 * journey record is itself status "Draft" with zero entered — so
 * showing her as enrolled would contradict the shared record. */
export const NOT_ENROLLED_NOTES = [
  {
    customerId: "PHS-CUS-1002835",
    journeyId: "jr-dormant",
    reason: "Matches this journey's target profile, but the journey is currently in Draft status in Journey Builder and has not been activated — no customer is enrolled.",
  },
];

function enrichCampaign(enrollment) {
  const campaign = getCampaignById(enrollment.campaignId);
  if (!campaign) return null; // defensively skip rather than render a broken row if the shared catalog ever changes
  return { ...enrollment, name: campaign.name, channel: campaign.channel, goal: campaign.goal };
}

function enrichJourney(enrollment) {
  const journey = getJourneyById(enrollment.journeyId);
  if (!journey) return null;
  return { ...enrollment, name: journey.name, owner: journey.owner };
}

export function getCampaignEnrollmentsForCustomer(customerId) {
  return CAMPAIGN_ENROLLMENTS.filter((e) => e.customerId === customerId).map(enrichCampaign).filter(Boolean);
}

export function getJourneyEnrollmentsForCustomer(customerId) {
  return JOURNEY_ENROLLMENTS.filter((e) => e.customerId === customerId).map(enrichJourney).filter(Boolean);
}

export function getNotEnrolledNotesForCustomer(customerId) {
  return NOT_ENROLLED_NOTES.filter((n) => n.customerId === customerId)
    .map((n) => {
      const journey = getJourneyById(n.journeyId);
      return journey ? { ...n, name: journey.name } : null;
    })
    .filter(Boolean);
}
