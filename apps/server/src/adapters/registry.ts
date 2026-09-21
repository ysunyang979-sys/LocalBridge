import type { AIClientAdapter } from "./base.js";
import { ChatGPTConnectorAdapter } from "./mcp/index.js";
import type { ConnectionService } from "../db/connection-service.js";
import type { McpContext } from "../mcp/context.js";
import type { TestConnectionResult } from "@localbridge/protocol";

export class AdapterRegistry {
  private adapters = new Map<string, AIClientAdapter>();

  constructor(
    private readonly connectionService: ConnectionService,
    private readonly mcpContext: McpContext
  ) {
    this.initStandardAdapters();
  }

  private initStandardAdapters() {
    this.adapters.set(
      "conn_chatgpt",
      new ChatGPTConnectorAdapter(this.connectionService, this.mcpContext)
    );
  }

  getAdapter(id: string): AIClientAdapter | null {
    if (this.adapters.has(id)) {
      return this.adapters.get(id)!;
    }

    const conn = this.connectionService.getConnection(id);
    if (!conn) return null;

    if (conn.clientType === "chatgpt") {
      const adapter = new ChatGPTConnectorAdapter(this.connectionService, this.mcpContext);
      this.adapters.set(id, adapter);
      return adapter;
    }

    return null;
  }

  getAll(): AIClientAdapter[] {
    return Array.from(this.adapters.values());
  }

  getByClientType(clientType: string): AIClientAdapter | null {
    for (const adapter of this.adapters.values()) {
      if (adapter.clientType === clientType) {
        return adapter;
      }
    }
    return null;
  }

  async testConnection(id: string): Promise<TestConnectionResult> {
    const adapter = this.getAdapter(id);
    if (!adapter) {
      return {
        success: false,
        stage: "auth",
        latencyMs: 0,
        toolCount: 0,
        message: `No adapter found for connection ${id}`,
        error: "ADAPTER_NOT_FOUND",
      };
    }
    return adapter.testConnection();
  }
}
