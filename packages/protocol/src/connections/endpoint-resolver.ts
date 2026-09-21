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
    const rawId = tunnelStatus.tunnel_id ? tunnelStatus.tunnel_id.trim() : "";

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
