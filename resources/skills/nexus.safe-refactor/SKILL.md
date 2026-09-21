# Safe Code Refactoring & Impact Control (`nexus.safe-refactor`)

## Purpose
Guide non-destructive, atomic code refactoring operations by calculating blast radius upfront, applying minimal diffs, verifying LSP diagnostics after every step, and running test suites to ensure zero behavioral regression.

## When to Use
- When asked to "refactor this module", "rename or extract this method", or "clean up this messy function".
- When modernizing legacy code patterns while preserving public contracts.
- When reorganizing code files or interfaces.

## Do Not Use When
- The build or tests are currently broken (fix them first using `nexus.fix-build` or `nexus.run-tests`).
- The user is asking for rapid prototyping with no regression guarantees.
- The user wants simple file deletion or asset cleanup (use `nexus.project-cleanup`).

## Recommended Tools
- `localbridge_project_info`: Verify project authorization.
- `localbridge_file_read`: Read target modules and consumers.
- `localbridge_code_references`: Trace all usages of the target symbol before changing its signature.
- `localbridge_code_impact`: Compute cross-module impact radius.
- `localbridge_file_patch`: Apply structured, minimal diffs.
- `localbridge_code_diagnostics`: Verify no compilation or type errors were introduced.
- `localbridge_test_start`: Run regression tests.
- `localbridge_job_status`: Wait for test completion.
- `localbridge_job_logs`: Verify test outputs.

## Workflow
1. **Check Project Authorization**: Verify `project_id` and ensure working tree is clean.
2. **Evaluate Symbol Impact**: Call `localbridge_code_references` and `localbridge_code_impact` on the target symbol to identify all affected call sites.
3. **Plan Refactoring Steps**: Formulate an ordered sequence of small, atomic patch steps.
4. **Apply Atomic Patches**: Apply diffs one file at a time using `localbridge_file_patch`.
5. **Verify Diagnostics**: After patching, immediately call `localbridge_code_diagnostics` to ensure zero type errors.
6. **Run Regression Tests**: Trigger `localbridge_test_start` to ensure existing behavior is preserved.
7. **Confirm Behavioral Parity**: Check `localbridge_job_logs` to ensure all tests passed cleanly.

## Safety Rules
- **Atomic changes**: Never make sweeping across-the-board replacements in a single step.
- **Rollback readiness**: If diagnostics or tests fail, revert changes or patch immediately.
- **Honor policy gates**: Modifying files requires write permissions and approval if configured.

## Verification
- Diagnostics show 0 new errors.
- Test suites continue to pass with 100% parity.
