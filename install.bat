@echo off
echo ============================================
echo  WhatsApp Clone - Installing Dependencies
echo ============================================
echo.

where node >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] Node.js is not installed!
    echo.
    echo Please download and install Node.js from:
    echo   https://nodejs.org/en/download/
    echo.
    echo Choose the LTS version (recommended)
    echo After installing, run this script again.
    echo.
    pause
    exit /b 1
)

echo [OK] Node.js found:
node --version
echo.

echo Installing server dependencies...
cd /d "%~dp0server"
call npm install
if %errorlevel% neq 0 (
    echo [ERROR] Failed to install server dependencies
    pause
    exit /b 1
)

echo.
echo Installing client dependencies...
cd /d "%~dp0client"
call npm install
if %errorlevel% neq 0 (
    echo [ERROR] Failed to install client dependencies
    pause
    exit /b 1
)

echo.
echo ============================================
echo  Installation complete!
echo  Run start.bat to launch the app.
echo ============================================
pause
