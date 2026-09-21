export type AIClientType =
  | "chatgpt"
  | "kimi-web"
  | "kimi"
  | "claude"
  | "gemini"
  | "deepseek"
  | "custom-mcp"
  | "custom-openai";

export type AIConnectionCategory = "native-mcp" | "tool-adapter";

export type AIConnectionStatus =
  | "connected"
  | "connecting"
  | "configured"
  | "not_configured"
  | "offline"
  | "error"
  | "disabled";

export type AIConnectionTransport =
  | "http"
  | "streamable-http"
  | "sse"
  | "stdio"
  | "tunnel";

export interface AIConnectionDto {
  id: string;
  clientType: AIClientType;
  name: string;
  category: AIConnectionCategory;
  status: AIConnectionStatus;
  transport: AIConnectionTransport;
  endpoint: string;
  tokenId?: string | null;
  tokenMasked?: string | null;
  scopes: string[];
  toolCount: number;
  lastSeenAt?: number | null;
  lastConnectedAt?: number | null;
  latencyMs?: number | null;
  lastError?: string | null;
  detectedConfigPath?: string | null;
  isDetected?: boolean;
  isPrimary?: boolean;
  toolAllowlist?: string[] | null;
  metadata?: Record<string, unknown>;
}

export interface AIConnectionConfig {
  id: string;
  clientType: AIClientType;
  name: string;
  category: AIConnectionCategory;
  transport: AIConnectionTransport;
  endpoint?: string;
  tokenId?: string | null;
  scopes?: string[];
  isPrimary?: boolean;
  toolAllowlist?: string[] | null;
  detectedConfigPath?: string | null;
  // API Provider specific fields
  baseUrl?: string;
  apiKey?: string; // Stored securely/encrypted, never logged
  model?: string;
  apiFormat?: "openai-compatible" | "deepseek" | "custom";
  metadata?: Record<string, unknown>;
}

export interface ConnectionHealthDto {
  id: string;
  status: AIConnectionStatus;
  lastConnectedAt: number | null;
  lastSeenAt: number | null;
  latencyMs: number | null;
  toolCount: number;
  lastError: string | null;
  authValid: boolean;
}

export interface ConfigPreviewResult {
  connectionId: string;
  clientType: AIClientType;
  configFilePath: string;
  fileExists: boolean;
  beforeContent?: string | null;
  afterContent: string;
  diffSummary: string;
}

export interface ApplyConfigResult {
  success: boolean;
  configFilePath: string;
  backupFilePath?: string;
  message: string;
}

export interface ProviderPreset {
  id: string;
  name: string;
  defaultBaseUrl: string;
  suggestedModels: string[];
  apiFormat: "openai-compatible" | "deepseek" | "custom";
}

export interface TestConnectionResult {
  success: boolean;
  stage: "auth" | "tools" | "ping" | "model";
  latencyMs: number;
  toolCount: number;
  message: string;
  error?: string;
}

export interface ClientAuditSource {
  clientId?: string | null;
  clientType?: string | null;
  clientName?: string | null;
}

export interface KimiPluginManifest {
  schema_version: string;
  name_for_human: string;
  name_for_model: string;
  description_for_human: string;
  description_for_model: string;
  auth: {
    type: "none" | "service_http" | "user_http" | "oauth";
    authorization_type?: string;
    verification_tokens?: Record<string, string>;
    instructions?: string;
  };
  api: {
    type: "mcp" | "openapi";
    url: string;
  };
  mcpServers?: Record<
    string,
    {
      url: string;
      headers?: Record<string, string>;
    }
  >;
  logo_url?: string;
  contact_email?: string;
  legal_info_url?: string;
}

export interface KimiPluginExportResult {
  success: boolean;
  exportDir: string;
  manifestPath: string;
  readmePath: string;
  manifest: KimiPluginManifest;
  readme: string;
  tunnelEndpoint: string;
}

