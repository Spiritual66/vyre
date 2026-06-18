# WhatsApp Clone Launcher
Write-Host "============================================" -ForegroundColor Green
Write-Host " WhatsApp Clone - Starting App" -ForegroundColor Green
Write-Host "============================================" -ForegroundColor Green

$rootDir = Split-Path -Parent $MyInvocation.MyCommand.Path

# Start backend
Write-Host "`nStarting backend server (port 3001)..." -ForegroundColor Cyan
Start-Process powershell -ArgumentList "-NoExit", "-Command", "Set-Location '$rootDir\server'; node index.js"

Start-Sleep -Seconds 2

# Start frontend
Write-Host "Starting frontend (port 5173)..." -ForegroundColor Cyan
Start-Process powershell -ArgumentList "-NoExit", "-Command", "Set-Location '$rootDir\client'; npm run dev"

Start-Sleep -Seconds 4

Write-Host "`n============================================" -ForegroundColor Green
Write-Host " App started! Opening browser..." -ForegroundColor Green
Write-Host " URL: http://localhost:5173" -ForegroundColor Yellow
Write-Host "============================================" -ForegroundColor Green

Start-Process "http://localhost:5173"
