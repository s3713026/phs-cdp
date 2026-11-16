#!/usr/bin/env bash
# Quick rebuild BFF only
set -e
cd "$(dirname "$0")/.."

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  Rebuild BFF Container"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

docker compose build phs-cdp-bff --no-cache
docker compose up -d phs-cdp-bff
echo "Waiting 5s for BFF to start..."
sleep 5

echo ""
echo "=== Health Check ==="
BFF_HEALTH=$(curl -sf http://localhost:3001/health 2>&1) && echo "✅ BFF: OK" || echo "❌ BFF not healthy"

echo ""
echo "=== Test /sourceConfig ==="
curl -s "http://localhost:3001/sourceConfig?writeKey=phs_Javascript_mwd0djfl" | python3 -c "
import json,sys
d=json.load(sys.stdin)
src=d.get('source',{})
print(f'  id:       {src.get(\"id\",\"MISSING\")}')
print(f'  name:     {src.get(\"name\",\"MISSING\")}')
print(f'  writeKey: {src.get(\"writeKey\",\"MISSING\")}')
print(f'  enabled:  {src.get(\"enabled\",\"MISSING\")}')
print(f'  dests:    {len(src.get(\"destinations\",[]))}')
" 2>&1

echo ""
echo "=== Test /api/sources ==="
curl -s -H "Authorization: Bearer phs-dev-token" http://localhost:3001/api/sources | python3 -c "
import json,sys
d=json.load(sys.stdin)
for s in d.get('data',[]):
    print(f'  ✅ {s[\"name\"]} | {s[\"type\"]} | {s[\"status\"]} | dests: {s[\"destinationCount\"]}')
" 2>&1

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
