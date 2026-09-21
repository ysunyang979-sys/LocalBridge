# Project Build Artifacts & Workspace Cleanup (`nexus.project-cleanup`)

## Purpose
Identify temporary files, build output directories (`dist/`, `build/`, `.turbo/`, `coverage/`, `.next/`), stale logs, and cache assets; present an explicit cleanup plan; and execute deletions using structured filesystem deletion tools under Nexus Full Control and Policy Engine constraints.

## When to Use
- When asked "Clean up build files", "Free up space in this project", or "Delete dist and cache".
- Before packaging or archiving a repository.
- After heavy builds or test runs that leave gigabytes of artifacts.

## Do Not Use When
- Deleting arbitrary user source files or non-build assets.
- Modifying code logic or refactoring.
- The project is actively building or running tests.

## Recommended Tools
- `localbridge_project_info`: Verify project authorization.
- `localbridge_directory_list`: Scan directory tree for target artifact folders.
- `localbridge_file_stat`: Check sizes and last modified times of cleanup targets.
- `localbridge_fs_delete`: Recursively delete directories or multi-file targets.
- `localbridge_file_delete`: Delete specific individual temporary files.

## Workflow
1. **Check Project Authorization**: Verify `project_id`.
2. **Scan Target Directories**: Call `localbridge_directory_list` looking specifically for known disposable folders (`dist`, `build`, `out`, `coverage`, `.cache`, `.turbo`).
3. **Identify Cleanable Artifacts**: Check `localbridge_file_stat` on candidate directories to calculate space.
4. **Generate Cleanup Plan**: Present an explicit list of paths to be deleted to the user before initiating deletion.
5. **Verify Full Control Policy**: Ensure the client has appropriate write privileges and Full Control mode if applicable.
6. **Execute Structured Deletion**: Call `localbridge_fs_delete` with `recursive: true` only on verified cleanup targets.
7. **Verify Disk Reclamation**: Verify targets no longer exist.

## Safety Rules
- **NEVER delete source code**: Strictly exclude `.git`, `src`, `lib`, `packages`, `tests`, and configuration files (`*.json`, `*.toml`, `*.yaml`).
- **Protected File Guard**: Protected files (e.g. `.env`, `.nexus/*`, credentials) are strictly shielded by the Nexus Policy Engine.
- **Controlled Scope**: Requires `write` scope. If Full Control or approvals are required, abide by policy.

## Verification
- Deleted directories are gone.
- Essential source files remain 100% intact.
