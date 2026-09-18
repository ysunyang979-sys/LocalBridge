# LocalBridge Architecture Specification

## Overview

LocalBridge is an open-source system designed to bridge AI clients running the Model Context Protocol (MCP) with local development environments, strictly preserving file containment and security on the user's host machine.

### Flow

1. AI Client (e.g. Claude Desktop, ChatGPT macOS, Codex) connects to LocalBridge Server via HTTPS MCP (`POST /mcp`, Bearer `lb_...`).
2. LocalBridge Server verifies the client's Bearer token against stored hashes in SQLite.
3. When the AI issues a tool invocation (e.g. `file_read`, `git_status`, `command_run`), the Server translates it into a typed JSON-RPC 2.0 request (`file.read`, `git.status`, `shell.run`).
4. The request is dispatched over an authenticated WebSocket (`lbr_...`) to the user's local Runner daemon.
5. The Runner daemon validates the canonical path, enforces command risk policies, and executes the operation strictly within the authorized project directory.
6. Structured results are routed back through the WebSocket to the Server, which returns the MCP tool response to the AI client.
