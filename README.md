# LocalBridge

> Secure Model Context Protocol (MCP) Bridge for Local Development Projects.

LocalBridge allows AI assistants (such as ChatGPT, Claude, and Codex) to securely inspect, search, edit, build, and test local projects on your computer via MCP, without exposing your entire disk or sending source code to untrusted intermediaries.

---

## Architecture Overview

LocalBridge enforces strict privilege separation between the Internet-facing Server and your local machine's Runner:

```text
AI Client (ChatGPT / Claude / Codex)
        │
        │ MCP 2026-07-28 Streamable HTTP (POST /mcp, Bearer lb_xxx)
        ▼
LocalBridge Server (Node.js + Fastify)
        │
        │ LocalBridge RPC (JSON-RPC 2.0 over WebSocket, Auth lbr_xxx)
        ▼
LocalBridge Runner (Node.js daemon on user's machine)
        │
        ├── Filesystem (Sandboxed, Canonical Path verification)
        ├── Git CLI
        ├── Shell (Risk classification, Execution timeouts)
        ├── Build & Test Runners
        └── Long-running Background Jobs
        │
        ▼
User-Authorized Projects (e.g. D:\Projects\my-app)
```

### Key Security Guarantees
- **No Direct Disk Access by Server**: The server never reads project files directly; the Runner connects outbound to the Server.
- **Canonical Path Sandboxing**: AI can only reference authorized `project_id`s. Physical paths are validated to block directory traversal (`../`), symlink escapes, Windows junctions, and UNC paths.
- **Dual Token Separation**: MCP client tokens (`lb_...`) and Runner daemon tokens (`lbr_...`) are generated with 256-bit cryptographic entropy (`crypto.randomBytes(32)`) and stored only as SHA-256 hashes (`token_hash`). Plaintext tokens are returned once and never persisted. Fixed-length SHA-256 digests paired with crypto.timingSafeEqual mitigate timing side-channel risks during token comparison.
- **Command Risk Engine**: Commands are classified into `SAFE`, `CAUTION`, and `DANGEROUS` (blocking destructive operations like `rm -rf /`, `format`, `reg delete` by default).
- **Sensitive File Shield**: Masking `.env*`, `*.pem`, `*.key`, `id_rsa`, etc., by default.

---

## Monorepo Layout

```text
localbridge/
├── apps/
│   ├── server/           # Fastify MCP & API Server with SQLite persistence
│   ├── runner/           # Local execution daemon (Phase 2+)
│   └── desktop/          # Tauri 2 + React + Vite GUI (Phase 10+)
├── packages/
│   ├── protocol/         # Pure protocol definitions, JSON-RPC schemas & error codes
│   ├── shared/           # Structured logger (Pino), config loader, crypto helpers
│   ├── security/         # Sandboxing, path verification & command risk analyzer
│   ├── mcp/              # MCP v2 tools and Streamable HTTP endpoint via @modelcontextprotocol/server (Phase 9)
│   └── ui/               # Shared design system & components (Phase 10+)
├── tests/                # Integration and end-to-end test suites
├── docs/                 # Architectural specifications and protocol documentation
└── scripts/              # Build and development helper scripts
```

---

## Getting Started (Phase 2)

### Prerequisites
- **Node.js**: `>= 24.0.0`
- **pnpm**: `>= 10.0.0`

### Installation & Build

```bash
# Install dependencies across monorepo
pnpm install

# Typecheck all packages and apps
pnpm typecheck

# Build all packages, server and runner
pnpm build

# Run automated tests (Vitest)
pnpm test
```

### 1. Running the Server

Start the LocalBridge Server daemon:

```bash
pnpm --filter @localbridge/server dev
```

The server starts at `http://127.0.0.1:18080`.

### 2. Creating a Runner Token

Generate an authenticated runner token (returned once, stored as a SHA-256 hash):

```bash
pnpm --filter @localbridge/server token:create runner "My PC"
```

To view or revoke tokens:
```bash
# List all registered tokens
pnpm --filter @localbridge/server token:list

# Revoke a token
pnpm --filter @localbridge/server token:revoke <token_id>
```

### 3. Running the Runner

**Linux / macOS (Bash):**
```bash
LOCALBRIDGE_RUNNER_TOKEN=lbr_xxxxxxxxxxxxxxxxx \
pnpm --filter @localbridge/runner dev
```

**Windows (PowerShell):**
```powershell
$env:LOCALBRIDGE_RUNNER_TOKEN="lbr_xxxxxxxxxxxxxxxxx"
pnpm --filter @localbridge/runner dev
```

Or pass via command-line argument:
```bash
pnpm --filter @localbridge/runner dev --token lbr_xxxxxxxxxxxxxxxxx --name "My PC"
```

### 4. Checking Runner Status

Probe server status and connected runner daemon:

```bash
# Server status (runners_connected = 1 when connected)
curl http://127.0.0.1:18080/api/status

# List connected runners
curl http://127.0.0.1:18080/api/runners
```

### 5. Server ↔ Runner RPC (Phase 3)

LocalBridge provides a strongly-typed bidirectional JSON-RPC 2.0 communication channel between Server and connected Runners:

#### Architecture & Safe Methods
- `system.ping`: Validates end-to-end application RPC round-trip.
  ```bash
  curl -X POST http://127.0.0.1:18080/api/runners/<runner_id>/ping
  # {"pong": true, "timestamp": 1742250000000, "runnerId": "..."}
  ```
- `system.info`: Queries real-time runtime capabilities and toolchain versions without exposing sensitive secrets or paths.
  ```bash
  curl http://127.0.0.1:18080/api/runners/<runner_id>/system-info
  ```

#### Request Lifecycle & Guarantees
- **Correlation ID**: Every request uses a cryptographically unique `req_<UUID>` ID.
- **Strict Typing**: Strongly-typed `RunnerRpcMap` with dual-ended schema validation (params validated before send & on receive; result validated on receive).
- **Concurrency & Size Limits**: Capped at `MAX_PENDING_REQUESTS = 64` and `MAX_RPC_MESSAGE_SIZE = 1 MiB`.
- **Timeout Management**: Dedicated timer per request (`system.ping` = 5s, `system.info` = 10s). Timed out requests reject with `RPC_TIMEOUT` and are immediately purged to prevent memory leaks.
- **Disconnect Cleanup**: Disconnected sockets cancel all active timers and reject all pending requests immediately with `RUNNER_DISCONNECTED`.
### 6. Local Project Authorization & Sandboxing (Phase 4)

LocalBridge Phase 4 introduces a strict project authorization boundary and an impenetrable path security sandbox.

#### Core Principle: Zero Remote Authorization
Remote AI models, external MCP clients, and even the LocalBridge Server CANNOT authorize or alter local directories. Only the human user physically on the Runner machine can authorize directories using the local Runner CLI. Physical file paths (`root`, `canonicalRoot`, `absolutePath`) NEVER leave the local machine and are never transmitted over the network or saved on the Server.

#### Runner Project CLI
Run the following commands on the local machine where the Runner is installed:

```bash
# Authorize a new local directory (assigns stable UUIDv4 proj_xxx ID)
pnpm --filter @localbridge/runner project:add /path/to/my-project --name "My Project"

# List all locally authorized projects and their canonical physical roots
pnpm --filter @localbridge/runner project:list

# Temporarily disable a project without removing it
pnpm --filter @localbridge/runner project:disable <project_id>

# Re-enable a disabled project
pnpm --filter @localbridge/runner project:enable <project_id>

# Remove authorization for a project
pnpm --filter @localbridge/runner project:remove <project_id>
```

#### Multi-Tier Path Sandbox Architecture
Every relative path requested within a project undergoes rigorous validation:
1. **Lexical Inspection**: Blocks directory traversal (`../`, `..\`, mixed separators), absolute paths, drive-relative paths (`C:foo`), and root-relative paths (`/foo`, `\foo`).
2. **Windows Platform Defenses**:
   - Rejects UNC network paths (`\\server\share`).
   - Rejects NT device namespaces (`\\?\` and `\\.\`).
   - Rejects NTFS Alternate Data Streams (`file.txt:stream`).
   - Rejects DOS reserved device names (`CON`, `PRN`, `AUX`, `NUL`, `COM1`-`COM9`, `LPT1`-`LPT9`).
   - Rejects trailing dots and spaces on path segments (`foo.txt.`, `foo.txt `).
   - Rejects null bytes (`\0`).
3. **Physical Canonical Containment**: Resolves paths to physical disk targets using `fs.realpathSync.native` and enforces strict containment inside the project's canonical root using `path.relative()` to eliminate prefix-confusion vulnerabilities (`C:\Project` vs `C:\Project-Evil`).
4. **Symlink & Junction Escape Detection**: Catches symlinks and Windows directory junctions that attempt to point outside the authorized project root with `PATH_SYMLINK_ESCAPE`.
5. **Sensitive File Shield**: Proactively shields critical credentials and secrets (`.env`, `.env.*`, `*.pem`, `*.key`, `id_rsa*`, `id_ed25519*`, `.ssh/*`, `.aws/*`, `.git/*`, `credentials.json`, `client_secret*.json`).

### 7. Safe Read-Only Filesystem & Directory Browsing (Phase 5)

LocalBridge Phase 5 introduces strictly read-only filesystem inspection and UTF-8 text browsing within user-authorized project boundaries via Server ↔ Runner typed RPC (`directory.list`, `file.stat`, `file.read`).

### 8. Safe Filesystem Modifications & Transactional Writes (Phase 6)

LocalBridge Phase 6 introduces auditable, transactional, conflict-detected file modification capabilities within user-authorized projects over Server ↔ Runner JSON-RPC 2.0.

#### Transactional Write RPC Methods
1. **`file.create`**:
   - Creates a new UTF-8 text file within the authorized project sandbox.
   - **No Implicit Directory Creation**: Parent directory must exist on disk; rejects with `PARENT_DIRECTORY_NOT_FOUND` (no automatic `mkdir -p`).
   - **Non-Existence Verification**: Rejects with `FILE_ALREADY_EXISTS` if target file or symlink already exists.
   - **Safety Limits**: Rejects binary files containing NUL bytes (`BINARY_FILE`) and files exceeding 8 MiB (`FILE_TOO_LARGE`).
   - Returns `{ operationId, projectId, path, newHash, bytes }`.

2. **`file.write`**:
   - Overwrites an existing file with mandatory conflict detection via `expectedHash` (SHA-256).
   - **Conflict Detection**: Compares current file SHA-256 against `expectedHash`. If mismatched, immediately aborts with `FILE_CONFLICT`.
   - **Automated Backup**: Creates an immutable backup (`metadata.json` and raw `content`) before write.
   - **Atomic Sibling Temporary File**: Writes to `.${basename}.localbridge-<id>.tmp`, executes `fsync`, preserves file permissions, and atomically renames over target. Cleans up temp file on failure.
   - Returns `{ operationId, projectId, path, oldHash, newHash, bytesBefore, bytesAfter, backupCreated: true }`.

3. **`file.patch`**:
   - Sequential in-memory search/replace engine with transactional rollback.
   - **Strict Match Counting**: Each replacement block must match exactly once. Zero matches throw `PATCH_NOT_FOUND`; multiple matches throw `PATCH_AMBIGUOUS`.
   - **Conflict Check**: Validates `expectedHash` prior to applying replacements.
   - **Automated Backup & Atomic Write**: Creates backup before persisting and applies changes atomically.
   - Returns `{ operationId, projectId, path, oldHash, newHash, bytesBefore, bytesAfter, replacementsApplied }`.

4. **`file.delete`**:
   - Safely deletes an existing file with mandatory conflict detection (`expectedHash`).
   - **Quarantine Backup**: Stores old content and metadata in quarantine backup before unlinking, enabling complete recovery.
   - Returns `{ operationId, projectId, path, oldHash, deleted: true, backupCreated: true }`.

5. **`file.restore`**:
   - Restores a file to its state prior to a specific `operationId`.
   - **Restore Conflict Prevention**: Rejects with `RESTORE_CONFLICT` if the file has been modified concurrently since that operation was performed.
   - Restores deleted files from quarantine back to disk with original permissions.
   - Returns `{ operationId, projectId, path, restoredHash, bytesRestored }`.

#### Project Access Mode Boundary
- Projects default strictly to `accessMode: "read-only"`.
- Remote AI clients and LocalBridge Server **CANNOT** upgrade access modes (no remote `project.setAccess` RPC exists).
- Access modes can only be changed locally by the user via the Runner CLI:
  ```bash
  pnpm --filter @localbridge/runner project:set-access <project-id> <read-only|read-write>
  ```
- Any write, patch, delete, or restore operation on a `read-only` project is immediately rejected with `PROJECT_READ_ONLY`.

#### Isolated Backup Subsystem
- Backups are stored strictly inside the Runner daemon's local state directory (`<runnerStateDir>/backups/<projectId>/<operationId>/`), **NEVER** in the user's project directory.
- Retention policy: maximum 100 backups and 100 MiB per project, with automated FIFO eviction of oldest entries.

#### Strict Security & Privacy Guarantees
- **Zero Physical Path Leakage**: Physical host paths (`root`, `canonicalRoot`, `absolutePath`) never leave the Runner daemon and never appear in RPC payloads.
- **Zero Server File Persistence**: Server acts as a stateless protocol router and never stores file contents, patch texts, or backup data.
- **Prohibited Operations**: Directory mutation (`directory.create`, `directory.delete`), file moves/renames (`file.move`, `file.rename`), symlink modifications (`FILE_SYMLINK_WRITE_BLOCKED`), shell execution, and MCP endpoints remain strictly blocked.

### 9. Safe Read-Only Git Inspection & Diff Engine (Phase 7)

LocalBridge Phase 7 introduces safe, strictly read-only Git inspection and unified diff capabilities across user-authorized projects via Server ↔ Runner typed RPC.

#### Read-Only Git RPC Methods
1. **`git.info`**:
   - Inspects Git repository metadata: current branch, detached HEAD state, full HEAD OID, 7-character shortHead, and upstream tracking status.
   - Returns `{ projectId, isRepository, branch, detached, head, shortHead, hasUpstream }`.
   - Returns `{ isRepository: false, ... }` gracefully when run against non-git projects.

2. **`git.status`**:
   - Inspects working tree and index status using NUL-delimited Git porcelain v2 (`git status --porcelain=v2 --branch -uall -z`).
   - Detects modified, added, deleted, renamed (with `oldPath`), and untracked entries.
   - Accurately tracks `ahead` and `behind` divergence from remote upstream.
   - **Privacy Shield**: Omit sensitive files (`.env`, `*.pem`, `id_rsa`, etc.) and flags `sensitiveEntriesFiltered: true`.
   - **Bound Enforcement**: Limits to at most 500 entries, setting `truncated: true` if exceeded.
   - Returns `{ projectId, branch, detached, ahead, behind, clean, entries, sensitiveEntriesFiltered, truncated }`.

3. **`git.diff`**:
   - Generates unified diffs across the project or for a targeted single file.
   - Supports `scope: "unstaged"` (working tree vs index) and `scope: "staged"` (index vs HEAD).
   - Configurable `contextLines` parameter (0..20, default: 3).
   - **Attack Neutralization**: Forces `--no-ext-diff`, `--no-textconv`, `-c diff.external=`, `-c core.fsmonitor=false`, and an isolated empty hooks directory to defeat repository-level command execution attacks.
   - **Symlink & Submodule Defense**: Omit symlinks in project-wide diffs and rejects single-file diffs on symlinks (`GIT_SYMLINK_DIFF_BLOCKED`) or submodules (`GIT_SUBMODULE_NOT_SUPPORTED`).
   - **Output Bounds**: Capped at 256 KiB; rejects oversized diffs with `GIT_DIFF_TOO_LARGE`.
   - Returns `{ projectId, scope, files, diff, sensitiveEntriesFiltered, symlinkEntriesFiltered, submoduleEntriesFiltered }`.

4. **`git.log`**:
   - Retrieves recent commit history using a strict NUL-delimited format (`%H%x00%h%x00%an%x00%at%x00%s`).
   - Parses hashes, author name, timestamp (milliseconds), and commit subject.
   - Supports commit limits (1..100, default: 20) and path scoping (`path: "sub/file.ts"`).
   - **Privacy Boundary**: Strictly excludes author email addresses (`%ae`), commit message bodies (`%b`), and remote server addresses.
   - Returns `{ projectId, commits }`.

#### Repository Boundary & Process Hardening
- **Repository Root Containment**: Worktree root must match project canonical root (`git rev-parse --show-toplevel === canonicalRoot`). Subdirectories of parent repositories are blocked with `GIT_REPOSITORY_BOUNDARY`.
- **Direct Execution**: Git is spawned directly via `child_process.spawn("git", ...)` with `shell: false` to eliminate shell injection vulnerabilities.
- **Process Bounds**: Default 10s execution timeout (max 30s) and 512 KiB buffer caps.
- **Universal Availability**: Both `read-only` and `read-write` authorized projects can run Git inspection.
- **Zero Physical Path Leakage**: Host physical paths, drive letters, and user home paths are sanitized from all outputs and error messages.

> [!IMPORTANT]
> **Phase 7 Status Notice**: LocalBridge completed Phase 7 (Read-Only Git Inspection).

### 10. Controlled Command Execution & Command Risk Engine (Phase 8)

LocalBridge Phase 8 introduces controlled, strongly-typed, risk-classified, user-authorized process execution over Server ↔ Runner JSON-RPC 2.0. It completely replaces raw, arbitrary shell execution with a strictly sandboxed process execution engine.

#### Strictly Prohibited Operations (Zero Raw Shell)
- **NO Raw Shell Execution**: LocalBridge prohibits `shell.run("arbitrary string")`, `cmd.exe /c`, `powershell -Command`, `bash -c`, or `sh -c`.
- **NO Remote Freeform Executables**: Remote callers (AI/Server) cannot request arbitrary binaries or freeform command lines (`{ "executable": "...", "args": [...] }`).
- **NO Dependency Mutating Commands**: Commands like `npm install`, `pnpm add`, `npm update`, and package lifecycle scripts (`preinstall`, `install`, `postinstall`, `prepare`, `prepack`, `postpack`) are classified as `DANGEROUS` and blocked.
- **NO Inline Code Evaluation**: Evaluation flags like `node -e`, `node --eval`, and `python -c` are classified as `DANGEROUS` and blocked.

#### Project Execution Permission Modes
Each authorized project has an independent `executionMode` attribute:
- **`disabled`** (Default): No command execution of any kind is permitted.
- **`safe-only`**: Only non-modifying system tool version checks (`tool-version`) are permitted. Scripts and package managers cannot be executed.
- **`project-code`**: Permitted to run safe tool checks, project scripts (`node-script`, `python-script`), and defined `package.json` scripts (`package-script`). Strictly requires `accessMode: "read-write"`.

#### Local Administrative Control Only
- Remote callers (AI or Server) **CANNOT** modify `executionMode`.
- Mode changes can only be performed locally by the user on the Runner machine via CLI:
  ```bash
  pnpm --filter @localbridge/runner project:set-execution <project-id> <disabled|safe-only|project-code>
  ```
- **Automatic Downgrade**: If a project's `accessMode` is set to `read-only`, `executionMode` is immediately and automatically downgraded to `disabled`.

#### Structured Command Specifications
Commands must be submitted using a structured, discriminated `CommandSpec`:
1. **`tool-version`**:
   - Inspects host tool versions (`node`, `npm`, `pnpm`, `python`).
   - Executes with `--version`. Classified as `SAFE`.
2. **`node-script`**:
   - Executes a verified `.js`, `.mjs`, or `.cjs` file within the project sandbox.
   - Checks that script is a regular file (symlinks blocked) and outside sensitive locations. Classified as `CAUTION`.
3. **`python-script`**:
   - Executes a verified `.py` file within the project sandbox.
   - Regular file checks and sensitive location masking enforced. Classified as `CAUTION`.
4. **`package-script`**:
   - Executes a script defined in the project's `package.json` (`scripts[name]`) using `npm` or `pnpm`.
   - Verifies the script exists before execution. Classified as `CAUTION`.

#### Subprocess Hardening & Environment Isolation
- **Direct Process Spawning**: Child processes are spawned directly via `child_process.spawn(executablePath, args, { shell: false })`. On Windows, JS tools (`npm`, `pnpm`) are executed directly via `node.exe` with JS entrypoints to bypass `cmd.exe` and avoid Node 24 `.cmd` invocation vulnerabilities.
- **Environment Allowlist**: Subprocesses do not inherit parent process environment variables. Only a minimal system allowlist is passed (`PATH`, `SystemRoot`, `WINDIR`, `TEMP`, `TMP`, `COMSPEC` on Windows; `PATH`, `LANG`, `LC_ALL`, `TMPDIR` on POSIX).
- **Secrets Stripping**: Parent secrets (`OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `AWS_*`, `GITHUB_TOKEN`, runner tokens, etc.) are stripped.
- **Isolated User Directories**: `HOME`, `USERPROFILE`, `XDG_CONFIG_HOME`, `XDG_DATA_HOME`, `XDG_CACHE_HOME`, and `NPM_CONFIG_USERCONFIG` are isolated to `<runnerStateDir>/execution-home/`.
- **Python Hardening**: `PYTHONNOUSERSITE=1` is set to prevent loading scripts from global user site packages.

#### Resource Bounds & Process Tree Termination
- **Output Bounds**: Standard output is capped at 256 KiB, standard error at 256 KiB, and combined output at 512 KiB. If exceeded, the entire process tree is terminated immediately, throwing `COMMAND_OUTPUT_TOO_LARGE`.
- **Execution Timeouts**: Default 60 seconds (clamped to 1s..300s). On timeout, the entire process tree is terminated immediately, throwing `COMMAND_TIMEOUT`.
- **Process Tree Kill**: Windows uses `taskkill.exe /PID <pid> /T /F` to guarantee termination of grandchild processes; POSIX uses process group signals.
- **Output Sanitization**: Strips ANSI escape sequences, CSI control codes, and OSC hyperlinks while preserving UTF-8, Chinese characters, and emojis. Redacts physical host filesystem paths to `<project-root>`, `<runner-state>`, and `<user-home>`.
- **Zero Server Output Persistence**: Server stores audit metadata (execution time, exit code, parameters) in SQLite, but never persists command stdout/stderr.

#### Trust Boundary Notice
> [!WARNING]
> **Project Code Trust Boundary**: Commands running in `project-code` mode execute with the local OS user privileges of the Runner process. While LocalBridge enforces strict parameter validation, path containment, environment stripping, resource caps, and process tree termination, it does not provide OS-level containerization or hypervisor isolation. Users must only grant `project-code` execution to projects whose scripts and dependencies they trust.

> [!IMPORTANT]
> **Phase 8 Status Notice**: LocalBridge has completed Phase 8. Controlled, risk-classified command execution (`command.classify`, `command.run`), read-only Git inspection, and transactional filesystem operations are fully operational. Background jobs, MCP runtime endpoints, and GUI remain slated for future phases.

### 11. Management API Security Boundary

- **Loopback Default (`127.0.0.1`)**: LocalBridge Server binds to `127.0.0.1` by default. Management REST endpoints (such as `/api/status`, `/api/runners`, `/api/projects`, `/api/runners/:id/ping`, and `/api/runners/:id/system-info`) are intended exclusively for local administrative inspection and trusted loopback access.
- **Access & Exposure Disclaimer**: If exposing the LocalBridge Server to non-loopback network interfaces or reverse proxies, administrative `/api/*` management routes MUST be protected behind appropriate authentication or reverse-proxy firewall rules to prevent unauthorized discovery or diagnostic probing.

---

## License

[MIT](LICENSE)
