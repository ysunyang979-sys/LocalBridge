# Deep Code Debugging & Linkage Diagnosis (`nexus.code-debug`)

## Purpose
Investigate complex code issues, type discrepancies, runtime errors, or logical bugs using rich LSP code intelligence (hover types, definitions, references, call hierarchy, and blast-radius impact analysis) without executing destructive edits.

## When to Use
- When asked "Why is this function failing?", "Where is this variable used?", or "Trace the root cause of this bug".
- When needing to understand cross-file symbol relationships and callers before modifying code.
- When inspecting compiler warnings or LSP diagnostics in specific files.

## Do Not Use When
- The user is asking to run a build or test suite (use `nexus.fix-build` or `nexus.run-tests`).
- The user is asking for large-scale multi-file refactoring (use `nexus.safe-refactor`).
- The user only wants a high-level project summary (use `nexus.project-inspect`).

## Recommended Tools
- `localbridge_project_info`: Verify project configuration and language services.
- `localbridge_file_read`: Read relevant source code around the suspicious logic.
- `localbridge_code_diagnostics`: Fetch current compiler errors, warnings, and hints.
- `localbridge_code_hover`: Retrieve precise type definitions and documentation for symbols.
- `localbridge_code_definition`: Jump to where functions, interfaces, or variables are defined.
- `localbridge_code_references`: Discover all usage sites across the codebase.
- `localbridge_code_call_hierarchy`: Explore incoming and outgoing call trees.
- `localbridge_code_impact`: Compute downstream impact analysis before planning a fix.

## Workflow
1. **Check Project Authorization**: Confirm project context and file accessibility.
2. **Inspect Code Diagnostics**: Check `localbridge_code_diagnostics` for syntax/type errors in the target file.
3. **Inspect Symbol Hover**: Use `localbridge_code_hover` at specific line/column to verify resolved types and signatures.
4. **Trace Symbol Definition**: Use `localbridge_code_definition` to locate source implementations across modules.
5. **Trace Symbol References**: Use `localbridge_code_references` to check callers, consumers, and overrides.
6. **Analyze Impact Scope**: Call `localbridge_code_impact` to assess ripple effects of proposed changes.
7. **Report Root Cause**: Formulate a clear explanation of why the bug occurs and recommend specific fixes.

## Safety Rules
- **READ-ONLY**: This debugging skill focuses purely on diagnosis. Do not apply uncontrolled edits.
- **Precision targeting**: Request hover and references at exact symbol positions rather than querying whole files arbitrarily.

## Verification
- Diagnostics confirm either known errors or clean syntax.
- Symbol references and types accurately explained to the user.
