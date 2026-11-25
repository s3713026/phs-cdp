#!/bin/bash
# Restart BFF container to pick up code changes from volume mount
cd "$(dirname "$0")/.."
echo "Restarting phs-cdp-bff..."
docker compose restart phs-cdp-bff
echo "Done. Waiting 3s for container to be ready..."
sleep 3
# Quick health check
curl -s http://localhost:3001/health | python3 -c "import json,sys; h=json.load(sys.stdin); print('Status:', h.get('status'), '| Mode:', h.get('mode'))" 2>/dev/null || echo "Health check: http://localhost:3001/health"
