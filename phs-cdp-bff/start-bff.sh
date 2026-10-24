#!/bin/bash
# PHS CDP BFF Startup Script
# Usage: bash start-bff.sh
# Chạy BFF tại localhost:3001

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BFF_DIR="$SCRIPT_DIR"

# Kiểm tra node
if ! command -v node &>/dev/null; then
  echo "❌ Node.js chưa được cài. Vui lòng cài Node.js >= 18."
  exit 1
fi

# Kill BFF đang chạy (nếu có)
OLD_PID=$(lsof -ti :3001 2>/dev/null)
if [ -n "$OLD_PID" ]; then
  echo "⚡ Stopping existing BFF (PID $OLD_PID)..."
  kill "$OLD_PID" 2>/dev/null
  sleep 1
fi

# Cài dependencies nếu chưa có
if [ ! -d "$BFF_DIR/node_modules" ]; then
  echo "📦 Installing dependencies..."
  cd "$BFF_DIR" && npm install
fi

echo "🚀 Starting PHS CDP BFF..."
cd "$BFF_DIR"

# Load .env nếu có
if [ -f "$BFF_DIR/.env" ]; then
  set -a
  source "$BFF_DIR/.env"
  set +a
  echo "✅ Loaded .env"
fi

# Start server
node src/server.js
