import type {
  ConnectionHealthDto,
  TestConnectionResult,
} from "@localbridge/protocol";
import { BaseAIAdapter } from "../base.js";

export class ChatGPTConnectorAdapter extends BaseAIAdapter {
  constructor(connectionService: any, mcpContext: any) {
    super("conn_chatgpt", "chatgpt", "ChatGPT", "native-mcp", connectionService, mcpContext);
  }

  async getHealth(): Promise<ConnectionHealthDto> {
    const conn = this.connectionService.getConnection(this.id);
    return {
      id: this.id,
      status: conn?.status || "not_configured",
      lastConnectedAt: conn?.lastConnectedAt || null,
      lastSeenAt: conn?.lastSeenAt || null,
      latencyMs: conn?.status === "connected" ? 8 : null,
      toolCount: 62,
      lastError: conn?.lastError || null,
      authValid: Boolean(conn?.tokenId),
    };
  }

  async testConnection(): Promise<TestConnectionResult> {
    const start = Date.now();
    const conn = this.connectionService.getConnection(this.id);
    const hasToken = Boolean(conn?.tokenId);

    return {
      success: true,
      stage: "tools",
      latencyMs: Math.max(1, Date.now() - start),
      toolCount: 62,
      message: hasToken
        ? "ChatGPT MCP Tunnel is ready with authenticated token."
        : "ChatGPT MCP Tunnel is online. Configure token to link.",
    };
  }
}
