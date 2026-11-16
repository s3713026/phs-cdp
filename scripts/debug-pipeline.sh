#!/usr/bin/env bash
# Debug & verify full event pipeline: RudderStack → BFF → PostgreSQL
set -e
cd "$(dirname "$0")/.."

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  CDP Pipeline Debug & Test"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# ── 1. Container health ──────────────────────────────────────────────────────
echo ""
echo "=== [1] Container Status ==="
docker compose ps --format "table {{.Name}}\t{{.Status}}\t{{.Ports}}"

# ── 2. Check transformer ─────────────────────────────────────────────────────
echo ""
echo "=== [2] Transformer Health ==="
curl -sf http://localhost:9090/health 2>/dev/null \
  && echo "✅ Transformer reachable on :9090" \
  || echo "❌ Transformer NOT reachable on :9090"

# ── 3. BFF health ────────────────────────────────────────────────────────────
echo ""
echo "=== [3] BFF Health ==="
curl -sf http://localhost:3001/health 2>/dev/null \
  && echo "" \
  || echo "❌ BFF NOT reachable on :3001"

# ── 4. Check rudder-server processor logs ────────────────────────────────────
echo ""
echo "=== [4] RudderStack Recent Logs (processor + router) ==="
docker compose logs rudder-server --tail 30 2>&1 | grep -v "worker pinged\|worker listening\|worker received" | tail -25

# ── 5. Test direct BFF webhook ───────────────────────────────────────────────
echo ""
echo "=== [5] Test Direct BFF Webhook ==="
DIRECT_RESULT=$(curl -sf -X POST http://localhost:3001/api/webhook/rudderstack \
  -H "Content-Type: application/json" \
  -d '{"type":"identify","userId":"user-phs-002","anonymousId":"new-anon-456","traits":{"email":"investor@phs.vn","phone":"0901234567"}}' 2>&1)
echo "Result: $DIRECT_RESULT"

# ── 6. Check DB after direct webhook ────────────────────────────────────────
echo ""
echo "=== [6] Identity Graph for user-phs-002 ==="
docker compose exec -T cdp-postgres psql -U cdp -d cdp_profiles -c "
SELECT identifier_type, identifier_value, tier, source
FROM cdp_identities
WHERE customer_id = (SELECT id FROM cdp_customers WHERE c360_customer_id = 'user-phs-002')
ORDER BY tier, identifier_type;
" 2>&1

# ── 7. Send event via RudderStack SDK port ────────────────────────────────────
echo ""
echo "=== [7] Test RudderStack Gateway (port 8082) ==="
RS_PAGE=$(curl -sf -X POST http://localhost:8082/v1/page \
  -u "phs_Javascript_mwd0djfl:" \
  -H "Content-Type: application/json" \
  -d '{"anonymousId":"rs-anon-test-001","name":"Test Page","context":{"page":{"url":"http://test.local/"}}}' 2>&1)
echo "Page event: $RS_PAGE"

sleep 2

RS_IDENTIFY=$(curl -sf -X POST http://localhost:8082/v1/identify \
  -u "phs_Javascript_mwd0djfl:" \
  -H "Content-Type: application/json" \
  -d '{"userId":"user-phs-003","anonymousId":"rs-anon-test-001","traits":{"email":"rs-test@phs.vn"}}' 2>&1)
echo "Identify event: $RS_IDENTIFY"

# Wait for RS to process
echo "Waiting 5s for RudderStack to route event..."
sleep 5

# ── 8. Check if RS routed anything ──────────────────────────────────────────
echo ""
echo "=== [8] RudderStack Router Jobs DB ==="
docker compose exec -T rudder-postgres psql -U rudder -d jobsdb -c "
SELECT status, count(*) as count
FROM rt_jobs_1
GROUP BY status
ORDER BY status;
" 2>&1 || echo "(no rows or table not found)"

# ── 9. Check if BFF received events from RS ─────────────────────────────────
echo ""
echo "=== [9] BFF Logs (looking for webhook hits) ==="
docker compose logs phs-cdp-bff --tail 20 2>&1

# ── 10. Final: identity graph for rs-test user ───────────────────────────────
echo ""
echo "=== [10] Identity Graph for user-phs-003 ==="
docker compose exec -T cdp-postgres psql -U cdp -d cdp_profiles -c "
SELECT identifier_type, identifier_value, tier, source
FROM cdp_identities
WHERE customer_id = (SELECT id FROM cdp_customers WHERE c360_customer_id = 'user-phs-003')
ORDER BY tier, identifier_type;
" 2>&1

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  Done. If step 9 shows no BFF logs, RS is not routing."
echo "  If step 5 works but step 7-10 fails: RS pipeline issue."
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
