@echo off
setlocal
cd /d "%~dp0"

echo ==================================================
echo   Starting Nexus MCP Bridge (Gemini Spark Layer)
echo ==================================================

if not exist "dist\index.js" (
    echo Building TypeScript project first...
    call npm run build
)

start "Nexus MCP Bridge (Port 8787)" cmd /c "node dist/index.js"

timeout /t 2 /nobreak >nul
echo.
echo Nexus MCP Bridge started.
echo Health check: http://127.0.0.1:8787/health
echo MCP endpoint: http://127.0.0.1:8787/mcp
echo.
exit /b 0
