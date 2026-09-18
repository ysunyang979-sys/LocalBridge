# LocalBridge Phase 8 Implementation & Verification Report

**Phase**: 8 — Controlled Command Execution & Command Risk Engine  
**Version**: `0.8.0`  
**Baseline Git Commit**: `b7fcfa6` (`feat: add safe read-only git inspection`)  
**Verified Runtime**: Node.js `v24.21.0`, pnpm `10.14.0`, Windows x64 (`win32`), Git `2.46.2.windows.1`  
**Test Results**: 48 test suites passed, 352 automated tests passed (100%)  
**Typecheck Results**: 0 errors across all 5 workspace projects (`pnpm typecheck`)  

---

## 1. Executive Summary

Phase 8 equips LocalBridge with its first controlled process execution capability without introducing arbitrary or unconstrained shell execution. By combining strong typing (`CommandSpec`), deterministic risk classification (`CommandClassifier`), three-tiered project execution authorization (`executionMode`), stripped and isolated process environments (`buildSafeProcessEnv`), hard output and timeout caps, and robust process tree termination (`killProcessTree`), LocalBridge allows AI agents to inspect developer tools, run project test suites, and execute scripts under explicit, user-configured local control.

### Zero Raw Shell Principle
LocalBridge strictly prohibits:
- `shell.run("arbitrary command string")`
- Subshell wrappers: `cmd.exe /c`, `powershell -Command`, `bash -c`, `sh -c`
- Remote freeform executables: `{ "executable": "...", "args": [...] }`
- Arbitrary package manager mutations: `npm install`, `pnpm add`, `npm update`
- Code evaluation flags: `node -e`, `node --eval`, `python -c`

---

## 2. Core Architecture & Components

```text
AI Client / Server RPC
         │
         │ CommandSpec (JSON-RPC 2.0: command.classify / command.run)
         ▼
LocalBridge Server
         │ (Stateless JSON-RPC forwarding & audit metadata persistence)
         ▼
LocalBridge Runner Daemon
         │
         ├── 1. Project Registry & Authorization Check
         │      (Verifies project exists, checks executionMode & accessMode)
         │
         ├── 2. Command Risk Classifier (CommandClassifier)
         │      (Classifies spec into SAFE, CAUTION, or DANGEROUS)
         │
         ├── 3. Command Policy Evaluation (CommandPolicy)
         │      (Evaluates executionMode policy matrix; checks write access)
         │
         ├── 4. Sandbox Path & Argument Validator
         │      (Bounds arguments; resolves script & cwd inside project sandbox)
         │
         ├── 5. Executable Registry (ExecutableRegistry)
         │      (Resolves host binary on system PATH; executes JS tools via node.exe)
         │
         ├── 6. Process Environment Isolator (buildSafeProcessEnv)
         │      (Allowlist env; strips secrets; isolates HOME to execution-home/)
         │
         ├── 7. Safe Process Runner (ProcessRunner)
         │      (Spawns with shell: false; streams stdout/stderr with byte limits;
         │       enforces timeout; terminates process tree on limit violation)
         │
         └── 8. Output Sanitizer (sanitizeProcessOutput)
                (Strips ANSI CSI/OSC; redacts physical paths to placeholders)
```

---

## 3. Project Authorization & Execution Modes

Every project authorized in the Runner maintains an independent `executionMode` property:

| Mode | Allowed Command Kinds | Required Access Mode | Description |
|---|---|---|---|
| `disabled` (Default) | None | Any | Execution is completely disabled. Any command execution attempt throws `PROJECT_EXECUTION_DISABLED`. |
| `safe-only` | `tool-version` | `read-only` or `read-write` | Permits only non-intrusive host tool version checks (`--version`). All script execution attempts are blocked with `COMMAND_BLOCKED`. |
| `project-code` | `tool-version`, `node-script`, `python-script`, `package-script` | `read-write` strictly required | Permits executing project scripts and declared package scripts. Requires explicit write access; blocked with `PROJECT_EXECUTION_REQUIRES_WRITE_ACCESS` otherwise. |

### Local-Only Administration
- Remote callers (AI or Server) **CANNOT** modify `executionMode`.
- Modifications must be performed locally by the machine user via the Runner CLI:
  ```bash
  pnpm --filter @localbridge/runner project:set-execution <project-id> <disabled|safe-only|project-code>
  ```
- **Auto-Downgrade**: If `accessMode` is switched from `read-write` to `read-only`, `executionMode` automatically downgrades to `disabled`.

---

## 4. Structured Command Specifications (`CommandSpec`)

All command requests must conform to the discriminated union `CommandSpec`:

1. **`tool-version`**:
   - Parameters: `{ kind: "tool-version", projectId, tool: "node" | "npm" | "pnpm" | "python" }`
   - Classification: `SAFE` (`executesProjectCode: false`, `mayModifyFiles: false`, `mayAccessNetwork: false`).
   - Executes: `<tool> --version`.

2. **`node-script`**:
   - Parameters: `{ kind: "node-script", projectId, path, args, cwd?, timeoutMs? }`
   - Classification: `CAUTION` (`executesProjectCode: true`).
   - Constraints: Must have `.js`, `.mjs`, or `.cjs` extension; must exist in project sandbox; cannot be a symbolic link; cannot be inside protected sensitive locations (`.git`, `.env`, private keys).

3. **`python-script`**:
   - Parameters: `{ kind: "python-script", projectId, path, args, cwd?, timeoutMs? }`
   - Classification: `CAUTION` (`executesProjectCode: true`).
   - Constraints: Must have `.py` extension; must exist in project sandbox; cannot be a symbolic link; cannot be in sensitive paths.

4. **`package-script`**:
   - Parameters: `{ kind: "package-script", projectId, manager: "npm" | "pnpm", script, args, cwd?, timeoutMs? }`
   - Classification: `CAUTION` for build/test scripts; `DANGEROUS` for lifecycle scripts (`install`, `postinstall`, `prepare`, etc.) and mutators (`publish`, `login`, `token`).
   - Constraints: Working directory must contain `package.json`, and `scripts[name]` must exist.

---

## 5. Subprocess Hardening & Environment Isolation

### 1. Direct Spawning & Windows CVE-2024-27980 Mitigation
- All child processes are spawned directly via `child_process.spawn(executablePath, args, { shell: false })`.
- On Windows, Node 24 rejects spawning `.cmd` or `.bat` files with `shell: false` (`EINVAL`). Furthermore, invoking `cmd.exe` directly introduces command injection attack surfaces.
- To resolve both issues securely, `ExecutableRegistry` inspects `npm` and `pnpm` on Windows, resolves their core JavaScript entrypoints (`npm-cli.js` / `pnpm.cjs`), and executes them directly via `node.exe <entrypoint> <args>` with `shell: false`. This provides complete portability, zero `cmd.exe` dependency, and complete immunity to `.cmd` batch injection attacks.

### 2. Environment Allowlist & Secret Stripping
- Subprocesses inherit **NO** parent process environment variables by default.
- Minimal allowlist enforced:
  - Windows: `PATH`, `PATHEXT`, `SystemRoot`, `WINDIR`, `TEMP`, `TMP`, `COMSPEC`
  - POSIX: `PATH`, `LANG`, `LC_ALL`, `TMPDIR`
- Parent secrets are stripped: `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `AWS_*`, `GITHUB_TOKEN`, runner tokens, and server secrets are never leaked to child processes.
- User configuration isolation: `HOME`, `USERPROFILE`, `XDG_CONFIG_HOME`, `XDG_DATA_HOME`, `XDG_CACHE_HOME`, and `NPM_CONFIG_USERCONFIG` are redirected to an isolated directory: `<runnerStateDir>/execution-home/`.
- Python isolation: `PYTHONNOUSERSITE=1` is set to block loading untrusted scripts from the user's host Python site-packages.
- Interactive prompt suppression: `CI=1` is set.

---

## 6. Resource Limits & Process Tree Termination

| Resource Limit | Value | Behavior on Violation |
|---|---|---|
| Max Stdout Size | 256 KiB (262,144 bytes) | Immediately aborts process tree; throws `COMMAND_OUTPUT_TOO_LARGE` |
| Max Stderr Size | 256 KiB (262,144 bytes) | Immediately aborts process tree; throws `COMMAND_OUTPUT_TOO_LARGE` |
| Max Total Output | 512 KiB (524,288 bytes) | Immediately aborts process tree; throws `COMMAND_OUTPUT_TOO_LARGE` |
| Execution Timeout | 1,000ms .. 300,000ms (Default: 60,000ms) | Immediately aborts process tree; throws `COMMAND_TIMEOUT` |
| Max Argument Count | 64 arguments | Validated upfront; throws `COMMAND_ARGUMENTS_TOO_LARGE` |
| Max Single Arg Size | 4,096 bytes | Validated upfront; throws `COMMAND_ARGUMENTS_TOO_LARGE` |
| Max Total Args Size | 64 KiB (65,536 bytes) | Validated upfront; throws `COMMAND_ARGUMENTS_TOO_LARGE` |

### Process Tree Termination (`killProcessTree`)
- When a process exceeds timeout or output limits, terminating only the parent process leaves orphaned child/grandchild processes running (e.g. `npm` spawning `node`).
- On Windows, `killProcessTree` calls `taskkill.exe /PID <pid> /T /F` to forcefully terminate the entire process hierarchy.
- On POSIX, process group signals (`process.kill(-pid, "SIGKILL")`) are dispatched.

---

## 7. Output Sanitization & Privacy Shield

- **ANSI & OSC Stripping**:
  - Regular expressions strip ANSI CSI sequences (color and formatting codes), OSC sequences (including OSC 8 terminal hyperlinks), and non-printable control characters.
  - Standard whitespace (`\n`, `\r\n`, `\t`) and all valid printable UTF-8 characters (including Chinese, Japanese, Korean, accented letters, and emojis) are strictly preserved.
- **Physical Path Redaction**:
  - `canonicalProjectRoot` is replaced with `<project-root>`.
  - `runnerStateDir` is replaced with `<runner-state>`.
  - User home directory (`os.homedir()`) is replaced with `<user-home>`.
  - Case-insensitivity and mixed slashes (`/` vs `\`) on Windows are normalized and handled.
- **Server Persistence Policy**:
  - The LocalBridge Server records audit metadata in SQLite (timestamp, duration, exit code, project ID, parameters).
  - The server **NEVER** stores or persists command `stdout` or `stderr` outputs in the database.

---

## 8. Trust Boundary Disclosure

> [!WARNING]
> **Project Code Trust Boundary**:
> Processes executed in `project-code` mode run with the OS user account privileges of the host Runner process. LocalBridge provides defense-in-depth through rigorous parameter checking, path containment, environment variable stripping, resource bounds, output sanitization, and process tree termination. However, LocalBridge does **NOT** provide kernel-level containerization (e.g. Linux namespaces, cgroups, or Windows containers) or hypervisor isolation.
> 
> Users must only grant `project-code` execution permission to local projects whose source code and dependencies are trusted.

---

## 9. Automated Verification Summary

```text
Test Suites: 48 passed, 48 total
Tests:       352 passed, 352 total
Snapshots:   0 total
Time:        25.12s
```

### Phase 8 Test Matrix
1. `tests/project-execution-mode.test.ts` (6 tests):
   - Default `executionMode: "disabled"` for newly added projects.
   - Automatic migration of legacy project records to `"disabled"`.
   - Authorization of `safe-only` mode on read-only projects.
   - Strict rejection of `project-code` mode on read-only projects (`PROJECT_EXECUTION_REQUIRES_WRITE_ACCESS`).
   - Authorization of `project-code` on read-write projects.
   - Automatic downgrade of `executionMode` to `"disabled"` when `accessMode` changes to `"read-only"`.
2. `tests/command-risk.test.ts` (15 tests):
   - Deterministic risk classification for `tool-version` (`SAFE`).
   - Risk classification for `node-script`, `python-script`, `package-script` (`CAUTION`).
   - Blocking dangerous package lifecycle scripts (`install`, `postinstall`, `prepare`, etc.) as `DANGEROUS`.
   - Blocking package manager mutators (`publish`, `login`, `adduser`, `token`) as `DANGEROUS`.
   - Blocking inline evaluation flags (`node -e`, `python -c`) as `DANGEROUS`.
   - Blocking non-script extensions and traversal script names as `DANGEROUS`.
   - Policy evaluation matrix across `disabled`, `safe-only`, and `project-code` modes.
3. `tests/command-env-isolation.test.ts` (4 tests):
   - Stripping parent environment secrets (`OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `AWS_*`, `GITHUB_TOKEN`).
   - Redirecting `HOME`, `USERPROFILE`, and `XDG_*` directories to `<runnerStateDir>/execution-home/`.
   - Setting `PYTHONNOUSERSITE=1`.
   - Preserving required system variables (`PATH`, `SystemRoot`).
4. `tests/command-process-limits.test.ts` (3 tests):
   - Subprocess timeout enforcement and process tree kill (`COMMAND_TIMEOUT`).
   - Stdout/stderr buffer overflow enforcement and process tree kill (`COMMAND_OUTPUT_TOO_LARGE`).
   - Upfront argument size boundary enforcement (`COMMAND_ARGUMENTS_TOO_LARGE`).
5. `tests/command-output-sanitization.test.ts` (7 tests):
   - Stripping ANSI colors and CSI sequences.
   - Stripping OSC terminal hyperlinks.
   - Preserving UTF-8 characters, Chinese text, and emojis.
   - Redacting physical paths with `<project-root>`, `<runner-state>`, `<user-home>` placeholders.
   - Handling mixed forward/backward slashes.
6. `tests/command-execution.test.ts` (10 tests):
   - Blocking all execution in `disabled` mode (`PROJECT_EXECUTION_DISABLED`).
   - Permitting `tool-version` while blocking scripts in `safe-only` mode (`COMMAND_BLOCKED`).
   - Executing `tool-version` across `node`, `npm`, and `pnpm`.
   - Executing `node-script` with arguments and capturing stdout.
   - Executing script with Chinese characters and emojis.
   - Capturing non-zero exit codes and stderr without throwing bridge errors.
   - Executing in relative subdirectories (`cwd`) with boundary containment.
   - Blocking execution of scripts in sensitive paths (`SENSITIVE_FILE_BLOCKED`).
   - Executing defined `package.json` package scripts.
   - Blocking undeclared package scripts (`COMMAND_SCRIPT_NOT_FOUND`).
7. `tests/command-rpc-integration.test.ts` (3 tests):
   - Server ↔ Runner WebSocket routing for `command.classify`.
   - Server ↔ Runner WebSocket routing for `command.run` in `safe-only` mode.
   - Server ↔ Runner WebSocket routing for `command.run` in `project-code` mode.
8. Regression Verification (41 suites):
   - Full regression pass for Phase 1 through Phase 7 suites (Auth, Token hashing, Handshake, Heartbeat, RPC Routing, Project Sandboxing, Read-Only Filesystem, Transactional Writes, Read-Only Git Engine).
