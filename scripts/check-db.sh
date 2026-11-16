#!/bin/bash
# Chạy: bash scripts/check-db.sh
# Kiểm tra toàn bộ trạng thái DB của CDP BFF

PSQL="docker compose exec -T cdp-postgres psql -U cdp -d cdp_profiles"

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  CDP Database Health Check"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

echo ""
echo "=== [1] Fix c360_event constraint (non-deferrable) ==="
$PSQL <<'SQL'
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'uq_c360_event_rs_message_id'
      AND conrelid = 'c360_event'::regclass
      AND condeferrable = TRUE
  ) THEN
    ALTER TABLE c360_event DROP CONSTRAINT uq_c360_event_rs_message_id;
    ALTER TABLE c360_event ADD CONSTRAINT uq_c360_event_rs_message_id UNIQUE (rudderstack_message_id);
    RAISE NOTICE 'FIXED: constraint converted to non-deferrable';
  ELSE
    RAISE NOTICE 'OK: constraint already non-deferrable';
  END IF;
END $$;
SQL

echo ""
echo "=== [2] Tables ==="
$PSQL -c "\dt"

echo ""
echo "=== [3] cdp_customers ==="
$PSQL -c "SELECT id, c360_customer_id, email, phone, lifecycle_stage, account_status, created_at FROM cdp_customers ORDER BY created_at;"

echo ""
echo "=== [4] Identity graph (cdp_identities) ==="
$PSQL -c "
SELECT cu.c360_customer_id, i.identifier_type, i.identifier_value, i.tier, i.source
FROM cdp_identities i
LEFT JOIN cdp_customers cu ON cu.id = i.customer_id
ORDER BY cu.c360_customer_id NULLS LAST, i.tier, i.priority;"

echo ""
echo "=== [5] c360_event (last 20 events) ==="
$PSQL -c "
SELECT event_id, customer_id, anonymous_id, event_name, platform, confidence_score,
       to_char(occurred_at, 'YYYY-MM-DD HH24:MI:SS') AS occurred_at
FROM c360_event ORDER BY occurred_at DESC LIMIT 20;"

echo ""
echo "=== [6] c360_event constraint status ==="
$PSQL -c "
SELECT conname,
       CASE WHEN condeferrable THEN 'DEFERRABLE ❌' ELSE 'NOT DEFERRABLE ✅' END AS status
FROM pg_constraint
WHERE conname = 'uq_c360_event_rs_message_id';"

echo ""
echo "=== [7] cdp_identity_config ==="
$PSQL -c "
SELECT identifier_type, tier, priority, merge_strategy,
       CASE WHEN is_active THEN '✅' ELSE '❌' END AS active
FROM cdp_identity_config ORDER BY tier, priority;"

echo ""
echo "=== [8] Event count per customer ==="
$PSQL -c "
SELECT customer_id, count(*) AS events, max(occurred_at) AS last_event
FROM c360_event GROUP BY customer_id ORDER BY last_event DESC;"

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
