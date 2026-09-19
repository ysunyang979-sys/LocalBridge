# Changelog

All notable changes to the LocalBridge project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [1.0.0] - 2026-09-19

### Milestone: v1.0.0 Production Release & Phase 12 Security Hardening

This release marks the general availability (GA) of **LocalBridge v1.0.0**, providing a production-grade, secure, local-first bridge between AI developer assistants and local workstations.

### Added
- **Tri-Domain Token Isolation**:
  - Distinct prefixes and authorization domains for tokens:
    - `lb_`: Model Context Protocol clients only (`POST /mcp`).
    - `lbr_`: Runner daemon WebSocket authentication (`/runner/ws`).
    - `lm_`: Desktop administrative management channel (`/api/management/*`).
  - Strict domain boundary checks rejecting cross-domain token reuse with 401/403 `INVALID_TOKEN_TYPE`.
- **Canary Redaction & Safe Audit Metadata Policy**:
  - Implemented `SafeAuditMetadata` field whitelist across all MCP tool execution audits.
  - Sensitive file contents, patches, unified diffs, raw command arguments, stdout/stderr streams, environment variables, and authentication tokens are strictly stripped from audit buffers, SQLite storage, and Desktop Activity feeds.
- **Management Channel Hardening**:
  - Enforced loopback IP binding (`127.0.0.1`, `::1`).
  - Host header verification defending against DNS rebinding attacks.
  - Browser origin verification blocking external web origins.
  - Direct dropping of cross-site browser fetches via `Sec-Fetch-Site: cross-site`.
- **Crash Recovery & State Integrity**:
  - Automatic pre-migration database snapshotting (`<dbPath>.pre-migration.bak`).
  - Purging of orphaned temporary files (`.localbridge-*.tmp`) upon Runner startup.
  - Automatic expiration and teardown of pending human approvals on Runner disconnect or shutdown.
- **Production Desktop Packaging**:
  - Tauri 2 NSIS installer and MSI bundle configuration with custom desktop icons.
  - Zero raw shell and zero direct filesystem plugin capabilities exposed to the webview.
- **Comprehensive Security Documentation**:
  - `SECURITY.md`: Vulnerability disclosure policy and response SLA.
  - `docs/THREAT_MODEL.md`: In-depth analysis covering 14 threat vectors.
  - `PRIVACY.md`: Local-first, zero-telemetry commitment and data ownership guidelines.
  - Automated CI/CD workflows (`ci.yml`, `release-windows.yml`).
  - CycloneDX Software Bill of Materials (`sbom.json`) and SHA-256 verification hashes (`SHA256SUMS.txt`).

### Changed
- Monorepo package versions updated to `1.0.0` across `@localbridge/protocol`, `@localbridge/shared`, `@localbridge/security`, `@localbridge/server`, `@localbridge/runner`, and `@localbridge/desktop`.
- Protocol versions stabilized: LocalBridge RPC Protocol `1.0`, Model Context Protocol `2026-07-28`.

### Security
- Fuzzed and fortified Windows path canonicalization against null bytes (`\0` and `%00`), Unicode fullwidth slashes (`／`, `＼`), Windows Alternate Data Streams (`:$DATA`), and 8.3 short filename aliasing.
- Strengthened Git execution isolation with `-c core.fsmonitor= -c diff.external= -c core.pager=cat -c core.hooksPath=/dev/null`.

---

## [0.11.0] - 2026-09-19

### Milestone: Phase 11 — Desktop Control Center & Human Approval

### Added
- **Desktop Control Center (`apps/desktop`)**:
  - Tauri 2 + React 19 + TypeScript + Vite GUI application.
  - Real-time service status, project browser, token generator, active job monitor, and audit log inspector.
  - Native directory picker integration via `@tauri-apps/plugin-dialog`.
- **Human Approval Center**:
  - Approval queue with 300-second automatic expiration.
  - SHA-256 parameter hash binding preventing parameter tampering between request and resolution.
  - One-time approval consumption preventing replay attacks.
- **Global Emergency Controls**:
  - Global Pause (`POST /api/pause`) temporarily freezing AI access while retaining management operations.
  - Emergency Stop (`POST /api/emergency-stop`) terminating all active child processes and engaging global pause.

---

## [0.10.0] - 2026-09-19

### Milestone: Phase 10 — MCP 2026-07-28 Server & Tool Suite

### Added
- Model Context Protocol (MCP) 2026-07-28 Streamable HTTP transport (`POST /mcp`).
- 23 strongly typed MCP tools spanning:
  - Projects: `localbridge_project_list`, `localbridge_project_get`.
  - Filesystem: `localbridge_dir_list`, `localbridge_file_read`, `localbridge_file_stat`, `localbridge_file_create`, `localbridge_file_write`, `localbridge_file_patch`, `localbridge_file_delete`, `localbridge_file_restore`.
  - Git: `localbridge_git_status`, `localbridge_git_diff`, `localbridge_git_log`, `localbridge_git_branches`.
  - Commands: `localbridge_command_classify`, `localbridge_command_run`.
  - Jobs: `localbridge_job_start`, `localbridge_job_status`, `localbridge_job_logs`, `localbridge_job_cancel`, `localbridge_job_list`, `localbridge_build_start`, `localbridge_test_start`.
- Bearer token authentication for MCP endpoints.

---

## [0.9.0] - 2026-09-19

### Milestone: Phase 9 — Long-Running Background Jobs

### Added
- Long-running job management engine (`build`, `test`, `dev`, `lint`).
- Ring-buffer logging per job with byte-offset log streaming.
- Graceful cancellation and process tree kill on Windows (`taskkill.exe /PID <pid> /T /F`).
- Configurable job execution timeouts and automatic cleanup upon project revocation.

---

## [0.8.0] - 2026-09-19

### Milestone: Phase 8 — Multi-Project Registry & Access Modes

### Added
- Dynamic project registry supporting multi-repository management.
- Access mode isolation: `read-only` vs `read-write`.
- Execution mode gating: `disabled`, `safe-only`, `project-code`.
- Opaque project identifier routing (`projectId`) preventing physical path leakage.

---

## [0.7.0] - 2026-09-19

### Milestone: Phase 7 — Read-Only Git Integration

### Added
- Pure read-only Git operations: `git.status`, `git.diff`, `git.log`, `git.branches`.
- Isolation against untrusted Git configuration and external hooks.
- Sensitive file diff masking.

---

## [0.6.0] - 2026-09-19

### Milestone: Phase 6 — Structured Filesystem Modifications & Automated Backups

### Added
- Atomic file write, file create, file delete, and search-and-replace patching.
- Pre-mutation backup engine creating timestamped backups in `.localbridge/backups`.
- Automated restoration RPC (`file.restore`).

---

## [0.5.0] - 2026-09-19

### Milestone: Phase 5 — Structured Command Execution & Risk Classification

### Added
- Command classification engine categorizing operations into `SAFE`, `CAUTION`, and `DANGEROUS`.
- Zero raw shell execution; structured `CommandSpec` execution model.
- Process tree lifecycle management.

---

## [0.4.0] - 2026-09-19

### Milestone: Phase 4 — Sandboxed Read-Only Filesystem

### Added
- Sandboxed directory listing, file reading, and file stat operations.
- Path canonicalization defending against directory traversal and symlink escapes.
- Sensitive file masking policy blocking `.env`, keys, and credentials.

---

## [0.3.0] - 2026-09-19

### Milestone: Phase 3 — LocalBridge Runner Daemon

### Added
- Node.js background runner daemon connecting outbound to the Server via WebSocket.
- Automatic reconnect with exponential backoff and jitter.
- Dual-channel RPC router.

---

## [0.2.0] - 2026-09-19

### Milestone: Phase 2 — Server & Token Authentication

### Added
- Fastify server with SQLite persistence in WAL mode.
- Cryptographic token generation and constant-time verification.
- Server health and status endpoints.

---

## [0.1.0] - 2026-09-19

### Milestone: Phase 1 — Project Scaffolding & Protocol Definitions

### Added
- Monorepo architecture with pnpm workspaces, TypeScript, and Turborepo.
- `@localbridge/protocol` package with Zod schemas for JSON-RPC 2.0.
- Shared logging, configuration, and cryptographic utilities.
