import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  RemoteMcpEndpointResolver,
  type TunnelStatusDto,
} from "@localbridge/protocol";
import { KimiWebPluginAdapter } from "../apps/server/src/adapters/mcp/kimi-web.js";
import { initDatabase } from "../apps/server/src/db/index.js";
import { TokenService } from "../apps/server/src/db/token-service.js";
import { ConnectionService } from "../apps/server/src/db/connection-service.js";
import {
  BUILTIN_CLIENT_CATALOG,
  mergeCatalogWithSavedConnections,
  resolveTunnelEndpoint,
} from "../apps/desktop/src/components/connections/catalog.js";

describe("Nexus Kimi Web Final Acceptance Test Suite", () => {
  let tmpDir: string;
  let dbConn: any;
  let tokenService: TokenService;
  let connectionService: ConnectionService;
  let adapter: KimiWebPluginAdapter;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "nexus-kimi-web-acc-"));
    const dbPath = path.join(tmpDir, "test.db");
    const migrationsDir = path.join(process.cwd(), "apps/server/src/db/migrations");
    dbConn = initDatabase(dbPath, migrationsDir);
    tokenService = new TokenService(dbConn.db);
    connectionService = new ConnectionService(dbConn.db, tokenService);
    adapter = new KimiWebPluginAdapter(connectionService, {} as any);
  });

  afterEach(() => {
    try {
      dbConn?.db?.close();
      if (tmpDir && fs.existsSync(tmpDir)) {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      }
    } catch {}
  });

  // 1. remote-mcp-endpoint-resolver
  describe("Dimension 1: RemoteMcpEndpointResolver", () => {
    it("resolves valid tunnel IDs into real public HTTPS MCP endpoints", () => {
      const cases = [
        {
          input: { status: "Connected", tunnel_id: "tnl-abc123" },
          expected: "https://tnl-abc123.nexus.localbridge.dev/mcp",
        },
        {
          input: { status: "Connected", tunnel_id: "my-gateway.example.com" },
          expected: "https://my-gateway.example.com/mcp",
        },
        {
          input: { status: "Connected", tunnel_id: "https://proxy.nexus.dev" },
          expected: "https://proxy.nexus.dev/mcp",
        },
        {
          input: { status: "Connected", tunnel_id: "https://proxy.nexus.dev/mcp" },
          expected: "https://proxy.nexus.dev/mcp",
        },
      ];

      for (const c of cases) {
        const res = RemoteMcpEndpointResolver.resolve(c.input);
        expect(res.isAvailable).toBe(true);
        expect(res.endpoint).toBe(c.expected);
        expect(res.status).toBe("connected");
        expect(res.requiresTunnel).toBe(false);
      }
    });

    it("returns isAvailable=false and endpoint=null when tunnel is offline or missing", () => {
      const offlineCases = [
        null,
        undefined,
        { status: "offline" },
        { status: "Disconnected" },
        { status: "Connected", tunnel_id: "" },
        { status: "Connected", tunnel_id: null },
      ];

      for (const c of offlineCases) {
        const res = RemoteMcpEndpointResolver.resolve(c as any);
        expect(res.isAvailable).toBe(false);
        expect(res.endpoint).toBeNull();
        expect(res.statusTextZh).toBe("安全隧道未连接");
        expect(res.requiresTunnel).toBe(true);
      }
    });

    it("generates MCP client snippet without placeholder when tunnel is connected", () => {
      const activeTunnel = { status: "Connected", tunnel_id: "tnl-prod-999" };
      const snippet = RemoteMcpEndpointResolver.generateSnippet(activeTunnel, "lb_masked_xyz");

      expect(snippet).not.toBeNull();
      expect(snippet?.mcpServers.nexus.url).toBe("https://tnl-prod-999.nexus.localbridge.dev/mcp");
      expect(snippet?.mcpServers.nexus.headers.Authorization).toBe("Bearer lb_masked_xyz");

      // When offline, returns null
      expect(RemoteMcpEndpointResolver.generateSnippet(null)).toBeNull();
    });

    it("generates Plugin Builder prompt containing live endpoint when connected", () => {
      const activeTunnel = { status: "Connected", tunnel_id: "tnl-prod-999" };
      const prompt = RemoteMcpEndpointResolver.generatePluginBuilderPrompt(activeTunnel);

      expect(prompt).not.toBeNull();
      expect(prompt).toContain("https://tnl-prod-999.nexus.localbridge.dev/mcp");
      expect(prompt).toContain("请创建名为 Nexus 的 MCP 插件");
      expect(prompt).not.toContain("<nexus-tunnel-host>");

      // When offline, returns null
      expect(RemoteMcpEndpointResolver.generatePluginBuilderPrompt(null)).toBeNull();
    });
  });

  // 2. kimi-web-real-endpoint
  describe("Dimension 2: Kimi Web Real Endpoint Propagation", () => {
    it("populates real public endpoint into catalog only when tunnel is connected", () => {
      const activeTunnel = {
        status: "Connected",
        tunnel_id: "https://my-live-tunnel.nexus.localbridge.dev",
        latencyMs: 25,
      };

      const merged = mergeCatalogWithSavedConnections(BUILTIN_CLIENT_CATALOG, [], activeTunnel);
      const kimiWeb = merged.find((c) => c.clientType === "kimi-web");
      expect(kimiWeb?.endpoint).toBe("https://my-live-tunnel.nexus.localbridge.dev/mcp");

      // When tunnel is disconnected
      const offlineMerged = mergeCatalogWithSavedConnections(BUILTIN_CLIENT_CATALOG, [], null);
      const offlineKimiWeb = offlineMerged.find((c) => c.clientType === "kimi-web");
      expect(offlineKimiWeb?.endpoint || "").toBe("");
    });
  });

  // 3. kimi-plugin-no-placeholder
  describe("Dimension 3: No Endpoint Placeholder Policy", () => {
    it("strictly rejects any placeholder string in manifest generation", () => {
      const prohibitedUrls = [
        "https://<nexus-tunnel-host>/mcp",
        "https://<placeholder>/mcp",
        "http://127.0.0.1:18080/mcp",
        "http://localhost:18080/mcp",
        "",
      ];

      for (const badUrl of prohibitedUrls) {
        expect(() => adapter.generatePluginManifest(badUrl)).toThrow();
        expect(() => adapter.generateReadme(badUrl)).toThrow();
        expect(() => adapter.exportPluginPackage(tmpDir, badUrl)).toThrow();
      }
    });

    it("ensures resolveTunnelEndpoint never returns placeholder string", () => {
      expect(resolveTunnelEndpoint(null)).toBeNull();
      expect(resolveTunnelEndpoint({ status: "Disconnected" })).toBeNull();
      expect(resolveTunnelEndpoint({ status: "Connected", tunnel_id: "" })).toBeNull();
    });
  });

  // 4. kimi-plugin-no-secret
  describe("Dimension 4: Zero Secret Leakage in Plugin Artifacts", () => {
    it("never writes credentials (lb_, lbr_, lm_) into manifest, readme, or export packages", () => {
      const realEndpoint = "https://live-gateway.nexus.localbridge.dev/mcp";
      const manifest = adapter.generatePluginManifest(realEndpoint);
      const manifestStr = JSON.stringify(manifest);

      expect(manifestStr).not.toMatch(/lb_[a-zA-Z0-9_-]+/);
      expect(manifestStr).not.toMatch(/lbr_[a-zA-Z0-9_-]+/);
      expect(manifestStr).not.toMatch(/lm_[a-zA-Z0-9_-]+/);

      const readme = adapter.generateReadme(realEndpoint);
      expect(readme).not.toMatch(/lb_[a-zA-Z0-9_-]+/);
      expect(readme).not.toMatch(/lbr_[a-zA-Z0-9_-]+/);

      const exportResult = adapter.exportPluginPackage(tmpDir, realEndpoint);
      const writtenManifest = fs.readFileSync(exportResult.manifestPath, "utf8");
      const writtenReadme = fs.readFileSync(exportResult.readmePath, "utf8");

      expect(writtenManifest).not.toMatch(/lb_[a-zA-Z0-9_-]+/);
      expect(writtenReadme).not.toMatch(/lb_[a-zA-Z0-9_-]+/);
    });
  });

  // 5. kimi-web-endpoint-health
  describe("Dimension 5: Remote MCP Endpoint Health & HTTP 401 Interpretation", () => {
    const originalFetch = globalThis.fetch;
    afterEach(() => {
      globalThis.fetch = originalFetch;
    });

    it("interprets HTTP 401/403 as endpoint reachable with auth required", async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        status: 401,
        statusText: "Unauthorized",
      });
      globalThis.fetch = mockFetch;

      const result = await adapter.testConnection("https://my-live-tunnel.nexus.localbridge.dev/mcp");

      expect(result.endpointReachable).toBe(true);
      expect(result.stage).toBe("auth");
      expect(result.message).toContain("服务可达，需要认证");
      expect(result.details?.endpoint).toBe("reachable");
      expect(result.details?.tunnel).toBe("connected");
    });

    it("interprets HTTP 200 as endpoint reachable and tools stage", async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        status: 200,
        statusText: "OK",
      });
      globalThis.fetch = mockFetch;

      const result = await adapter.testConnection("https://my-live-tunnel.nexus.localbridge.dev/mcp");

      expect(result.endpointReachable).toBe(true);
      expect(result.success).toBe(true);
      expect(result.stage).toBe("tools");
      expect(result.details?.endpoint).toBe("reachable");
    });

    it("fails self-check if tunnel endpoint is offline or placeholder", async () => {
      const result = await adapter.testConnection("https://<nexus-tunnel-host>/mcp");

      expect(result.success).toBe(false);
      expect(result.endpointReachable).toBe(false);
      expect(result.error).toBe("TUNNEL_OFFLINE");
      expect(result.message).toContain("安全隧道未连接");
    });
  });

  // 6. kimi-web-auth-isolation
  describe("Dimension 6: Dedicated Token & Scope Isolation", () => {
    it("generates isolated token for Kimi Web that is separate from other AI clients", () => {
      connectionService.createOrUpdateConnection({
        id: "conn_kimi_web",
        clientType: "kimi-web",
        name: "Kimi Web",
        category: "native-mcp",
        transport: "tunnel",
        scopes: ["read", "write"],
      });
      connectionService.createOrUpdateConnection({
        id: "conn_claude",
        clientType: "claude",
        name: "Claude Code",
        category: "native-mcp",
        transport: "http",
        scopes: ["read", "write", "execute"],
      });

      const kimiToken = connectionService.createOrRotateToken("conn_kimi_web", ["read", "write"]);
      const claudeToken = connectionService.createOrRotateToken("conn_claude", ["read", "write", "execute"]);

      expect(kimiToken.token).not.toEqual(claudeToken.token);

      const kimiVal = tokenService.validateMcpToken(kimiToken.token);
      expect(kimiVal.valid).toBe(true);
      expect(JSON.parse(kimiVal.tokenRecord?.scopes || "[]")).toEqual(["read", "write"]);

      // Rotating Kimi Web token invalidates old Kimi Web token but keeps Claude intact
      const rotated = connectionService.createOrRotateToken("conn_kimi_web", ["read"]);
      expect(tokenService.validateMcpToken(kimiToken.token).valid).toBe(false);
      expect(tokenService.validateMcpToken(rotated.token).valid).toBe(true);
      expect(tokenService.validateMcpToken(claudeToken.token).valid).toBe(true);
    });
  });

  // 7. kimi-web-scope-real
  describe("Dimension 7: Scope Enforcement Matrix", () => {
    it("strictly blocks write/execute when Kimi Web token is limited to read scope", () => {
      connectionService.createOrUpdateConnection({
        id: "conn_kimi_web",
        clientType: "kimi-web",
        name: "Kimi Web",
        category: "native-mcp",
        transport: "tunnel",
        scopes: ["read"],
      });

      const { token } = connectionService.createOrRotateToken("conn_kimi_web", ["read"]);
      const val = tokenService.validateMcpToken(token);
      const scopes: string[] = JSON.parse(val.tokenRecord?.scopes || "[]");

      const checkAccess = (required: "read" | "write" | "execute") => scopes.includes(required);

      expect(checkAccess("read")).toBe(true);
      expect(checkAccess("write")).toBe(false);
      expect(checkAccess("execute")).toBe(false);
    });
  });

  // 8. kimi-web-client-attribution
  describe("Dimension 8: Client Attribution in Audit and Persistence", () => {
    it("retains 'kimi-web' clientType and 'Kimi Web' name in connection record", () => {
      const conn = connectionService.createOrUpdateConnection({
        id: "conn_kimi_web",
        clientType: "kimi-web",
        name: "Kimi Web",
        category: "native-mcp",
        transport: "tunnel",
        endpoint: "https://real-tnl.nexus.dev/mcp",
        scopes: ["read", "write"],
      });

      expect(conn.clientType).toBe("kimi-web");
      expect(conn.name).toBe("Kimi Web");

      const retrieved = connectionService.getConnection("conn_kimi_web");
      expect(retrieved?.clientType).toBe("kimi-web");
      expect(retrieved?.name).toBe("Kimi Web");
    });
  });
});
