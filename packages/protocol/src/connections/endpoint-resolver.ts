export interface RemoteMcpEndpointResult {
  isAvailable: boolean;
  endpoint: string | null;
  baseHost: string | null;
  status: "connected" | "offline" | "not_configured";
  statusTextZh: string;
  statusTextEn: string;
  requiresTunnel: boolean;
}

export interface McpClientSnippet {
  mcpServers: {
    nexus: {
      url: string;
      headers: {
        Authorization: string;
      };
    };
  };
}

export interface RemoteMcpEndpointInput {
  status?: string | null;
  tunnel_id?: string | null;
  tunnelId?: string | null;
  configured?: boolean;
  public_hostname?: string | null;
  publicHostname?: string | null;
  public_base_url?: string | null;
  publicBaseUrl?: string | null;
  mcp_endpoint?: string | null;
  mcpEndpoint?: string | null;
  tunnel_url?: string | null;
  tunnelUrl?: string | null;
  publicHost?: string | null;
  publicHttpsUrl?: string | null;
}

export class RemoteMcpEndpointResolver {
  /**
   * Resolves the real public HTTPS MCP endpoint from current tunnel state.
   * If Tunnel is not connected or public endpoint is not configured, returns isAvailable: false, endpoint: null.
   * NEVER returns placeholder strings, and NEVER synthesizes non-existent domains (*.nexus.localbridge.dev).
   */
  static resolve(
    tunnelStatus?: RemoteMcpEndpointInput | null
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
    const isNotConfigured =
      tunnelStatus.configured === false || tunnelStatus.status === "NotConfigured";

    if (!isConnected) {
      return {
        isAvailable: false,
        endpoint: null,
        baseHost: null,
        status: isNotConfigured ? "not_configured" : "offline",
        statusTextZh: isNotConfigured ? "公网端点未配置" : "安全隧道未连接",
        statusTextEn: isNotConfigured ? "Public endpoint not configured" : "Secure Tunnel is offline",
        requiresTunnel: true,
      };
    }

    // Check candidate sources for real public hostname/endpoint
    const explicitEndpoint = (
      tunnelStatus.mcp_endpoint ||
      tunnelStatus.mcpEndpoint ||
      ""
    ).trim();

    const explicitBaseUrl = (
      tunnelStatus.public_base_url ||
      tunnelStatus.publicBaseUrl ||
      tunnelStatus.tunnel_url ||
      tunnelStatus.tunnelUrl ||
      tunnelStatus.publicHttpsUrl ||
      ""
    ).trim();

    const explicitHostname = (
      tunnelStatus.public_hostname ||
      tunnelStatus.publicHostname ||
      tunnelStatus.publicHost ||
      ""
    ).trim();

    let origin = "";

    if (explicitEndpoint) {
      if (explicitEndpoint.startsWith("https://") || explicitEndpoint.startsWith("http://")) {
        try {
          const url = new URL(explicitEndpoint);
          if (this.isValidPublicHostname(url.hostname)) {
            return {
              isAvailable: true,
              endpoint: explicitEndpoint,
              baseHost: url.host,
              status: "connected",
              statusTextZh: "已连接",
              statusTextEn: "Connected",
              requiresTunnel: false,
            };
          }
        } catch {}
      }
    }

    if (explicitBaseUrl) {
      try {
        const u = new URL(explicitBaseUrl.startsWith("http") ? explicitBaseUrl : `https://${explicitBaseUrl}`);
        if (this.isValidPublicHostname(u.hostname)) {
          origin = u.origin;
        }
      } catch {}
    }

    if (!origin && explicitHostname) {
      let cleanHost = explicitHostname.replace(/\/+$/, "").replace(/^https?:\/\//, "");
      if (cleanHost.endsWith("/mcp")) cleanHost = cleanHost.slice(0, -4);
      if (this.isValidPublicHostname(cleanHost)) {
        origin = `https://${cleanHost}`;
      }
    }

    // If only tunnel_id is provided, check if it's already a full valid public URL.
    // If it's an internal ID (starts with "tunnel_" or UUID), strictly do NOT synthesize fake domain.
    if (!origin && tunnelStatus.tunnel_id) {
      const rawId = tunnelStatus.tunnel_id.trim();
      if (rawId.startsWith("https://") || rawId.startsWith("http://")) {
        try {
          const u = new URL(rawId);
          if (this.isValidPublicHostname(u.hostname)) {
            origin = u.origin;
          }
        } catch {}
      }
    }

    if (!origin) {
      return {
        isAvailable: false,
        endpoint: null,
        baseHost: null,
        status: "not_configured",
        statusTextZh: "公网端点未配置 (请配置 Cloudflare 域名或 Quick Tunnel)",
        statusTextEn: "Public endpoint not configured (Configure domain or Quick Tunnel)",
        requiresTunnel: true,
      };
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
   * Validates that a hostname is a genuine public hostname,
   * rejecting fake domains (like *.nexus.localbridge.dev), tunnel IDs, or bare UUIDs.
   */
  public static isValidPublicHostname(hostname: string): boolean {
    if (!hostname) return false;
    const h = hostname.toLowerCase().trim();
    if (h === "localhost" || h === "127.0.0.1") return false;
    if (h.endsWith("nexus.localbridge.dev") || h.endsWith("localbridge.dev")) return false;
    if (h.startsWith("tunnel_")) return false;
    // Disallow bare UUIDs as hostnames
    if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(h)) return false;
    // Must contain at least one dot
    if (!h.includes(".")) return false;
    return true;
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
