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
}

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

export interface ModelDownloadOptions {
  proxyMode?: "system" | "direct" | "custom";
  customProxyUrl?: string;
}

export interface ModelValidationResult {
  valid: boolean;
  modelPath: string;
  missingFiles: string[];
  totalBytes: number;
  error?: string | null;
}

export interface ModelStatusDto {
  installed: boolean;
  status: ModelDownloadStatus;
  modelPath: string;
  progress: ModelDownloadProgress | null;
  error: string | null;
}

export interface ModelImportOptions {
  sourceDir: string;
  copyToManaged?: boolean;
}


