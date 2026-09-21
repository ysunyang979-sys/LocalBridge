import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { initDatabase } from "../apps/server/src/db/index.js";
import { TokenService } from "../apps/server/src/db/token-service.js";
import { ConnectionService } from "../apps/server/src/db/connection-service.js";
import { OpenAICompatibleAdapter, PRESET_PROVIDERS } from "../apps/server/src/adapters/tools/index.js";

describe("OpenAI-Compatible & Preset Tool Adapters Suite", () => {
  let tmpDir: string;
  let dbConn: any;
  let tokenService: TokenService;
  let connectionService: ConnectionService;
  let mockMcpContext: any;
  let auditLogs: any[] = [];

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "nexus-openai-comp-test-"));
    const dbPath = path.join(tmpDir, "test.db");
    const migrationsDir = path.join(process.cwd(), "apps/server/src/db/migrations");
    dbConn = initDatabase(dbPath, migrationsDir);
    tokenService = new TokenService(dbConn.db);
    connectionService = new ConnectionService(dbConn.db, tokenService);

    auditLogs = [];
    mockMcpContext = {
      isPaused: () => false,
      logAudit: (event: string, meta: any) => {
        auditLogs.push({ event, meta });
      },
    };
  });

  afterEach(() => {
    try {
      dbConn?.db?.close();
      if (tmpDir && fs.existsSync(tmpDir)) {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      }
    } catch {}
  });

  it("provides rich preset providers for Qwen, GLM, Kimi API, and Local Gateways", () => {
    expect(PRESET_PROVIDERS.length).toBeGreaterThanOrEqual(5);

    const presetIds = PRESET_PROVIDERS.map((p) => p.id);
    expect(presetIds).toContain("deepseek");
    expect(presetIds).toContain("qwen");
    expect(presetIds).toContain("glm");
    expect(presetIds).toContain("local-gateway");

    const localGateway = PRESET_PROVIDERS.find((p) => p.id === "local-gateway");
    expect(localGateway?.defaultBaseUrl).toBe("http://127.0.0.1:11434/v1");
    expect(localGateway?.suggestedModels).toContain("deepseek-r1");
  });

  it("initializes custom OpenAI-compatible adapter with correct metadata", () => {
    const adapter = new OpenAICompatibleAdapter(
      "conn_local_ollama",
      "Ollama Local Qwen",
      connectionService,
      mockMcpContext
    );

    expect(adapter.id).toBe("conn_local_ollama");
    expect(adapter.name).toBe("Ollama Local Qwen");
    expect(adapter.category).toBe("tool-adapter");
    expect(adapter.clientType).toBe("custom-openai");
  });

  it("executes tool calls with custom provider client attribution in audit trail", async () => {
    const adapter = new OpenAICompatibleAdapter(
      "conn_qwen_dashscope",
      "Qwen DashScope",
      connectionService,
      mockMcpContext
    );

    const result = await adapter.executeToolCall({
      name: "localbridge_git_status",
      arguments: { projectId: "proj_demo" },
      clientId: "conn_qwen_dashscope",
      clientType: "custom-openai",
      clientName: "Qwen DashScope",
      projectId: "proj_demo",
    });

    expect(result.success).toBe(true);
    expect(result.toolName).toBe("localbridge_git_status");
    expect(auditLogs.length).toBe(1);
    expect(auditLogs[0].meta.clientId).toBe("conn_qwen_dashscope");
    expect(auditLogs[0].meta.clientName).toBe("Qwen DashScope");
  });
});
