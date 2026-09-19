# LocalBridge Threat Model (STRIDE & Defense-in-Depth Analysis)

**Document Version**: 1.0.0  
**Target Release**: LocalBridge v1.0.0  
**Security Baseline**: Phase 12 Security Hardening  
**Date**: September 19, 2026  

---

## 1. Scope, System Architecture & Trust Boundaries

LocalBridge connects autonomous AI developer agents (such as Claude, ChatGPT, Codex, Cursor) to local software repositories on a user's computer via the Model Context Protocol (MCP 2026-07-28).

The system consists of four primary components:
1. **AI Client**: External or local process connecting via `POST /mcp` using a Bearer token (`lb_...`).
2. **LocalBridge Server**: Fastify-based HTTP server managing tokens, projects, audit records, and loopback routes.
3. **LocalBridge Runner**: Daemon executing verified filesystem, Git, and structured command operations inside authorized project sandboxes.
4. **Desktop Control Center**: Tauri 2 + React 19 UI providing user-in-the-loop oversight, token generation, and approval management.

```text
               TRUST BOUNDARY 1: Untrusted / Semi-Trusted AI Input
                                      │
                                      ▼
             [ AI Client (Claude, ChatGPT, Codex, Cursor) ]
                                      │
                 MCP 2026-07-28 Streamable HTTP (POST /mcp)
                    Bearer Token Domain: lb_*
                                      │
                                      ▼
             ┌─────────────────────────────────────────────────┐
             │            LocalBridge Server (Node.js)         │
             │  - SQLite (WAL Mode, Pre-migration Backups)     │
             │  - Loopback Enforcer (127.0.0.1, ::1 only)      │
             │  - DNS Rebinding / Browser Pivot Defense        │
             │  - Token Domain Boundary (lb_ vs lbr_ vs lm_)   │
             └─────────────────────────────────────────────────┘
                   │                                     │
  Runner WebSocket │ lbr_*            Management REST    │ lm_* (Local Only)
  TRUST BOUNDARY 2 │                  TRUST BOUNDARY 3   │
                   ▼                                     ▼
┌──────────────────────────────────────┐     ┌───────────────────────────────┐
│     LocalBridge Runner Daemon        │     │  Desktop Control Center (GUI) │
│ - Canonical Path Sandboxing          │     │ - Tauri 2 Webview (No shell)  │
│ - Zero Raw Shell / Structured Specs  │     │ - Human Approval Center       │
│ - Git Command Hijack Defense         │     │ - Emergency Kill Switch       │
│ - Process Tree Termination           │     │ - Activity & Audit Viewer     │
└──────────────────────────────────────┘     └───────────────────────────────┘
                   │
  TRUST BOUNDARY 4 │ User-Authorized Repositories Only
                   ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                       Local Filesystem & Project Trees                      │
│                  (e.g., C:\Users\user\Projects\my-app)                      │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Comprehensive 14-Vector Threat Analysis

### Vector 1: Prompt Injection & AI Agent Manipulation
- **Threat**: A malicious repository file (e.g. `README.md`, comments in code) contains adversarial instructions designed to trick the AI into executing destructive actions, exfiltrating credentials, or overwriting files outside the project.
- **Impact**: Unauthorized modifications, data leakage, or service abuse.
- **Mitigation & Countermeasures**:
  - **Tool Parameter Boundary**: The AI client can never supply raw operating system commands or arbitrary file paths.
  - **Human-in-the-Loop Approvals**: Potentially disruptive actions (such as project code execution or write access on read-only projects) require manual user approval with SHA-256 parameter binding.
  - **Global Pause & Emergency Stop**: User can pause all AI tool executions immediately with zero disruption to runner operations.

### Vector 2: Path Traversal & Windows Path Canonicalization
- **Threat**: Attackers supply crafted path inputs attempting to traverse outside the authorized repository directory.
- **Attack Variations Addressed**:
  - Classic traversal (`../`, `..\`, `....//`).
  - URL / percent-encoded traversal and null bytes (`%2e%2e%2f`, `%00`).
  - Unicode fullwidth slashes (`\uFF0F` `／`, `\uFF3C` `＼`).
  - Windows Alternate Data Streams (`filename.txt::$DATA`, `file.txt:hidden`).
  - Windows 8.3 short filename aliasing (`PROGRA~1`, `DOCUME~1`).
  - UNC network paths (`\\attacker-host\share`).
  - Device namespaces (`\\.\`, `\\?\`, `CON`, `PRN`, `AUX`, `NUL`, `COM1-9`, `LPT1-9`).
- **Mitigation & Countermeasures**:
  - Every path is processed through `validateWindowsPathSecurity` and `canonicalizePath` before access.
  - The resulting realpath is verified against the canonical project root using case-normalized path prefix comparisons (`path.relative(root, resolved)`).

### Vector 3: Command Injection & Arbitrary Code Execution
- **Threat**: AI models attempting to pass shell command separators (`&`, `|`, `;`, `` ` ``, `$()`) or arbitrary shell strings.
- **Impact**: Remote Code Execution (RCE) on the host workstation.
- **Mitigation & Countermeasures**:
  - **Strict Feature Freeze**: Zero raw shell commands (`exec`, `system`, `sh -c`, `cmd.exe /c`, `powershell.exe`).
  - **Structured Command Specifications**: Commands can only be executed via strongly typed `CommandSpec` schemas: `tool-version`, `node-script`, `python-script`, or `package-script`.
  - Process arguments are passed as discrete string arrays (`spawn(executable, args, { shell: false })`), completely eliminating shell expansion.

### Vector 4: Git Command & Process Hijacking
- **Threat**: Malicious `.git/config` or crafted arguments invoking external programs via Git configuration keys (e.g., `core.fsmonitor`, `diff.external`, `pager`, `textconv`, or Git hooks).
- **Impact**: Code execution triggered during read-only Git status or diff operations.
- **Mitigation & Countermeasures**:
  - All Git invocations explicitly override dangerous configuration settings via command-line flags:
    `-c core.fsmonitor= -c diff.external= -c core.pager=cat -c core.hooksPath=/dev/null`.
  - Git subcommands are whitelisted: only `status`, `diff`, `log`, `branch`, `rev-parse` are permitted. Zero Git write operations (`commit`, `push`, `reset`) are exposed to the AI client.

### Vector 5: Token Theft, Forgery, and Domain Cross-Contamination
- **Threat**: An attacker acquiring an MCP token tries to authenticate as a Runner or access administrative management endpoints, or vice versa.
- **Impact**: Privilege escalation, unauthorized token minting, or project reconfiguration.
- **Mitigation & Countermeasures**:
  - **Three Disjoint Token Domains**:
    - `lb_`: Model Context Protocol clients only.
    - `lbr_`: Runner WebSocket connection only.
    - `lm_`: Desktop Management REST API only.
  - Using an `lb_` or `lbr_` token on `/api/management/*` immediately returns HTTP 401 `INVALID_TOKEN_TYPE`.
  - Tokens use 256-bit CSPRNG entropy (`crypto.randomBytes(32)`).
  - Plaintext tokens are returned once upon creation and never persisted.
  - Database stores only SHA-256 digests (`token_hash`), compared with `crypto.timingSafeEqual`.

### Vector 6: DNS Rebinding & Web Browser Pivot Attacks
- **Threat**: A victim visits a malicious website in Chrome/Firefox/Edge. The attacker uses DNS rebinding or cross-origin `fetch` to pivot into `http://127.0.0.1:port/api/management` to steal tokens or alter projects.
- **Impact**: Host takeover from the browser sandbox.
- **Mitigation & Countermeasures**:
  - **Host Header Validation**: All requests must present a Host header matching an approved loopback address (`127.0.0.1`, `localhost`, `[::1]`). External domain names (e.g. `rebind.attacker.com`) are rejected with HTTP 403 `HOST_NOT_ALLOWED`.
  - **Browser Origin Check**: Non-loopback `Origin` headers are blocked.
  - **Cross-Site Fetch Blocking**: Requests bearing `Sec-Fetch-Site: cross-site` are immediately rejected with HTTP 403 `CROSS_SITE_REQUEST_BLOCKED`.
  - **Management Secret Required**: Management routes require the local secret (`lm_...`).

### Vector 7: Malicious Web Content & XSS in Desktop Activity/Audit
- **Threat**: Project filenames, file contents, or error messages containing HTML/JavaScript tags (`<script>alert(1)</script>`) executed within the Desktop UI webview.
- **Impact**: Local webview compromise, session hijacking, or unauthorized approval clicks.
- **Mitigation & Countermeasures**:
  - **Zero Raw HTML / InnerHTML**: All Desktop UI rendering in React 19 uses JSX text nodes which automatically HTML-entity-encode all strings.
  - **Safe Audit Whitelist**: Audit records strip raw content, arguments, and stdout before storing or serving to the UI.

### Vector 8: Symlink & Hardlink Junction Exploitation
- **Threat**: A project directory contains symlinks or NTFS directory junctions pointing to sensitive system paths (e.g., `C:\Windows\System32`, `C:\Users\user\.ssh`).
- **Impact**: Reading or writing sensitive files outside the project sandbox.
- **Mitigation & Countermeasures**:
  - The Runner resolves realpaths (`fs.realpath`) before performing reading, writing, patching, or deletion.
  - If a symlink resolves to a target path outside the project's canonical root, the operation is rejected with `PATH_OUTSIDE_PROJECT`.

### Vector 9: Sensitive File & Credential Exposure
- **Threat**: The AI client reads credentials from `.env`, `.git/config`, `id_rsa`, or private certificates.
- **Impact**: Secret exfiltration.
- **Mitigation & Countermeasures**:
  - **Sensitive File Policy**: Built-in pattern blacklist blocks reading or listing files matching sensitive patterns (`.env*`, `*.pem`, `*.key`, `id_*`, `credentials*`, etc.).
  - **Canary Redaction in Audit**: Audit logs never include file contents, patches, or command arguments.

### Vector 10: Denial of Service & Resource Exhaustion
- **Threat**: AI client spawns infinite background jobs, writes gigabytes of files, or floods the server with requests.
- **Impact**: Disk exhaustion, CPU saturation, memory exhaustion.
- **Mitigation & Countermeasures**:
  - **In-Memory Rate Limiting**: Per-token rate limiting on MCP requests (default 60 req/min).
  - **Job Concurrency & Execution Limits**: Strict caps on concurrent background jobs; mandatory `timeoutMs` (max 300,000ms / 5 minutes).
  - **Process Tree Kill**: Immediate termination of runaway child processes and their subchildren (`taskkill /PID <pid> /T /F`).
  - **Automated Backup Pruning**: Maximum 100 backups per project with a 100 MiB total quota; oldest backups automatically evicted.

### Vector 11: State Tampering & SQLite Database Corruption
- **Threat**: Crash during database migration or concurrent writes corrupting configuration and token state.
- **Impact**: Service unavailability or loss of project authorization state.
- **Mitigation & Countermeasures**:
  - **WAL Mode**: SQLite configured with Write-Ahead Logging (`PRAGMA journal_mode = WAL`) and foreign key enforcement (`PRAGMA foreign_keys = ON`).
  - **Pre-Migration Backups**: Every schema migration creates an automatic timestamped backup copy (`<dbPath>.pre-migration.bak`).
  - **Atomic Config Writes**: Application configuration writes use atomic rename patterns (`write tmp -> rename`).

### Vector 12: Desktop UI Hijacking & Native Capability Escalation
- **Threat**: Compromised webview executing OS commands through Tauri IPC.
- **Impact**: Privilege escalation to the desktop user.
- **Mitigation & Countermeasures**:
  - **Zero Shell Plugin**: `tauri-plugin-shell` is completely omitted from desktop capabilities.
  - **Zero FS Plugin**: `tauri-plugin-fs` is disabled for webview; file operations must route through verified LocalBridge server APIs.
  - **Scoped Dialog Plugin**: `@tauri-apps/plugin-dialog` is restricted strictly to folder selection (`open` directory picker).

### Vector 13: Runner-Server MitM & Desynchronization
- **Threat**: An attacker impersonates a Runner daemon or captures messages between Server and Runner over WebSocket.
- **Impact**: Hijacking execution or intercepting code.
- **Mitigation & Countermeasures**:
  - Runner connects over local WebSocket requiring valid `lbr_` token.
  - Heartbeat ping/pong every 15 seconds; disconnected runners are promptly unregistered.
  - All pending approvals and ephemeral state associated with a runner are immediately expired upon disconnect.

### Vector 14: Supply Chain & Dependency Compromise
- **Threat**: Vulnerabilities or malicious code introduced through third-party npm packages or Rust crates.
- **Impact**: Backdoored binary or runtime vulnerability.
- **Mitigation & Countermeasures**:
  - Pinned lockfiles (`pnpm-lock.yaml`, `Cargo.lock`).
  - Automated CI dependency audits (`pnpm audit`).
  - CycloneDX Software Bill of Materials (`sbom.json`) published for all release artifacts.

---

## 3. Residual Risk & User Responsibilities

1. **User Approvals**: LocalBridge cannot protect against users blindly approving high-risk actions in the Approval Center without reading the prompt details.
2. **Authorized Project Contents**: Granting access to a folder containing pre-existing malicious code allows that code to be executed when the user runs project scripts.
3. **Local Machine Security**: If the host machine is already compromised with rootkit or malware, LocalBridge's local security boundaries can be bypassed by processes with equivalent or higher privileges.
