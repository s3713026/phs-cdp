/*
  PHS CDP — Customer 360 behavior-analytics helpers.

  Pure functions only, over fields that already exist on a CUSTOMERS
  record (js/data/customers.js): `events[]`, `transactions[]`,
  `behavior`, `metrics`. No new mock records are introduced here — this
  file only derives views over data that already exists.

  All event `date`/`time` strings in customers.js (e.g. "17 Sep 2026",
  "20:31") are recorded in the same implicit timezone used elsewhere in
  this prototype for scheduling (Asia/Ho_Chi_Minh — see
  js/data/campaigns.js schedule.timezone) — there is no separate UTC
  offset stored per event, so that convention is assumed consistently
  here too, not re-derived.

  MINIMUM_EVENT_VOLUME exists because this project's mock customers
  have very few recorded events (1–11). A hierarchical time-of-day or
  day-of-week chart built from 2–3 points would present noise as a
  pattern — hasSufficientEventVolume() is the single gate every caller
  uses before rendering those two charts, so the threshold only has to
  be defended once.
*/

// Same shared "today" anchor used throughout this app (Golden Customer
// fixture, the RFM fixtures in js/data/rfm/fixtures.js). Previously
// imported from js/data/customer-360-population.js, which has been
// removed (fully superseded by the shared RFM engine) — defined
// locally here now rather than reaching into a different module for
// one literal date string.
const REFERENCE_DATE = "17 Sep 2026";

export const MINIMUM_EVENT_VOLUME = 8;

const WEEKDAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const MONTHS = { Jan: 0, Feb: 1, Mar: 2, Apr: 3, May: 4, Jun: 5, Jul: 6, Aug: 7, Sep: 8, Oct: 9, Nov: 10, Dec: 11 };

/** Parses this project's consistent "D MMM YYYY" display-date strings
 * (e.g. "17 Sep 2026") without relying on locale-sensitive Date
 * parsing. Returns null for anything that doesn't match. */
export function parseDisplayDate(str) {
  if (!str) return null;
  const m = /^(\d{1,2})\s+([A-Za-z]{3})\s+(\d{4})$/.exec(str.trim());
  if (!m) return null;
  const [, day, mon, year] = m;
  const monthIndex = MONTHS[mon];
  if (monthIndex === undefined) return null;
  return new Date(Number(year), monthIndex, Number(day));
}

function parseHour(timeStr) {
  const m = /^(\d{1,2}):(\d{2})/.exec((timeStr || "").trim());
  return m ? Number(m[1]) : null;
}

/** Reverse of parseDisplayDate — same "DD MMM YYYY" convention
 * (zero-padded day, matching every hand-written date string in this
 * app, e.g. "06 Jul 2026") — NOT zero-padding here was a real bug: it
 * made a generated zero-fill label like "9 Sep 2026" silently fail to
 * string-match a hand-written "09 Sep 2026" event, undercounting. */
export function formatDisplayDate(d) {
  return `${String(d.getDate()).padStart(2, "0")} ${MONTH_NAMES[d.getMonth()]} ${d.getFullYear()}`;
}

function startOfWeekMonday(d) {
  const copy = new Date(d);
  const day = copy.getDay(); // 0=Sun..6=Sat
  const diff = day === 0 ? -6 : 1 - day;
  copy.setDate(copy.getDate() + diff);
  return copy;
}

export function hasSufficientEventVolume(customer, threshold = MINIMUM_EVENT_VOLUME) {
  return (customer?.events?.length || 0) >= threshold;
}

/** Hour-of-day (0–23) event counts. Only hours with at least one
 * recorded event are included — callers render "no activity" for the
 * rest rather than a 24-slot chart padded with invented zeros. */
export function eventsByHour(customer) {
  const counts = new Map();
  (customer?.events || []).forEach((e) => {
    const h = parseHour(e.time);
    if (h === null) return;
    counts.set(h, (counts.get(h) || 0) + 1);
  });
  return [...counts.entries()].sort((a, b) => a[0] - b[0]).map(([hour, count]) => ({ hour, count }));
}

/** Weekday event counts (Sun–Sat), derived from each event's own
 * recorded date — not an assumed/fabricated distribution. */
export function eventsByWeekday(customer) {
  const counts = new Map();
  (customer?.events || []).forEach((e) => {
    const d = parseDisplayDate(e.date);
    if (!d) return;
    const wd = d.getDay();
    counts.set(wd, (counts.get(wd) || 0) + 1);
  });
  // All 7 weekdays are always returned (zero counts included) — unlike
  // hour-of-day, this is a small fixed domain where a zero is itself
  // informative ("never active on Sundays"), not a cluttering gap.
  return WEEKDAY_LABELS.map((label, i) => ({ weekday: label, count: counts.get(i) || 0 }));
}

/** Combined hour × weekday matrix for the heatmap view — same
 * underlying events as eventsByHour/eventsByWeekday, just cross-
 * tabulated instead of two separate 1-D breakdowns. Only hours with
 * at least one recorded event (across any weekday) become columns,
 * same "don't pad with invented gaps" convention as eventsByHour. */
/** Registration-aware window clamp: never extends before the
 * customer's own "Registration Date" attribute, even if a caller asks
 * for a wider window — a day before registration is genuinely "not
 * yet a customer", not an observed zero, so it must never be silently
 * zero-filled. `sinceDate`/`untilDate` are optional Date objects. */
function clampWindow(customer, sinceDate, untilDate) {
  const regStr = customer?.attributes?.["Registration Date"];
  const regDate = regStr ? parseDisplayDate(regStr) : null;
  let since = sinceDate || null;
  if (regDate && (!since || regDate > since)) since = regDate;
  return { since, until: untilDate || null };
}

function eventsInWindow(customer, since, until) {
  return (customer?.events || []).filter((e) => {
    const d = parseDisplayDate(e.date);
    if (!d) return false;
    if (since && d < since) return false;
    if (until && d > until) return false;
    return true;
  });
}

const WINDOW_DAYS = { "7d": 7, "30d": 30, "90d": 90 };

/** Resolves a UI window key ("7d"/"30d"/"90d"/"all") against the
 * shared reference "today" into concrete, registration-clamped dates
 * every window-aware function below can use identically. */
export function resolveWindow(customer, windowKey) {
  const ref = parseDisplayDate(REFERENCE_DATE);
  if (windowKey === "all" || !WINDOW_DAYS[windowKey]) {
    return clampWindow(customer, null, ref);
  }
  const since = new Date(ref.getTime() - (WINDOW_DAYS[windowKey] - 1) * 86400000);
  return clampWindow(customer, since, ref);
}

/** Hour × weekday cross-tab, optionally restricted to a window (see
 * resolveWindow). Columns are only hours with at least one event
 * ANYWHERE in the window (not a fixed 24-column grid) — consistent
 * with eventsByHour's "don't pad with invented gaps" convention. */
export function hourWeekdayMatrix(customer, { sinceDate, untilDate } = {}) {
  const { since, until } = clampWindow(customer, sinceDate, untilDate);
  const events = eventsInWindow(customer, since, until);
  const hourSet = new Set();
  events.forEach((e) => {
    const h = parseHour(e.time);
    if (h !== null) hourSet.add(h);
  });
  const hours = [...hourSet].sort((a, b) => a - b);
  const matrix = WEEKDAY_LABELS.map(() => hours.map(() => 0));
  events.forEach((e) => {
    const h = parseHour(e.time);
    const d = parseDisplayDate(e.date);
    if (h === null || !d) return;
    const col = hours.indexOf(h);
    if (col === -1) return;
    matrix[d.getDay()][col]++;
  });
  return { matrix, rowLabels: WEEKDAY_LABELS, colLabels: hours.map((h) => `${String(h).padStart(2, "0")}:00`), eventCount: events.length };
}

/** Event count per actual recorded date, chronological. This is the
 * customer's own real spread of activity — never a smoothed or
 * interpolated N-day series like Dashboard's platform-wide trend. */
export function eventsByDate(customer) {
  const counts = new Map();
  (customer?.events || []).forEach((e) => {
    counts.set(e.date, (counts.get(e.date) || 0) + 1);
  });
  return [...counts.entries()]
    .map(([date, count]) => ({ date, count, sortKey: parseDisplayDate(date) }))
    .sort((a, b) => (a.sortKey && b.sortKey ? a.sortKey - b.sortKey : 0))
    .map(({ date, count }) => ({ date, count }));
}

/** Same events as eventsByDate, but zero-filled across a window
 * (registration-clamped, see resolveWindow) instead of only the
 * customer's own recorded dates — needed for the Daily Activity Trend
 * chart, where "no event that day" within a KNOWN-covered window is a
 * real, confident zero, never silently skipped. Without a window
 * (sinceDate/untilDate both omitted), falls back to the old
 * observed-dates-only behavior. */
export function eventsByDateInWindow(customer, { sinceDate, untilDate } = {}) {
  const { since, until } = clampWindow(customer, sinceDate, untilDate);
  const events = eventsInWindow(customer, since, until);
  const byDate = new Map();
  events.forEach((e) => byDate.set(e.date, (byDate.get(e.date) || 0) + 1));
  if (!since || !until) return eventsByDate(customer);
  const rows = [];
  const cursor = new Date(since);
  while (cursor <= until) {
    const label = formatDisplayDate(cursor);
    rows.push({ date: label, count: byDate.get(label) || 0 });
    cursor.setDate(cursor.getDate() + 1);
  }
  return rows;
}

function weekRangeLabel(start, end) {
  const sameMonth = start.getMonth() === end.getMonth();
  return sameMonth
    ? `${start.getDate()}–${end.getDate()} ${MONTH_NAMES[end.getMonth()]}`
    : `${start.getDate()} ${MONTH_NAMES[start.getMonth()]} – ${end.getDate()} ${MONTH_NAMES[end.getMonth()]}`;
}

/** Same events as eventsByDate, bucketed into Monday-start weeks —
 * the "Weekly" side of the Session Frequency & Recency Daily/Weekly
 * toggle. Same underlying events, just a coarser bucket, never a
 * second, differently-sourced figure. Keyed by the week-start
 * TIMESTAMP (not a formatted string) to rule out any string-formatting
 * collision; label is a compact range ("17–23 Aug" / "28 Jul – 3 Aug"
 * across a month boundary), computed from the same start/end used to
 * aggregate the count, so the label and the number can never disagree. */
export function eventsByWeek(customer) {
  const byWeekStart = new Map();
  (customer?.events || []).forEach((e) => {
    const d = parseDisplayDate(e.date);
    if (!d) return;
    const start = startOfWeekMonday(d);
    const key = start.getTime();
    if (!byWeekStart.has(key)) byWeekStart.set(key, { start, count: 0 });
    byWeekStart.get(key).count++;
  });
  return [...byWeekStart.values()]
    .sort((a, b) => a.start - b.start)
    .map(({ start, count }) => {
      const end = new Date(start.getTime() + 6 * 86400000);
      return { date: weekRangeLabel(start, end), count };
    });
}

/** Web vs. App split from the existing CDP event-source taxonomy.
 * Deliberately only these two buckets — API/Connector/In-App/Web
 * Message/Email are integration or messaging sources, not the
 * customer's own browsing/app channel, so they are reported
 * separately as "Other" rather than folded in or guessed at. Device
 * OS (iOS/Android) and desktop-vs-mobile-web are NOT derivable from
 * this schema and are not shown here. */
export function channelSplit(customer) {
  let web = 0, app = 0, other = 0;
  (customer?.events || []).forEach((e) => {
    if (e.source === "Web") web += 1;
    else if (e.source === "App") app += 1;
    else other += 1;
  });
  return { web, app, other, total: web + app + other };
}

/** Device-OS breakdown — answers a DIFFERENT question than
 * channelSplit (which platform vs. which supported device category).
 * Reads a per-event `device` field that only exists on the Golden
 * Customer fixture and the synthetic population dataset — the 5
 * original CUSTOMERS records (js/data/customers.js, protected, not
 * editable) have no such field, so every one of their events
 * genuinely falls into "Unknown Device" rather than a guessed OS.
 * `anyKnownDevice` lets the caller show an honest "not tracked for
 * this profile" note instead of a misleadingly-confident 100%
 * Unknown chart with no explanation. */
export function deviceBreakdown(customer) {
  const events = customer?.events || [];
  const counts = { "iOS App": 0, "Android App": 0, "Desktop Web": 0, "Mobile Web": 0, Unknown: 0 };
  let anyKnownDevice = false;
  events.forEach((e) => {
    if (e.device && Object.prototype.hasOwnProperty.call(counts, e.device)) {
      counts[e.device]++;
      if (e.device !== "Unknown") anyKnownDevice = true;
    } else {
      counts.Unknown++;
    }
  });
  return { counts, total: events.length, anyKnownDevice };
}

/* ------------------------------------------------------------------ */
/* Behavior-to-Need Signals — three explicit, documented signal types,  */
/* each with its OWN eligibility allowlist (§7.2). An event whose type  */
/* is not on the relevant allowlist can never generate that signal —   */
/* it still appears in the plain Event Timeline, just not as a         */
/* business signal. Every signal is a deterministic condition over     */
/* existing fields — no model, no training data, no inference.         */
/* ------------------------------------------------------------------ */

// Viewing/interest events only — deliberately excludes "trading"
// category events (Place Order etc.). Viewing a stock repeatedly is
// evidence of INTEREST, never of a trade decision, and mixing the two
// categories together (as the prior version of this function did)
// blurred that distinction.
const PRODUCT_INTEREST_EVENT_TYPES = ["View Stock", "View Product Information", "Search Stock", "Watchlist Add"];

/** Product Interest Signal — the same subject (e.g. a stock symbol in
 * an event's first prop) appearing in 2+ eligible viewing events. */
export function productInterestSignal(customer) {
  const counts = new Map();
  (customer?.events || []).forEach((e) => {
    if (!PRODUCT_INTEREST_EVENT_TYPES.includes(e.type)) return;
    const subject = e.props?.[0];
    if (!subject) return;
    if (!counts.has(subject)) counts.set(subject, []);
    counts.get(subject).push(e);
  });
  const repeated = [...counts.entries()].filter(([, list]) => list.length >= 2).sort((a, b) => b[1].length - a[1].length);
  if (!repeated.length) return null;
  const [subject, list] = repeated[0];
  const sorted = [...list].sort((a, b) => (parseDisplayDate(b.date) ?? 0) - (parseDisplayDate(a.date) ?? 0));
  const EVIDENCE_CAP = 6;
  return {
    kind: "productInterest",
    subject,
    occurrences: list.length,
    observationWindow: "All recorded events",
    events: sorted.slice(0, EVIDENCE_CAP).map((e) => ({ date: e.date, type: e.type })),
    evidenceTruncated: list.length > EVIDENCE_CAP,
    rule: `The same subject appears in ${list.length} of these eligible viewing event types: ${PRODUCT_INTEREST_EVENT_TYPES.join(", ")}.`,
  };
}

// Any event type ending in "Failed" is eligible — a small, explicit
// allowlist-by-suffix rather than an open-ended match, so a type like
// "Login" (which never ends in "Failed") can never accidentally
// qualify.
function isFailureEventType(type) {
  return typeof type === "string" && type.endsWith("Failed");
}

/** Journey Friction Signal — 2+ failure events for the same step
 * (grouped by event type, since each failure type already names its
 * own workflow step, e.g. "Place Order Failed"). */
export function journeyFrictionSignal(customer) {
  const counts = new Map();
  (customer?.events || []).forEach((e) => {
    if (!isFailureEventType(e.type)) return;
    if (!counts.has(e.type)) counts.set(e.type, []);
    counts.get(e.type).push(e);
  });
  const repeated = [...counts.entries()].filter(([, list]) => list.length >= 2).sort((a, b) => b[1].length - a[1].length);
  if (!repeated.length) return null;
  const [step, list] = repeated[0];
  const sorted = [...list].sort((a, b) => (parseDisplayDate(b.date) ?? 0) - (parseDisplayDate(a.date) ?? 0));
  return {
    kind: "journeyFriction",
    step,
    occurrences: list.length,
    latestDate: sorted[0]?.date,
    observationWindow: "All recorded events",
    errors: list.map((e) => e.error || e.props?.find((p) => typeof p === "string" && /error|fail/i.test(p)) || "No error detail recorded").filter((v, i, arr) => arr.indexOf(v) === i),
    events: list.map((e) => ({ date: e.date, type: e.type, error: e.error })),
    rule: `2 or more "${step}" events recorded for this customer.`,
    suggestedReview: "Review whether this workflow step needs operational attention for this customer.",
  };
}

const ENGAGEMENT_CHANGE_SIGNAL_THRESHOLD_PCT = 20;

/** Engagement Change Signal — a thin wrapper over
 * activityDeclineVsBaseline(): the raw §8 comparison is ALWAYS shown
 * regardless of magnitude, but this signal only fires when the change
 * crosses a documented threshold, so trivial day-to-day noise doesn't
 * show up as a "signal". Never labeled as churn — see the caller's
 * caveat text. */
export function engagementChangeSignal(customer) {
  const decline = activityDeclineVsBaseline(customer);
  if (decline.insufficientData) return null;
  const meaningfulPct = decline.percentChange !== null && Math.abs(decline.percentChange) >= ENGAGEMENT_CHANGE_SIGNAL_THRESHOLD_PCT;
  const meaningfulZeroBaseline = decline.percentChange === null && decline.currentPeriod.count >= 3; // a zero-baseline jump to several events is still worth flagging
  if (!meaningfulPct && !meaningfulZeroBaseline) return null;
  return {
    kind: "engagementChange",
    direction: decline.absoluteDiff >= 0 ? "increase" : "decrease",
    ...decline,
    rule: `|percentage change| >= ${ENGAGEMENT_CHANGE_SIGNAL_THRESHOLD_PCT}% (or a zero-baseline period reaching 3+ events).`,
  };
}

/** Session frequency/recency — reuses the SAME `behavior.sessions`
 * figure already shown in the Behavior & Consent tab (not a
 * re-derived, potentially-different number). "Last recorded activity"
 * is the most recent event date on file — explicitly not claimed to
 * be a literal session-end timestamp, since no session boundary is
 * stored in this schema, only discrete named events. */
export function sessionFrequencyRecency(customer) {
  const sorted = eventsByDate(customer);
  const lastDate = sorted.length ? sorted[sorted.length - 1].date : null;
  return {
    sessions30d: customer?.behavior?.sessions ?? null,
    lastRecordedActivityDate: lastDate,
    activeDaysRecorded: sorted.length,
  };
}

const ACTIVITY_DECLINE_WINDOW_DAYS = 30;

/** Current vs. comparison period, same metric (event count), same
 * window length, aligned to the shared reference "today" so every
 * customer is compared the same way. Percentage change is explicitly
 * NOT calculated when the comparison baseline is zero (would be
 * mathematically meaningless) — the raw counts are still shown. Only
 * flagged fully insufficient when BOTH windows are empty. */
function dailyCountsFor(parsedEvents, start, days) {
  const dayMs = 86400000;
  const counts = new Array(days).fill(0);
  parsedEvents.forEach((e) => {
    const offset = Math.round((e.d - start) / dayMs);
    if (offset >= 0 && offset < days) counts[offset]++;
  });
  return counts;
}

export function activityDeclineVsBaseline(customer, windowDays = ACTIVITY_DECLINE_WINDOW_DAYS) {
  const refDate = parseDisplayDate(REFERENCE_DATE);
  const dayMs = 86400000;
  const parsed = (customer?.events || []).map((e) => ({ ...e, d: parseDisplayDate(e.date) })).filter((e) => e.d);

  const currentStart = new Date(refDate.getTime() - (windowDays - 1) * dayMs);
  const comparisonEnd = new Date(currentStart.getTime() - dayMs);
  const comparisonStart = new Date(comparisonEnd.getTime() - (windowDays - 1) * dayMs);

  const currentDaily = dailyCountsFor(parsed, currentStart, windowDays);
  const comparisonDaily = dailyCountsFor(parsed, comparisonStart, windowDays);
  const currentCount = currentDaily.reduce((a, b) => a + b, 0);
  const comparisonCount = comparisonDaily.reduce((a, b) => a + b, 0);
  const insufficientData = currentCount === 0 && comparisonCount === 0;
  const absoluteDiff = currentCount - comparisonCount;
  const percentChange = comparisonCount > 0 ? Math.round((absoluteDiff / comparisonCount) * 100) : null;

  return {
    windowDays,
    insufficientData,
    currentPeriod: { start: formatDisplayDate(currentStart), end: formatDisplayDate(refDate), count: currentCount, dailyCounts: currentDaily },
    comparisonPeriod: { start: formatDisplayDate(comparisonStart), end: formatDisplayDate(comparisonEnd), count: comparisonCount, dailyCounts: comparisonDaily },
    absoluteDiff,
    percentChange,
  };
}
