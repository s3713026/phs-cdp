-- ============================================================
-- Migration 003: Upgrade cdp_identities + cdp_events
-- + seed missing identity config entries
-- Idempotent: safe to run multiple times on any server
-- ============================================================

-- ── cdp_identities: add tier, priority, last_seen_at (idempotent) ────────────
ALTER TABLE cdp_identities
  ADD COLUMN IF NOT EXISTS tier         SMALLINT NOT NULL DEFAULT 3,
  ADD COLUMN IF NOT EXISTS priority     SMALLINT NOT NULL DEFAULT 99,
  ADD COLUMN IF NOT EXISTS last_seen_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();

CREATE INDEX IF NOT EXISTS idx_identities_tier
  ON cdp_identities(tier);
CREATE INDEX IF NOT EXISTS idx_identities_customer_type
  ON cdp_identities(customer_id, identifier_type);

-- ── GLOBAL UNIQUE constraint on (identifier_type, identifier_value) ──────────
-- Required for tier-3 reassignment and tier-1/2 conflict handling.
-- Named constraint so we can check existence with IF NOT EXISTS pattern.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'cdp_identities_identifier_type_identifier_value_key'
      AND conrelid = 'cdp_identities'::regclass
  ) THEN
    ALTER TABLE cdp_identities
      ADD CONSTRAINT cdp_identities_identifier_type_identifier_value_key
      UNIQUE (identifier_type, identifier_value);
    RAISE NOTICE 'Global unique constraint created';
  ELSE
    RAISE NOTICE 'Global unique constraint already exists';
  END IF;
END $$;

-- ── cdp_events: add rs_message_id + rs_job_id for dedup (idempotent) ─────────
ALTER TABLE cdp_events
  ADD COLUMN IF NOT EXISTS rs_message_id VARCHAR(255),
  ADD COLUMN IF NOT EXISTS rs_job_id     BIGINT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_events_rs_message_id
  ON cdp_events(rs_message_id) WHERE rs_message_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_events_anonymous_id ON cdp_events(anonymous_id);
CREATE INDEX IF NOT EXISTS idx_events_occurred_at  ON cdp_events(occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_events_customer_id  ON cdp_events(customer_id);

-- ── cdp_identity_config: seed / upsert all entries ───────────────────────────
INSERT INTO cdp_identity_config
  (identifier_type, display_name, tier, priority, merge_strategy, description)
VALUES
  ('phs_account_id',    'PHS Account ID',               1, 10, 'permanent',   'Primary ground-truth: depository account number'),
  ('national_id_hash',  'National ID / CCCD (hashed)',  1, 20, 'permanent',   'SHA-256 of CCCD/CMND/Passport — never store raw'),
  ('c360_customer_id',  'CDP Customer ID',               1, 15, 'permanent',   'Internal CDP customer identifier'),
  ('phone',             'Mobile Phone Number',           2, 30, 'pre_account', 'E.164 format; merge pre-account'),
  ('email',             'Email Address',                 2, 40, 'pre_account', '1 email per customer; not a permanent merge key'),
  ('idfa',              'iOS Advertising ID (IDFA)',     2, 50, 'pre_account', 'Apple IDFA — weak signal, user can reset'),
  ('idfv',              'iOS Vendor ID (IDFV)',          2, 60, 'pre_account', 'Apple IDFV — more stable than IDFA'),
  ('gaid',              'Google Advertising ID (GAID)', 2, 70, 'pre_account', 'Google GAID — weak signal, user can reset'),
  ('app_user_id',       'App User ID',                  2, 80, 'pre_account', 'Internal app user identifier'),
  ('xpro_user_id',      'XPro User ID',                 2, 90, 'pre_account', 'XPro platform user identifier'),
  ('zalo_id',           'Zalo User ID',                 2, 100,'pre_account', 'Zalo social platform identifier'),
  ('cloudgo_contact_id','CloudGO Contact ID',           2, 110,'pre_account', 'CloudGO CRM contact identifier'),
  ('anonymous_id',      'Anonymous Visitor ID',         3, 200,'track_only',  'RudderStack anonymous_id — never a merge key')
ON CONFLICT (identifier_type) DO UPDATE SET
  tier           = EXCLUDED.tier,
  priority       = EXCLUDED.priority,
  merge_strategy = EXCLUDED.merge_strategy,
  display_name   = EXCLUDED.display_name;

-- ── Fix existing identities: set correct tier from config ────────────────────
-- (backfill for rows inserted before migration 003 ran)
UPDATE cdp_identities i
SET tier     = c.tier,
    priority = c.priority
FROM cdp_identity_config c
WHERE i.identifier_type = c.identifier_type
  AND (i.tier != c.tier OR i.priority != c.priority);

-- ── Remove stale c360_customer_id rows from cdp_identities ───────────────────
-- c360_customer_id is an internal UUID stored as a column on cdp_customers,
-- NOT as a row in cdp_identities. Old code created these erroneously.
DELETE FROM cdp_identities WHERE identifier_type = 'c360_customer_id';

-- ── Drop legacy cdp_events table (all code now uses c360_event) ──────────────
-- cdp_events was the original event table from migration 001.
-- c360_event (migration 002) is the canonical table aligned with DWH C360.
-- Safe to drop: no code references cdp_events anymore.
DROP TABLE IF EXISTS cdp_events;

-- ── Fix c360_event: drop DEFERRABLE from rudderstack_message_id UNIQUE ────────
-- PostgreSQL does not allow ON CONFLICT with DEFERRABLE constraints.
-- This converts the existing deferrable constraint to a non-deferrable one.
DO $$
BEGIN
  -- Drop old deferrable constraint if it exists
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'uq_c360_event_rs_message_id'
      AND conrelid = 'c360_event'::regclass
  ) THEN
    -- Check if it's deferrable
    IF EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conname = 'uq_c360_event_rs_message_id'
        AND conrelid = 'c360_event'::regclass
        AND condeferrable = TRUE
    ) THEN
      ALTER TABLE c360_event DROP CONSTRAINT uq_c360_event_rs_message_id;
      ALTER TABLE c360_event
        ADD CONSTRAINT uq_c360_event_rs_message_id
        UNIQUE (rudderstack_message_id);
      RAISE NOTICE 'Fixed: c360_event UNIQUE constraint is now non-deferrable';
    ELSE
      RAISE NOTICE 'c360_event UNIQUE constraint already non-deferrable, no change needed';
    END IF;
  ELSE
    -- Constraint doesn't exist yet, create it
    ALTER TABLE c360_event
      ADD CONSTRAINT uq_c360_event_rs_message_id
      UNIQUE (rudderstack_message_id);
    RAISE NOTICE 'Created: c360_event UNIQUE constraint';
  END IF;
END $$;
