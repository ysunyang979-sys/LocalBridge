# Git Change Review & Compliance Inspection (`nexus.git-review`)

## Purpose
Inspect working directory changes, staged files, unified diffs, and recent commit history to provide a rigorous, security-aware code review before committing or pushing.

## When to Use
- When asked "What have I changed?", "Review my git diff", or "Is this ready to commit?".
- Before merging branches or finalizing a development task.
- To detect uncommitted debug statements, leftover console logs, or leaked secrets.

## Do Not Use When
- The user specifically asked to commit, stage, or push code.
- The user is asking to debug a specific compiler error (use `nexus.code-debug`).
- The project is not a Git repository.

## Recommended Tools
- `localbridge_project_info`: Verify project authorization.
- `localbridge_git_info`: Check current branch and repository root.
- `localbridge_git_status`: Check staged, unstaged, and untracked files.
- `localbridge_git_diff`: Retrieve unified diff for staged or unstaged modifications.
- `localbridge_git_log`: View recent commit messages and commit structure.
- `localbridge_code_diagnostics`: Verify changed files contain no compiler errors or broken types.
- `localbridge_code_impact`: Check blast radius of modified interfaces.

## Workflow
1. **Check Project Authorization**: Verify `project_id` and repository status.
2. **Inspect Git Status**: Call `localbridge_git_status` to see which files were added, modified, or deleted.
3. **Fetch Unified Diff**: Call `localbridge_git_diff` to review the exact line-by-line modifications.
4. **Inspect Recent Commits**: Call `localbridge_git_log` with a limit of 3-5 commits to understand context.
5. **Check Code Diagnostics**: Call `localbridge_code_diagnostics` to ensure changed files have no compile errors.
6. **Synthesize Review Report**: Present an organized review highlighting correctness, potential bugs, style, and security concerns.

## Safety Rules
- **STRICTLY NO UNREQUESTED COMMITS**: Do NOT call `localbridge_git_commit`, `localbridge_git_stage`, or `localbridge_command_run` with git push unless the user explicitly commands you to do so.
- **Secret Detection**: Flag any accidental additions of `.env`, tokens, private keys, or passwords immediately.
- **Read-Only Inspection**: This skill is strictly analytical and does not modify the working tree.

## Verification
- Working tree status and diff retrieved without errors.
- Any syntax errors or suspicious code flagged clearly.
