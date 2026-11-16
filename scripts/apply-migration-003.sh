#!/bin/bash
# Apply migration 003 — run from cdp_product directory
set -e
echo "Applying migration 003: identity tiers + event upgrades..."

docker compose exec -T cdp-postgres psql -U cdp -d cdp_profiles << 'EOSQL'
-- Step 1: Add columns to cdp_identities (idempotent)
ALTER TABLE cdp_identities
  ADD COLUMN IF NOT EXISTS tier         SMALLINT NOT NULL DEFAULT 3,
  ADD COLUMN IF NOT EXISTS priority     SMALLINT NOT NULL DEFAULT 99,
  ADD COLUMN IF NOT EXISTS last_seen_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();

CREATE INDEX IF NOT EXISTS idx_identities_tier ON cdp_identities(tier);
CREATE INDEX IF NOT EXISTS idx_identities_customer_type ON cdp_identities(customer_id, identifier_type);

-- Step 2: Add columns to cdp_events (idempotent)
ALTER TABLE cdp_events
  ADD COLUMN IF NOT EXISTS rs_message_id VARCHAR(255),
  ADD COLUMN IF NOT EXISTS rs_job_id     BIGINT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_events_rs_message_id
  ON cdp_events(rs_message_id) WHERE rs_message_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_events_anonymous_id ON cdp_events(anonymous_id);
CREATE INDEX IF NOT EXISTS idx_events_occurred_at  ON cdp_events(occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_events_customer_id  ON cdp_events(customer_id);

-- Step 3: Seed/update identity config with correct tiers
INSERT INTO cdp_identity_config
  (identifier_type, display_name, tier, priority, merge_strategy, description)
VALUES
  ('phs_account_id',    'PHS Account ID',               1, 10, 'permanent',   'Primary: depository account number'),
  ('national_id_hash',  'National ID / CCCD (hashed)',  1, 20, 'permanent',   'SHA-256 of CCCD/CMND'),
  ('c360_customer_id',  'CDP Customer ID',               1, 15, 'permanent',   'Internal CDP customer ID'),
  ('phone',             'Mobile Phone Number',           2, 30, 'pre_account', 'E.164 format; merge pre-account'),
  ('email',             'Email Address',                 2, 40, 'pre_account', 'Not a permanent merge key'),
  ('idfa',              'iOS Advertising ID (IDFA)',     2, 50, 'pre_account', 'Apple IDFA'),
  ('idfv',              'iOS Vendor ID (IDFV)',          2, 60, 'pre_account', 'Apple IDFV'),
  ('gaid',              'Google Advertising ID (GAID)', 2, 70, 'pre_account', 'Google GAID'),
  ('app_user_id',       'App User ID',                  2, 80, 'pre_account', 'Internal app user ID'),
  ('xpro_user_id',      'XPro User ID',                 2, 90, 'pre_account', 'XPro platform ID'),
  ('zalo_id',           'Zalo User ID',                 2, 100,'pre_account', 'Zalo social ID'),
  ('cloudgo_contact_id','CloudGO Contact ID',           2, 110,'pre_account', 'CloudGO CRM ID'),
  ('anonymous_id',      'Anonymous Visitor ID',         3, 200,'track_only',  'Never a merge key')
ON CONFLICT (identifier_type) DO UPDATE SET
  tier           = EXCLUDED.tier,
  priority       = EXCLUDED.priority,
  merge_strategy = EXCLUDED.merge_strategy,
  display_name   = EXCLUDED.display_name;

-- Step 4: Fix existing identities — backfill correct tiers
UPDATE cdp_identities i
SET tier     = c.tier,
    priority = c.priority
FROM cdp_identity_config c
WHERE i.identifier_type = c.identifier_type
  AND (i.tier != c.tier OR i.priority != c.priority);

-- Verify
SELECT identifier_type, display_name, tier, merge_strategy
FROM cdp_identity_config
ORDER BY tier, priority;
EOSQL

echo ""
echo "Migration 003 applied successfully."
echo "Checking identity graph for user-phs-001..."
docker compose exec -T cdp-postgres psql -U cdp -d cdp_profiles -c "
SELECT identifier_type, identifier_value, tier, source
FROM cdp_identities
WHERE customer_id = (SELECT id FROM cdp_customers WHERE c360_customer_id = 'user-phs-001')
ORDER BY tier, identifier_type;
"
