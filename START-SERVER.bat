@echo off
title Lashkari Properties - AI Voice
cd /d "%~dp0"

if not exist "node_modules\" (
  echo Installing dependencies...
  call npm install
  if errorlevel 1 (
    echo npm install failed.
    pause
    exit /b 1
  )
)

echo.
echo Starting Lashkari Properties AI Voice on http://localhost:5050
echo Dashboard password: see .env DASHBOARD_PASSWORD
echo.
node src\server.js
pause
