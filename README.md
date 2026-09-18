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

> [!IMPORTANT]
> **Phase 6 Status Notice**: LocalBridge is currently at Phase 6. Safe, conflict-detected file modification operations (`file.create`, `file.write`, `file.patch`, `file.delete`, `file.restore`) are active exclusively on projects explicitly granted `read-write` access by the local user. Shell execution, Git operations, background jobs, and MCP runtime endpoints remain strictly prohibited.

### 9. Management API Security Boundary

- **Loopback Default (`127.0.0.1`)**: LocalBridge Server binds to `127.0.0.1` by default. Management REST endpoints (such as `/api/status`, `/api/runners`, `/api/projects`, `/api/runners/:id/ping`, and `/api/runners/:id/system-info`) are intended exclusively for local administrative inspection and trusted loopback access.
- **Access & Exposure Disclaimer**: If exposing the LocalBridge Server to non-loopback network interfaces or reverse proxies, administrative `/api/*` management routes MUST be protected behind appropriate authentication or reverse-proxy firewall rules to prevent unauthorized discovery or diagnostic probing.

---

## License

[MIT](LICENSE)
