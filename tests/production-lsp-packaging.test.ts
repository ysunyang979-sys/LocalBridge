import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import child_process from "node:child_process";
import { fileURLToPath } from "node:url";
import { findBundledLsp, resolveTypeScriptLanguageServer } from "../apps/runner/src/lsp/detection.js";
import { LspClient } from "../apps/runner/src/lsp/client.js";
import { buildApp } from "../apps/server/src/app.js";
import { LocalBridgeRunner } from "../apps/runner/src/runner.js";
import { RunnerDaemonConfigSchema } from "../apps/runner/src/config/schema.js";
import { AppConfigSchema } from "@localbridge/shared";
import { Client, StreamableHTTPClientTransport } from "@modelcontextprotocol/client";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");
const resourcesDir = path.resolve(rootDir, "apps/desktop/src-tauri/resources");
const mywebDir = path.resolve(rootDir, "../Myweb");

describe("Production Bundled LSP Packaging & Runtime Verification", () => {
  const lspDir = path.join(resourcesDir, "lsp");
  const cliPath = path.join(lspDir, "node_modules/typescript-language-server/lib/cli.mjs");
  const tsserverPath = path.join(lspDir, "node_modules/typescript/lib/tsserver.js");
  const nodeExe = path.join(resourcesDir, "runtime/node.exe");

  it("1. Bundled LSP directory contains required language server and typescript files", () => {
    expect(fs.existsSync(cliPath), `cli.mjs must exist at ${cliPath}`).toBe(true);
    expect(fs.existsSync(tsserverPath), `tsserver.js must exist at ${tsserverPath}`).toBe(true);
    expect(fs.existsSync(path.join(lspDir, "package.json"))).toBe(true);
  });

  it("2. Bundled typescript-language-server runs under clean/empty PATH", () => {
    const runtimeNode = fs.existsSync(nodeExe) ? nodeExe : process.execPath;
    const output = child_process.execFileSync(runtimeNode, [cliPath, "--version"], {
      env: { PATH: "", SystemRoot: process.env.SystemRoot || "C:\\Windows" },
    }).toString().trim();

    expect(output).toMatch(/^6\./);
  });

  it("3. findBundledLsp resolves the packaged LSP runtime", () => {
    const bundled = findBundledLsp();
    expect(bundled).not.toBeNull();
    expect(fs.existsSync(bundled!.cliPath)).toBe(true);
    expect(bundled!.tsserverPath).toBeDefined();
    expect(fs.existsSync(bundled!.tsserverPath!)).toBe(true);
  });

  it("4. resolveTypeScriptLanguageServer resolves bundled LSP for projects without local node_modules", () => {
    const tempEmptyProject = fs.mkdtempSync(path.join(process.env.TEMP || "C:/temp", "lb-test-lsp-proj-"));
    try {
      const resolution = resolveTypeScriptLanguageServer(tempEmptyProject);
      expect(resolution).not.toBeNull();
      expect(resolution!.serverKind).toBe("typescript");
      expect(resolution!.executable).toBe(process.execPath);
      expect(resolution!.args).toContain("--stdio");
      expect(fs.existsSync(resolution!.args[0]!)).toBe(true);
      expect(resolution!.tsserverPath).toBeDefined();
      expect(fs.existsSync(resolution!.tsserverPath!)).toBe(true);
    } finally {
      fs.rmSync(tempEmptyProject, { recursive: true, force: true });
    }
  });

  it("5. End-to-end LSP protocol on Myweb/app.js returns real symbols and diagnostics", async () => {
    if (!fs.existsSync(mywebDir)) {
      console.warn("Myweb directory not present, skipping live Myweb test");
      return;
    }

    const resolution = resolveTypeScriptLanguageServer(mywebDir);
    expect(resolution).not.toBeNull();

    const tempStateDir = fs.mkdtempSync(path.join(process.env.TEMP || "C:/temp", "lb-test-lsp-state-"));
    const client = new LspClient({
      executable: resolution!.executable,
      args: resolution!.args,
      projectRoot: mywebDir,
      runnerStateDir: tempStateDir,
      safeEnv: { PATH: "", SystemRoot: process.env.SystemRoot || "C:\\Windows" },
      tsserverPath: resolution!.tsserverPath,
    });

    try {
      await client.start();
      expect(client.isRunning).toBe(true);
      expect(client.initialized).toBe(true);

      const appJsContent = fs.readFileSync(path.join(mywebDir, "app.js"), "utf-8");
      client.openDocument("app.js", appJsContent, "javascript");

      // Wait 1s for diagnostics / index
      await new Promise((r) => setTimeout(r, 1000));

      const symbols = await client.request<any[]>("textDocument/documentSymbol", {
        textDocument: {
          uri: `file:///${path.resolve(mywebDir, "app.js").replace(/\\/g, "/")}`,
        },
      });

      expect(Array.isArray(symbols)).toBe(true);
      expect(symbols.length).toBeGreaterThan(0);

      const symbolNames = symbols.map((s) => s.name);
      expect(symbolNames).toContain("ideas");
      expect(symbolNames).toContain("button");
      expect(symbolNames).toContain("output");

      // Test hover
      const hover = await client.request<any>("textDocument/hover", {
        textDocument: {
          uri: `file:///${path.resolve(mywebDir, "app.js").replace(/\\/g, "/")}`,
        },
        position: { line: 0, character: 7 }, // "ideas"
      });
      expect(hover).toBeDefined();
      expect(hover?.contents).toBeDefined();
    } finally {
      await client.stop();
      fs.rmSync(tempStateDir, { recursive: true, force: true });
    }
  });

  it("6. Real MCP Code Intelligence tools on Myweb return valid data and avoid LSP_NOT_AVAILABLE", async () => {
    if (!fs.existsSync(mywebDir)) return;

    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "lb-mcp-lsp-prod-"));
    const dbFilePath = path.join(tmpDir, "mcp-lsp.db");
    const runnerStatePath = path.join(tmpDir, "runner-state.json");
    const runnerProjectsPath = path.join(tmpDir, "projects.json");

    const managementSecret = "lm_test_mgmt_secret_12345";
    const serverConfig = AppConfigSchema.parse({
      server: { host: "127.0.0.1", port: 0, dbPath: dbFilePath, auth: { managementSecret } },
      logging: { level: "silent", pretty: false },
    });

    const serverInstance = await buildApp({
      config: serverConfig,
      migrationsDir: path.resolve(rootDir, "apps/server/src/db/migrations"),
      enableLogging: false,
      managementSecret,
    });
    const address = await serverInstance.app.listen({ host: "127.0.0.1", port: 0 });
    const match = address.match(/:(\d+)$/);
    const serverPort = match ? Number.parseInt(match[1]!, 10) : 18080;

    const mcpTokenRecord = serverInstance.tokenService.createToken({
      name: "Test-MCP-Token",
      type: "mcp",
      scopes: ["read", "write", "execute"],
    });
    const mcpToken = mcpTokenRecord.token;

    const runnerTokenRecord = serverInstance.tokenService.createToken({
      name: "Test-Runner-Token",
      type: "runner",
      scopes: ["runner:connect"],
    });
    const runnerToken = runnerTokenRecord.token;

    const runnerConfig = RunnerDaemonConfigSchema.parse({
      serverUrl: `ws://127.0.0.1:${serverPort}/runner/ws`,
      token: runnerToken,
      runnerName: "Prod-LSP-Test-Runner",
      statePath: runnerStatePath,
      projectsPath: runnerProjectsPath,
      logging: { level: "silent", pretty: false },
      reconnect: {
        enabled: true,
        initialDelayMs: 100,
        maxDelayMs: 500,
        factor: 1.5,
        jitter: false,
      },
      heartbeatIntervalMs: 5000,
    });

    const runner = new LocalBridgeRunner(runnerConfig);
    const authorized = runner.projectRegistry.add(mywebDir, {
      name: "Myweb",
      accessMode: "read-write",
    });
    runner.projectRegistry.setExecutionMode(authorized.id, "safe-only");
    const projectId = authorized.id;

    await runner.start();

    // Wait for runner registration and project sync
    const startWait = Date.now();
    while (serverInstance.runnerRegistry.count() === 0) {
      if (Date.now() - startWait > 8000) throw new Error("Timeout waiting for runner to register");
      await new Promise((r) => setTimeout(r, 50));
    }
    while (serverInstance.projectService.listProjects().length === 0) {
      if (Date.now() - startWait > 8000) throw new Error("Timeout waiting for projects to sync");
      await new Promise((r) => setTimeout(r, 50));
    }

    // Connect MCP Client
    const transport = new StreamableHTTPClientTransport(
      new URL(`http://127.0.0.1:${serverPort}/mcp`),
      {
        protocolVersion: "2026-07-28",
        requestInit: {
          headers: {
            authorization: `Bearer ${mcpToken}`,
            connection: "close",
          },
        },
      }
    );
    const client = new Client(
      { name: "TestClient", version: "1.0.0" },
      {
        capabilities: {},
        versionNegotiation: { mode: { pin: "2026-07-28" } },
      } as any
    );
    await client.connect(transport);

    try {
      // 1. localbridge_code_document_symbols
      const docSymbolsRes = await client.callTool({
        name: "localbridge_code_document_symbols",
        arguments: { projectId, path: "app.js" },
      });
      expect(docSymbolsRes.isError).toBeFalsy();
      const docSymbolsText = (docSymbolsRes.content[0] as any)?.text;
      const docSymbolsData = JSON.parse(docSymbolsText);
      expect(docSymbolsData.symbols).toBeDefined();
      expect(docSymbolsData.symbols.length).toBeGreaterThan(0);
      const names = docSymbolsData.symbols.map((s: any) => s.name);
      expect(names).toContain("ideas");
      expect(names).toContain("button");

      // 2. localbridge_code_diagnostics
      const diagRes = await client.callTool({
        name: "localbridge_code_diagnostics",
        arguments: { projectId, path: "app.js" },
      });
      expect(diagRes.isError).toBeFalsy();
      const diagData = JSON.parse((diagRes.content[0] as any)?.text);
      expect(diagData.diagnostics).toBeDefined();

      // 3. localbridge_code_hover
      const hoverRes = await client.callTool({
        name: "localbridge_code_hover",
        arguments: { projectId, path: "app.js", line: 0, character: 6 },
      });
      expect(hoverRes.isError).toBeFalsy();
      const hoverData = JSON.parse((hoverRes.content[0] as any)?.text);
      expect(hoverData).toBeDefined();
      expect(hoverData.type || hoverData.signature || hoverData.documentation || hoverData.symbol).toBeDefined();

      // 4. localbridge_code_definition
      const defRes = await client.callTool({
        name: "localbridge_code_definition",
        arguments: { projectId, path: "app.js", line: 11, character: 16 }, // ideas[Math.floor...]
      });
      expect(defRes.isError).toBeFalsy();
      const defData = JSON.parse((defRes.content[0] as any)?.text);
      expect(defData.definitions).toBeDefined();

      // 5. localbridge_code_references
      const refRes = await client.callTool({
        name: "localbridge_code_references",
        arguments: { projectId, path: "app.js", line: 0, character: 6 },
      });
      expect(refRes.isError).toBeFalsy();
      const refData = JSON.parse((refRes.content[0] as any)?.text);
      expect(refData.references).toBeDefined();

      // 6. localbridge_code_call_hierarchy
      const callRes = await client.callTool({
        name: "localbridge_code_call_hierarchy",
        arguments: { projectId, path: "app.js", line: 10, character: 10, direction: "incoming" },
      });
      expect(callRes.isError).toBeFalsy();

      // 7. localbridge_code_impact
      const impactRes = await client.callTool({
        name: "localbridge_code_impact",
        arguments: { projectId, path: "app.js", line: 0, character: 6 },
      });
      expect(impactRes.isError).toBeFalsy();

      // 8. localbridge_code_workspace_symbols
      const wsRes = await client.callTool({
        name: "localbridge_code_workspace_symbols",
        arguments: { projectId, query: "ideas" },
      });
      expect(wsRes.isError).toBeFalsy();
    } finally {
      await client.close();
      await runner.stop();
      await serverInstance.app.close();
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});
