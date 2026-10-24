/**
 * Webhook Receiver — POST /api/webhook/rudderstack
 * Receives events from RudderStack and stores in cdp-postgres
 *
 * Supports:
 *   type: "identify"  → upsert customer profile + identities
 *   type: "alias"     → merge anonymous → known
 *   type: "track"     → insert behavioral event
 */
const router = require('express').Router();
const CustomerService = require('../services/CustomerService');

// RudderStack sends a shared secret in Authorization header
// Set RUDDERSTACK_WEBHOOK_SECRET in .env for production
function verifyWebhookSecret(req, res, next) {
  const secret = process.env.RUDDERSTACK_WEBHOOK_SECRET;
  if (!secret) return next(); // not configured — skip check

  const authHeader = req.headers['authorization'] || '';
  const token = authHeader.replace(/^Bearer\s+/i, '');
  if (token !== secret) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
}

router.post('/rudderstack', verifyWebhookSecret, async (req, res) => {
  try {
    const payload = req.body;

    // RudderStack can send a batch array or a single event
    const events = Array.isArray(payload.batch) ? payload.batch : [payload];

    const results = [];
    for (const event of events) {
      try {
        const result = await processEvent(event);
        results.push({ type: event.type, status: 'ok', result });
      } catch (err) {
        console.error('[webhook] Event processing error:', err.message, '| type:', event.type);
        results.push({ type: event.type, status: 'error', error: err.message });
      }
    }

    res.json({ received: results.length, results });
  } catch (err) {
    console.error('[webhook] Fatal error:', err.message);
    res.status(500).json({ error: 'Webhook processing failed' });
  }
});

async function processEvent(event) {
  const { type, userId, anonymousId, traits = {}, properties = {} } = event;
  const previousId = event.previousId || event.context?.previousId;

  switch ((type || '').toLowerCase()) {

    case 'identify': {
      // Upsert customer profile from identify() call
      if (!userId && !anonymousId) {
        return { skipped: 'no userId or anonymousId' };
      }
      if (userId) {
        return CustomerService.upsertProfile(userId, traits, anonymousId);
      }
      // Anonymous identify — record event only
      return { anonymousId, action: 'anonymous_identify_skipped' };
    }

    case 'alias': {
      // Merge anonymous → known
      if (!userId) return { skipped: 'no userId in alias event' };
      if (!previousId) return { skipped: 'no previousId in alias event' };
      return CustomerService.mergeIdentities(previousId, userId);
    }

    case 'track': {
      // Behavioral event
      let customer = null;
      if (userId) {
        customer = await CustomerService.findByUserId(userId);
        if (!customer && userId) {
          // Auto-create minimal profile on track events for known users
          customer = await CustomerService.upsertProfile(userId, {}, anonymousId);
        }
      }

      const source = deriveSource(event);
      return CustomerService.recordEvent(
        customer?.id || null,
        anonymousId || null,
        event.event || 'Unknown Event',
        { ...properties, category: event.category },
        source,
        event.context?.sessionId || null,
      );
    }

    case 'page': {
      // Page view — treat as track event
      let customer = null;
      if (userId) customer = await CustomerService.findByUserId(userId);

      return CustomerService.recordEvent(
        customer?.id || null,
        anonymousId || null,
        'Page Viewed',
        {
          page_name:  event.name,
          page_url:   event.context?.page?.url,
          page_title: event.context?.page?.title,
          ...properties,
        },
        deriveSource(event),
        event.context?.sessionId || null,
      );
    }

    default:
      return { skipped: `unsupported event type: ${type}` };
  }
}

function deriveSource(event) {
  const platform = (event.context?.library?.name || '').toLowerCase();
  if (platform.includes('android') || platform.includes('ios') || platform.includes('react-native')) return 'mobile';
  if (platform.includes('node') || platform.includes('python') || platform.includes('java')) return 'server';
  return 'web';
}

module.exports = router;
