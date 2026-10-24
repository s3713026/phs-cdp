/*
  PHS CDP — Customer 360 "Recommended Next Actions" rule engine.

  Pure functions only — no DOM, no UI copy decisions beyond the plain
  evidence/reason strings a rule produces. Every rule is deterministic
  and every result traces to specific fields on the customer's actual
  CRM link / eKYC follow-up / ticket records (js/data/customer-360-crm.js).
  There is no scoring model, no machine-learned signal and no claim of
  predicting customer behavior — each rule is a simple, readable
  condition a business user could verify by hand.

  Priority tiers (High/Medium/Low) follow the documented ordering:
    1. Unresolved operational issues with explicit urgency   (Rule D)
    2. Pending customer-support follow-up / repeated contact  (Rule C)
    3. Documented eKYC follow-up needs                        (Rule A)
    4. CRM follow-up opportunities                            (Rule B)
    5. Lower-priority review actions                          (Rule E)
  Priority is never raised simply because data is missing — a missing
  field shows up as `missingInfo`, not as urgency.
*/

const RULE_ORDER = ["D", "C", "A", "B", "E", "F"];
const PRIORITY_RANK = { High: 0, Medium: 1, Low: 2 };

function sortResults(results) {
  return [...results].sort((a, b) => {
    const p = PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority];
    if (p !== 0) return p;
    return RULE_ORDER.indexOf(a.ruleId) - RULE_ORDER.indexOf(b.ruleId);
  });
}

/* ---- Rule A — eKYC follow-up --------------------------------------- */
function ruleA({ customer, ekycFollowups }) {
  const failing = ekycFollowups.find((r) => r.error);
  if (!failing) return null;
  return {
    ruleId: "A",
    title: "Review failed eKYC",
    reason: `The linked eKYC record for ${customer.name} shows a documented error that has not been recorded as resolved.`,
    evidence: [
      { label: "Step", value: failing.step },
      { label: "Error", value: failing.error },
      { label: "Latest call", value: `${failing.callDate} · ${failing.reachability} · ${failing.callOutcome}` },
      { label: "Follow count", value: failing.followCount },
      { label: "PIC", value: failing.pic || "Not recorded" },
    ],
    priority: "Medium",
    pic: failing.pic,
    suggestedNextStep: "Review the recorded error and existing call history, then determine whether further customer assistance is needed.",
    relatedRecordType: "ekyc",
    relatedRecordId: failing.id,
  };
}

/* ---- Rule B — CRM follow-up priority -------------------------------- */
function ruleB({ customer, classification }) {
  if (!classification) return null;
  if (classification.classificationCode !== "A" && classification.classificationCode !== "B") return null;
  // "Pending" = fewer than 2 recorded follow-up attempts so far.
  if ((classification.followUpAttempts ?? 0) >= 2) return null;
  return {
    ruleId: "B",
    title: "Prioritize CRM follow-up",
    reason: `${customer.name} is classified ${classification.classificationCode} and the available record shows only ${classification.followUpAttempts} follow-up attempt(s) so far.`,
    evidence: [
      { label: "CRM classification", value: `${classification.classificationCode}` },
      { label: "Last contact", value: `${classification.lastContactDate} · ${classification.lastContactOutcome}` },
      { label: "Follow-up attempts", value: String(classification.followUpAttempts ?? 0) },
    ],
    priority: classification.classificationCode === "A" ? "High" : "Medium",
    pic: null,
    suggestedNextStep: "Prioritize review and follow-up according to the documented CRM process.",
    relatedRecordType: "classification",
    relatedRecordId: null,
    note: "CRM classification reflects a contact/lead outcome, not investment value or purchase intent.",
  };
}

/* ---- Rule C — repeated unsuccessful contact -------------------------- */
function ruleC({ customer, classification, ekycFollowups }) {
  const unreachedEkyc = ekycFollowups.filter((r) => r.reachability && r.reachability !== "Nghe máy");
  const unreachedClassification =
    classification && (classification.followUpAttempts ?? 0) >= 2 && classification.lastContactOutcome !== "Nghe máy — trao đổi";

  if (unreachedEkyc.length === 0 && !unreachedClassification) return null;

  const attempts = unreachedEkyc.length || classification.followUpAttempts || 0;
  const latestOutcome = unreachedEkyc[0]?.reachability || classification?.lastContactOutcome || "Not recorded";

  return {
    ruleId: "C",
    title: "Review repeated unsuccessful contact",
    reason: `Available records document ${attempts} contact attempt(s) for ${customer.name} without a successful outcome.`,
    evidence: [
      { label: "Attempts", value: String(attempts) },
      { label: "Latest outcome", value: latestOutcome },
      { label: "Comment", value: unreachedEkyc[0]?.csComment || "Not recorded" },
    ],
    priority: "Medium",
    pic: unreachedEkyc[0]?.pic || null,
    suggestedNextStep: "Review the contact history and determine the appropriate next approach according to the business process.",
    relatedRecordType: unreachedEkyc.length ? "ekyc" : "classification",
    relatedRecordId: unreachedEkyc[0]?.id || null,
  };
}

/* ---- Rule D — unresolved support ticket ------------------------------ */
// Only "Đã đóng" (closed) and "Đã hủy" (cancelled) are confirmed
// terminal statuses from the real source sample — everything else is
// treated as requiring further action. See module header in
// customer-360-crm.js for why an in-progress example had to be added
// beyond the observed sample.
const TERMINAL_TICKET_STATUSES = new Set(["Đã đóng", "Đã hủy"]);
function ruleD({ customer, tickets }) {
  const open = tickets.find((t) => !TERMINAL_TICKET_STATUSES.has(t.status));
  if (!open) return null;
  return {
    ruleId: "D",
    title: "Follow up on open support ticket",
    reason: `Ticket ${open.code} for ${customer.name} has status "${open.status}", which is not a confirmed-closed status.`,
    evidence: [
      { label: "Ticket", value: open.code },
      { label: "Status", value: open.status },
      { label: "Priority", value: open.priority },
      { label: "Category", value: open.category },
      { label: "Assigned to", value: open.assignedTo || "Not recorded" },
    ],
    priority: open.priority === "Cao" ? "High" : "Medium",
    pic: open.assignedTo,
    suggestedNextStep: "Review the ticket and follow up with the assigned PIC or team.",
    relatedRecordType: "ticket",
    relatedRecordId: open.id,
  };
}

/* ---- Rule E — repeated issue ------------------------------------------ */
function ruleE({ customer, tickets }) {
  const byCategory = new Map();
  tickets.forEach((t) => {
    if (!byCategory.has(t.category)) byCategory.set(t.category, []);
    byCategory.get(t.category).push(t);
  });
  const repeated = [...byCategory.entries()].find(([, list]) => list.length >= 2);
  if (!repeated) return null;
  const [category, list] = repeated;
  return {
    ruleId: "E",
    title: "Review recurring issue",
    reason: `${customer.name} has ${list.length} tickets in the same category ("${category}").`,
    evidence: [
      { label: "Category", value: category },
      { label: "Related tickets", value: list.map((t) => t.code).join(", ") },
      { label: "Dates", value: list.map((t) => t.createdDate).join(" · ") },
    ],
    priority: "Medium",
    pic: list[0].assignedTo,
    suggestedNextStep: "Review the recurring issue and consider whether escalation or a broader service review is appropriate.",
    relatedRecordType: "ticket",
    relatedRecordId: list[0].id,
  };
}

const RULES = [
  { id: "A", run: ruleA },
  { id: "B", run: ruleB },
  { id: "C", run: ruleC },
  { id: "D", run: ruleD },
  { id: "E", run: ruleE },
];

/**
 * @param {object} context
 * @param {object} context.customer - a record from js/data/customers.js
 * @param {object|undefined} context.classification - CUSTOMER_CRM_LINKS entry, if any
 * @param {object[]} context.ekycFollowups - this customer's EKYC_FOLLOWUPS rows
 * @param {object[]} context.tickets - this customer's SUPPORT_TICKETS rows
 * @returns {object[]} sorted recommendation results; a single Rule-F
 *   "insufficient data" marker when nothing else triggers — never an
 *   empty array, so the UI always has one explicit thing to render.
 */
export function generateRecommendations(context) {
  const results = RULES.map((r) => r.run(context)).filter(Boolean);
  if (results.length === 0) {
    return [
      {
        ruleId: "F",
        title: "Insufficient data to generate a recommendation",
        reason: "The available CRM, eKYC and ticket records for this customer do not support a reliable recommendation.",
        evidence: [],
        priority: null,
        pic: null,
        suggestedNextStep: null,
        relatedRecordType: null,
        relatedRecordId: null,
      },
    ];
  }
  return sortResults(results);
}
