@echo off
setlocal
echo ==================================================
echo   Stopping Nexus MCP Bridge (Port 8787)
echo ==================================================

for /f "tokens=5" %%a in ('netstat -aon ^| findstr ":8787" ^| findstr "LISTENING"') do (
    echo Terminating PID: %%a
    taskkill /f /pid %%a >nul 2>&1
)

echo Nexus MCP Bridge stopped.
exit /b 0
