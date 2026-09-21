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

export interface LspServerStatus {
  projectId: string;
  language: string;
  serverKind: string;
  status: "ready" | "starting" | "unavailable" | "error" | "stopped";
  pid?: number;
  startedAt?: number;
  restartCount: number;
  lastError?: string;
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

export type ApprovalRoutingMode = "chat" | "auto-trusted" | "desktop" | "hybrid";

export interface Approval {
  id: string;
  projectId: string;
  operation: string;
  policy?: string;
  risk: "CAUTION" | "DANGEROUS";
  summary: string;
  payloadHash: string;
  createdAt: number;
  expiresAt: number;
  status: "pending" | "approved" | "denied" | "expired" | "consumed";
  resolvedAt?: number | null;
  resolvedBy?: string | null;
  decisionSource?: string | null;
  advice?: DecisionAdvice | null;
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

export type WorkflowSessionState = "active" | "completed" | "abandoned";
export type WorkflowSessionEventKind =
  | "session_started"
  | "session_checkpoint"
  | "session_finished"
  | "file_operation"
  | "git_operation"
  | "command_execution"
  | "job_lifecycle"
  | "approval_decision"
  | "lsp_impact"
  | "security_event";

export type ResolvedWorkspace =
  | {
      mode: "primary";
      projectRoot: string;
    }
  | {
      mode: "worktree";
      worktreeId: string;
      worktreeRoot: string;
      branchName: string;
      baseBranch?: string;
      baseCommit?: string;
      headCommit?: string;
      isClean?: boolean;
    };

export interface WorkflowSession {
  id: string;
  projectId: string;
  state: WorkflowSessionState;
  title: string | null;
  goals: string[];
  checkpointCount: number;
  eventCount: number;
  startedAt: number;
  lastActiveAt: number;
  finishedAt: number | null;
  finishReason: string | null;
  finishNotes: string | null;
  workspace?: ResolvedWorkspace;
}

export interface WorkflowCheckpoint {
  id: string;
  sessionId: string;
  checkpointNumber: number;
  summary: string;
  nextSteps: string[];
  blockers: string[];
  createdAt: number;
}

export interface WorkflowSessionEvent {
  id: string;
  sessionId: string;
  eventNumber: number;
  kind: WorkflowSessionEventKind;
  operation: string;
  status: "success" | "failure" | "pending";
  target: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: number;
}

export interface WorkflowHandoffPacket {
  version: "1.0.0";
  session: {
    id: string;
    projectId: string;
    projectName: string;
    state: WorkflowSessionState;
    title: string | null;
    goals: string[];
    startedAt: number;
    lastActiveAt: number;
    finishedAt: number | null;
    finishReason: string | null;
    finishNotes: string | null;
  };
  workspace?: ResolvedWorkspace;
  latestCheckpoint: WorkflowCheckpoint | null;
  recentCheckpoints: WorkflowCheckpoint[];
  currentStatus: {
    git: {
      branch: string | null;
      dirty: boolean;
      modifiedFiles: string[];
      untrackedFiles: string[];
      stagedFiles: string[];
    };
    activeJobs: {
      jobId: string;
      commandKind: string;
      startedAt: number;
    }[];
    pendingApprovals: {
      id: string;
      operation: string;
      risk: string;
      createdAt: number;
    }[];
  };
  touchedFiles: {
    path: string;
    operationCount: number;
    lastOperation: string;
    lastTouchedAt: number;
  }[];
  recentEvents: {
    eventNumber: number;
    kind: WorkflowSessionEventKind;
    operation: string;
    status: string;
    target: string | null;
    createdAt: number;
  }[];
  runtimes?: {
    active: {
      runtimeId: string;
      name?: string;
      state: string;
      generation: number;
      kind: string;
    }[];
    recent?: {
      runtimeId: string;
      name?: string;
      state: string;
      generation: number;
      kind: string;
    }[];
  };
  continuationPrompt: string;
}

export type RuntimeState =
  | "starting"
  | "running"
  | "stopping"
  | "stopped"
  | "failed"
  | "interrupted";

export interface PersistentRuntime {
  runtimeId: string;
  name?: string;
  state: RuntimeState;
  processState?: RuntimeState;
  listeningPorts?: number[];
  generation: number;
  projectId: string;
  sessionId?: string;
  worktreeId?: string;
  kind: "package-script" | "registered-command";
  commandCategory: string;
  workspaceMode: "direct" | "managed-worktree";
  startedAt?: number | null;
  stoppedAt?: number | null;
  uptimeMs?: number;
  pid?: number | null;
  exitCode?: number | null;
  signal?: string | null;
  restartCount: number;
  lastErrorCode?: string | null;
  lastError?: string | null;
  outputTruncated?: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface RuntimeLogChunk {
  seq: number;
  stream: "stdout" | "stderr";
  timestamp: number;
  text: string;
  generation?: number;
}

export type {
  TunnelNetworkMode,
  TunnelSaveConfigInput,
  TunnelTestConnectionParams,
  TunnelTestConnectionResult,
  TunnelStatusDto,
} from "./api/bridge.js";

export interface DecisionContext {
  operation: string;
  toolName?: string;
  projectId?: string;
  projectName?: string;
  accessMode?: "read-only" | "read-write";
  executionMode?: "disabled" | "safe-only" | "project-code" | "full-system";
  trustLevel?: "standard" | "session-trusted" | "full-project-trust" | "custom";
  pathType?: "relative" | "absolute" | "system" | "protected";
  command?: string;
  args?: string[];
  protectedResource?: boolean;
  currentPolicyDecision?: "allow" | "ask" | "deny";
  locale?: string;
  [key: string]: unknown;
}

export interface DecisionAdvice {
  provider: "laya" | "disabled" | string;
  risk: {
    label: "low" | "medium" | "high" | "critical";
    confidence: number;
  };
  approval: {
    recommended: boolean;
    confidence: number;
  };
  category: string | null;
  routing: {
    suggestedTool?: string;
    suggestedSkill?: string;
  };
  reasoningTags: string[];
  latencyMs: number;
  model: string;
  advisoryOnly: true;
}

export type DecisionProviderType = "disabled" | "laya";

export type IntelligenceWorkerStatus =
  | "disabled"
  | "loading"
  | "ready"
  | "offline"
  | "error";

export interface DecisionProviderConfig {
  provider: DecisionProviderType;
  modelPath: string;
  pythonPath: string;
  workerTimeoutMs?: number;
}

export interface IntelligenceStatusDto {
  provider: DecisionProviderType;
  status: IntelligenceWorkerStatus;
  model: string;
  execution: "local";
  latencyMs?: number;
  inferenceTimeMs?: number;
  language: string;
  modelPath: string;
  pythonPath: string;
  lastError?: string | null;
}

export type UserExperienceMode = "standard" | "advanced";

export type ModelDownloadStatus =
  | "not-installed"
  | "downloading"
  | "verifying"
  | "ready"
  | "offline"
  | "error";

export interface ModelDownloadProgress {
  totalBytes: number;
  downloadedBytes: number;
  percent: number;
  speedBytesPerSec: number;
  currentFile: string;
}

export interface ModelStatusDto {
  installed: boolean;
  status: ModelDownloadStatus;
  modelPath: string;
  progress: ModelDownloadProgress | null;
  error: string | null;
}

export interface ModelDownloadOptions {
  proxyMode?: "direct" | "system" | "custom";
  customProxyUrl?: string;
}

export interface ModelValidationResult {
  valid: boolean;
  modelPath: string;
  missingFiles: string[];
  totalBytes: number;
  error: string | null;
}

export interface ModelImportOptions {
  sourceDir: string;
  copyToManaged?: boolean;
}



