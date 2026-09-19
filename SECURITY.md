# Security Policy

## Supported Versions

LocalBridge follows semantic versioning (`MAJOR.MINOR.PATCH`). Security updates and patches are actively supported for the following versions:

| Version | Supported          | Security Maintenance Status |
| :------ | :----------------- | :-------------------------- |
| 1.0.x   | :white_check_mark: | Active (Current Baseline)   |
| < 1.0.0 | :x:                | End of Life (Development)   |

---

## Security Architecture & Core Tenets

LocalBridge is engineered for local-first execution with strict defense-in-depth isolation. When connecting autonomous AI assistants to your local development machine, LocalBridge enforces the following security tenets:

1. **Local-First & Loopback Binding**:
   - The LocalBridge Server binds strictly to the local loopback interface (`127.0.0.1`, `::1`).
   - Management endpoints (`/api/management/*`) enforce DNS rebinding protection (validating `Host` against authorized loopback targets) and block cross-site browser pivot attacks (`Sec-Fetch-Site: cross-site`).

2. **Tri-Domain Token Isolation**:
   - Authentication tokens are cryptographically distinct and strictly isolated across three security domains:
     - **MCP Client Tokens** (`lb_` prefix): Authorized solely for Model Context Protocol interactions (`POST /mcp`). Cannot call administrative or management endpoints.
     - **Runner Daemon Tokens** (`lbr_` prefix): Authorized solely for Runner WebSocket RPC connections (`/runner/ws`). Cannot call MCP or management endpoints.
     - **Management Tokens** (`lm_` prefix): Authorized solely for Desktop administrative controls (`/api/management/*`). Cannot authenticate to MCP or Runner channels.
   - All tokens are generated with 256 bits of CSPRNG entropy (`crypto.randomBytes(32)`), stored exclusively as SHA-256 hashes in SQLite, and verified in constant time (`crypto.timingSafeEqual`) to prevent timing side-channel attacks.

3. **Sandboxing & Canonical Path Enforcement**:
   - AI tools reference files exclusively via opaque, user-granted `projectId` and relative paths.
   - All paths are strictly validated and canonicalized against the project root before file I/O occurs.
   - Mitigates directory traversal (`../`), null byte injections (`\0` and `%00`), Unicode fullwidth slashes (`／`, `＼`), Windows Alternate Data Streams (`:$DATA`), 8.3 short filename aliasing (`PROGRA~1`), NTFS junction escapes, and UNC remote paths (`\\attacker\share`).

4. **Zero Raw Shell & Process Tree Lifecycle Management**:
   - Arbitrary shell strings (`sh -c`, `cmd.exe /c`, PowerShell eval) are strictly disallowed.
   - Commands are submitted as structured schemas (`CommandSpec`: `tool-version`, `node-script`, `python-script`, `package-script`).
   - All spawned child processes are tracked and terminated cleanly using process tree kills (`taskkill /PID <pid> /T /F` on Windows) on timeout, cancellation, or emergency stop.

5. **Safe Audit & Redaction Policy**:
   - LocalBridge enforces a strict field whitelist (`SafeAuditMetadata`) on audit logs.
   - Sensitive file contents, patches, unified diffs, raw command arguments, stdout/stderr streams, environment variables, and authentication tokens are strictly stripped and never written to audit buffers or database records.

6. **Human-in-the-Loop Approvals**:
   - In LocalBridge v1.0.1, the protected approval operation with end-to-end execution verification and consumption is `file.delete`.
   - Approvals are cryptographically bound to parameters via SHA-256 digest verification (`canonicalPayloadHash`), expire in 300 seconds, and are strictly one-time consumable (`verifyAndConsume`).

---

## Reporting a Vulnerability

We take the security of LocalBridge and user systems extremely seriously. If you identify a security vulnerability or suspect a security flaw in LocalBridge, please report it promptly through our coordinated disclosure process.

### Disclosure Guidelines

- **Do NOT file public GitHub issues, discussions, or pull requests for suspected security vulnerabilities.**
- Send an encrypted email or detailed report to our dedicated security contact:
  - **Email**: `security@localbridge.dev` (or open a private GitHub Security Advisory)
- Include the following details to help us triage and resolve the issue quickly:
  - **Description**: Detailed description of the vulnerability and attack scenario.
  - **Affected Component**: Affected package (`@localbridge/server`, `@localbridge/runner`, `@localbridge/security`, etc.) and version (`1.0.0`).
  - **Steps to Reproduce / PoC**: Minimal reproducible example or proof-of-concept script.
  - **Impact Assessment**: Potential impact (e.g., sandbox escape, privilege escalation, token disclosure).
  - **Remediation Suggestions**: Any suggested code changes or configuration mitigations (if available).

### Response SLA & Coordination

- **Initial Response**: Within **48 hours** of receiving your report.
- **Triage & Assessment**: Within **5 business days**, confirming reproduction and risk severity.
- **Remediation Plan**: A patch and security advisory will be prepared in a private repository.
- **Public Disclosure**: We coordinate public disclosure timelines with reporters, typically targeting 30 days after a fix is verified, or earlier upon mutual agreement.
