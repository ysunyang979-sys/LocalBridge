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
- **Dual Token Separation**: MCP client tokens (`lb_...`) and Runner daemon tokens (`lbr_...`) are generated with 256-bit cryptographic entropy (`crypto.randomBytes(32)`) and stored only as SHA-256 hashes (`token_hash`). Plaintext tokens are returned once and never persisted.
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

---

## License

[MIT](LICENSE)
