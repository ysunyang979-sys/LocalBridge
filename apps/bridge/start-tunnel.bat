@echo off
setlocal
cd /d "%~dp0"

echo ==================================================
echo   Starting Cloudflare Tunnel for Nexus MCP Bridge
echo ==================================================
echo Forwarding public HTTPS traffic to http://127.0.0.1:8787...
echo.

set "CLOUDFLARED_EXE=E:\workspace\tunnel-client-runtime-cloudflared-v0.0.14-windows-amd64\cloudflared.exe"

if exist "%CLOUDFLARED_EXE%" (
    "%CLOUDFLARED_EXE%" tunnel --url http://127.0.0.1:8787
) else (
    cloudflared tunnel --url http://127.0.0.1:8787
)
