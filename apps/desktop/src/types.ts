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
  clientId?: string | null;
  clientType?: string | null;
  clientName?: string | null;
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

  // Real inference & telemetry fields
  providerUsed?: "laya" | "disabled" | string;
  fallbackUsed?: boolean;
  workerReady?: boolean;
  modelLoaded?: boolean;
  inferenceExecuted?: boolean;
}

export type DecisionProviderType = "disabled" | "laya";

export type IntelligenceWorkerStatus =
  | "disabled"
  | "starting"
  | "loading"
  | "ready"
  | "offline"
  | "error";

export interface DecisionProviderConfig {
  provider: DecisionProviderType;
  modelPath: string;
  pythonPath: string;
  workerTimeoutMs?: number;
  startupTimeoutMs?: number;
  inferenceTimeoutMs?: number;
  developerOverride?: boolean;
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

  // Real Worker & Runtime Telemetry
  runtimeType?: "managed" | "developer-override" | "system";
  workerStatus?: "running" | "stopped" | "starting" | "error";
  modelLoaded?: boolean;
  providerClass?: "LayaDecisionProvider" | "DisabledDecisionProvider";
  inferenceReady?: boolean;
  developerOverride?: boolean;
  warmInferenceMs?: number | null;
  startupTimeoutMs?: number;
  inferenceTimeoutMs?: number;
  lastInferenceAt?: string | null;
  lastInferenceLatencyMs?: number | null;
  recentInference?: LayaRecentInferenceDto | null;
}

export interface LayaRecentInferenceDto {
  source: "chatgpt" | "nexus_internal";
  operation: string;
  target?: string;
  risk: "low" | "medium" | "high" | "critical";
  recommendation: "approve" | "review" | "deny";
  confidence: number;
  providerUsed: string;
  fallbackUsed: boolean;
  inferenceExecuted: boolean;
  latencyMs: number;
  timestamp: string;
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

import type {
  RemoteMcpEndpointResult,
  McpClientSnippet,
} from "@localbridge/protocol";

export type {
  AIClientType,
  AIConnectionCategory,
  AIConnectionStatus,
  AIConnectionTransport,
  AIConnectionDto,
  AIConnectionConfig,
  ConnectionHealthDto,
  TestConnectionResult,
  ClientAuditSource,
  RemoteMcpEndpointResult,
  McpClientSnippet,
} from "@localbridge/protocol";

export class RemoteMcpEndpointResolver {
  /**
   * Resolves the real public HTTPS MCP endpoint from current tunnel state.
   * If Tunnel is not connected or tunnel_id is missing, returns isAvailable: false, endpoint: null.
   * NEVER returns placeholder strings like '<nexus-tunnel-host>', localhost, or 127.0.0.1.
   */
  static resolve(
    tunnelStatus?: {
      status?: string;
      tunnel_id?: string | null;
      configured?: boolean;
    } | null
  ): RemoteMcpEndpointResult {
    if (!tunnelStatus) {
      return {
        isAvailable: false,
        endpoint: null,
        baseHost: null,
        status: "offline",
        statusTextZh: "安全隧道未连接",
        statusTextEn: "Secure Tunnel is offline",
        requiresTunnel: true,
      };
    }

    const isConnected =
      tunnelStatus.status === "Connected" || tunnelStatus.status === "connected";
    const rawId = (
      tunnelStatus.tunnel_id ||
      (tunnelStatus as any).tunnelId ||
      (tunnelStatus as any).publicHost ||
      (tunnelStatus as any).publicHttpsUrl ||
      ""
    ).trim();

    if (!isConnected || !rawId) {
      const isNotConfigured =
        tunnelStatus.configured === false || tunnelStatus.status === "NotConfigured";
      return {
        isAvailable: false,
        endpoint: null,
        baseHost: null,
        status: isNotConfigured ? "not_configured" : "offline",
        statusTextZh: "安全隧道未连接",
        statusTextEn: "Secure Tunnel is offline",
        requiresTunnel: true,
      };
    }

    // Process valid tunnel_id
    let base = rawId.replace(/\/+$/, "");
    if (base.endsWith("/mcp")) {
      base = base.slice(0, -4);
    }

    let origin = "";
    if (base.startsWith("https://")) {
      origin = base;
    } else if (base.startsWith("http://")) {
      origin = base.replace(/^http:\/\//, "https://");
    } else if (base.includes(".")) {
      origin = `https://${base}`;
    } else {
      origin = `https://${base}.nexus.localbridge.dev`;
    }

    const endpoint = `${origin}/mcp`;
    const baseHost = origin.replace(/^https?:\/\//, "");

    return {
      isAvailable: true,
      endpoint,
      baseHost,
      status: "connected",
      statusTextZh: "已连接",
      statusTextEn: "Connected",
      requiresTunnel: false,
    };
  }

  /**
   * Generates MCP client configuration snippet.
   * Returns null if Tunnel is not connected and real endpoint is unavailable.
   */
  static generateSnippet(
    tunnelStatus?: { status?: string; tunnel_id?: string | null; configured?: boolean } | null,
    tokenMasked?: string | null
  ): McpClientSnippet | null {
    const res = RemoteMcpEndpointResolver.resolve(tunnelStatus);
    if (!res.isAvailable || !res.endpoint) {
      return null;
    }

    return {
      mcpServers: {
        nexus: {
          url: res.endpoint,
          headers: {
            Authorization: `Bearer ${tokenMasked || "YOUR_NEXUS_TOKEN"}`,
          },
        },
      },
    };
  }
}

// Full Control Mode types
export type FullControlScope = "current-project" | "device";

export interface FullControlSession {
  id: string;
  clientId: string;
  clientName?: string;
  scope: FullControlScope;
  projectId?: string;
  projectName?: string;
  startedAt: number;
  expiresAt: number;
  reason?: string;
  operatorConfirmedAt: number;
  active: boolean;
}

export interface StartFullControlParams {
  clientId: string;
  scope: FullControlScope;
  projectId?: string;
  durationMinutes?: number;
  reason?: string;
  confirmedDeviceFullControl?: boolean;
}

export interface StopFullControlParams {
  sessionId?: string;
  clientId?: string;
}

export interface FullControlStatusDto {
  enabled: boolean;
  activeSession: FullControlSession | null;
  allSessions: FullControlSession[];
}

// Nexus Skills types
export type SkillSource = "builtin" | "user" | "project";
export type SkillRisk = "low" | "medium" | "high";
export type SkillCategory =
  | "inspection"
  | "debugging"
  | "testing"
  | "refactoring"
  | "review"
  | "runtime"
  | "maintenance"
  | "general";

export type SkillValidationStatus = "valid" | "invalid" | "conflict" | "warning";

export interface SkillMetadata {
  id: string;
  version: string | number;
  name: Record<string, string>;
  description: Record<string, string>;
  category: SkillCategory;
  risk: SkillRisk;
  triggers: string[];
  tools: string[];
  workflow: string[];
  enabled: boolean;
  source: SkillSource;
  sourcePath?: string;
  projectId?: string;
  validationStatus?: SkillValidationStatus;
  validationErrors?: string[];
  securityWarning?: string;
}

export interface SkillDefinition extends SkillMetadata {
  instructions: string;
}

export interface SkillMatchResult {
  skill: SkillMetadata | null;
  confidence: number;
  reason: string;
}

export interface SkillListFilter {
  projectId?: string;
  category?: string;
  source?: SkillSource;
  enabledOnly?: boolean;
}

export interface SkillImportPreview {
  valid: boolean;
  id: string;
  version: string | number;
  name: Record<string, string>;
  description: Record<string, string>;
  category: SkillCategory;
  risk: SkillRisk;
  toolsCount: number;
  workflowStepsCount: number;
  tools: string[];
  workflow: string[];
  triggers: string[];
  validationStatus: SkillValidationStatus;
  validationErrors: string[];
  securityWarning?: string;
  hasConflict: boolean;
  existingVersion?: string | number;
  existingSource?: SkillSource;
  isBuiltinConflict: boolean;
  executableFilesFound?: string[];
  rawYaml?: string;
  markdownContent?: string;
}

export interface SkillImportParams {
  sourceType: "folder" | "zip";
  sourcePath?: string;
  zipBase64?: string;
  target: "user" | "project";
  projectId?: string;
  projectRoot?: string;
  overwrite?: boolean;
}

export interface SkillImportResult {
  success: boolean;
  skill?: SkillMetadata;
  error?: string;
  validationErrors?: string[];
}

export interface SkillDeleteResult {
  success: boolean;
  skillId: string;
  removedPath?: string;
  error?: string;
}

export interface SkillRawContentResult {
  skillId: string;
  rawYaml: string;
  markdownContent: string;
}


