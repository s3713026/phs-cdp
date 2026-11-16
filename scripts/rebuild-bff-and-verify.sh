#!/usr/bin/env bash
# Rebuild BFF and verify all UI endpoints work correctly
set -e
cd "$(dirname "$0")/.."
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  Rebuilding BFF..."
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
docker compose build phs-cdp-bff --no-cache
docker compose up -d phs-cdp-bff
echo "Waiting 5s for BFF to start..."
sleep 5

AUTH="Authorization: Bearer phs-dev-token"

echo ""
echo "=== [1] Sources ==="
curl -sf -H "$AUTH" http://localhost:3001/api/sources | python3 -c "
import json,sys; d=json.load(sys.stdin)
data=d.get('data',[])
print(f'  Count: {len(data)}')
for s in data: print(f'  ✅ {s[\"name\"]} | {s[\"type\"]} | {s[\"status\"]} | dests={s[\"destinationCount\"]}')
" && echo "" || echo "  ❌ FAILED"

echo "=== [2] Destinations ==="
curl -sf -H "$AUTH" http://localhost:3001/api/destinations | python3 -c "
import json,sys; d=json.load(sys.stdin)
data=d.get('data',[])
print(f'  Count: {len(data)}')
for s in data: print(f'  ✅ {s[\"name\"]} | {s.get(\"type\",\"?\")} | {s[\"status\"]}')
" && echo "" || echo "  ❌ FAILED"

echo "=== [3] SDK sourceConfig ==="
curl -sf "http://localhost:3001/sourceConfig?writeKey=phs_Javascript_mwd0djfl" | python3 -c "
import json,sys; d=json.load(sys.stdin)
src=d.get('source',{})
wk=src.get('writeKey','')
print(f'  name:    {src.get(\"name\",\"MISSING\")}')
print(f'  dests:   {len(src.get(\"destinations\",[]))}')
print('  ✅ SDK config OK' if wk else '  ❌ SDK config MISSING writeKey')
" && echo "" || echo "  ❌ FAILED"

echo "=== [4] Customers ==="
curl -sf -H "$AUTH" "http://localhost:3001/api/customers?limit=3" | python3 -c "
import json,sys; d=json.load(sys.stdin)
data=d.get('data',[])
print(f'  Total in DB: {d.get(\"total\",0)}')
for c in data[:3]: print(f'  - {c.get(\"name\",\"?\")} ({c.get(\"source\",\"?\")})')
" && echo "" || echo "  ❌ FAILED"

echo "=== [5] DB events ==="
docker compose exec -T cdp-postgres psql -U cdp -d cdp_profiles -c "
SELECT event_name, channel, substring(anonymous_id::text,1,8) AS anon_prefix, occurred_at
FROM c360_event ORDER BY occurred_at DESC LIMIT 5;
" 2>&1

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "✅ Rebuild complete!"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
