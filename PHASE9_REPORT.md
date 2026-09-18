# LocalBridge Phase 9 Implementation Report

**Milestone**: Phase 9 — Build/Test & Background Job System  
**Version**: `0.9.0`  
**Runtime**: Node.js `v24.21.0`, pnpm `10.14.0`, Windows x64  
**Date**: September 19, 2026  

---

## 1. Executive Summary

Phase 9 establishes the asynchronous, long-running background job execution subsystem for LocalBridge. It extends Phase 8's controlled process execution engine into an asynchronous job manager capable of running long-duration tasks—such as `pnpm test`, `pnpm build`, test suites, and project scripts—without exposing any raw shell capabilities, without allowing remote arbitrary executables, and without auto-installing dependencies.

### Key Capabilities Introduced
- **7 New Typed RPC Methods**:
  - `job.start`: Initiates a background job using a structured `CommandSpec`.
  - `job.status`: Queries current lifecycle state, risk assessment, exit code, signal, and duration.
  - `job.logs`: Streams sanitized stdout/stderr chunks with opaque cursor pagination (`lastSeq`).
  - `job.cancel`: Terminates the entire process tree idempotently.
  - `job.list`: Lists active and recent jobs filtered by `projectId` or `state`.
  - `build.start`: High-level wrapper for `pnpm run build` or `npm run build` (or custom script).
  - `test.start`: High-level wrapper for `pnpm run test` or `npm run test` (or custom script).
- **Zero Raw Shell & Inherited Security**: Completely prohibits `shell.run`, `cmd.exe /c`, `powershell -Command`, `bash -c`, or arbitrary binaries. All execution goes through Phase 8's structured `CommandSpec` and policy engine.
- **Strict Concurrency & Rate Limiting**: Maximum 4 concurrent running jobs per Runner (`MAX_RUNNING_JOBS_PER_RUNNER = 4`), maximum 2 concurrent running jobs per Project (`MAX_RUNNING_JOBS_PER_PROJECT = 2`), and maximum 20 job starts per minute (`MAX_JOB_STARTS_PER_MINUTE = 20`).
- **In-Memory Ring Buffer & Pre-Storage Sanitization**: 4 MiB buffer per job with FIFO eviction. ANSI/OSC codes stripped and physical paths redacted before buffering; UTF-8, Chinese characters, and emojis strictly preserved.
- **Process Tree Termination**: Uses `taskkill.exe /PID <pid> /T /F` on Windows to cleanly terminate parent and grandchild processes.
- **Runner Ownership & Disconnect Continuity**: Runner daemon owns jobs; WebSocket disconnection does not kill running jobs.
- **Immediate Project Revocation Abort**: Removing, disabling, or downgrading project permissions (`executionMode` or `accessMode`) immediately terminates all active jobs for that project.
- **Zero Server Log Persistence**: Server audits execution metadata in SQLite but never persists stdout/stderr.

---

## 2. Specification Compliance Verification

| Specification Requirement | Implemented Status | Verification Evidence |
| :--- | :--- | :--- |
| **No Raw Shell Execution** | Fully Compliant | No `shell.run`, `cmd.exe`, or freeform command strings. `job.start` only accepts structured `CommandSpec`. |
| **Structured Job IDs** | Fully Compliant | Stable `job_<UUIDv4>` format (e.g. `job_${crypto.randomUUID()}`). Verified in `tests/job-registry.test.ts`. |
| **Job Lifecycle States** | Fully Compliant | `running` → `succeeded` / `failed` / `cancelled` / `timed-out`. Verified in `tests/job-lifecycle.test.ts`. |
| **Runner Concurrency Cap (4)** | Fully Compliant | 5th concurrent runner job rejected with `JOB_CAPACITY_EXCEEDED`. Verified in `tests/job-capacity.test.ts`. |
| **Project Concurrency Cap (2)** | Fully Compliant | 3rd concurrent project job rejected with `JOB_CAPACITY_EXCEEDED`. Verified in `tests/job-capacity.test.ts`. |
| **Rate Limit (20 starts/min)** | Fully Compliant | 21st start within 60s rejected with `JOB_RATE_LIMITED`. Verified in `tests/job-capacity.test.ts`. |
| **Job Timeouts (1s..3600s)** | Fully Compliant | Default 600s (10 min). Timer kills entire process tree and marks state `timed-out`. Verified in `tests/job-timeout.test.ts`. |
| **Process Tree Termination** | Fully Compliant | Spawns with `shell: false`. Aborts with `taskkill.exe /PID <pid> /T /F` on Windows. Verified in `tests/job-cancel.test.ts`. |
| **Ring Buffer & Sanitization** | Fully Compliant | 4 MiB FIFO eviction with `truncated: true` and `droppedBytes`. Pre-storage ANSI/OSC strip and path redaction. Verified in `tests/job-logs.test.ts`. |
| **Cursor Pagination** | Fully Compliant | Base64url cursor `{ lastSeq: number }`, max 100 chunks, 128 KiB limit per response. Verified in `tests/job-logs.test.ts`. |
| **build.start & test.start** | Fully Compliant | High-level package-script wrappers with `package.json` validation (`BUILD_SCRIPT_NOT_FOUND`, `TEST_SCRIPT_NOT_FOUND`). Verified in `tests/build-test-start.test.ts`. |
| **No Auto Dependency Install** | Fully Compliant | Missing `node_modules` fails normally in logs; never runs `npm install` or `pnpm install`. |
| **Runner Ownership** | Fully Compliant | Jobs continue running locally across WebSocket disconnect. Queryable upon reconnect. Verified in `tests/job-disconnect.test.ts`. |
| **Permission Revocation Abort** | Fully Compliant | Disabling, removing, or downgrading project immediately aborts all running project jobs. Verified in `tests/job-project-revocation.test.ts`. |
| **Zero Server Log Persistence** | Fully Compliant | Server audits metadata in SQLite but never writes stdout/stderr to disk. |

---

## 3. Architecture & Implementation Highlights

### 3.1 Project Registry Dynamic Event Mechanism
`apps/runner/src/projects/registry.ts` now extends `EventEmitter`. Mutations emit:
- `project:removed` (`projectId`)
- `project:disabled` (`projectId`)
- `project:enabled` (`projectId`)
- `project:access_mode_changed` (`projectId`, `mode`)
- `project:execution_mode_changed` (`projectId`, `mode`)

`JobManager` subscribes to these events and immediately triggers `cancelProjectJobs(projectId, reason)` if a project is disabled, removed, or has its `executionMode` downgraded to `"disabled"` or `"safe-only"`.

### 3.2 Dual Timeout Avoidance
`JobStartParams.timeoutMs` defines the execution ceiling (clamped to 1s..3600s, default 600s). The job manager overrides any inner `CommandSpec.timeoutMs` with the job-level timeout, preventing conflicting duplicate timers.

### 3.3 Node 24 Native Compatibility Fix
Under Node.js 24.19.0+, `better-sqlite3` Statement destructors can trigger an assertion failure (`node::RemoveEnvironmentCleanupHook: (env) != nullptr`) during V8 Isolate disposal if prepared statements are garbage-collected after environment teardown.
- Added `if (typeof global.gc === "function") global.gc();` inside `db.close()` in `apps/server/src/db/index.ts`.
- Configured `execArgv: ["--expose-gc"]` in `vitest.config.ts`.
- Results in 100% clean test teardown across all 58 test files.

---

## 4. Test Verification Summary

### Monorepo Test Results (`pnpm test`)
```text
Test Files  58 passed (58)
     Tests  378 passed (378)
  Duration  39.65s
```

### TypeScript Typecheck (`pnpm typecheck`)
```text
Scope: 5 of 6 workspace projects
packages/protocol typecheck: Done
packages/shared typecheck: Done
packages/security typecheck: Done
apps/runner typecheck: Done
apps/server typecheck: Done
```

### Production Monorepo Build (`pnpm build`)
- `@localbridge/protocol`: dist/index.js (33.99 KB), dist/index.d.ts (161.71 KB)
- `@localbridge/shared`: dist/index.js (8.22 KB), dist/index.d.ts (8.66 KB)
- `@localbridge/security`: dist/index.js (18.78 KB), dist/index.d.ts (6.58 KB)
- `@localbridge/server`: dist/index.js (41.22 KB)
- `@localbridge/runner`: dist/index.js (167.84 KB)

---

## 5. Answers to Mandatory Verification Questions

### 1. Are background jobs owned by the WebSocket connection or by the local Runner?
Background jobs are owned strictly by the local Runner daemon (`JobManager`), not the transient WebSocket connection. If the connection drops, jobs continue executing uninterrupted on the local machine. Reconnecting clients can query status and fetch logs at any time using the `jobId`.

### 2. Is raw shell execution permitted in any form?
No. `job.start` accepts only validated, discriminated `CommandSpec` objects. Arbitrary shell strings, `cmd.exe /c`, `powershell -Command`, and remote executable paths are strictly rejected.

### 3. Does LocalBridge automatically install missing dependencies?
No. LocalBridge strictly refuses to run `npm install` or `pnpm install` automatically. If dependencies are missing, the build/test script will fail and record standard error output in the job logs.

### 4. How are grandchild processes killed on Windows?
On Windows, `killProcessTree` invokes `taskkill.exe /PID <pid> /T /F`, which traverses and forcefully terminates the complete process tree including all child and grandchild processes.

### 5. What happens when project execution permission is downgraded while jobs are running?
The `ProjectRegistry` emits `project:execution_mode_changed`. The `JobManager` listens to this event and immediately cancels all running jobs for that project, logging the cancellation reason.
