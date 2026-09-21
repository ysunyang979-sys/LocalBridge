import type { AIConnectionDto } from "../../types.js";

export interface BuiltinCatalogEntry extends AIConnectionDto {
  descriptionZh: string;
  descriptionEn: string;
  quickActionType: "tunnel" | "kimi-plugin" | "apply-config" | "api-key" | "details";
  isAdvancedOnly?: boolean;
}

export function resolveTunnelEndpoint(
  tunnelStatus: { status?: string; tunnel_id?: string | null } | null
): string {
  if (tunnelStatus && tunnelStatus.status === "Connected" && tunnelStatus.tunnel_id) {
    const tid = tunnelStatus.tunnel_id.trim();
    if (tid.startsWith("https://") || tid.startsWith("http://")) {
      return `${tid.replace(/\/+$/, "")}/mcp`;
    }
    if (tid.includes(".")) {
      return `https://${tid.replace(/\/+$/, "")}/mcp`;
    }
    return `https://${tid}.nexus.localbridge.dev/mcp`;
  }
  return "https://<nexus-tunnel-host>/mcp";
}

export const BUILTIN_CLIENT_CATALOG: BuiltinCatalogEntry[] = [
  {
    id: "conn_chatgpt",
    clientType: "chatgpt",
    name: "ChatGPT",
    category: "native-mcp",
    status: "not_configured",
    transport: "tunnel",
    endpoint: "Secure MCP Tunnel",
    scopes: ["read", "write", "execute"],
    toolCount: 55,
    isPrimary: true,
    isDetected: false,
    isAdvancedOnly: false,
    descriptionZh: "通过 Secure MCP Tunnel 安全直连 ChatGPT，全功能本地工具沙箱与审批保护。",
    descriptionEn: "Direct connection to ChatGPT via Secure MCP Tunnel with local sandbox & approval enforcement.",
    quickActionType: "tunnel",
  },
  {
    id: "conn_kimi_web",
    clientType: "kimi-web",
    name: "Kimi Web",
    category: "native-mcp",
    status: "not_configured",
    transport: "tunnel",
    endpoint: "https://<nexus-tunnel-host>/mcp",
    scopes: ["read", "write"],
    toolCount: 55,
    isPrimary: false,
    isDetected: false,
    isAdvancedOnly: false,
    descriptionZh: "通过 Kimi 网页版插件安全连接 Nexus。",
    descriptionEn: "Securely connect to Nexus via Kimi Web plugin.",
    quickActionType: "kimi-plugin",
  },
  {
    id: "conn_claude",
    clientType: "claude",
    name: "Claude Code / Desktop",
    category: "native-mcp",
    status: "not_configured",
    transport: "http",
    endpoint: "http://127.0.0.1:18080/mcp",
    detectedConfigPath: null,
    scopes: ["read", "write", "execute"],
    toolCount: 55,
    isPrimary: false,
    isDetected: false,
    isAdvancedOnly: false,
    descriptionZh: "支持 Claude Desktop 与 Claude Code CLI，写入本地 MCP 配置即可生效。",
    descriptionEn: "Supports Claude Desktop & Claude Code CLI via local MCP configuration.",
    quickActionType: "apply-config",
  },
  {
    id: "conn_gemini",
    clientType: "gemini",
    name: "Gemini CLI",
    category: "native-mcp",
    status: "not_configured",
    transport: "http",
    endpoint: "http://127.0.0.1:18080/mcp",
    detectedConfigPath: null,
    scopes: ["read", "write", "execute"],
    toolCount: 55,
    isPrimary: false,
    isDetected: false,
    isAdvancedOnly: false,
    descriptionZh: "Google Gemini 命令行工具，通过 ~/.gemini/settings.json 建立 MCP 通信。",
    descriptionEn: "Google Gemini CLI via ~/.gemini/settings.json MCP configuration.",
    quickActionType: "apply-config",
  },
  {
    id: "conn_deepseek",
    clientType: "deepseek",
    name: "DeepSeek",
    category: "tool-adapter",
    status: "not_configured",
    transport: "http",
    endpoint: "https://api.deepseek.com",
    scopes: ["read", "write"],
    toolCount: 55,
    isPrimary: false,
    isDetected: false,
    isAdvancedOnly: false,
    metadata: {
      baseUrl: "https://api.deepseek.com",
      model: "deepseek-chat",
      apiFormat: "openai-compatible",
    },
    descriptionZh: "深度求索 API 模型，使用 Function Calling 适配器映射本地工具并统一执行安全策略。",
    descriptionEn: "DeepSeek API model using Function Calling adapter with full Nexus security enforcement.",
    quickActionType: "api-key",
  },
  {
    id: "conn_openai_compat",
    clientType: "custom-openai",
    name: "OpenAI-compatible",
    category: "tool-adapter",
    status: "not_configured",
    transport: "http",
    endpoint: "https://api.openai.com/v1",
    scopes: ["read", "write"],
    toolCount: 55,
    isPrimary: false,
    isDetected: false,
    isAdvancedOnly: false,
    metadata: {
      baseUrl: "https://api.openai.com/v1",
      model: "gpt-4o",
      apiFormat: "openai-compatible",
    },
    descriptionZh: "通用 OpenAI 格式模型端点，适配第三方商用模型或本地 Ollama/vLLM 服务。",
    descriptionEn: "Generic OpenAI-compatible endpoint for third-party or local Ollama/vLLM services.",
    quickActionType: "api-key",
  },
  {
    id: "conn_kimi",
    clientType: "kimi",
    name: "Kimi Code",
    category: "native-mcp",
    status: "not_configured",
    transport: "http",
    endpoint: "http://127.0.0.1:18080/mcp",
    detectedConfigPath: null,
    scopes: ["read", "write", "execute"],
    toolCount: 55,
    isPrimary: false,
    isDetected: false,
    isAdvancedOnly: true,
    descriptionZh: "Kimi Code 开发者命令行与本地客户端，通过 ~/.kimi-code/mcp.json 接入。",
    descriptionEn: "Kimi Code developer CLI & local client connecting via ~/.kimi-code/mcp.json.",
    quickActionType: "apply-config",
  },
];

export function mergeCatalogWithSavedConnections(
  catalog: BuiltinCatalogEntry[],
  savedConnections: AIConnectionDto[],
  tunnelStatus: { status?: string; latencyMs?: number; tunnel_id?: string | null } | null
): AIConnectionDto[] {
  const merged: AIConnectionDto[] = [];
  const handledSavedIds = new Set<string>();

  // 1. Process catalog items
  for (const item of catalog) {
    const saved = savedConnections.find((s) => {
      if (s.id === item.id) return true;
      if (
        ["chatgpt", "kimi-web", "kimi", "claude", "gemini", "deepseek"].includes(item.clientType) &&
        s.clientType === item.clientType
      ) {
        return true;
      }
      return false;
    });

    if (saved) {
      handledSavedIds.add(saved.id);
    }

    let resolvedStatus = saved?.status || item.status;
    let latencyMs = saved?.latencyMs ?? item.latencyMs;
    let endpoint = saved?.endpoint || item.endpoint;

    // Special ChatGPT rule: if Tunnel is connected, ChatGPT is connected!
    if (item.clientType === "chatgpt") {
      if (tunnelStatus?.status === "Connected") {
        resolvedStatus = "connected";
        latencyMs = tunnelStatus.latencyMs || 12;
      } else if (resolvedStatus === "connected" && tunnelStatus?.status !== "Connected") {
        resolvedStatus = "offline";
      }
    }

    // Special Kimi Web rule: must use public HTTPS tunnel endpoint, never 127.0.0.1
    if (item.clientType === "kimi-web") {
      const publicEndpoint = resolveTunnelEndpoint(tunnelStatus);
      endpoint = publicEndpoint;
      if (tunnelStatus?.status === "Connected") {
        if (saved?.status === "connected" || (saved?.tokenId && saved?.status === "configured")) {
          resolvedStatus = saved.status;
        } else if (saved?.tokenId) {
          resolvedStatus = "configured";
        }
      }
    }

    // Determine if primary
    const isPrimary = saved !== undefined ? Boolean(saved.isPrimary) : Boolean(item.isPrimary);

    merged.push({
      ...item,
      ...(saved || {}),
      id: saved?.id || item.id,
      name: saved?.name || item.name,
      category: item.category,
      clientType: item.clientType,
      status: resolvedStatus,
      latencyMs,
      isPrimary,
      transport: saved?.transport || item.transport,
      endpoint,
      scopes: saved?.scopes || item.scopes,
      toolCount: saved?.toolCount || item.toolCount,
      detectedConfigPath:
        saved?.detectedConfigPath !== undefined
          ? saved.detectedConfigPath
          : item.detectedConfigPath,
      isDetected: saved?.isDetected !== undefined ? saved.isDetected : item.isDetected,
      metadata: {
        ...(item.metadata || {}),
        ...(saved?.metadata || {}),
        isAdvancedOnly: item.isAdvancedOnly,
      },
    });
  }

  // 2. Append any custom connections created by the user (not in the catalog)
  for (const saved of savedConnections) {
    if (!handledSavedIds.has(saved.id)) {
      merged.push(saved);
    }
  }

  return merged;
}
