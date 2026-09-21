# Fix Build Failures (`nexus.fix-build`)

## Purpose
Systematically reproduce build failures, locate the precise root cause using LSP diagnostics, apply minimal and focused code edits, and verify that the build succeeds.

## When to Use
- When the project fails to build or compile (e.g. `pnpm build`, `cargo build`, `npm run build`).
- When encountering TypeScript compiler errors (`tsc`), missing imports, or syntax failures.
- When user asks "帮我修一下构建错误" or "The build is broken, please fix it".

## Do Not Use When
- The build succeeds and only unit tests are failing (use `nexus.run-tests`).
- The user is asking for architectural restructuring or feature additions (use `nexus.safe-refactor`).
- The project is not yet understood (use `nexus.project-inspect` first).

## Recommended Tools
- `localbridge_project_list`: Confirm authorized project.
- `localbridge_build_start` or `localbridge_command_run`: Execute actual build commands (`npm run build`, `cargo check`).
- `localbridge_code_diagnostics`: Pull LSP compiler diagnostics with line numbers and error codes.
- `localbridge_file_read`: Inspect the offending file around the reported error line.
- `localbridge_file_patch`: Apply surgical string replacements.
- `localbridge_file_write`: Write updated file content when patches are non-trivial.

## Workflow
1. **Confirm Project**: Locate target `project_id`.
2. **Reproduce Failure**: Run `localbridge_build_start` or `localbridge_command_run` (`npm run build`, etc.) to capture the exact failure log and exit code.
3. **Collect Diagnostics**: Call `localbridge_code_diagnostics` to get structured error messages, line numbers, and symbol errors.
4. **Pinpoint Root Cause**: Use `localbridge_file_read` on the offending file at the exact error lines. Do NOT speculate or blindly rewrite unrelated files.
5. **Apply Minimal Patch**: Apply the smallest possible code change via `localbridge_file_patch` (or `localbridge_file_write`) resolving the syntax/type/import error.
6. **Verify Build Passes**: Re-run `localbridge_build_start` to confirm the exit code is 0 and no new errors were introduced.
7. **Summarize Resolution**: Clearly describe what broke, what was changed, and show the build verification result.

## Safety Rules
- **Minimal Blast Radius**: Do NOT perform sweeping refactors or mass-delete files to fix a build error.
- **Never Modify Lockfiles Directly**: Do not edit `pnpm-lock.yaml`, `package-lock.json`, or `Cargo.lock` by hand.
- **Respect Permissions**: If file write requires approval or is denied, stop and inform the user.
- **Emergency Stop**: If Emergency Stop triggers, cease all write operations immediately.

## Verification
- Clean compilation: The build command MUST exit with code 0.
- `localbridge_code_diagnostics` on the modified files must report 0 syntax/type errors.

## Failure Handling
- If the build still fails after modification, read the new compiler errors and iterate.
- If a dependency is missing, check `package.json` before recommending an install command.
- Never loop infinitely; if 3 attempts fail, stop and present diagnostic findings to the user.

## Final Response Expectations
- **Root Cause Explanation**: Why the build was failing.
- **Code Diff**: Exact changes made to fix the issue.
- **Verification Evidence**: Build command output demonstrating exit code 0.
