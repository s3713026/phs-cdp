#!/bin/bash
cd "$(dirname "$0")/.."
echo "→ Force recreating BFF container with new volume mounts..."
docker compose up -d --force-recreate phs-cdp-bff
echo "→ Waiting 5s..."
sleep 5
echo ""
echo "=== Dashboard check ==="
curl -s http://localhost:3001/api/dashboard | python3 -c "
import json,sys
d=json.load(sys.stdin)
print(f'mode: {d.get(\"mode\")}')
print(f'lifecycleSource: {d.get(\"lifecycleSource\")}')
print(f'activity count: {len(d.get(\"recentCustomerActivity\",[]))}')
print(f'customers total: {d.get(\"customers\",{}).get(\"total\")}')
"
