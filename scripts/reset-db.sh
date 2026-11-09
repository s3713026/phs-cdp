#!/bin/bash
# Reset toàn bộ data trong CDP Postgres — giữ nguyên schema
# Chạy từ thư mục cdp_product: bash scripts/reset-db.sh

set -e
CONTAINER="cdp_postgres"
DB_USER="${CDP_DB_USER:-cdp}"
DB_NAME="${CDP_DB_NAME:-cdp_profiles}"

echo "⚠️  Sẽ xóa toàn bộ data trong $DB_NAME (giữ schema)"
read -p "Nhập 'yes' để xác nhận: " confirm
[[ "$confirm" != "yes" ]] && echo "Hủy." && exit 0

echo ""
echo "🗑️  Đang xóa data..."

docker exec "$CONTAINER" psql -U "$DB_USER" -d "$DB_NAME" -c "
SET session_replication_role = 'replica';
TRUNCATE TABLE cdp_audience_contacts     RESTART IDENTITY CASCADE;
TRUNCATE TABLE cdp_audience_history      RESTART IDENTITY CASCADE;
TRUNCATE TABLE cdp_audiences             RESTART IDENTITY CASCADE;
TRUNCATE TABLE cdp_identity_links        RESTART IDENTITY CASCADE;
TRUNCATE TABLE cdp_events                RESTART IDENTITY CASCADE;
TRUNCATE TABLE cdp_customers             RESTART IDENTITY CASCADE;
TRUNCATE TABLE cdp_audit_logs            RESTART IDENTITY CASCADE;
SET session_replication_role = 'origin';
SELECT table_name, (xpath('/row/c/text()', query_to_xml(format('select count(*) as c from %I', table_name), false, true, '')))[1]::text::int AS rows
FROM information_schema.tables
WHERE table_schema = 'public' AND table_name LIKE 'cdp_%'
ORDER BY table_name;
"

echo ""
echo "✅  Done — schema còn nguyên, data đã xóa hết"
