# Automated Test Runner & Failure Diagnosis (`nexus.run-tests`)

## Purpose
Execute tests in the local environment, capture test output, isolate failing assertions or stack traces, guide code repairs, and re-run tests to verify resolution.

## When to Use
- When asked to "run tests", "check if tests pass", or "fix failing unit tests".
- After making code changes or refactors to verify that functionality has not regressed.
- When running targeted test files or comprehensive test suites.

## Do Not Use When
- The project does not build (use `nexus.fix-build` first).
- The user is asking for general code review or architecture explanation without executing tests.
- Starting a long-running dev server (use `nexus.start-dev-runtime`).

## Recommended Tools
- `localbridge_project_info`: Identify project roots and configured test runners.
- `localbridge_file_read`: Inspect test setup and configuration (e.g. `vitest.config.ts`, `jest.config.js`).
- `localbridge_test_start`: Trigger an asynchronous or synchronous test job.
- `localbridge_job_status`: Poll the execution status of the running test job.
- `localbridge_job_logs`: Fetch stdout and stderr logs containing test assertions and failure traces.
- `localbridge_code_diagnostics`: Inspect TypeScript or compiler errors on the failing test/source files.
- `localbridge_file_patch`: Apply minimal, surgical fixes to the failing code or tests.

## Workflow
1. **Check Project Authorization**: Verify `project_id` and test environment.
2. **Detect Test Configuration**: Inspect `package.json` scripts or test config files to determine the right test runner and optional filters.
3. **Trigger Test Job**: Invoke `localbridge_test_start` with the target `project_id` (and optional file filter or test name).
4. **Monitor Test Status**: Use `localbridge_job_status` to observe job progression until completion.
5. **Analyze Test Failures**: Call `localbridge_job_logs` to isolate the exact assertion errors, failed suites, and file line numbers.
6. **Repair Failures**: Apply minimal targeted edits using `localbridge_file_patch` (or `localbridge_file_write`).
7. **Rerun Verification**: Re-invoke `localbridge_test_start` to ensure all tests pass cleanly.

## Safety Rules
- **Do not blindly modify tests to make them pass**: Fix the underlying implementation unless the test itself was identified as outdated or buggy.
- **Isolate test scope**: When debugging a specific failure, run targeted test files before running the entire test suite.
- **Do not bypass approval gates**: Mutating files will trigger policy checks; honor all approvals.

## Verification
- Test job must exit with code 0 (`status: "succeeded"`).
- Zero failing assertions in `localbridge_job_logs`.

## Failure Handling
- If tests time out or hang, check for unclosed network sockets or database connections.
- If dependencies are missing, suggest checking `package.json` dependencies.
