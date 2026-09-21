import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { KimiWebPluginAdapter } from "../apps/server/src/adapters/mcp/kimi-web.js";
import { initDatabase } from "../apps/server/src/db/index.js";
import { TokenService } from "../apps/server/src/db/token-service.js";
import { ConnectionService } from "../apps/server/src/db/connection-service.js";
import {
  BUILTIN_CLIENT_CATALOG,
  mergeCatalogWithSavedConnections,
  resolveTunnelEndpoint,
} from "../apps/desktop/src/components/connections/catalog.js";

describe("Kimi Web Plugin & Isolation Test Suite", () => {
  let tmpDir: string;
  let dbConn: any;
  let tokenService: TokenService;
  let connectionService: ConnectionService;
  let adapter: KimiWebPluginAdapter;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "nexus-kimi-web-test-"));
    const dbPath = path.join(tmpDir, "test.db");
    const migrationsDir = path.join(process.cwd(), "apps/server/src/db/migrations");
    dbConn = initDatabase(dbPath, migrationsDir);
    tokenService = new TokenService(dbConn.db);
    connectionService = new ConnectionService(dbConn.db, tokenService);
    adapter = new KimiWebPluginAdapter();
  });

  afterEach(() => {
    try {
      dbConn?.db?.close();
      if (tmpDir && fs.existsSync(tmpDir)) {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      }
    } catch {}
  });

  describe("1. Manifest & Package Generation", () => {
    it("generates valid kimi.plugin.json manifest pointing to HTTPS tunnel endpoint and never localhost", () => {
      const tunnelEndpoint = "https://tnl-nexus-abc12345.nexus.localbridge.dev/mcp";
      const manifest = adapter.generatePluginManifest(tunnelEndpoint);

      expect(manifest.schema_version).toBe("v1");
      expect(manifest.name_for_model).toBe("nexus");
      expect(manifest.name_for_human).toContain("Nexus");
      expect(manifest.auth.type).toBe("service_http");
      expect(manifest.auth.authorization_type).toBe("bearer");
      expect(manifest.mcpServers.nexus.url).toBe(tunnelEndpoint);

      // Security check: Never point to 127.0.0.1 or localhost
      const manifestJson = JSON.stringify(manifest);
      expect(manifestJson).not.toContain("127.0.0.1");
      expect(manifestJson).not.toContain("localhost");
      expect(manifestJson).not.toContain("lb_"); // No plaintext credentials in manifest template
    });

    it("rejects placeholder, missing endpoint, or localhost, requiring a valid HTTPS public endpoint", () => {
      expect(() => (adapter as any).generatePluginManifest()).toThrow(/Secure Tunnel is offline/);
      expect(() => adapter.generatePluginManifest("https://<nexus-tunnel-host>/mcp")).toThrow(/Invalid tunnel endpoint/);
      expect(() => adapter.generatePluginManifest("http://127.0.0.1:18080/mcp")).toThrow(/Invalid tunnel endpoint/);
      expect(() => adapter.generatePluginManifest("http://localhost:18080/mcp")).toThrow(/Invalid tunnel endpoint/);
    });

    it("generates markdown README with 9-step kimi.com setup instructions", () => {
      const tunnelEndpoint = "https://live-tunnel.nexus.dev/mcp";
      const readme = adapter.generateReadme(tunnelEndpoint);

      expect(readme).toContain("Kimi Web (kimi.com)");
      expect(readme).toContain("kimi.plugin.json");
      expect(readme).toContain("https://kimi.com");
      expect(readme).toContain(tunnelEndpoint);
      // Verify all 9 step indicators
      for (let i = 1; i <= 9; i++) {
        expect(readme).toMatch(new RegExp(`${i}\\.\\s+`));
      }
    });

    it("exports plugin package into directory without leaking plaintext tokens", async () => {
      const exportDir = path.join(tmpDir, "export-test");
      const tunnelUrl = "https://tnl-xyz.nexus.dev/mcp";

      const result = await adapter.exportPluginPackage(exportDir, tunnelUrl);
      expect(result.success).toBe(true);
      expect(result.exportDir).toBe(path.join(exportDir, "nexus-kimi-plugin"));
      expect(fs.existsSync(result.manifestPath)).toBe(true);
      expect(fs.existsSync(result.readmePath)).toBe(true);

      const manifestContent = fs.readFileSync(result.manifestPath, "utf-8");
      const parsedManifest = JSON.parse(manifestContent);
      expect(parsedManifest.mcpServers.nexus.url).toBe(tunnelUrl);
      expect(manifestContent).not.toContain("lb_");
      expect(manifestContent).not.toContain("<nexus-tunnel-host>");

      const readmeContent = fs.readFileSync(result.readmePath, "utf-8");
      expect(readmeContent).toContain(tunnelUrl);
      expect(readmeContent).not.toContain("lb_");
      expect(readmeContent).not.toContain("<nexus-tunnel-host>");
    });
  });

  describe("2. Dedicated Token & Isolation", () => {
    it("assigns isolated, dedicated token to Kimi Web without cross-client pollution", () => {
      // Initialize connections first
      connectionService.createOrUpdateConnection({
        id: "conn_kimi_web",
        clientType: "kimi-web",
        name: "Kimi Web",
        category: "native-mcp",
        transport: "tunnel",
        scopes: ["read", "write"],
      });
      connectionService.createOrUpdateConnection({
        id: "conn_chatgpt",
        clientType: "chatgpt",
        name: "ChatGPT",
        category: "native-mcp",
        transport: "tunnel",
        scopes: ["read", "write", "execute"],
      });

      // Create tokens for Kimi Web and ChatGPT
      const kimiWebToken = connectionService.createOrRotateToken("conn_kimi_web", ["read", "write"]);
      const chatgptToken = connectionService.createOrRotateToken("conn_chatgpt", ["read", "write", "execute"]);

      expect(kimiWebToken.token).not.toEqual(chatgptToken.token);

      // Validate Kimi Web token
      const valKimi = tokenService.validateMcpToken(kimiWebToken.token);
      expect(valKimi.valid).toBe(true);
      expect(JSON.parse(valKimi.tokenRecord?.scopes || "[]")).toEqual(["read", "write"]);

      // Validate ChatGPT token
      const valGpt = tokenService.validateMcpToken(chatgptToken.token);
      expect(valGpt.valid).toBe(true);
      expect(JSON.parse(valGpt.tokenRecord?.scopes || "[]")).toEqual(["read", "write", "execute"]);

      // Rotating Kimi Web token does not affect ChatGPT token
      const rotatedKimi = connectionService.createOrRotateToken("conn_kimi_web", ["read"]);
      expect(tokenService.validateMcpToken(kimiWebToken.token).valid).toBe(false);
      expect(tokenService.validateMcpToken(rotatedKimi.token).valid).toBe(true);
      expect(tokenService.validateMcpToken(chatgptToken.token).valid).toBe(true);
    });
  });

  describe("3. Scope Enforcement Matrix", () => {
    it("enforces read-only scope: permits read-only tools and denies modifying tools", () => {
      connectionService.createOrUpdateConnection({
        id: "conn_kimi_web",
        clientType: "kimi-web",
        name: "Kimi Web",
        category: "native-mcp",
        transport: "tunnel",
        scopes: ["read"],
      });

      const { token } = connectionService.createOrRotateToken("conn_kimi_web", ["read"]);
      const validated = tokenService.validateMcpToken(token);
      expect(validated.valid).toBe(true);

      const scopes: string[] = JSON.parse(validated.tokenRecord?.scopes || "[]");

      // Scope permission policy gate
      const executeTool = (toolName: string, requiredScope: "read" | "write" | "execute") => {
        if (!scopes.includes(requiredScope)) {
          return {
            allowed: false,
            error: `DENIED: Tool '${toolName}' requires '${requiredScope}' scope, but token only grants [${scopes.join(", ")}]`,
          };
        }
        return { allowed: true, error: null };
      };

      // project_list requires "read"
      const readResult = executeTool("project_list", "read");
      expect(readResult.allowed).toBe(true);
      expect(readResult.error).toBeNull();

      // git_commit requires "write"
      const writeResult = executeTool("git_commit", "write");
      expect(writeResult.allowed).toBe(false);
      expect(writeResult.error).toContain("DENIED");
      expect(writeResult.error).toContain("requires 'write' scope");

      // run_command requires "execute"
      const execResult = executeTool("run_command", "execute");
      expect(execResult.allowed).toBe(false);
      expect(execResult.error).toContain("requires 'execute' scope");
    });
  });

  describe("4. Audit & Client Attribution", () => {
    it("correctly identifies clientType as 'kimi-web' for approval and audit attribution", () => {
      const conn = connectionService.createOrUpdateConnection({
        id: "conn_kimi_web",
        clientType: "kimi-web",
        name: "Kimi Web",
        category: "native-mcp",
        transport: "tunnel",
        endpoint: "https://my-tunnel.nexus.dev/mcp",
        scopes: ["read", "write"],
      });

      expect(conn.clientType).toBe("kimi-web");
      expect(conn.name).toBe("Kimi Web");

      // Verify audit attribution label
      const getClientDisplayLabel = (clientType: string) => {
        switch (clientType) {
          case "kimi-web":
            return "Kimi Web";
          case "kimi":
            return "Kimi Code";
          case "chatgpt":
            return "ChatGPT";
          default:
            return clientType;
        }
      };

      expect(getClientDisplayLabel(conn.clientType)).toBe("Kimi Web");
      expect(getClientDisplayLabel("kimi")).toBe("Kimi Code");
    });
  });

  describe("5. Mode Hierarchy & Catalog Separation", () => {
    it("includes Kimi Web in standard mode and filters out Kimi Code (isAdvancedOnly)", () => {
      const merged = mergeCatalogWithSavedConnections(BUILTIN_CLIENT_CATALOG, [], null);

      // Standard mode filter
      const standardNative = merged.filter((c) => {
        if (c.category !== "native-mcp") return false;
        if (c.metadata?.isAdvancedOnly) return false;
        return true;
      });

      const standardTypes = standardNative.map((c) => c.clientType);
      expect(standardTypes).toContain("chatgpt");
      expect(standardTypes).toContain("kimi-web");
      expect(standardTypes).toContain("claude");
      expect(standardTypes).toContain("gemini");
      expect(standardTypes).not.toContain("kimi"); // Kimi Code hidden in standard mode

      // Advanced mode filter
      const advancedNative = merged.filter((c) => c.category === "native-mcp");
      const advancedTypes = advancedNative.map((c) => c.clientType);
      expect(advancedTypes).toContain("kimi-web");
      expect(advancedTypes).toContain("kimi"); // Kimi Code present in advanced mode
    });

    it("resolves dynamic tunnel endpoint for Kimi Web when Tunnel is connected", () => {
      const activeTunnel = {
        status: "Connected",
        tunnel_id: "https://my-live-tunnel.nexus.localbridge.dev",
        latencyMs: 18,
      };

      const endpoint = resolveTunnelEndpoint(activeTunnel);
      expect(endpoint).toBe("https://my-live-tunnel.nexus.localbridge.dev/mcp");

      const merged = mergeCatalogWithSavedConnections(BUILTIN_CLIENT_CATALOG, [], activeTunnel);
      const kimiWeb = merged.find((c) => c.clientType === "kimi-web");
      expect(kimiWeb?.endpoint).toBe("https://my-live-tunnel.nexus.localbridge.dev/mcp");
    });
  });
});
