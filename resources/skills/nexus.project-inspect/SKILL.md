# Project Architecture & Context Inspection (`nexus.project-inspect`)

## Purpose
Systematically analyze an authorized local project's structure, technology stack, package dependencies, main entrypoints, and codebase health without mutating any files.

## When to Use
- When asked "What does this project do?", "Explain project architecture", or "Show me the project structure".
- When orienting yourself in an unfamiliar codebase before attempting modifications or debugging.
- When inspecting project configuration (`package.json`, `tsconfig.json`, `Cargo.toml`, `pyproject.toml`, etc.).

## Do Not Use When
- The user is asking to diagnose a specific build error or test failure (use `nexus.fix-build` or `nexus.run-tests`).
- The user wants to start a development server (use `nexus.start-dev-runtime`).
- The user wants to edit, refactor, or delete files.

## Recommended Tools
- `localbridge_project_list`: Retrieve list of authorized projects and find target `project_id`.
- `localbridge_project_info`: Inspect access mode, execution mode, and metadata.
- `localbridge_directory_list`: List top-level directories and files.
- `localbridge_file_read`: Read manifest files (`package.json`, `README.md`, etc.).
- `localbridge_code_workspace_symbols`: Discover primary classes, functions, and symbols.
- `localbridge_code_diagnostics`: Check for pre-existing syntax or compilation errors.

## Workflow
1. **Verify Project Authorization**: Call `localbridge_project_list` to locate the authorized `project_id` matching the user's workspace.
2. **List Root Directory**: Call `localbridge_directory_list` with `depth: 1` or `depth: 2` to survey directories (`src/`, `tests/`, `packages/`, etc.).
3. **Read Manifests**: Call `localbridge_file_read` on `package.json`, `Cargo.toml`, or `README.md` to identify the runtime, frameworks, and scripts.
4. **Locate Entrypoints**: Identify server/app main entrypoints (e.g. `src/index.ts`, `src/main.rs`, `src/App.tsx`).
5. **Inspect Diagnostics**: Call `localbridge_code_diagnostics` to check baseline project health.
6. **Synthesize Architecture Summary**: Provide a clear, structured overview of the project.

## Safety Rules
- **READ-ONLY**: This skill is strictly read-only. Do not invoke `file_write`, `file_create`, `file_delete`, or mutating commands.
- **Protect sensitive files**: Skip or redact any sensitive environment variables or `.env` files found in the directory.
- **Limit file reads**: Read only essential manifests and entrypoints; avoid dumping entire source directories into the prompt context.

## Verification
- Verify that the target `project_id` is authorized and accessible.
- Verify manifest parsing succeeded and primary scripts (`build`, `dev`, `test`) are identified.

## Failure Handling
- If `project_id` is invalid or missing, inform the user and list available projects using `localbridge_project_list`.
- If the project root contains no recognized manifests, inspect top-level filenames and summarize generic directory layout.

## Final Response Expectations
Provide a concise, organized report:
- **Project Name & Tech Stack** (Languages, Frameworks, Build Tools)
- **Directory Layout** (Key folders and their roles)
- **Primary Entrypoints & Scripts** (`build`, `dev`, `test`)
- **Current Health & Diagnostics** (Any TypeScript/LSP errors detected)
