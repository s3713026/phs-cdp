#!/bin/bash
# ============================================================
# RudderStack Setup Script - PHS CDP
# Chạy script này trên server 100.117.24.87
# ============================================================

set -e

echo "🚀 Bắt đầu cài đặt RudderStack cho PHS CDP..."

# 1. Tạo thư mục
echo "📁 Tạo thư mục..."
mkdir -p ~/phs-cdp/rudderstack
cd ~/phs-cdp/rudderstack

# 2. Copy docker-compose.yml vào đây
echo ""
echo "⚠️  Hãy copy file docker-compose.yml vào: ~/phs-cdp/rudderstack/"
echo "   Sau đó chạy lại script này với argument 'start'"
echo ""

if [ "$1" = "start" ]; then
    echo "📦 Kiểm tra file docker-compose.yml..."
    if [ ! -f "docker-compose.yml" ]; then
        echo "❌ Không tìm thấy docker-compose.yml trong $(pwd)"
        exit 1
    fi

    echo "🔍 Kiểm tra RAM hiện tại..."
    free -h

    echo ""
    echo "🐳 Khởi động services..."
    docker compose up -d postgres
    echo "⏳ Đợi PostgreSQL sẵn sàng (30s)..."
    sleep 30

    echo "🚀 Khởi động Control Plane..."
    docker compose up -d control-plane
    sleep 15

    echo "🔄 Khởi động Transformer..."
    docker compose up -d transformer
    sleep 10

    echo "🔌 Khởi động Data Plane (Backend)..."
    docker compose up -d backend

    echo ""
    echo "✅ Tất cả services đã khởi động!"
    echo ""
    echo "📊 Trạng thái:"
    docker compose ps

    echo ""
    echo "🌐 Truy cập:"
    echo "  Control Plane: http://100.117.24.87:3000"
    echo "  Data Plane:    http://100.117.24.87:8082"
    echo "  User:          admin@phscdp.local"
    echo "  Password:      PHS@Rudder2024!"
fi
