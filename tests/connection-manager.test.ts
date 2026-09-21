import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { initDatabase } from "../apps/server/src/db/index.js";
import { TokenService } from "../apps/server/src/db/token-service.js";
import { ConnectionService } from "../apps/server/src/db/connection-service.js";

describe("ConnectionService & Persistence Suite", () => {
  let tmpDir: string;
  let dbConn: any;
  let tokenService: TokenService;
  let connectionService: ConnectionService;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "nexus-conn-mgr-"));
    const dbPath = path.join(tmpDir, "test.db");
    const migrationsDir = path.join(process.cwd(), "apps/server/src/db/migrations");
    dbConn = initDatabase(dbPath, migrationsDir);
    tokenService = new TokenService(dbConn.db);
    connectionService = new ConnectionService(dbConn.db, tokenService);
  });

  afterEach(() => {
    try {
      dbConn?.db?.close();
      if (tmpDir && fs.existsSync(tmpDir)) {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      }
    } catch {}
  });

  it("seeds default AI connections on fresh database", () => {
    const connections = connectionService.listConnections();
    expect(connections.length).toBeGreaterThanOrEqual(5);

    const ids = connections.map((c) => c.id);
    expect(ids).toContain("conn_chatgpt");
    expect(ids).toContain("conn_kimi");
    expect(ids).toContain("conn_claude");
    expect(ids).toContain("conn_gemini");
    expect(ids).toContain("conn_deepseek");
  });

  it("creates and retrieves a new custom connection", () => {
    const created = connectionService.createOrUpdateConnection({
      id: "conn_my_agent",
      clientType: "custom-mcp",
      name: "Custom Agent Client",
      category: "native-mcp",
      transport: "http",
      endpoint: "http://127.0.0.1:18080/mcp",
      scopes: ["read", "write"],
    });

    expect(created).toBeDefined();
    expect(created.id).toBe("conn_my_agent");
    expect(created.status).toBe("not_configured");

    connectionService.updateStatus("conn_my_agent", "configured");
    connectionService.createOrRotateToken("conn_my_agent", ["read", "write"]);
    const fetched = connectionService.getConnection("conn_my_agent");
    expect(fetched?.status).toBe("configured");
    expect(fetched).toBeDefined();
    expect(fetched?.name).toBe("Custom Agent Client");
    expect(fetched?.scopes).toEqual(["read", "write"]);
  });

  it("updates existing connection attributes without losing token", () => {
    const { tokenId, token } = connectionService.createOrRotateToken("conn_kimi");
    expect(token).toMatch(/^lb_/);

    const updated = connectionService.createOrUpdateConnection({
      id: "conn_kimi",
      clientType: "kimi",
      name: "Kimi Code AI Pro",
      category: "native-mcp",
      transport: "http",
    });

    expect(updated.name).toBe("Kimi Code AI Pro");
    expect(updated.tokenId).toBe(tokenId);
  });

  it("enforces single primary connection invariant", () => {
    connectionService.setPrimary("conn_kimi");
    let kimi = connectionService.getConnection("conn_kimi");
    let chatgpt = connectionService.getConnection("conn_chatgpt");
    expect(kimi?.isPrimary).toBe(true);
    expect(chatgpt?.isPrimary).toBe(false);

    connectionService.setPrimary("conn_claude");
    kimi = connectionService.getConnection("conn_kimi");
    const claude = connectionService.getConnection("conn_claude");
    expect(claude?.isPrimary).toBe(true);
    expect(kimi?.isPrimary).toBe(false);
  });

  it("rotates dedicated token and updates connection record", () => {
    const first = connectionService.createOrRotateToken("conn_gemini");
    expect(first.token).toMatch(/^lb_/);

    const second = connectionService.createOrRotateToken("conn_gemini");
    expect(second.token).toMatch(/^lb_/);
    expect(second.tokenId).not.toBe(first.tokenId);

    const gemini = connectionService.getConnection("conn_gemini");
    expect(gemini?.tokenId).toBe(second.tokenId);
  });

  it("deletes a connection and its tokens properly", () => {
    connectionService.createOrUpdateConnection({
      id: "conn_to_delete",
      clientType: "custom-openai",
      name: "Temporary Model",
      category: "tool-adapter",
      transport: "http",
    });

    expect(connectionService.getConnection("conn_to_delete")).toBeDefined();
    const deleted = connectionService.deleteConnection("conn_to_delete");
    expect(deleted).toBe(true);
    expect(connectionService.getConnection("conn_to_delete")).toBeNull();
  });
});
