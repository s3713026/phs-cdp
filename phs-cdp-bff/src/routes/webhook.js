/**
 * Webhook Receiver — POST /api/webhook/rudderstack
 *
 * Receives events from RudderStack → routes through IdentityResolutionService
 * (tiered identity graph) → stores in cdp-postgres.
 *
 * Supported event types:
 *   identify → resolve/create profile + link identifiers + store traits
 *   alias    → merge anonymous → known (stitching)
 *   track    → behavioral event (resolve identity first)
 *   page     → page view
 *   screen   → mobile screen view
 *   group    → account/org grouping (future)
 */
const router = require('express').Router();
const IdentityResolutionService = require('../services/IdentityResolutionService');

// Last deliveries, kept in memory for Administration → Technical Health.
const RECENT_MAX = 50;
const recentDeliveries = [];
const counters = { received: 0, stored: 0, duplicate: 0, skipped: 0, failed: 0, lastReceivedAt: null, lastError: null };

function remember(entry) {
  recentDeliveries.unshift(entry);
  if (recentDeliveries.length > RECENT_MAX) recentDeliveries.length = RECENT_MAX;
}

// ─── Webhook secret verification ──────────────────────────────────────────────
function verifyWebhookSecret(req, res, next) {
  const secret = process.env.RUDDERSTACK_WEBHOOK_SECRET;
  if (!secret) return next(); // not configured — skip in dev

  const authHeader = req.headers['authorization'] || '';
  const token = authHeader.replace(/^Bearer\s+/i, '');
  if (token !== secret) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
}

// ─── Main handler ─────────────────────────────────────────────────────────────
router.post('/rudderstack', verifyWebhookSecret, async (req, res) => {
  try {
    const payload = req.body || {};

    // RudderStack may send a single event, a { batch: [] } envelope or a bare array
    const events = Array.isArray(payload) ? payload
      : Array.isArray(payload.batch) ? payload.batch
      : [payload];

    const results = [];
    let transientFailure = false;

    for (const event of events) {
      counters.received++;
      counters.lastReceivedAt = new Date().toISOString();
      try {
        console.log("[webhook] RAW_EVENT:", JSON.stringify({type:event.type, userId:event.userId, anonymousId:event.anonymousId, props_userId:(event.properties||{}).userId, props_c360:(event.properties||{}).c360_customer_id}));
        const result = await processEvent(event || {});
        if (result && result.skipped) counters.skipped++;
        else if (result && result.duplicate) counters.duplicate++;
        else counters.stored++;
        results.push({ type: event.type, status: 'ok', result });
        remember({ at: counters.lastReceivedAt, type: event.type, event: describe(event), status: result?.skipped ? 'skipped' : 'ok' });
      } catch (err) {
        counters.failed++;
        counters.lastError = { at: new Date().toISOString(), message: err.message, type: event && event.type };
        console.error('[webhook] Event error:', err.message, '| type:', event && event.type);
        results.push({ type: event && event.type, status: 'error', error: err.message });
        remember({ at: counters.lastReceivedAt, type: event && event.type, event: describe(event), status: 'error', error: err.message });
        if (isTransient(err)) transientFailure = true;
      }
    }

    // A database outage is temporary: answer 503 so RudderStack retries the
    // delivery instead of dropping the event. Bad data keeps a 200 (retrying
    // would never succeed) and is reported in `results`.
    if (transientFailure) {
      return res.status(503).json({ error: 'Temporarily unable to store events', received: results.length, results });
    }
    res.json({ received: results.length, results });
  } catch (err) {
    console.error('[webhook] Fatal:', err.message);
    res.status(500).json({ error: 'Webhook processing failed' });
  }
});

// Delivery counters for Technical Health (admin UI)
router.get('/rudderstack/status', require('../middleware/rbac').requireRole('admin'), (_req, res) => {
  res.json({ ...counters, recent: recentDeliveries.slice(0, 20) });
});

function isTransient(err) {
  return /connection timeout|Connection terminated|ECONNREFUSED|ECONNRESET|EAI_AGAIN|ENOTFOUND|starting up|too many clients|deadlock/i
    .test(String(err && err.message || ''));
}

function describe(event) {
  if (!event) return '';
  if (event.type === 'track') return event.event || 'Unknown Event';
  if (event.type === 'page' || event.type === 'screen') return event.name || event.properties?.name || event.type;
  return event.type || '';
}

// ─── Event router ─────────────────────────────────────────────────────────────
async function processEvent(rawEvent) {
  // RudderStack strips userId when forwarding webhook source events to destinations.
  // Recover userId from properties.userId or properties.phs_account_id as fallback.
  const props = rawEvent.properties || {};
  const recoveredUserId = rawEvent.userId
    || props.userId
    || props.phs_account_id
    || props.c360_customer_id
    || null;
  const event = recoveredUserId !== rawEvent.userId
    ? { ...rawEvent, userId: recoveredUserId || rawEvent.userId }
    : rawEvent;

  const type = (event.type || '').toLowerCase();

  switch (type) {

    // ── identify: resolve/create customer + link identifiers + store traits ───
    case 'identify': {
      const { userId, anonymousId, context = {}, messageId } = event;
      const traits = { ...(context.traits || {}), ...(event.traits || {}) };
      if (!userId && !anonymousId) return { skipped: 'no userId or anonymousId' };

      const identifiers = buildIdentifiers({ userId, anonymousId, traits });

      const { customer, identifierType, confidenceScore, isNew, merged } =
        await IdentityResolutionService.resolveIdentity(identifiers, {
          source: deriveSource(event),
          session_id: context.sessionId || null,
        }, traits);

      const stored = await IdentityResolutionService.recordEvent(customer, confidenceScore, {
        event_name:              'Identify',
        event_category:          'identity',
        platform:                derivePlatform(event),
        app_version:             context.app?.version,
        channel:                 deriveSource(event),
        properties:              safeTraits(traits),
        occurred_at:             event.originalTimestamp || event.timestamp,
        received_at:             event.receivedAt,
        session_id:              context.sessionId,
        rudderstack_message_id:  messageId,
        anonymous_id:            anonymousId,
      });

      return { customerId: customer.id, identifierType, confidenceScore, isNew, merged, duplicate: !!stored.duplicate };
    }

    // ── alias: merge two identities (anonymous → known) ───────────────────────
    case 'alias': {
      const { userId, previousId } = event;
      if (!userId || !previousId) return { skipped: 'alias requires userId and previousId' };
      const { customer, merged } = await IdentityResolutionService.resolveIdentity(
        { c360_customer_id: userId, anonymous_id: previousId },
        { source: deriveSource(event) },
      );
      return { merged, customerId: customer.id };
    }

    // ── track: behavioral event ───────────────────────────────────────────────
    case 'track': {
      // RudderStack renames the event to "webhook_source_event" when forwarding from
      // a webhook source. Recover the original event name from properties.
      const rawEventName = event.event || '';
      const eventName = (rawEventName === 'webhook_source_event' || !rawEventName)
        ? (event.properties?.event || event.properties?.eventName || event.properties?.event_name || rawEventName || 'Unknown Event')
        : rawEventName;
      return recordBehaviorEvent(event, eventName, event.properties?.category || 'track');
    }

    // ── page: page view ───────────────────────────────────────────────────────
    case 'page': {
      const page = event.context?.page || {};
      const pageName = event.name || event.properties?.name || event.properties?.title || page.title || page.path || null;
      return recordBehaviorEvent(event, 'Page Viewed', 'page', {
        page_name:  pageName,
        page_url:   event.properties?.url   || page.url,
        page_path:  event.properties?.path  || page.path,
        page_title: event.properties?.title || page.title,
        referrer:   event.properties?.referrer || page.referrer,
      }, pageName);
    }

    // ── screen: mobile screen view ────────────────────────────────────────────
    case 'screen': {
      const screenName = event.name || event.properties?.name || null;
      return recordBehaviorEvent(event, 'Screen Viewed', 'screen', { screen_name: screenName }, screenName);
    }

    // ── group: account/org (future) ───────────────────────────────────────────
    case 'group': {
      return { skipped: 'group events not yet implemented' };
    }

    default:
      return { skipped: `unsupported type: ${type || '(none)'}` };
  }
}

// ─── Helper: behavioral event (track / page / screen) ────────────────────────
async function recordBehaviorEvent(event, eventName, category, extraProps = {}, screenName = null) {
  const { userId, anonymousId, properties = {}, context = {}, messageId } = event;
  if (!userId && !anonymousId) return { skipped: 'no userId or anonymousId' };

  // Traits the SDK remembers from an earlier identify() ride along in context.traits;
  // they help recognise the customer but are not written to the profile here.
  const ctxTraits = context.traits || {};
  const identifiers = buildIdentifiers({ userId, anonymousId, traits: {
    email: ctxTraits.email, phone: ctxTraits.phone,
  } });

  // A failure here is thrown on purpose: the event must not be stored without
  // its customer link (it would never show up on the profile).
  const { customer, confidenceScore } = await IdentityResolutionService.resolveIdentity(identifiers, {
    source: deriveSource(event),
    session_id: context.sessionId,
  });

  const mergedProps = { ...properties };
  for (const [k, v] of Object.entries(extraProps)) {
    if (v !== undefined && v !== null && v !== '') mergedProps[k] = v;
  }
  if (context.campaign && Object.keys(context.campaign).length) mergedProps.campaign = context.campaign;

  const stored = await IdentityResolutionService.recordEvent(customer, confidenceScore, {
    event_name:             eventName,
    event_category:         category,
    platform:               derivePlatform(event),
    app_version:            context.app?.version,
    screen_name:            screenName,
    channel:                deriveSource(event),
    properties:             mergedProps,
    occurred_at:            event.originalTimestamp || event.timestamp,
    received_at:            event.receivedAt,
    session_id:             context.sessionId,
    rudderstack_message_id: messageId,
    anonymous_id:           anonymousId,
  });

  return { customerId: customer.id, eventId: stored.event_id || null, duplicate: !!stored.duplicate };
}

// ─── Build identifiers object from event fields ───────────────────────────────
function buildIdentifiers({ userId, anonymousId, traits = {} }) {
  const str = (v) => (v === undefined || v === null || v === '' ? null : String(v));
  const fullName = traits.name || traits.full_name
    || [traits.firstName || traits.first_name, traits.lastName || traits.last_name].filter(Boolean).join(' ')
    || null;
  return {
    c360_customer_id:    str(userId),
    email:               str(traits.email),
    phone:               str(traits.phone),
    national_id_raw:     str(traits.national_id),
    app_user_id:         str(traits.app_user_id),
    xpro_user_id:        str(traits.xpro_user_id),
    zalo_id:             str(traits.zalo_id),
    cloudgo_contact_id:  str(traits.cloudgo_contact_id),
    idfa:                str(traits.idfa),
    idfv:                str(traits.idfv),
    gaid:                str(traits.gaid),
    anonymous_id:        str(anonymousId),
    // Profile field (not an identifier key)
    full_name:           str(fullName),
  };
}

// Raw national id must never be stored, not even inside event properties.
function safeTraits(traits) {
  const copy = { ...traits };
  delete copy.national_id;
  delete copy.national_id_raw;
  delete copy.password;
  return copy;
}

// ─── Derive channel source from event context ─────────────────────────────────
function deriveSource(event) {
  const lib = (event.context?.library?.name || '').toLowerCase();
  const channel = (event.channel || '').toLowerCase();
  const sourceType = (event.context?.sourceType || event.sourceType || '').toLowerCase();
  if (channel === 'mobile' || /android|ios|swift|kotlin|flutter|react-native|react native/.test(lib)) return 'mobile';
  if (channel === 'server' || /node|python|java(?!script)|\bgo\b|php|ruby|\.net|http/.test(lib)) return 'server';
  // Webhook source: no library, no channel → comes from external system via HTTP POST
  if (!lib && !channel && !event.context?.page && !event.context?.userAgent) return 'server';
  if (sourceType === 'webhook' || channel === 'webhook') return 'server';
  return 'web';
}

function derivePlatform(event) {
  const os = event.context?.os?.name;
  if (os) return os;
  return deriveSource(event);
}

module.exports = router;
module.exports._status = () => ({ ...counters, recent: recentDeliveries.slice(0, 20) });
