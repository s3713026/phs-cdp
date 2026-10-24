#!/usr/bin/env bash
# ============================================================
# PHS CDP — Deploy Script
# Run from CDP/ root directory (one level above phs-cdp-bff/ and phs-cdp-ui/)
# Usage: bash phs-cdp-bff/deploy.sh
# ============================================================
set -e

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  PHS CDP — Deploy to 100.117.24.87"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# Verify .env exists
if [ ! -f ".env" ]; then
  echo "❌ .env not found — copy .env.cdp-template to .env and fill credentials"
  exit 1
fi

# Verify docker-compose.yml (unified) exists
if [ ! -f "docker-compose.yml" ]; then
  echo "❌ docker-compose.yml not found — copy phs-cdp-ui/rudderstack-setup/docker-compose-unified.yml to docker-compose.yml here"
  exit 1
fi

echo ""
echo "▶ Pulling latest images..."
docker compose pull --ignore-pull-failures 2>/dev/null || true

echo ""
echo "▶ Building custom services (BFF + UI)..."
docker compose build --no-cache phs-cdp-bff phs-cdp-ui

echo ""
echo "▶ Starting all services..."
docker compose up -d

echo ""
echo "▶ Waiting for services to be healthy (30s)..."
sleep 30

echo ""
echo "▶ Checking service status..."
docker compose ps

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  Services should be available at:"
echo "  UI:           http://100.117.24.87"
echo "  BFF:          http://100.117.24.87:3001"
echo "  Mautic:       http://100.117.24.87:8080"
echo "  RudderStack:  http://100.117.24.87:8082"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "▶ Check BFF health:"
echo "  curl http://100.117.24.87:3001/health"
echo ""
echo "▶ View logs:"
echo "  docker compose logs -f phs-cdp-bff"
echo "  docker compose logs -f cdp-postgres"
