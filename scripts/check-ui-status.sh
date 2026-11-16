#!/usr/bin/env bash
# Check all UI-facing endpoints to verify fixes
set -e
cd "$(dirname "$0")/.."

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  UI Status Check"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
AUTH="Authorization: Bearer phs-dev-token"

# 1. Sources
echo ""
echo "=== [1] Sources ==="
curl -s -H "$AUTH" http://localhost:3001/api/sources | python3 -c "
import json,sys; d=json.load(sys.stdin)
data=d.get('data',[])
print(f'  Count: {len(data)}')
for s in data: print(f'  ✅ {s[\"name\"]} | {s[\"type\"]} | {s[\"status\"]} | dests={s[\"destinationCount\"]}')
[ print('  ❌ EMPTY') for _ in [] ] if data else print('  ❌ EMPTY - Sources not loading')
"

# 2. Destinations
echo ""
echo "=== [2] Destinations ==="
curl -s -H "$AUTH" http://localhost:3001/api/destinations | python3 -c "
import json,sys; d=json.load(sys.stdin)
data=d.get('data',[])
print(f'  Count: {len(data)}')
for s in data: print(f'  ✅ {s[\"name\"]} | {s[\"type\"]} | {s[\"status\"]}')
" 2>&1 || echo "  ❌ FAILED"

# 3. sourceConfig (SDK init)
echo ""
echo "=== [3] SDK sourceConfig ==="
curl -s "http://localhost:3001/sourceConfig?writeKey=phs_Javascript_mwd0djfl" | python3 -c "
import json,sys; d=json.load(sys.stdin)
src=d.get('source',{})
wk=src.get('writeKey','')
print(f'  writeKey: {wk[:20]}...' if len(wk)>20 else f'  writeKey: {wk}')
print(f'  name:     {src.get(\"name\",\"MISSING\")}')
print(f'  enabled:  {src.get(\"enabled\",\"MISSING\")}')
print(f'  dests:    {len(src.get(\"destinations\",[]))}')
print('  ✅ SDK config OK' if wk else '  ❌ SDK config MISSING writeKey')
"

# 4. Customers
echo ""
echo "=== [4] Customers ==="
curl -s -H "$AUTH" "http://localhost:3001/api/customers?limit=5" | python3 -c "
import json,sys; d=json.load(sys.stdin)
data=d.get('data',[])
print(f'  Total: {d.get(\"total\",0)} customers')
for c in data[:3]:
    has_m = bool(c.get('metrics')); has_j = bool(c.get('journey')); has_i = bool(c.get('initials'))
    status = '✅' if (has_m and has_j and has_i) else '⚠️'
    print(f'  {status} {c[\"name\"]} | initials={c.get(\"initials\",\"?\")} metrics={has_m} journey={has_j}')
"

# 5. Customer detail (click test)
echo ""
echo "=== [5] Customer Detail (C360 click) ==="
curl -s -H "$AUTH" "http://localhost:3001/api/customers/user-phs-002" | python3 -c "
import json,sys; c=json.load(sys.stdin)
if 'error' in c: print('  ❌', c['error']); exit()
m=c.get('metrics'); j=c.get('journey')
print(f'  name:     {c.get(\"name\",\"?\")}')
print(f'  initials: {c.get(\"initials\",\"MISSING\")}')
print(f'  status:   {c.get(\"status\",\"MISSING\")}')
print(f'  metrics:  {\"✅\" if m else \"❌ MISSING\"} - portfolioBand={m.get(\"portfolioBand\",\"?\") if m else \"-\"}')
print(f'  journey:  {\"✅\" if j else \"❌ MISSING\"} - stage={j.get(\"currentLabel\",\"?\") if j else \"-\"}')
print(f'  events:   {len(c.get(\"recentEvents\",[]))} recent events')
"

# 6. c360_event table - check recent events
echo ""
echo "=== [6] DB: Recent events in c360_event ==="
docker compose exec -T cdp-postgres psql -U cdp -d cdp_profiles -c "
SELECT event_name, channel, anonymous_id, occurred_at
FROM c360_event
ORDER BY occurred_at DESC
LIMIT 5;
" 2>&1

# 7. DataFlows connections
echo ""
echo "=== [7] DataFlows connections (via sources destinations field) ==="
curl -s -H "$AUTH" http://localhost:3001/api/sources | python3 -c "
import json,sys; d=json.load(sys.stdin)
for s in d.get('data',[]):
    for dest_id in s.get('destinations',[]):
        print(f'  ✅ LINK: {s[\"id\"]} → {dest_id}')
" 2>&1 || echo "  No links"

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
