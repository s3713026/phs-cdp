#!/bin/bash
# Migration 004: Fix identity tiers + clean c360_customer_id duplicates
# Run from cdp_product directory
set -e
echo "Applying migration 004: fix identity tiers and data cleanup..."

docker compose exec -T cdp-postgres psql -U cdp -d cdp_profiles << 'EOSQL'

-- Step 1: Fix any rows where tier/priority don't match the current config
UPDATE cdp_identities i
SET tier     = c.tier,
    priority = c.priority
FROM cdp_identity_config c
WHERE i.identifier_type = c.identifier_type
  AND (i.tier != c.tier OR i.priority != c.priority);

-- Step 2: Remove redundant c360_customer_id entries from cdp_identities
-- (c360_customer_id is already the primary key column on cdp_customers;
--  we don't need a separate identity row for it)
DELETE FROM cdp_identities
WHERE identifier_type = 'c360_customer_id';

-- Step 3: Ensure unique constraint exists on cdp_identities
-- (identifier_type, identifier_value) must be globally unique for Tier-3 reassign to work
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'cdp_identities_identifier_type_identifier_value_key'
  ) THEN
    ALTER TABLE cdp_identities
      ADD CONSTRAINT cdp_identities_identifier_type_identifier_value_key
      UNIQUE (identifier_type, identifier_value);
    RAISE NOTICE 'Added global unique constraint on (identifier_type, identifier_value)';
  ELSE
    RAISE NOTICE 'Global unique constraint already exists';
  END IF;
END $$;

-- Verify tiers
SELECT identifier_type, identifier_value, tier, source
FROM cdp_identities
ORDER BY tier, identifier_type;

EOSQL

echo ""
echo "Migration 004 complete. Current identity graph:"
docker compose exec -T cdp-postgres psql -U cdp -d cdp_profiles -c "
SELECT
  c.c360_customer_id,
  i.identifier_type,
  i.identifier_value,
  i.tier,
  i.source
FROM cdp_identities i
JOIN cdp_customers c ON c.id = i.customer_id
ORDER BY c.c360_customer_id, i.tier, i.identifier_type;
"
