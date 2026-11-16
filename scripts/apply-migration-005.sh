#!/usr/bin/env bash
# Migration 005: Fix c360_event column sizes
set -e
cd "$(dirname "$0")/.."

echo "Applying migration 005: fix c360_event column sizes..."

docker compose exec -T cdp-postgres psql -U cdp -d cdp_profiles << 'SQL'
ALTER TABLE c360_event
  ALTER COLUMN customer_id    TYPE VARCHAR(100),
  ALTER COLUMN channel        TYPE VARCHAR(50),
  ALTER COLUMN event_name     TYPE VARCHAR(100),
  ALTER COLUMN event_category TYPE VARCHAR(50),
  ALTER COLUMN platform       TYPE VARCHAR(50),
  ALTER COLUMN app_version    TYPE VARCHAR(50);

SELECT column_name, character_maximum_length
FROM information_schema.columns
WHERE table_name = 'c360_event'
  AND data_type = 'character varying'
ORDER BY ordinal_position;
SQL

echo "Migration 005 complete."
