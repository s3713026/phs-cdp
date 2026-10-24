# RudderStack Self-Hosted - PHS CDP

## Thông tin cài đặt

| Service       | URL                              | Port |
|---------------|----------------------------------|------|
| Control Plane | http://100.117.24.87:3000        | 3000 |
| Data Plane    | http://100.117.24.87:8082        | 8082 |
| PostgreSQL    | Internal only                    | 5432 |
| Transformer   | Internal only                    | 9090 |

## Thông tin đăng nhập

- **Control Plane UI**: admin@phscdp.local / PHS@Rudder2024!
- **Workspace Token**: phs_workspace_token_2024

## Hướng dẫn cài đặt trên server

### Bước 1: SSH vào server
```bash
ssh cuongtruong@100.117.24.87
```

### Bước 2: Tạo thư mục và copy file
```bash
mkdir -p ~/phs-cdp/rudderstack
cd ~/phs-cdp/rudderstack
# Copy docker-compose.yml vào đây
```

### Bước 3: Khởi động từng bước
```bash
# Khởi động PostgreSQL trước
docker compose up -d postgres

# Đợi 30 giây, kiểm tra health
docker compose ps

# Khởi động Control Plane
docker compose up -d control-plane

# Đợi 15 giây
docker compose up -d transformer

# Cuối cùng khởi động Data Plane
docker compose up -d backend
```

### Bước 4: Kiểm tra
```bash
# Xem logs
docker compose logs -f backend

# Test Data Plane health
curl http://localhost:8082/health

# Test Control Plane
curl http://localhost:3000/health
```

## RAM Budget

| Service        | Limit | Reserved |
|----------------|-------|----------|
| PostgreSQL     | 512MB | 256MB    |
| Control Plane  | 512MB | 256MB    |
| Transformer    | 512MB | 256MB    |
| Data Plane     | 768MB | 512MB    |
| **Total**      | **2.3GB** | **1.3GB** |

Server có 3.8GB RAM, để dư ~1.5GB cho OS và các services khác.

## Test gửi event
```bash
curl -X POST http://100.117.24.87:8082/v1/track \
  -H "Content-Type: application/json" \
  -d '{
    "userId": "test-user-001",
    "event": "Product Viewed",
    "properties": {
      "product_name": "Margin",
      "source": "phs-cdp-ui"
    }
  }' \
  -u "phs_workspace_token_2024:"
```
