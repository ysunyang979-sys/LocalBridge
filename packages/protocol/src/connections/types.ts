export type AIClientType = "chatgpt";

export type AIConnectionCategory = "native-mcp" | "tool-adapter";

export type AIConnectionStatus =
  | "connected"
  | "connecting"
  | "configured"
  | "detected"
  | "auth_required"
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

export interface TestConnectionResult {
  success: boolean;
  stage: "auth" | "tools" | "ping" | "model" | "endpoint";
  latencyMs: number;
  toolCount?: number;
  message: string;
  error?: string;
  endpointReachable?: boolean;
  authValid?: boolean;
  details?: Record<string, unknown>;
}

export interface ClientAuditSource {
  clientId?: string | null;
  clientType?: string | null;
  clientName?: string | null;
}
