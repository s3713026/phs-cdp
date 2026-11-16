#!/usr/bin/env bash
# Fix & Rebuild — applies all fixes and verifies the full pipeline
# Run: bash scripts/fix-and-rebuild.sh
set -e
cd "$(dirname "$0")/.."

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  CDP Fix & Rebuild"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# ── 1. Apply data fix migration ──────────────────────────────────────────────
echo ""
echo "=== [1] Applying data migration 004 ==="
bash scripts/apply-migration-004.sh

# ── 2. Rebuild BFF ───────────────────────────────────────────────────────────
echo ""
echo "=== [2] Rebuilding BFF container ==="
docker compose build phs-cdp-bff --no-cache
docker compose up -d phs-cdp-bff

echo "Waiting 5s for BFF to start..."
sleep 5

# ── 3. Health check ──────────────────────────────────────────────────────────
echo ""
echo "=== [3] Health Checks ==="
BFF_HEALTH=$(curl -sf http://localhost:3001/health 2>&1) && echo "✅ BFF: $BFF_HEALTH" || echo "❌ BFF not healthy"
RS_HEALTH=$(curl -sf http://localhost:8082/health 2>&1) && echo "✅ RudderStack gateway OK" || echo "⚠️  RudderStack: $RS_HEALTH"

# ── 4. Test direct BFF — should work ─────────────────────────────────────────
echo ""
echo "=== [4] Direct BFF Webhook Test (user-phs-002) ==="
RESULT=$(curl -s -X POST http://localhost:3001/api/webhook/rudderstack \
  -H "Content-Type: application/json" \
  -d '{"type":"identify","userId":"user-phs-002","anonymousId":"new-anon-456","traits":{"email":"investor@phs.vn","phone":"0901234567"}}')
echo "$RESULT"

if echo "$RESULT" | grep -q '"status":"ok"'; then
  echo "✅ Direct BFF webhook: OK"
else
  echo "❌ Direct BFF webhook FAILED"
fi

# ── 5. Check identity graph user-phs-002 ─────────────────────────────────────
echo ""
echo "=== [5] Identity Graph: user-phs-002 ==="
docker compose exec -T cdp-postgres psql -U cdp -d cdp_profiles -c "
SELECT identifier_type, identifier_value, tier, source
FROM cdp_identities
WHERE customer_id = (SELECT id FROM cdp_customers WHERE c360_customer_id = 'user-phs-002')
ORDER BY tier, identifier_type;
"

# ── 6. Test via RudderStack gateway ──────────────────────────────────────────
echo ""
echo "=== [6] Send events via RudderStack Gateway (port 8082) ==="
# Anonymous page view
curl -sf -X POST http://localhost:8082/v1/page \
  -u "phs_Javascript_mwd0djfl:" \
  -H "Content-Type: application/json" \
  -d '{"anonymousId":"rs-test-anon-001","name":"Margin Products","context":{"page":{"url":"https://phs.vn/margin"}}}' \
  && echo "  ✅ Page event sent" || echo "  ❌ Page event failed"

sleep 1

# Identify (link anon to known user)
curl -sf -X POST http://localhost:8082/v1/identify \
  -u "phs_Javascript_mwd0djfl:" \
  -H "Content-Type: application/json" \
  -d '{"userId":"user-phs-003","anonymousId":"rs-test-anon-001","traits":{"email":"rs-test@phs.vn","phone":"0912345678"}}' \
  && echo "  ✅ Identify event sent" || echo "  ❌ Identify event failed"

echo ""
echo "Waiting 10s for RudderStack to process and route..."
sleep 10

# ── 7. Check if RS routed to BFF ────────────────────────────────────────────
echo ""
echo "=== [7] RudderStack Router Jobs ==="
# rt_jobs_1 holds pending/queued jobs; rt_job_status_1 holds delivery outcomes
docker compose exec -T rudder-postgres psql -U rudder -d jobsdb -c "
SELECT
  COUNT(*)        AS total_queued_jobs,
  MIN(created_at) AS oldest_job,
  MAX(created_at) AS newest_job
FROM rt_jobs_1;
" 2>&1 || echo "(rt_jobs_1 table may not exist yet — no events routed)"

echo ""
echo "--- Job delivery outcomes (rt_job_status_1) ---"
docker compose exec -T rudder-postgres psql -U rudder -d jobsdb -c "
SELECT job_state, COUNT(*) AS count
FROM rt_job_status_1
GROUP BY job_state
ORDER BY count DESC;
" 2>&1 || echo "(rt_job_status_1 table may not exist yet)"

echo ""
echo "=== [8] BFF Logs (last 15 lines) ==="
docker compose logs phs-cdp-bff --tail 15 2>&1

# ── 9. Final: check identity graph user-phs-003 (from RS pipeline) ──────────
echo ""
echo "=== [9] Identity Graph: user-phs-003 (via RudderStack) ==="
docker compose exec -T cdp-postgres psql -U cdp -d cdp_profiles -c "
SELECT identifier_type, identifier_value, tier, source
FROM cdp_identities
WHERE customer_id = (SELECT id FROM cdp_customers WHERE c360_customer_id = 'user-phs-003')
ORDER BY tier, identifier_type;
" 2>&1

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
if docker compose exec -T cdp-postgres psql -U cdp -d cdp_profiles -qtAX \
   -c "SELECT COUNT(*) FROM cdp_identities WHERE customer_id=(SELECT id FROM cdp_customers WHERE c360_customer_id='user-phs-002')" 2>/dev/null | grep -qv "^0$"; then
  echo "  ✅ PASS: user-phs-002 has identity records"
else
  echo "  ⚠️  user-phs-002 has no identity records yet"
fi

USER3_COUNT=$(docker compose exec -T cdp-postgres psql -U cdp -d cdp_profiles -qtAX \
  -c "SELECT COUNT(*) FROM cdp_identities WHERE customer_id=(SELECT id FROM cdp_customers WHERE c360_customer_id='user-phs-003')" 2>/dev/null || echo "0")
if [ "$USER3_COUNT" != "0" ] && [ -n "$USER3_COUNT" ]; then
  echo "  ✅ PASS: RudderStack pipeline is working (user-phs-003 has $USER3_COUNT identity records)"
else
  echo "  ⚠️  RudderStack pipeline may not be routing — user-phs-003 has 0 records"
  echo "  → Check step 7-8 output above for clues"
fi
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
