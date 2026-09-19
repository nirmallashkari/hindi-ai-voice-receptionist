@echo off
title Lashkari - Test Outbound Call
cd /d "%~dp0"

echo Starting server if needed...
curl -s http://localhost:5050/api/health >nul 2>&1
if errorlevel 1 (
  start "Lashkari-Server" cmd /k "node src\server.js"
  timeout /t 3 /nobreak >nul
)

echo.
echo TEST: Twilio se +919993320540 pe Hindi test call
echo.
curl -s -X POST http://localhost:5050/api/outbound/call ^
  -H "Content-Type: application/json" ^
  -H "x-dashboard-password: lashkari123" ^
  -d "{\"to\":\"+919993320540\",\"provider\":\"twilio\"}"
echo.
echo.
echo Phone check karo - ring aana chahiye.
pause
