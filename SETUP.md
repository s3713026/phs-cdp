# PHS CDP — Setup Guide

> **Unified CDP & Marketing Workspace** cho Phu Hung Securities  
> RudderStack + Mautic + Custom BFF + UI

---

## Mục lục

1. [Yêu cầu hệ thống](#1-yêu-cầu-hệ-thống)
2. [Clone & Cấu hình](#2-clone--cấu-hình)
3. [Khởi động Docker](#3-khởi-động-docker)
4. [Setup Mautic (bắt buộc, lần đầu)](#4-setup-mautic-bắt-buộc-lần-đầu)
5. [Kiểm tra hệ thống](#5-kiểm-tra-hệ-thống)
6. [Truy cập ứng dụng](#6-truy-cập-ứng-dụng)
7. [Gửi event test qua RudderStack](#7-gửi-event-test-qua-rudderstack)
8. [Các lệnh thường dùng](#8-các-lệnh-thường-dùng)
9. [Xử lý sự cố](#9-xử-lý-sự-cố)
10. [Kiến trúc hệ thống](#10-kiến-trúc-hệ-thống)

---

## 1. Yêu cầu hệ thống

| Thành phần | Phiên bản tối thiểu | Ghi chú |
|---|---|---|
| Docker Desktop | 24+ | Windows/macOS/Linux |
| Docker Compose | v2.20+ | Tích hợp trong Docker Desktop |
| RAM khả dụng | **8 GB** | 4 GB tối thiểu cho lab |
| Disk | 10 GB trống | Dành cho images + data |
| OS | Windows 10/11, macOS 12+, Ubuntu 20.04+ | |

> **Windows:** Dùng PowerShell (không phải Command Prompt). WSL2 phải được bật.

---

## 2. Clone & Cấu hình

### 2.1 Clone repository

```powershell
# Windows PowerShell
git clone <repo-url> D:\project\phs-cdp
cd D:\project\phs-cdp
```

```bash
# Linux / macOS
git clone <repo-url> ~/project/phs-cdp
cd ~/project/phs-cdp
```

### 2.2 Tạo file `.env`

```powershell
# Windows
Copy-Item .env.example .env
```

```bash
# Linux / macOS
cp .env.example .env
```

### 2.3 Điền mật khẩu vào `.env`

Mở `.env` và **bắt buộc** thay thế các giá trị `CHANGE_ME_*`:

```env
# ── Mautic MySQL ─────────────────────────────────────────────
MYSQL_PASSWORD=your_mautic_db_password        # ← THAY ĐỔI

# ── Mautic App ───────────────────────────────────────────────
MAUTIC_PASSWORD=your_mautic_admin_password    # ← THAY ĐỔI

# ── CDP Profile Store ─────────────────────────────────────────
CDP_DB_PASSWORD=your_cdp_db_password          # ← BẮT BUỘC (sẽ lỗi nếu để trống)

# ── BFF App ──────────────────────────────────────────────────
JWT_SECRET=your_jwt_secret_min_32_chars       # ← THAY ĐỔI (tối thiểu 32 ký tự)
RUDDERSTACK_WEBHOOK_SECRET=your_webhook_secret # ← THAY ĐỔI
```

> ⚠️ **KHÔNG commit file `.env` lên git.** File này đã được thêm vào `.gitignore`.

**Các giá trị còn lại có thể giữ nguyên default:**

```env
RS_DB_USER=rudder
RS_DB_PASSWORD=rudderpassword
RS_DB_NAME=jobsdb
RS_PORT=8082
RS_ADMIN_PASSWORD=PHS@Rudder2024!
MYSQL_ROOT_PASSWORD=mauticroot
MYSQL_DB=mautic
MYSQL_USER=mautic
MAUTIC_PORT=8081
MAUTIC_USERNAME=phs_admin
CDP_DB_USER=cdp
CDP_DB_NAME=cdp_profiles
BFF_PORT=3001
NODE_ENV=production
UI_PORT=8811
USE_MOCK=false
RATE_LIMIT_MAX_REQUESTS=500
CORS_ORIGINS=http://localhost:8811,http://100.117.24.87:8811
```

> **Lưu ý CORS_ORIGINS:** Thay `100.117.24.87` bằng IP máy chủ thực tế nếu triển khai trên server riêng.

---

## 3. Khởi động Docker

### 3.1 Khởi động tất cả services

```powershell
# Windows PowerShell
cd D:\project\phs-cdp
docker compose up -d
```

```bash
# Linux / macOS
cd ~/project/phs-cdp
docker compose up -d
```

### 3.2 Kiểm tra trạng thái (chờ ~60 giây)

```powershell
docker compose ps
```

Kết quả mong đợi:

```
NAME              STATUS
rs_postgres       running (healthy)
rs_transformer    running
rs_backend        running
mautic_mysql      running (healthy)
mautic            running
cdp_postgres      running (healthy)
phs_cdp_bff       running
phs_cdp_ui        running
```

> **Lần đầu khởi động** có thể mất 2–5 phút do download Docker images (~2 GB).

### 3.3 Xem logs nếu có lỗi

```powershell
# Xem log tất cả
docker compose logs -f

# Xem log từng service
docker compose logs -f phs-cdp-bff
docker compose logs -f rudder-server
docker compose logs -f mautic
```

---

## 4. Setup Mautic (bắt buộc, lần đầu)

> **Đây là bước duy nhất cần thao tác thủ công.** Mautic 5 không hỗ trợ tự động tạo admin user qua Docker env vars.

### 4.1 Mở trình duyệt

Truy cập: **http://localhost:8081**

> Nếu Mautic chưa sẵn sàng, đợi thêm 1–2 phút và refresh lại.

### 4.2 Điền thông tin trong wizard

Mautic sẽ hiện wizard cài đặt lần đầu gồm 3 bước:

**Bước 1 — Database (tự điền):**

Mautic tự đọc từ env, chỉ cần nhấn **Next**.

**Bước 2 — Admin User:**

| Trường | Giá trị |
|---|---|
| First Name | PHS |
| Last Name | Admin |
| Username | `phs_admin` ← dùng đúng giá trị trong .env `MAUTIC_USERNAME` |
| Email | admin@phs.vn |
| Password | ← dùng đúng giá trị trong .env `MAUTIC_PASSWORD` |

**Bước 3 — Finish:**

Nhấn **Finish**. Mautic sẽ redirect sang trang login.

### 4.3 Đăng nhập Mautic

- Username: `phs_admin`
- Password: giá trị `MAUTIC_PASSWORD` trong `.env`

### 4.4 Bật Mautic API

1. Vào **Settings** (icon bánh răng góc trên phải)
2. Chọn **Configuration**
3. Tab **API Settings**
4. Bật **Enable HTTP basic auth?** → **Yes**
5. Nhấn **Apply** → **Save**

> Nếu không bật API, BFF sẽ hiển thị `mautic: "degraded"` trong system health.

---

## 5. Kiểm tra hệ thống

Dùng **PowerShell** (Windows) hoặc **curl** (Linux/macOS):

### 5.1 BFF Health Check

```powershell
# Windows PowerShell
Invoke-RestMethod -Uri "http://localhost:3001/health"
```

```bash
# Linux / macOS
curl http://localhost:3001/health | jq .
```

Kết quả mong đợi:

```json
{
  "status": "ok",
  "service": "phs-cdp-bff",
  "version": "1.0.0",
  "mode": "LIVE",
  "integrations": {
    "mautic": { "url": "http://mautic:80", "status": "connected" },
    "rudderstack": { "url": "http://rudder-server:8080", "status": "connected" }
  }
}
```

### 5.2 Dashboard API (live data)

```powershell
# Windows PowerShell
Invoke-RestMethod -Uri "http://localhost:3001/api/dashboard" -Headers @{"X-PHS-Role"="admin"} | ConvertTo-Json -Depth 5
```

```bash
# Linux / macOS
curl -H "X-PHS-Role: admin" http://localhost:3001/api/dashboard | jq .
```

Kết quả mong đợi — `mode: "live"` và `rudderstack: "connected"`:

```json
{
  "systemHealth": {
    "rudderstack": "connected",
    "mautic": "connected",
    "cdpDatabase": "connected",
    "overallStatus": "healthy"
  },
  "recentActivity": {
    "source": "rudderstack"
  },
  "mode": "live"
}
```

### 5.3 RudderStack Events

```powershell
# Windows PowerShell
Invoke-RestMethod -Uri "http://localhost:3001/api/events/stats" -Headers @{"X-PHS-Role"="admin"}
Invoke-RestMethod -Uri "http://localhost:3001/api/events/health" -Headers @{"X-PHS-Role"="admin"}
```

```bash
# Linux / macOS
curl -H "X-PHS-Role: admin" http://localhost:3001/api/events/stats | jq .
curl -H "X-PHS-Role: admin" http://localhost:3001/api/events/health | jq .
```

### 5.4 Danh sách events từ RudderStack Postgres

```powershell
# Windows PowerShell
Invoke-RestMethod -Uri "http://localhost:3001/api/events?limit=10" -Headers @{"X-PHS-Role"="admin"} | ConvertTo-Json -Depth 5
```

```bash
# Linux / macOS
curl -H "X-PHS-Role: admin" "http://localhost:3001/api/events?limit=10" | jq .
```

---

## 6. Truy cập ứng dụng

| Ứng dụng | URL | Ghi chú |
|---|---|---|
| **PHS CDP UI** | http://localhost:8811 | Giao diện Marketing chính |
| **BFF API** | http://localhost:3001 | Backend API |
| **Mautic** | http://localhost:8081 | Admin Mautic (dùng nội bộ) |
| **RudderStack Data Plane** | http://localhost:8082 | Nhận events từ SDK |

> **Production:** Thay `localhost` bằng IP hoặc domain thực tế.

---

## 7. Gửi event test qua RudderStack

RudderStack Data Plane chạy ở cổng **8082** (map sang container port 8080).

### 7.1 Identify event

```powershell
# Windows PowerShell
$body = @{
    writeKey = "phs_web_write_key_2024"
    userId = "test-user-001"
    type = "identify"
    traits = @{
        name = "Nguyen Van A"
        email = "nguyenvana@email.com"
        lifecycle_stage = "active_investor"
    }
} | ConvertTo-Json

Invoke-RestMethod -Uri "http://localhost:8082/v1/identify" -Method Post -Body $body -ContentType "application/json"
```

```bash
# Linux / macOS
curl -X POST http://localhost:8082/v1/identify \
  -H "Content-Type: application/json" \
  -d '{
    "writeKey": "phs_web_write_key_2024",
    "userId": "test-user-001",
    "type": "identify",
    "traits": {
      "name": "Nguyen Van A",
      "email": "nguyenvana@email.com",
      "lifecycle_stage": "active_investor"
    }
  }'
```

### 7.2 Track event

```powershell
# Windows PowerShell
$body = @{
    writeKey = "phs_web_write_key_2024"
    userId = "test-user-001"
    type = "track"
    event = "Product Viewed"
    properties = @{
        product_name = "Margin"
        product_category = "investment"
        page_url = "https://phs.vn/margin"
    }
} | ConvertTo-Json

Invoke-RestMethod -Uri "http://localhost:8082/v1/track" -Method Post -Body $body -ContentType "application/json"
```

```bash
# Linux / macOS
curl -X POST http://localhost:8082/v1/track \
  -H "Content-Type: application/json" \
  -d '{
    "writeKey": "phs_web_write_key_2024",
    "userId": "test-user-001",
    "type": "track",
    "event": "Product Viewed",
    "properties": {
      "product_name": "Margin",
      "product_category": "investment",
      "page_url": "https://phs.vn/margin"
    }
  }'
```

### 7.3 Kiểm tra event đã được nhận

```powershell
# Windows PowerShell — đợi 5-10 giây rồi check
Invoke-RestMethod -Uri "http://localhost:3001/api/events/stats" -Headers @{"X-PHS-Role"="admin"}
```

---

## 8. Các lệnh thường dùng

### Khởi động / Dừng

```powershell
# Khởi động tất cả
docker compose up -d

# Dừng tất cả (giữ data)
docker compose down

# Dừng và xóa toàn bộ data (reset hoàn toàn)
docker compose down -v

# Restart một service
docker compose restart phs-cdp-bff
```

### Rebuild sau khi thay đổi code

```powershell
# Rebuild BFF
docker compose build phs-cdp-bff
docker compose up -d phs-cdp-bff

# Rebuild UI
docker compose build phs-cdp-ui
docker compose up -d phs-cdp-ui

# Rebuild tất cả
docker compose build
docker compose up -d
```

### Xem logs

```powershell
# Log realtime của BFF
docker compose logs -f phs-cdp-bff

# Log 100 dòng cuối của RudderStack
docker compose logs --tail=100 rudder-server

# Log tất cả services
docker compose logs -f
```

### Kiểm tra Postgres trực tiếp

```powershell
# RudderStack DB — xem events
docker exec -it rs_postgres psql -U rudder -d jobsdb -c "SELECT id, event_type, created_at FROM gw_jobs_1 ORDER BY created_at DESC LIMIT 10;"

# CDP DB — xem customers
docker exec -it cdp_postgres psql -U cdp -d cdp_profiles -c "SELECT id, phs_account_id, lifecycle_stage FROM cdp_customers LIMIT 10;"
```

---

## 9. Xử lý sự cố

### 9.1 `CDP_DB_PASSWORD is required in .env`

**Nguyên nhân:** File `.env` chưa được tạo hoặc `CDP_DB_PASSWORD` còn trống.

**Khắc phục:**

```powershell
# Kiểm tra file .env tồn tại
Test-Path .env

# Nếu chưa có, tạo từ example
Copy-Item .env.example .env
# Rồi mở .env và điền CDP_DB_PASSWORD
notepad .env
```

### 9.2 Mautic hiển thị `degraded` trong system health

**Nguyên nhân 1:** API Mautic chưa được bật.

→ Vào Mautic Settings → Configuration → API Settings → Bật HTTP basic auth

**Nguyên nhân 2:** `MAUTIC_PASSWORD` trong `.env` khác với password đã tạo trong wizard.

→ Kiểm tra `.env` có `MAUTIC_PASSWORD` khớp với password tạo lúc setup wizard.

**Nguyên nhân 3:** Mautic chưa khởi động xong (cần 1–2 phút).

```powershell
docker compose logs mautic --tail=20
```

### 9.3 RudderStack không nhận events

**Kiểm tra:**

```powershell
# BFF health check
Invoke-RestMethod -Uri "http://localhost:3001/api/events/health" -Headers @{"X-PHS-Role"="admin"}

# RudderStack log
docker compose logs rudder-server --tail=30
```

**Thường gặp:** RudderStack cần 30–60 giây sau khi container start để load workspaceConfig.

### 9.4 BFF không khởi động

```powershell
docker compose logs phs-cdp-bff --tail=30
```

Lỗi thường gặp:
- `CDP_DB_PASSWORD is required` → Xem mục 9.1
- `Connection refused cdp-postgres` → `cdp-postgres` chưa healthy, chờ thêm
- `EADDRINUSE 3001` → Cổng 3001 đang được dùng bởi app khác

### 9.5 UI không load

```powershell
# Kiểm tra UI container
docker compose logs phs-cdp-ui

# Kiểm tra có thể gọi BFF từ UI không
Invoke-RestMethod -Uri "http://localhost:3001/health"
```

Nếu UI load nhưng API lỗi CORS: Kiểm tra `CORS_ORIGINS` trong `.env` có chứa URL đang dùng.

### 9.6 Reset hoàn toàn (xóa tất cả data)

> ⚠️ **Thao tác này xóa toàn bộ data, không thể khôi phục.**

```powershell
docker compose down -v
docker compose up -d
# Sau đó làm lại bước 4 (Setup Mautic wizard)
```

---

## 10. Kiến trúc hệ thống

### Docker Services

| Service | Container | Port | Mô tả |
|---|---|---|---|
| `rudder-postgres` | `rs_postgres` | — (nội bộ) | Database cho RudderStack |
| `rudder-transformer` | `rs_transformer` | — (nội bộ) | Xử lý transformation |
| `rudder-server` | `rs_backend` | **8082** | RudderStack Data Plane |
| `mautic-mysql` | `mautic_mysql` | — (nội bộ) | Database cho Mautic |
| `mautic` | `mautic` | **8081** | Marketing automation engine |
| `cdp-postgres` | `cdp_postgres` | — (nội bộ, bảo mật) | CDP Profile Store |
| `phs-cdp-bff` | `phs_cdp_bff` | **3001** | Backend For Frontend (API) |
| `phs-cdp-ui` | `phs_cdp_ui` | **8811** | UI Marketing Workspace |

### Luồng dữ liệu

```
Web/Mobile/Server
      │ SDK events
      ▼
RudderStack Data Plane (8082)
      │ Lưu vào gw_jobs_1
      ▼
rudder-postgres (5432, nội bộ)
      │
      ▼
BFF RudderStackAdapter
      │ Query Postgres trực tiếp
      ▼
BFF API (3001)
      │
      ▼
PHS CDP UI (8811)
```

### File cấu hình RudderStack

```
phs-cdp/
└── rudderstack/
    └── workspaceConfig.json    ← Cấu hình sources, destinations, write keys
```

**Write Key mặc định:** `phs_web_write_key_2024`  
**Data Plane URL:** `http://localhost:8082` (từ ngoài) / `http://rudder-server:8080` (nội bộ Docker)

### Bảo mật

- `cdp-postgres` KHÔNG expose port ra ngoài — chỉ BFF mới kết nối được
- Credentials chỉ nằm trong `.env` và Docker env — KHÔNG xuất hiện trong frontend
- BFF dùng `X-PHS-Role` header cho phân quyền RBAC tạm thời
- PII được mask trước khi gửi ra external activation channels

---

## Phát triển thêm

### Thứ tự ưu tiên triển khai tiếp theo

1. **Customer 360** — Merge RS event timeline vào profile
2. **Identity Graph** — Wire `getIdentities()` từ RudderStack
3. **Audience Builder** — Sync segment sang Mautic
4. **Data Quality** — Monitor event completeness từ RS

### Cấu trúc thư mục

```
phs-cdp/
├── .env                        ← Credentials (KHÔNG commit)
├── .env.example                ← Template
├── docker-compose.yml
├── SETUP.md                    ← File này
├── rudderstack/
│   └── workspaceConfig.json
├── phs-cdp-bff/
│   ├── Dockerfile
│   ├── package.json
│   └── src/
│       ├── server.js
│       ├── adapters/
│       │   ├── RudderStackAdapter.js
│       │   └── MauticAdapter.js
│       ├── routes/
│       │   ├── dashboard.js
│       │   ├── events.js
│       │   ├── customers.js
│       │   └── ...
│       └── db/
│           └── init/
│               └── 001_schema.sql
└── phs-cdp-ui/
    ├── Dockerfile
    ├── index.html
    └── js/
        ├── api.js              ← PHSAPI global object
        └── pages/
            └── ...
```

---

*Tài liệu này cập nhật cho phiên bản CDP Phase 1 — RudderStack Integration hoàn chỉnh.*
