import type { AIClientAdapter } from "./base.js";
import {
  ChatGPTConnectorAdapter,
  KimiWebPluginAdapter,
  KimiCodeAdapter,
  ClaudeAdapter,
  GeminiCliAdapter,
  CustomMcpAdapter,
} from "./mcp/index.js";
import {
  DeepSeekToolAdapter,
  OpenAICompatibleAdapter,
  PRESET_PROVIDERS,
} from "./tools/index.js";
import type { ConnectionService } from "../db/connection-service.js";
import type { McpContext } from "../mcp/context.js";
import type { TestConnectionResult, ProviderPreset } from "@localbridge/protocol";

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
    this.adapters.set(
      "conn_kimi_web",
      new KimiWebPluginAdapter(this.connectionService, this.mcpContext)
    );
    this.adapters.set(
      "conn_kimi",
      new KimiCodeAdapter(this.connectionService, this.mcpContext)
    );
    this.adapters.set(
      "conn_claude",
      new ClaudeAdapter(this.connectionService, this.mcpContext)
    );
    this.adapters.set(
      "conn_gemini",
      new GeminiCliAdapter(this.connectionService, this.mcpContext)
    );
    this.adapters.set(
      "conn_deepseek",
      new DeepSeekToolAdapter(this.connectionService, this.mcpContext)
    );
  }

  getAdapter(id: string): AIClientAdapter | null {
    if (this.adapters.has(id)) {
      return this.adapters.get(id)!;
    }

    const conn = this.connectionService.getConnection(id);
    if (!conn) return null;

    if (conn.clientType === "kimi-web") {
      const adapter = new KimiWebPluginAdapter(this.connectionService, this.mcpContext);
      this.adapters.set(id, adapter);
      return adapter;
    }

    if (conn.clientType === "custom-mcp") {
      const adapter = new CustomMcpAdapter(
        id,
        conn.name,
        this.connectionService,
        this.mcpContext
      );
      this.adapters.set(id, adapter);
      return adapter;
    }

    if (conn.clientType === "custom-openai") {
      const adapter = new OpenAICompatibleAdapter(
        id,
        conn.name,
        this.connectionService,
        this.mcpContext
      );
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

  registerCustom(config: { id: string; clientType: string; name: string }): AIClientAdapter {
    let adapter: AIClientAdapter;
    if (config.clientType === "custom-mcp") {
      adapter = new CustomMcpAdapter(
        config.id,
        config.name,
        this.connectionService,
        this.mcpContext
      );
    } else {
      adapter = new OpenAICompatibleAdapter(
        config.id,
        config.name,
        this.connectionService,
        this.mcpContext
      );
    }
    this.adapters.set(config.id, adapter);
    return adapter;
  }

  removeCustom(id: string): boolean {
    return this.adapters.delete(id);
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

  getPresets(): ProviderPreset[] {
    return PRESET_PROVIDERS;
  }
}
