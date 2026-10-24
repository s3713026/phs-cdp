#!/usr/bin/env bash
# ============================================================
# PHS CDP — Deploy Script
# Run from the CDP/ directory on the server
# Usage: ./deploy.sh [--build] [--no-cache]
# ============================================================
set -euo pipefail

CDP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$CDP_DIR"

echo "🚀 PHS CDP Deploy — $(date)"
echo "   Directory: $CDP_DIR"

# Check prerequisites
if [ ! -f ".env" ]; then
  echo "❌ ERROR: .env file not found!"
  echo "   Please copy .env.example to .env and fill in credentials."
  exit 1
fi

if [ ! -f "docker-compose.yml" ]; then
  echo "❌ ERROR: docker-compose.yml not found!"
  exit 1
fi

# Source env for validation
set -a && source .env && set +a

if [ "${CDP_DB_PASSWORD:-}" = "CHANGE_ME_cdp_strong_password_here" ] || [ -z "${CDP_DB_PASSWORD:-}" ]; then
  echo "❌ ERROR: CDP_DB_PASSWORD not set in .env"
  exit 1
fi

echo "✅ .env validated"

# Parse flags
BUILD_FLAG=""
CACHE_FLAG=""
for arg in "$@"; do
  case $arg in
    --build)     BUILD_FLAG="--build" ;;
    --no-cache)  CACHE_FLAG="--no-cache" ;;
  esac
done

echo ""
echo "📦 Pulling base images..."
docker compose pull rudder-postgres mautic-mysql 2>/dev/null || true

if [ -n "$BUILD_FLAG" ]; then
  echo ""
  echo "🔨 Building BFF and UI images..."
  docker compose build $CACHE_FLAG phs-cdp-bff phs-cdp-ui
fi

echo ""
echo "🐳 Starting all services..."
docker compose up -d

echo ""
echo "⏳ Waiting for services to be healthy..."
sleep 10

echo ""
echo "📊 Service status:"
docker compose ps

echo ""
echo "✅ Deploy complete!"
echo ""
echo "   UI:            http://$(hostname -I | awk '{print $1}'):${UI_PORT:-8811}"
echo "   BFF API:       http://$(hostname -I | awk '{print $1}'):${BFF_PORT:-3001}"
echo "   RudderStack:   http://$(hostname -I | awk '{print $1}'):${RS_PORT:-8082}"
echo "   Mautic:        http://$(hostname -I | awk '{print $1}'):${MAUTIC_PORT:-8081}"
echo ""
echo "   BFF Health:    curl http://localhost:${BFF_PORT:-3001}/health"
echo "   BFF Ping:      curl http://localhost:${BFF_PORT:-3001}/ping"
