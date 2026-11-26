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
 *   → Reassigned freely when the same device identifies as a different user.
 *
 * Confidence score rules (stored on c360_event):
 *   Tier 1 match  → 95
 *   Tier 2 match  → 70
 *   Tier 3 only   → 20
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
// Small helpers
// ---------------------------------------------------------------------------
const ALLOWED_SOURCES = new Set(['web', 'mobile', 'crm', 'rudderstack', 'server']);
function safeSource(source) {
  return ALLOWED_SOURCES.has(source) ? source : 'rudderstack';
}

const LIFECYCLE_VALUES = new Set([
  'prospect', 'lead', 'ekyc', 'account_opening', 'funding', 'first_trade',
  'active_investor', 'vip', 'dormant', 'churn_risk', 'reactivation',
  'newly_opened', 'unfunded', 'no_trade', 'active', 'declining', 'churned',
]);

function clip(value, max) {
  if (value === null || value === undefined) return null;
  const s = String(value);
  return s.length > max ? s.slice(0, max) : s;
}

/** A profile is an "anonymous shell" when nothing but Tier-3 identifiers points at it. */
async function isAnonymousShell(client, customer) {
  if (!customer) return false;
  if (customer.c360_customer_id) return false;
  const { rows } = await client.query(
    `SELECT 1 FROM cdp_identities WHERE customer_id = $1 AND tier < 3 LIMIT 1`,
    [customer.id]
  );
  return rows.length === 0;
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
 * Resolution order:
 *   1. Tier 1 (account id, national id hash)        → permanent match
 *   2. Tier 2 (phone, email, device ids)            → match only pre-account profiles
 *   3. Tier 3 (anonymous id)                        → same visitor as before:
 *        - event carries no stronger identifier     → reuse the profile that owns the anonymous id
 *        - event carries a NEW stronger identifier  → reuse it only if it is still an anonymous
 *                                                     shell (it then becomes the known customer)
 *   4. Nothing matched                              → create a profile
 *
 * Anonymous → Known stitching: when an anonymous id that belongs to an anonymous
 * shell arrives together with a known customer, the shell's history is moved to
 * the known customer and the shell is removed.
 *
 * @param {object} identifiers  - { phs_account_id?, national_id_raw?, phone?, email?,
 *                                   idfa?, idfv?, gaid?, anonymous_id?,
 *                                   app_user_id?, xpro_user_id?, zalo_id?, cloudgo_contact_id?,
 *                                   full_name? }
 * @param {object} [context]    - { source?, session_id? } for audit
 * @param {object} [traits]     - profile traits from identify() to store on the profile
 * @returns {object}            - { customer, identifierType, confidenceScore, isNew, merged }
 */
async function resolveIdentity(identifiers, context = {}, traits = null) {
  const config = await getIdentityConfig();
  identifiers = { ...identifiers };
  context = { ...context, source: safeSource(context.source) };

  // Normalize: c360_customer_id is the canonical name from the UI/webhook layer.
  // IdentityResolutionService uses phs_account_id internally. Alias here so both work.
  if (!identifiers.phs_account_id && identifiers.c360_customer_id) {
    identifiers.phs_account_id = identifiers.c360_customer_id;
  }

  // Hash national_id if provided in raw form
  if (identifiers.national_id_raw) {
    identifiers.national_id_hash = hashNationalId(identifiers.national_id_raw);
  }
  delete identifiers.national_id_raw;

  // Column limits
  identifiers.phs_account_id = clip(identifiers.phs_account_id, 128);
  identifiers.anonymous_id   = clip(identifiers.anonymous_id, 255);
  identifiers.email          = identifiers.email ? clip(String(identifiers.email).trim().toLowerCase(), 255) : null;
  identifiers.phone          = clip(identifiers.phone, 50);
  identifiers.full_name      = clip(identifiers.full_name, 255);

  const client = await db.getClient();
  try {
    await client.query('BEGIN');

    // Serialise concurrent events of the same visitor/customer so two parallel
    // webhook calls cannot both create a profile for the same identifier.
    const lockKeys = [identifiers.phs_account_id, identifiers.anonymous_id].filter(Boolean).sort();
    for (const key of lockKeys) {
      await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [key]);
    }

    let matchedCustomer = null;
    let matchedIdentifierType = null;

    const tier1Types = config
      .filter(c => c.tier === 1 && c.merge_strategy === 'permanent')
      .sort((a, b) => a.priority - b.priority)
      .map(c => c.identifier_type);
    const tier2Types = config
      .filter(c => c.tier === 2 && c.merge_strategy === 'pre_account')
      .sort((a, b) => a.priority - b.priority)
      .map(c => c.identifier_type);

    const findByIdentity = async (idType, value) => {
      const { rows } = await client.query(
        `SELECT c.*
         FROM cdp_customers c
         JOIN cdp_identities i ON i.customer_id = c.id
         WHERE i.identifier_type = $1
           AND i.identifier_value = $2
         LIMIT 1`,
        [idType, value]
      );
      return rows[0] || null;
    };

    // ── Step 1: Tier-1 identifiers ──────────────────────────────────────
    for (const idType of tier1Types) {
      const value = identifiers[idType];
      if (!value) continue;
      const found = await findByIdentity(idType, value);
      if (found) { matchedCustomer = found; matchedIdentifierType = idType; break; }
    }

    // Fast path: also check c360_customer_id column directly for phs_account_id
    if (!matchedCustomer && identifiers.phs_account_id) {
      const { rows } = await client.query(
        `SELECT * FROM cdp_customers WHERE c360_customer_id = $1 LIMIT 1`,
        [identifiers.phs_account_id]
      );
      if (rows.length > 0) {
        matchedCustomer = rows[0];
        matchedIdentifierType = 'phs_account_id';
      }
    }

    // ── Step 2: Tier-2 identifiers ONLY if no Tier-1 found ──────────────
    if (!matchedCustomer) {
      for (const idType of tier2Types) {
        const value = identifiers[idType];
        if (!value) continue;
        const found = await findByIdentity(idType, value);
        if (found) {
          // Merge only if the matched profile has NO Tier-1 identifier yet,
          // or the event does not claim a (different) account at all.
          const { rows: tier1Rows } = await client.query(
            `SELECT 1 FROM cdp_identities
             WHERE customer_id = $1
               AND identifier_type = ANY($2::text[])
             LIMIT 1`,
            [found.id, tier1Types]
          );
          const targetHasAccount = tier1Rows.length > 0 || !!found.c360_customer_id;
          if (!targetHasAccount || !identifiers.phs_account_id) {
            matchedCustomer = found;
            matchedIdentifierType = idType;
          }
          break;
        }
      }
    }

    // ── Step 3: Tier-3 — the profile that currently owns this anonymous id ─
    let anonOwner = null;
    let anonOwnerIsShell = false;
    if (identifiers.anonymous_id) {
      anonOwner = await findByIdentity('anonymous_id', identifiers.anonymous_id);
      anonOwnerIsShell = await isAnonymousShell(client, anonOwner);
    }
    const hasStrongIdentifier = [...tier1Types, ...tier2Types].some(t => !!identifiers[t]);

    if (!matchedCustomer && anonOwner && (!hasStrongIdentifier || anonOwnerIsShell)) {
      matchedCustomer = anonOwner;
      matchedIdentifierType = 'anonymous_id';
    }

    // ── Step 4: Create new profile if still not found ───────────────────
    let isNew = false;
    if (!matchedCustomer) {
      const now = new Date();
      const { rows: newRows } = await client.query(
        `INSERT INTO cdp_customers
           (id, c360_customer_id, email, phone, full_name,
            app_user_id, xpro_user_id, zalo_user_id, cloudgo_contact_id,
            lifecycle_stage, account_status,
            first_seen_at, last_seen_at, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9,
                 $10, $11,
                 $12, $12, $12, $12)
         ON CONFLICT (c360_customer_id) DO UPDATE
           SET last_seen_at = NOW(), updated_at = NOW()
         RETURNING *`,
        [
          uuidv4(),
          identifiers.phs_account_id || null,
          identifiers.email || null,
          identifiers.phone || null,
          identifiers.full_name || null,
          clip(identifiers.app_user_id, 128),
          clip(identifiers.xpro_user_id, 128),
          clip(identifiers.zalo_id, 128),
          clip(identifiers.cloudgo_contact_id, 128),
          identifiers.phs_account_id ? 'lead' : 'prospect',
          identifiers.phs_account_id ? 'active' : 'lead',
          now,
        ]
      );

      matchedCustomer = newRows[0];
      matchedIdentifierType = identifiers.phs_account_id
        ? 'phs_account_id'
        : (identifiers.phone ? 'phone' : (identifiers.email ? 'email' : 'anonymous_id'));
      isNew = true;

      console.log(JSON.stringify({
        event: 'identity.created',
        customerId: matchedCustomer.id,
        identifierType: matchedIdentifierType,
        source: context.source
      }));
    } else {
      await client.query(
        `UPDATE cdp_customers SET last_seen_at = NOW(), updated_at = NOW()
         WHERE id = $1`,
        [matchedCustomer.id]
      );
    }

    // ── Step 5: Anonymous → Known stitching ─────────────────────────────
    // The anonymous id belonged to an anonymous shell, and the event resolved
    // to another (known) profile: carry the anonymous history over.
    let merged = false;
    if (anonOwner && anonOwner.id !== matchedCustomer.id && anonOwnerIsShell) {
      await mergeProfiles(client, anonOwner.id, matchedCustomer.id);
      merged = true;
      console.log(JSON.stringify({
        event: 'identity.stitched',
        from: anonOwner.id,
        into: matchedCustomer.id,
      }));
    }

    // ── Step 6: Upsert all provided identifiers into cdp_identities ─────
    await upsertIdentifiers(client, matchedCustomer.id, identifiers, config, context);

    // ── Step 7: First time this profile gets an account id → upgrade ────
    if (identifiers.phs_account_id && !matchedCustomer.c360_customer_id) {
      await client.query(
        `UPDATE cdp_customers
         SET c360_customer_id = $1,
             lifecycle_stage  = CASE
               WHEN lifecycle_stage IS NULL OR lifecycle_stage = 'prospect' THEN 'lead'
               ELSE lifecycle_stage
             END,
             account_status   = 'active',
             converted_at     = COALESCE(converted_at, NOW()),
             updated_at       = NOW()
         WHERE id = $2`,
        [identifiers.phs_account_id, matchedCustomer.id]
      );
      matchedIdentifierType = 'phs_account_id';
      console.log(JSON.stringify({
        event: 'identity.upgraded',
        customerId: matchedCustomer.id,
      }));
    }

    // ── Step 8: Store profile traits (identify) ─────────────────────────
    await applyTraits(client, matchedCustomer.id, identifiers, traits);

    const { rows: fresh } = await client.query(
      `SELECT * FROM cdp_customers WHERE id = $1`, [matchedCustomer.id]
    );
    await client.query('COMMIT');

    // Confidence reflects the strongest identifier the event carried.
    const strongest = identifiers.phs_account_id || identifiers.national_id_hash
      ? (identifiers.phs_account_id ? 'phs_account_id' : 'national_id_hash')
      : (tier2Types.find(t => !!identifiers[t]) || matchedIdentifierType || 'anonymous_id');
    const confidenceScore = computeConfidenceScore(strongest, config);

    return {
      customer: fresh[0] || matchedCustomer,
      identifierType: matchedIdentifierType,
      confidenceScore,
      isNew,
      merged,
    };
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    console.error(JSON.stringify({
      event: 'identity.resolution_failed',
      error: err.message,
      identifiers: _maskPII(identifiers)
    }));
    throw err;
  } finally {
    client.release();
  }
}

// ---------------------------------------------------------------------------
// Merge an anonymous shell profile into a surviving profile
// ---------------------------------------------------------------------------
async function mergeProfiles(client, fromId, intoId) {
  if (!fromId || !intoId || fromId === intoId) return;

  const { rows: target } = await client.query(
    `SELECT c360_customer_id FROM cdp_customers WHERE id = $1`, [intoId]
  );

  // Behaviour history follows the surviving profile
  await client.query(
    `UPDATE c360_event
     SET cdp_customer_uuid = $1, customer_id = $2
     WHERE cdp_customer_uuid = $3`,
    [intoId, clip(target[0]?.c360_customer_id, 100), fromId]
  );

  // Remaining identifiers of the shell (other anonymous ids / devices)
  await client.query(
    `UPDATE cdp_identities SET customer_id = $1 WHERE customer_id = $2`,
    [intoId, fromId]
  );

  // Keep the earliest first-seen date
  await client.query(
    `UPDATE cdp_customers t
     SET first_seen_at = LEAST(t.first_seen_at, s.first_seen_at)
     FROM cdp_customers s
     WHERE t.id = $1 AND s.id = $2`,
    [intoId, fromId]
  );

  await client.query(`DELETE FROM cdp_customers WHERE id = $1`, [fromId]);
}

// ---------------------------------------------------------------------------
// Store identify() traits on the profile
// ---------------------------------------------------------------------------
// Traits that are identifiers or have their own column — never copied to custom_attributes.
const RESERVED_TRAITS = new Set([
  'email', 'phone', 'name', 'full_name', 'firstName', 'lastName', 'first_name', 'last_name',
  'lifecycle_stage', 'kyc_status', 'product_interests',
  'national_id', 'national_id_raw', 'national_id_hash', 'password',
  'app_user_id', 'xpro_user_id', 'zalo_id', 'cloudgo_contact_id', 'idfa', 'idfv', 'gaid',
]);

async function applyTraits(client, customerId, identifiers, traits) {
  const t = traits && typeof traits === 'object' ? traits : {};

  const fullName = identifiers.full_name
    || clip([t.firstName || t.first_name, t.lastName || t.last_name].filter(Boolean).join(' ') || null, 255);
  const lifecycle = LIFECYCLE_VALUES.has(t.lifecycle_stage) ? t.lifecycle_stage : null;
  const interests = Array.isArray(t.product_interests) ? JSON.stringify(t.product_interests) : null;

  // Remaining simple traits → custom attributes (objects/arrays are skipped)
  const custom = {};
  for (const [k, v] of Object.entries(t)) {
    if (RESERVED_TRAITS.has(k)) continue;
    if (v === null || v === undefined) continue;
    if (['string', 'number', 'boolean'].includes(typeof v)) custom[k] = v;
  }
  const hasCustom = Object.keys(custom).length > 0;

  if (!identifiers.email && !identifiers.phone && !fullName && !lifecycle && !t.kyc_status && !interests && !hasCustom) {
    return;
  }

  await client.query(
    `UPDATE cdp_customers SET
       email             = COALESCE($2, email),
       phone             = COALESCE($3, phone),
       full_name         = COALESCE($4, full_name),
       lifecycle_stage   = COALESCE($5, lifecycle_stage),
       kyc_status        = COALESCE($6, kyc_status),
       product_interests = COALESCE($7::jsonb, product_interests),
       custom_attributes = COALESCE(custom_attributes, '{}'::jsonb) || $8::jsonb,
       updated_at        = NOW()
     WHERE id = $1`,
    [
      customerId,
      identifiers.email || null,
      identifiers.phone || null,
      fullName || null,
      lifecycle,
      clip(t.kyc_status, 64),
      interests,
      JSON.stringify(custom),
    ]
  );
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
  const source = safeSource(context.source);

  for (const [idType, rawValue] of Object.entries(idMap)) {
    if (!rawValue) continue;
    const value = clip(rawValue, 512);

    const cfgEntry = config.find(c => c.identifier_type === idType);
    const tier     = cfgEntry ? cfgEntry.tier : 3;
    const priority = cfgEntry ? cfgEntry.priority : 99;

    if (tier === 3) {
      // Tier 3: reassign freely to current customer (anonymous_id follows latest identify)
      await client.query(
        `INSERT INTO cdp_identities
           (id, customer_id, identifier_type, identifier_value,
            tier, priority, source, last_seen_at, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), NOW())
         ON CONFLICT (identifier_type, identifier_value)
           DO UPDATE SET
             customer_id  = EXCLUDED.customer_id,
             last_seen_at = NOW(),
             source       = EXCLUDED.source`,
        [uuidv4(), customerId, idType, value, tier, priority, source]
      );
    } else {
      // Tier 1/2: insert or touch last_seen_at if same customer.
      // If owned by a DIFFERENT customer → skip silently (WHERE guards the update).
      await client.query(
        `INSERT INTO cdp_identities
           (id, customer_id, identifier_type, identifier_value,
            tier, priority, source, last_seen_at, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), NOW())
         ON CONFLICT (identifier_type, identifier_value)
           DO UPDATE SET
             last_seen_at = NOW(),
             source       = EXCLUDED.source
           WHERE cdp_identities.customer_id = EXCLUDED.customer_id`,
        [uuidv4(), customerId, idType, value, tier, priority, source]
      );
    }
  }
}

// ---------------------------------------------------------------------------
// Write resolved event to c360_event
// ---------------------------------------------------------------------------

// Real column widths of c360_event, read once. Older databases still have the
// narrow columns (event_name 50, platform 20 …); values are clipped to whatever
// the live table accepts so an event is never rejected for being "too long".
let _eventLimits = null;
const DEFAULT_EVENT_LIMITS = {
  customer_id: 20, anonymous_id: 100, event_name: 50, event_category: 30, platform: 20,
  app_version: 20, screen_name: 100, channel: 20, session_id: 100, rudderstack_message_id: 100,
};
async function getEventLimits() {
  if (_eventLimits) return _eventLimits;
  try {
    const { rows } = await db.query(
      `SELECT column_name, character_maximum_length AS len
       FROM information_schema.columns
       WHERE table_name = 'c360_event' AND character_maximum_length IS NOT NULL`
    );
    if (rows.length) {
      _eventLimits = { ...DEFAULT_EVENT_LIMITS };
      rows.forEach(r => { _eventLimits[r.column_name] = r.len; });
      return _eventLimits;
    }
  } catch { /* fall through to defaults */ }
  return DEFAULT_EVENT_LIMITS;
}
function resetEventLimits() { _eventLimits = null; }

/**
 * recordEvent
 *
 * Writes a normalized event to c360_event (the shared C360/CDP event table).
 * `customer` may be null for an event that could not be linked to a profile.
 */
async function recordEvent(customer, confidenceScore, eventPayload) {
  const {
    event_name, event_category, platform, app_version, screen_name,
    channel, properties, occurred_at, received_at, session_id,
    rudderstack_message_id, anonymous_id
  } = eventPayload;

  const L = await getEventLimits();
  const toDate = (v) => {
    const d = v ? new Date(v) : new Date();
    return isNaN(d.getTime()) ? new Date() : d;
  };

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
      clip(customer && customer.c360_customer_id, L.customer_id),
      customer ? customer.id : null,
      clip(anonymous_id, L.anonymous_id),
      clip(event_name || 'Unknown Event', L.event_name),
      clip(event_category, L.event_category),
      clip(platform, L.platform),
      clip(app_version, L.app_version),
      clip(screen_name, L.screen_name),
      clip(channel, L.channel),
      JSON.stringify(properties || {}),
      toDate(occurred_at),
      toDate(received_at),
      clip(session_id, L.session_id),
      Math.max(0, Math.min(100, Number(confidenceScore) || 0)),
      clip(rudderstack_message_id, L.rudderstack_message_id)
    ]
  );

  // rows is empty when the same RudderStack message was already stored
  return rows[0] || { duplicate: true };
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
  mergeProfiles,
  resetEventLimits,
  hashNationalId,
  computeConfidenceScore,
  invalidateConfigCache,
  _maskPII
};
