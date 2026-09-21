import type {
  AIClientType,
  AIConnectionCategory,
  AIConnectionStatus,
  AIConnectionTransport,
  AIConnectionDto,
} from "../../types.js";
import { RemoteMcpEndpointResolver } from "../../types.js";

export type QuickActionType = "tunnel" | "kimi-plugin" | "apply-config" | "api-key" | "details";

export type ConnectionViewModel =
  | {
      source: "builtin";
      id: string;
      catalogId: string;
      savedConnectionId?: string;
      name: string;
      category: AIConnectionCategory;
      clientType: AIClientType;
      status: AIConnectionStatus;
      transport: AIConnectionTransport;
      endpoint: string;
      scopes: string[];
      toolCount: number;
      toolsCount: number;
      quickActionType?: QuickActionType;
      isPrimary: boolean;
      isDetected: boolean;
      detectedConfigPath?: string | null;
      tokenMasked?: string | null;
      maskedToken?: string | null;
      tokenId?: string | null;
      latencyMs?: number | null;
      lastError?: string | null;
      lastSeen?: string | null;
      lastSeenAt?: number | null;
      lastConnectedAt?: number | null;
      metadata: Record<string, any>;
      isAdvancedOnly?: boolean;
    }
  | {
      source: "saved";
      id: string;
      savedConnectionId: string;
      catalogId?: string;
      name: string;
      category: AIConnectionCategory;
      clientType: AIClientType;
      status: AIConnectionStatus;
      transport: AIConnectionTransport;
      endpoint: string;
      scopes: string[];
      toolCount: number;
      toolsCount: number;
      quickActionType?: QuickActionType;
      isPrimary: boolean;
      isDetected: boolean;
      detectedConfigPath?: string | null;
      tokenMasked?: string | null;
      maskedToken?: string | null;
      tokenId?: string | null;
      latencyMs?: number | null;
      lastError?: string | null;
      lastSeen?: string | null;
      lastSeenAt?: number | null;
      lastConnectedAt?: number | null;
      metadata: Record<string, any>;
      isAdvancedOnly?: boolean;
    };

/**
 * Defensively resolves and validates any AIConnectionDto or catalog entry into a safe,
 * guaranteed non-null ConnectionViewModel without risk of `undefined.xxx` property access crashes.
 */
export function resolveConnectionViewModel(
  conn: Partial<AIConnectionDto> | null | undefined,
  tunnelStatus?: { status?: string; tunnel_id?: string | null; configured?: boolean } | null
): ConnectionViewModel | null {
  if (!conn || typeof conn !== "object") {
    return null;
  }

  const id = conn.id ? String(conn.id) : "unknown";
  const clientType = (conn.clientType || "custom-mcp") as AIClientType;
  const name = conn.name ? String(conn.name) : (id === "unknown" ? "Unknown Client" : id);
  const category = (conn.category || "native-mcp") as AIConnectionCategory;
  const transport = (conn.transport || "http") as AIConnectionTransport;

  // Determine source
  const hasSavedState = Boolean(
    conn.tokenId || (conn as any).savedConnectionId || (conn as any).source === "saved"
  );
  const isPureCatalog =
    !hasSavedState &&
    (id.startsWith("conn_") || id.startsWith("builtin-")) &&
    [
      "chatgpt",
      "kimi-web",
      "kimi",
      "claude",
      "gemini",
      "deepseek",
      "custom-openai",
    ].includes(clientType);

  const source: "builtin" | "saved" = isPureCatalog ? "builtin" : "saved";

  // Safely sanitize scopes
  let safeScopes: string[] = [];
  if (Array.isArray(conn.scopes)) {
    safeScopes = conn.scopes.filter((s): s is string => typeof s === "string");
  }

  // Defensively resolve endpoint
  let safeEndpoint = conn.endpoint ? String(conn.endpoint) : "";
  if (clientType === "kimi-web") {
    const resolved = RemoteMcpEndpointResolver.resolve(tunnelStatus);
    safeEndpoint = resolved.endpoint || "";
  }

  // Defensively resolve status semantics:
  // - "connected": tested and active
  // - "configured": has saved credentials/tokens/configs, but not actively verified
  // - "detected": client local config file found on host (Claude, Gemini, etc.)
  // - "not_configured": default catalog state without active credentials
  // - "offline": tunnel or server unreachable
  // - "error": diagnostic failure
  let resolvedStatus: AIConnectionStatus = (conn.status as AIConnectionStatus) || "not_configured";

  if (clientType === "chatgpt") {
    if (tunnelStatus?.status === "Connected") {
      resolvedStatus = "connected";
    } else if (resolvedStatus === "connected") {
      resolvedStatus = "offline";
    }
  } else if (clientType === "kimi-web") {
    const isTunnelOnline = tunnelStatus?.status === "Connected";
    if (!isTunnelOnline) {
      if (resolvedStatus === "connected") {
        resolvedStatus = "offline";
      }
    } else {
      if (conn.status === "connected") {
        resolvedStatus = "connected";
      } else if (conn.tokenId) {
        resolvedStatus = "configured";
      } else {
        resolvedStatus = "not_configured";
      }
    }
  } else if (clientType === "deepseek" || clientType === "custom-openai") {
    const hasCustomConfig = Boolean(
      conn.metadata?.hasApiKey ||
      (conn.metadata?.apiKeyMasked && conn.metadata?.apiKeyMasked !== "") ||
      conn.tokenId
    );
    if (!hasCustomConfig && resolvedStatus === "configured") {
      resolvedStatus = "not_configured";
    }
  }

  const safeMetadata: Record<string, any> =
    conn.metadata && typeof conn.metadata === "object" ? { ...conn.metadata } : {};

  const rawToken = conn.tokenMasked || conn.tokenId || null;
  const maskedToken = rawToken
    ? (rawToken.length > 10 ? `${rawToken.slice(0, 7)}••••${rawToken.slice(-4)}` : "••••••••")
    : null;

  const count = typeof conn.toolCount === "number" ? conn.toolCount : ((conn as any).toolsCount ?? (id === "unknown" ? 0 : 55));

  const quickActionType: QuickActionType =
    (conn as any).quickActionType ||
    (clientType === "kimi-web"
      ? "kimi-plugin"
      : clientType === "chatgpt"
      ? "tunnel"
      : clientType === "claude" || clientType === "gemini" || clientType === "kimi"
      ? "apply-config"
      : clientType === "deepseek" || clientType === "custom-openai"
      ? "api-key"
      : "details");

  const lastSeen =
    (conn as any).lastSeen ||
    (conn.lastSeenAt ? new Date(conn.lastSeenAt).toISOString() : null);

  const common = {
    id,
    name,
    category,
    clientType,
    status: resolvedStatus,
    transport,
    endpoint: safeEndpoint,
    scopes: safeScopes,
    toolCount: count,
    toolsCount: count,
    quickActionType,
    isPrimary: Boolean(conn.isPrimary),
    isDetected: Boolean(conn.isDetected),
    detectedConfigPath: conn.detectedConfigPath || null,
    tokenMasked: maskedToken,
    maskedToken,
    tokenId: conn.tokenId || null,
    latencyMs: typeof conn.latencyMs === "number" ? conn.latencyMs : null,
    lastError: conn.lastError ? String(conn.lastError) : null,
    lastSeen,
    lastSeenAt: typeof conn.lastSeenAt === "number" ? conn.lastSeenAt : null,
    lastConnectedAt: typeof conn.lastConnectedAt === "number" ? conn.lastConnectedAt : null,
    metadata: safeMetadata,
    isAdvancedOnly: Boolean(safeMetadata.isAdvancedOnly),
  };

  if (source === "builtin") {
    return {
      ...common,
      source: "builtin",
      catalogId: id,
      savedConnectionId: undefined,
    };
  } else {
    return {
      ...common,
      source: "saved",
      savedConnectionId: id,
      catalogId: (safeMetadata.catalogId as string | undefined) || id,
    };
  }
}
