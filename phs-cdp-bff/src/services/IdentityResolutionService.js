/**
 * IdentityResolutionService
 *
 * Single write path for all identity resolution in CDP.
 * Implements a tiered identity hierarchy driven by cdp_identity_config.
 *
 * Tier 1 — Strong/Permanent merge keys (phs_account_id, national_id_hash)
 *   → Always merge profiles; association is permanent.
 *
 * Tier 2 — Weak/Pre-account merge keys (phone, email, idfa, idfv, gaid)
 *   → Merge only when NO Tier-1 identifier exists on the target profile.
 *   → After Tier-1 is established, store value but do NOT re-merge.
 *
 * Tier 3 — Track-only (anonymous_id)
 *   → Never used as a merge key; only link events to a profile.
 *
 * Confidence score rules (stored on c360_event):
 *   Tier 1 match  → 90–100
 *   Tier 2 match  → 60–80
 *   Tier 3 only   → 0–30
 *   No match      → 0
 */

const crypto = require('crypto');
const { v4: uuidv4 } = require('uuid');
const db = require('../db/pool');


// ---------------------------------------------------------------------------
// Config cache (reload from DB at most once per 5 min)
// ---------------------------------------------------------------------------
let _configCache = null;
let _configCachedAt = 0;
const CONFIG_TTL_MS = 5 * 60 * 1000;

async function getIdentityConfig() {
  const now = Date.now();
  if (_configCache && now - _configCachedAt < CONFIG_TTL_MS) {
    return _configCache;
  }
  const { rows } = await db.query(
    `SELECT identifier_type, tier, priority, merge_strategy, is_active
     FROM cdp_identity_config
     WHERE is_active = TRUE
     ORDER BY tier ASC, priority ASC`
  );
  _configCache = rows;
  _configCachedAt = now;
  return rows;
}

function invalidateConfigCache() {
  _configCache = null;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Hash a plain-text national ID value with SHA-256.
 * Raw CCCD/CMND values must NEVER be stored; only the hash is stored.
 */
function hashNationalId(rawValue) {
  if (!rawValue) return null;
  return crypto.createHash('sha256').update(rawValue.trim().toUpperCase()).digest('hex');
}

/**
 * Returns the merge strategy for a given identifier_type from cached config.
 */
function getMergeStrategy(config, identifierType) {
  const entry = config.find(c => c.identifier_type === identifierType);
  return entry ? entry.merge_strategy : 'track_only';
}

function getTier(config, identifierType) {
  const entry = config.find(c => c.identifier_type === identifierType);
  return entry ? entry.tier : 3;
}

/**
 * Compute confidence score based on which identifier matched.
 */
function computeConfidenceScore(identifierType, config) {
  const tier = getTier(config, identifierType);
  if (tier === 1) return 95;
  if (tier === 2) return 70;
  return 20;
}

// ---------------------------------------------------------------------------
// Core: resolve or create a cdp_customer profile
// ---------------------------------------------------------------------------

/**
 * resolveIdentity
 *
 * Given a set of identifiers from an incoming event, find or create the
 * matching cdp_customer profile following the tier rules.
 *
 * @param {object} identifiers  - { phs_account_id?, national_id_raw?, phone?, email?,
 *                                   idfa?, idfv?, gaid?, anonymous_id?,
 *                                   app_user_id?, xpro_user_id?, zalo_id?, cloudgo_contact_id? }
 * @param {object} [context]    - { source?, session_id? } for audit
 * @returns {object}            - { customer, identifierType, confidenceScore, isNew }
 */
async function resolveIdentity(identifiers, context = {}) {
  const config = await getIdentityConfig();

  // Hash national_id if provided in raw form
  if (identifiers.national_id_raw) {
    identifiers.national_id_hash = hashNationalId(identifiers.national_id_raw);
    delete identifiers.national_id_raw;
  }

  const client = await db.getClient();
  try {
    await client.query('BEGIN');

    // ── Step 1: Try Tier-1 identifiers first ────────────────────────────
    let matchedCustomer = null;
    let matchedIdentifierType = null;

    const tier1Types = config
      .filter(c => c.tier === 1 && c.merge_strategy === 'permanent')
      .sort((a, b) => a.priority - b.priority)
      .map(c => c.identifier_type);

    for (const idType of tier1Types) {
      const value = identifiers[idType];
      if (!value) continue;

      const { rows } = await client.query(
        `SELECT c.*
         FROM cdp_customers c
         JOIN cdp_identities i ON i.customer_id = c.id
         WHERE i.identifier_type = $1
           AND i.identifier_value = $2
         LIMIT 1`,
        [idType, value]
      );
      if (rows.length > 0) {
        matchedCustomer = rows[0];
        matchedIdentifierType = idType;
        break;
      }
    }

    // ── Step 2: Try Tier-2 identifiers ONLY if no Tier-1 found ──────────
    if (!matchedCustomer) {
      const tier2Types = config
        .filter(c => c.tier === 2 && c.merge_strategy === 'pre_account')
        .sort((a, b) => a.priority - b.priority)
        .map(c => c.identifier_type);

      for (const idType of tier2Types) {
        const value = identifiers[idType];
        if (!value) continue;

        const { rows } = await client.query(
          `SELECT c.*
           FROM cdp_customers c
           JOIN cdp_identities i ON i.customer_id = c.id
           WHERE i.identifier_type = $1
             AND i.identifier_value = $2
           LIMIT 1`,
          [idType, value]
        );
        if (rows.length > 0) {
          // Merge only if the matched profile has NO Tier-1 identifier yet
          const { rows: tier1Rows } = await client.query(
            `SELECT 1 FROM cdp_identities
             WHERE customer_id = $1
               AND identifier_type = ANY($2::text[])
             LIMIT 1`,
            [rows[0].id, tier1Types]
          );
          if (tier1Rows.length === 0) {
            matchedCustomer = rows[0];
            matchedIdentifierType = idType;
          }
          break;
        }
      }
    }

    // ── Step 3: Create new profile if still not found ───────────────────
    let isNew = false;
    if (!matchedCustomer) {
      const profileId = uuidv4();
      const now = new Date();

      // Extract profile-level fields that come with the event
      const {
        c360_customer_id, email, phone, full_name,
        app_user_id, xpro_user_id, zalo_user_id, cloudgo_contact_id,
        anonymous_id
      } = identifiers;

      const { rows: newRows } = await client.query(
        `INSERT INTO cdp_customers
           (id, c360_customer_id, email, phone, full_name,
            app_user_id, xpro_user_id, zalo_user_id, cloudgo_contact_id,
            lifecycle_stage, account_status,
            first_seen_at, last_seen_at, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9,
                 'prospect', 'lead',
                 $10, $10, $10, $10)
         RETURNING *`,
        [
          profileId,
          c360_customer_id || null,
          email || null,
          phone || null,
          full_name || null,
          app_user_id || null,
          xpro_user_id || null,
          zalo_user_id || null,
          cloudgo_contact_id || null,
          now
        ]
      );

      matchedCustomer = newRows[0];
      matchedIdentifierType = c360_customer_id
        ? 'phs_account_id'
        : (identifiers.phone ? 'phone' : (identifiers.email ? 'email' : 'anonymous_id'));
      isNew = true;

      console.log({
        event: 'identity.created',
        customerId: matchedCustomer.id,
        identifierType: matchedIdentifierType,
        source: context.source
      });
    } else {
      // Update last_seen_at on existing profile
      await client.query(
        `UPDATE cdp_customers SET last_seen_at = NOW(), updated_at = NOW()
         WHERE id = $1`,
        [matchedCustomer.id]
      );

      console.log({
        event: 'identity.matched',
        customerId: matchedCustomer.id,
        identifierType: matchedIdentifierType,
        source: context.source
      });
    }

    // ── Step 4: Upsert all provided identifiers into cdp_identities ─────
    await upsertIdentifiers(client, matchedCustomer.id, identifiers, config, context);

    // ── Step 5: Upgrade profile if Tier-1 identifier arrives on existing
    //           Tier-2-matched profile ─────────────────────────────────
    if (!isNew && identifiers.phs_account_id && !matchedCustomer.c360_customer_id) {
      await client.query(
        `UPDATE cdp_customers
         SET c360_customer_id = $1,
             lifecycle_stage  = CASE
               WHEN lifecycle_stage = 'prospect' THEN 'lead'
               ELSE lifecycle_stage
             END,
             account_status   = 'active',
             converted_at     = NOW(),
             updated_at       = NOW()
         WHERE id = $2`,
        [identifiers.phs_account_id, matchedCustomer.id]
      );
      console.log({
        event: 'identity.upgraded',
        customerId: matchedCustomer.id,
        phsAccountId: identifiers.phs_account_id
      });
    }

    await client.query('COMMIT');

    const confidenceScore = computeConfidenceScore(matchedIdentifierType, config);

    return {
      customer: matchedCustomer,
      identifierType: matchedIdentifierType,
      confidenceScore,
      isNew
    };
  } catch (err) {
    await client.query('ROLLBACK');
    console.error({ event: 'identity.resolution_failed', error: err.message, identifiers: _maskPII(identifiers) });
    throw err;
  } finally {
    client.release();
  }
}

// ---------------------------------------------------------------------------
// Upsert all identifiers for a resolved profile
// ---------------------------------------------------------------------------
async function upsertIdentifiers(client, customerId, identifiers, config, context) {
  const idMap = {
    phs_account_id:      identifiers.phs_account_id,
    national_id_hash:    identifiers.national_id_hash,
    phone:               identifiers.phone,
    email:               identifiers.email,
    idfa:                identifiers.idfa,
    idfv:                identifiers.idfv,
    gaid:                identifiers.gaid,
    anonymous_id:        identifiers.anonymous_id,
    app_user_id:         identifiers.app_user_id,
    xpro_user_id:        identifiers.xpro_user_id,
    zalo_id:             identifiers.zalo_id,
    cloudgo_contact_id:  identifiers.cloudgo_contact_id
  };

  for (const [idType, value] of Object.entries(idMap)) {
    if (!value) continue;

    const cfgEntry = config.find(c => c.identifier_type === idType);
    const tier     = cfgEntry ? cfgEntry.tier : 3;
    const priority = cfgEntry ? cfgEntry.priority : 99;

    await client.query(
      `INSERT INTO cdp_identities
         (id, customer_id, identifier_type, identifier_value,
          tier, priority, source, last_seen_at, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), NOW())
       ON CONFLICT (customer_id, identifier_type, identifier_value)
         DO UPDATE SET
           last_seen_at = NOW(),
           source       = EXCLUDED.source`,
      [uuidv4(), customerId, idType, value, tier, priority, context.source || 'bff']
    );
  }
}

// ---------------------------------------------------------------------------
// Write resolved event to c360_event
// ---------------------------------------------------------------------------

/**
 * recordEvent
 *
 * Writes a normalized event to c360_event (the shared C360/CDP event table).
 * Called by the webhook handler after resolveIdentity().
 *
 * @param {object} customer      - cdp_customers row (from resolveIdentity)
 * @param {number} confidenceScore
 * @param {object} eventPayload  - normalized event fields
 */
async function recordEvent(customer, confidenceScore, eventPayload) {
  const {
    event_name, event_category, platform, app_version, screen_name,
    channel, properties, occurred_at, received_at, session_id,
    rudderstack_message_id, anonymous_id
  } = eventPayload;

  const { rows } = await db.query(
    `INSERT INTO c360_event
       (event_id, customer_id, cdp_customer_uuid, anonymous_id,
        event_name, event_category, platform, app_version, screen_name,
        channel, properties, occurred_at, received_at, session_id,
        confidence_score, rudderstack_message_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
     ON CONFLICT (rudderstack_message_id) DO NOTHING
     RETURNING event_id`,
    [
      uuidv4(),
      customer.c360_customer_id || null,   // VARCHAR(20) PHS account
      customer.id,                          // UUID cdp internal
      anonymous_id || null,
      event_name,
      event_category || null,
      platform || null,
      app_version || null,
      screen_name || null,
      channel || null,
      JSON.stringify(properties || {}),
      occurred_at ? new Date(occurred_at) : new Date(),
      received_at ? new Date(received_at) : new Date(),
      session_id || null,
      confidenceScore,
      rudderstack_message_id || null
    ]
  );

  return rows[0] || null;
}

// ---------------------------------------------------------------------------
// PII masking for safe logging
// ---------------------------------------------------------------------------
function _maskPII(identifiers) {
  const safe = { ...identifiers };
  if (safe.email)            safe.email = safe.email.replace(/(.{2}).+(@.+)/, '$1***$2');
  if (safe.phone)            safe.phone = safe.phone.slice(0, 4) + '****' + safe.phone.slice(-2);
  if (safe.national_id_hash) safe.national_id_hash = '[hashed]';
  if (safe.national_id_raw)  safe.national_id_raw  = '[REDACTED]';
  return safe;
}

// ---------------------------------------------------------------------------
module.exports = {
  resolveIdentity,
  recordEvent,
  hashNationalId,
  computeConfidenceScore,
  invalidateConfigCache,
  _maskPII // exported for unit tests
};
