import { z } from "zod";

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

// Laya MCP Bridge DTOs
export interface LayaMcpStatusResult {
  enabled: boolean;
  provider: string;
  workerReady: boolean;
  modelLoaded: boolean;
  inferenceReady: boolean;
  modelPathConfigured: boolean;
  lastInferenceAt: string | null;
  lastInferenceLatencyMs: number | null;
}

export const LayaMcpStatusParamsSchema = z.object({});

export const LayaMcpAssessParamsSchema = z.object({
  projectId: z.string().optional(),
  operation: z.string().min(1, "operation is required"),
  target: z.string().optional(),
  command: z.string().optional(),
  description: z.string().optional(),
  skillId: z.string().optional(),
  context: z.string().optional(),
});

export interface LayaMcpAssessParams {
  projectId?: string;
  operation: string;
  target?: string;
  command?: string;
  description?: string;
  skillId?: string;
  context?: string;
}

export interface LayaMcpAssessResult {
  risk: "low" | "medium" | "high" | "critical";
  recommendation: "approve" | "review" | "deny";
  confidence: number;
  category: string;
  reason: string;
  providerUsed: string;
  fallbackUsed: boolean;
  workerReady: boolean;
  modelLoaded: boolean;
  inferenceExecuted: boolean;
  inferenceLatencyMs?: number;
  suggestedSkill?: string;
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
