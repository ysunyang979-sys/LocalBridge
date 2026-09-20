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
  state: "queued" | "running" | "succeeded" | "failed" | "cancelled" | "timed_out" | "timed-out" | "interrupted";
  risk?: "SAFE" | "CAUTION" | "DANGEROUS";
  commandKind?: string;
  createdAt: number;
  queuedAt?: number | null;
  startedAt?: number | null;
  finishedAt?: number | null;
  exitCode?: number | null;
  signal?: string | null;
  durationMs?: number;
  outputTruncated?: boolean;
  error?: string;
  errorCode?: string;
}

export interface JobLogChunk {
  seq: number;
  stream: "stdout" | "stderr";
  timestamp: number;
  text: string;
}

export interface JobLogsResult {
  jobId: string;
  chunks: JobLogChunk[];
  nextCursor: string | null;
  truncated: boolean;
  droppedBytes: number;
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
  relativePath?: string;
  durationMs?: number;
  resultStatus?: "success" | "error";
  errorCode?: string;
  decisionSource?: string;
  policyLevel?: string;
  actorDisplayName?: string;
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

export type ProjectTrustLevel =
  | "standard"
  | "session-trusted"
  | "full-project-trust"
  | "custom";

export type FileActionPolicy = "allow" | "ask" | "deny";
export type CommandActionPolicy = "allow" | "ask" | "controlled" | "deny";
export type ProtectedFilesPolicy = "always-ask" | "deny" | "follow-policy";

export interface ProjectCustomRules {
  files?: {
    read?: FileActionPolicy;
    create?: FileActionPolicy;
    write?: FileActionPolicy;
    patch?: FileActionPolicy;
    delete?: FileActionPolicy;
    rename?: FileActionPolicy;
  };
  git?: {
    status?: FileActionPolicy;
    diff?: FileActionPolicy;
    log?: FileActionPolicy;
    stage?: FileActionPolicy;
    unstage?: FileActionPolicy;
    commit?: FileActionPolicy;
    createBranch?: FileActionPolicy;
    switchBranch?: FileActionPolicy;
    restore?: FileActionPolicy;
  };
  commands?: {
    inspect?: FileActionPolicy;
    test?: FileActionPolicy;
    lint?: FileActionPolicy;
    typecheck?: FileActionPolicy;
    build?: FileActionPolicy;
    devServer?: FileActionPolicy;
    packageScript?: FileActionPolicy;
    packageInstall?: FileActionPolicy;
    gitRead?: FileActionPolicy;
    customSafe?: FileActionPolicy;
    controlledCommand?: FileActionPolicy;
  };
}

export interface ProjectTrustPolicy {
  trustLevel: ProjectTrustLevel;
  filePolicy?: FileActionPolicy;
  commandPolicy: CommandActionPolicy;
  protectedFilesPolicy: ProtectedFilesPolicy;
  customRules?: ProjectCustomRules;
  updatedAt?: number;
}

