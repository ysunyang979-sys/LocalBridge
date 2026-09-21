# Local Dev Runtime Startup & Process Management (`nexus.start-dev-runtime`)

## Purpose
Identify the project's development or start script, launch it safely using the Nexus Persistent Runtime daemon (avoiding hanging synchronous subshells), inspect output logs for local ports/URLs, and verify healthy operational status.

## When to Use
- When asked "Start the dev server", "Run this project", or "Start local web server".
- To bring up a local backend API, Vite/Next frontend server, or full-stack service.
- To inspect output logs from currently running dev processes.

## Do Not Use When
- The user only wants to run short-lived unit tests (use `nexus.run-tests`).
- The project has failing builds or unresolved syntax errors (use `nexus.fix-build`).
- Running one-off git commands.

## Recommended Tools
- `localbridge_project_info`: Verify project authorization.
- `localbridge_file_read`: Read `package.json` scripts (`scripts.dev`, `scripts.start`).
- `localbridge_runtime_list`: Check if a runtime instance is already active for this project.
- `localbridge_runtime_start`: Launch the dev process as a background managed runtime.
- `localbridge_runtime_status`: Check running state, PID, CPU/memory, and uptime.
- `localbridge_runtime_logs`: Read stdout/stderr streams to capture server listening ports (e.g. `http://localhost:3000`).
- `localbridge_runtime_stop`: Stop or kill the managed runtime if requested.

## Workflow
1. **Check Project Authorization**: Verify `project_id`.
2. **Inspect Runtime Scripts**: Call `localbridge_file_read` on `package.json` to find the exact dev command (e.g. `pnpm dev`, `npm run start`).
3. **Check Existing Runtime**: Call `localbridge_runtime_list` to see if a process is already running; avoid duplicate port collisions.
4. **Launch Dev Runtime**: Call `localbridge_runtime_start` with `project_id` and the detected script.
5. **Monitor Startup Status**: Call `localbridge_runtime_status` to ensure process transitioned to `running`.
6. **Fetch Initial Logs**: Call `localbridge_runtime_logs` to capture startup banners, localhost URLs, and ready indicators.
7. **Report Access URL**: Present the listening URL (e.g., `http://localhost:5173`) and status to the user.

## Safety Rules
- **NEVER use blocking command execution for servers**: Never run dev servers with blocking `localbridge_command_run`; always use `localbridge_runtime_start` to ensure graceful lifecycle management.
- **Port Conflict Awareness**: If the process crashes immediately due to `EADDRINUSE`, inform the user.
- **Execution Scope Required**: Starting runtimes requires `execute` scope.

## Verification
- `localbridge_runtime_status` returns `status: "running"`.
- Log output shows server successfully listening.
