@echo off
title Lashkari Properties - Exotel AI LIVE
cd /d "%~dp0"
set PIPECAT_WEBSOCKET_AUTH=none

echo Starting Dashboard...
start "Lashkari-Dashboard" cmd /k "cd /d "%~dp0" && node src\server.js"
timeout /t 2 /nobreak >nul

echo Starting Cloudflare tunnel (port 7860)...
start "Lashkari-Tunnel" cmd /k "cloudflared tunnel --url http://localhost:7860 --no-autoupdate"
timeout /t 3 /nobreak >nul

echo Starting Priya AI agent...
cd /d "%~dp0exotel-agent"
python -u agent.py -t exotel --host 0.0.0.0 --port 7860 --ws-auth none -v
pause
