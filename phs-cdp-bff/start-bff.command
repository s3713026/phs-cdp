#!/bin/bash
# PHS CDP BFF - Double-click để chạy trên macOS
# Script này sẽ mở Terminal và khởi động BFF tại localhost:3001

BFF_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "================================================"
echo "   PHS CDP BFF - Starting..."
echo "================================================"

# Kill process cũ nếu có
OLD_PID=$(lsof -ti :3001 2>/dev/null)
if [ -n "$OLD_PID" ]; then
  echo "⚡ Stopping existing process on port 3001 (PID $OLD_PID)..."
  kill "$OLD_PID" 2>/dev/null
  sleep 1
fi

# Load .env
if [ -f "$BFF_DIR/.env" ]; then
  set -a
  source "$BFF_DIR/.env"
  set +a
  echo "✅ Loaded .env configuration"
fi

echo ""
echo "🚀 BFF sẽ chạy tại: http://localhost:3001"
echo "   Nhấn Ctrl+C để dừng"
echo ""

cd "$BFF_DIR"
node src/server.js
