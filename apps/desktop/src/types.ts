export interface ServerStatus {
  server: string;
  version: string;
  runners_connected: number;
  mcp_active: boolean;
  paused?: boolean;
}

export interface McpStatus {
  mcpActive: boolean;
  paused: boolean;
  version: string;
  protocolVersion: string;
  toolsCount: number;
}

export interface Project {
  id: string;
  name: string;
  root: string;
  enabled: boolean;
  accessMode: "read-only" | "read-write";
  executionMode: "disabled" | "safe-only" | "project-code";
  runnerId?: string;
  createdAt?: number;
  updatedAt?: number;
}

export interface Approval {
  id: string;
  projectId: string;
  operation: string;
  risk: "CAUTION" | "DANGEROUS";
  summary: string;
  payloadHash: string;
  createdAt: number;
  expiresAt: number;
  status: "pending" | "approved" | "denied" | "expired";
  resolvedAt?: number | null;
  resolvedBy?: string | null;
}

export interface Job {
  jobId: string;
  projectId: string;
  state: "queued" | "running" | "succeeded" | "failed" | "cancelled" | "timed-out";
  risk: "SAFE" | "CAUTION" | "DANGEROUS";
  createdAt: number;
  startedAt?: number | null;
  finishedAt?: number | null;
  durationMs?: number;
}

export interface Token {
  id: string;
  type: "runner" | "mcp";
  name: string;
  scopes: string[];
  createdAt: number;
  lastUsedAt?: number | null;
  expiresAt?: number | null;
  revokedAt?: number | null;
}

export interface RunnerInfo {
  id: string;
  name: string;
  status: "online" | "offline" | "busy";
  platform: string;
  arch: string;
  version: string;
  capabilities: {
    filesystem: boolean;
    shell: boolean;
    git: boolean;
    build: boolean;
    test: boolean;
    docker: boolean;
  };
  connectedAt?: number;
  lastSeenAt?: number;
}

export interface AuditEvent {
  id: string;
  timestamp: string;
  event: string;
  principalId?: string;
  authType?: string;
  toolName: string;
  projectId?: string;
  runnerId?: string;
  durationMs?: number;
  resultStatus?: "success" | "error";
  errorCode?: string;
}

export interface DesktopHealthStatus {
  ready: boolean;
  version: string;
  platform: string;
  bundled_runtime: boolean;
  server_running: boolean;
  runner_running: boolean;
  startup_error: string | null;
}
