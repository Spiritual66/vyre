@echo off
echo ============================================
echo  WhatsApp Clone - Starting App
echo ============================================
echo.

where node >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] Node.js not found. Run install.bat first.
    pause
    exit /b 1
)

echo Starting backend server on port 3001...
start "WhatsApp Server" cmd /k "set PATH=C:\Program Files\nodejs;%PATH% && cd /d "%~dp0server" && node index.js"

echo Waiting for server to start...
timeout /t 3 /nobreak >nul

echo Starting frontend on port 5173...
start "WhatsApp Client" cmd /k "set PATH=C:\Program Files\nodejs;%PATH% && cd /d "%~dp0client" && npm run dev"

echo Waiting for client to build...
timeout /t 4 /nobreak >nul

echo.
echo ============================================
echo  App is running!
echo  Open your browser to: http://localhost:5173
echo ============================================
echo.
start http://localhost:5173
