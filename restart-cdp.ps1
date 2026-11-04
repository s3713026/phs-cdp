# ============================================================
# PHS CDP — Restart script sau khi fix
# Chạy trong PowerShell tại D:\project\phs-cdp
# ============================================================

Set-Location D:\project\phs-cdp

Write-Host "Rebuilding BFF (events.js fix + RS_PG env vars)..." -ForegroundColor Yellow
docker compose build phs-cdp-bff

Write-Host "Restarting rudder-server (workspaceConfig fix)..." -ForegroundColor Yellow
docker compose restart rudder-server

Write-Host "Restarting BFF..." -ForegroundColor Yellow
docker compose up -d phs-cdp-bff

Write-Host "Waiting 15s for services to stabilize..." -ForegroundColor Gray
Start-Sleep -Seconds 15

Write-Host "Checking health..." -ForegroundColor Green
Invoke-WebRequest -Uri "http://localhost:3001/health" -UseBasicParsing | Select-Object -ExpandProperty Content

Write-Host "`nDone! Check http://localhost:8811" -ForegroundColor Green
