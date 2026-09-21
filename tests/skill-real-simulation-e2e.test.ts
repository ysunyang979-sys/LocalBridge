import { describe, expect, it, beforeAll, afterAll } from "vitest";
import path from "node:path";
import os from "node:os";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { buildApp, type BuiltAppResult } from "../apps/server/src/app.js";
import { AppConfigSchema, createLogger } from "@localbridge/shared";
import { MCP_PROTOCOL_VERSION } from "../apps/server/src/mcp/types.js";
import { LocalBridgeRunner } from "../apps/runner/src/runner.js";
import { RunnerDaemonConfigSchema } from "../apps/runner/src/config/schema.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const migrationsDir = path.resolve(__dirname, "../apps/server/src/db/migrations");

describe("ChatGPT Real Skill Execution E2E Simulation", () => {
  let tmpDir: string;
  let projectDir: string;
  let dbFilePath: string;
  let runnerStatePath: string;
  let runnerProjectsPath: string;
  let serverInstance: BuiltAppResult;
  let serverPort: number;
  let mcpToken: string;
  let runnerToken: string;
  let runner: LocalBridgeRunner;
  let projectId: string;

  beforeAll(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "chatgpt-skill-sim-"));
    projectDir = path.join(tmpDir, "MyWebApp");
    fs.mkdirSync(projectDir, { recursive: true });

    // Seed mock project files
    fs.writeFileSync(
      path.join(projectDir, "package.json"),
      JSON.stringify(
        {
          name: "my-web-app",
          version: "1.0.0",
          scripts: {
            build: "node -e 'console.log(\"Build succeeded\")'",
            dev: "node -e 'console.log(\"Server listening on http://localhost:3000\"); setInterval(() => {}, 1000);'",
            test: "node -e 'console.log(\"All tests passing\"); process.exit(0);'",
          },
        },
        null,
        2
      ),
      "utf-8"
    );
    fs.writeFileSync(path.join(projectDir, "README.md"), "# My Web App\nA full-stack demo.", "utf-8");

    dbFilePath = path.join(tmpDir, "sim.db");
    runnerStatePath = path.join(tmpDir, "runner-state.json");
    runnerProjectsPath = path.join(tmpDir, "projects.json");

    const config = AppConfigSchema.parse({
      server: { host: "127.0.0.1", port: 0, dbPath: dbFilePath },
      logging: { level: "silent", pretty: false },
    });

    serverInstance = await buildApp({
      config,
      migrationsDir,
      enableLogging: false,
    });

    await serverInstance.app.listen({ port: 0, host: "127.0.0.1" });
    serverPort = (serverInstance.app.server.address() as any).port;

    // Create MCP Client token
    const clientTokenRecord = serverInstance.tokenService.createToken({
      name: "chatgpt-client",
      type: "mcp",
      scopes: ["read", "write", "execute"],
    });
    mcpToken = clientTokenRecord.token;

    // Create Runner token and launch Runner daemon connected to server
    const runnerTokenRecord = serverInstance.tokenService.createToken({
      name: "local-runner",
      type: "runner",
      scopes: ["runner:connect"],
    });
    runnerToken = runnerTokenRecord.token;

    const runnerConfig = RunnerDaemonConfigSchema.parse({
      serverUrl: `ws://127.0.0.1:${serverPort}/runner/ws`,
      token: runnerToken,
      runnerName: "test-runner",
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

    const silentLogger = createLogger({ level: "silent", pretty: false, enabled: false });
    runner = new LocalBridgeRunner(runnerConfig, silentLogger);

    const authorized = runner.projectRegistry.add(projectDir, {
      name: "MyWebApp",
      accessMode: "read-write",
    });
    projectId = authorized.id;
    runner.projectRegistry.setExecutionMode(projectId, "project-code");
    runner.projectRegistry.setTrustPolicy(projectId, {
      trustLevel: "full-project-trust",
      commandPolicy: "allow",
      filePolicy: "allow",
    });

    await runner.start();

    // Wait for registration on server
    let ready = false;
    for (let i = 0; i < 50; i++) {
      const p = serverInstance.projectService.getProject(projectId);
      if (p && p.runnerId) {
        ready = true;
        break;
      }
      await new Promise((r) => setTimeout(r, 100));
    }
    if (!ready) {
      throw new Error("Runner did not register and sync project within 5000ms");
    }
  });

  afterAll(async () => {
    if (runner) {
      await runner.stop();
    }
    if (serverInstance) {
      serverInstance.app.server.closeAllConnections?.();
      await serverInstance.app.close();
      serverInstance = null as any;
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {}
  });

  async function callMcpTool(toolName: string, args: Record<string, any>) {
    const res = await fetch(`http://127.0.0.1:${serverPort}/mcp`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept: "application/json, text/event-stream",
        authorization: `Bearer ${mcpToken}`,
        "mcp-protocol-version": MCP_PROTOCOL_VERSION,
        connection: "close",
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: `call_${Date.now()}_${Math.random()}`,
        method: "tools/call",
        params: {
          name: toolName,
          arguments: args,
        },
      }),
    });

    expect(res.status).toBe(200);
    const data = (await res.json()) as any;
    expect(data.result.isError).toBeUndefined();
    return JSON.parse(data.result.content[0].text);
  }

  it("completes full project inspection scenario via nexus.project-inspect", async () => {
    // Step 1: ChatGPT receives prompt "帮我看一下 Myweb 这个项目是做什么的"
    const match = await callMcpTool("localbridge_skill_match", {
      query: "帮我看一下 Myweb 这个项目是做什么的",
    });
    expect(match.matchedSkill?.id).toBe("nexus.project-inspect");
    expect(match.confidence).toBeGreaterThan(0.5);

    // Step 2: ChatGPT fetches skill guidelines
    const skillDetail = await callMcpTool("localbridge_skill_get", {
      skillId: "nexus.project-inspect",
    });
    expect(skillDetail.skill.id).toBe("nexus.project-inspect");
    expect(skillDetail.skill.workflow).toContain("read_manifests");

    // Step 3: ChatGPT follows the workflow
    // 3a. List projects to find ID
    const projectList = await callMcpTool("localbridge_project_list", {});
    const targetProject = projectList.projects.find((p: any) => p.name === "MyWebApp" || p.id === projectId);
    expect(targetProject).toBeDefined();

    // 3b. Read directory list
    const dirList = await callMcpTool("localbridge_directory_list", {
      projectId: targetProject.id,
      path: ".",
    });
    const entries = dirList.entries.map((e: any) => e.name);
    expect(entries).toContain("package.json");
    expect(entries).toContain("README.md");

    // 3c. Read package.json manifest
    const pkgRead = await callMcpTool("localbridge_file_read", {
      projectId: targetProject.id,
      path: "package.json",
    });
    const fileText = pkgRead.lines.map((l: any) => l.text).join("\n");
    const parsedPkg = JSON.parse(fileText);
    expect(parsedPkg.name).toBe("my-web-app");
    expect(parsedPkg.scripts.dev).toBeDefined();
  });

  it("completes start-dev-runtime scenario via nexus.start-dev-runtime", async () => {
    // Step 1: Match skill
    const match = await callMcpTool("localbridge_skill_match", {
      query: "启动开发服务跑起来",
    });
    expect(match.matchedSkill?.id).toBe("nexus.start-dev-runtime");

    // Step 2: Get instructions
    const skillDetail = await callMcpTool("localbridge_skill_get", {
      skillId: "nexus.start-dev-runtime",
    });
    expect(skillDetail.skill.tools).toContain("localbridge_runtime_start");

    // Step 3: Check existing runtimes
    const runtimeList = await callMcpTool("localbridge_runtime_list", {
      projectId: projectId,
    });
    expect(runtimeList.runtimes).toHaveLength(0);

    // Step 4: Launch persistent runtime using detected dev command
    const startRes = await callMcpTool("localbridge_runtime_start", {
      projectId: projectId,
      name: "web-dev",
      launch: {
        kind: "package-script",
        manager: "npm",
        script: "dev",
      },
    });
    expect(["starting", "running"]).toContain(startRes.state);

    // Step 5: Read logs to verify listening port
    await new Promise((resolve) => setTimeout(resolve, 800));
    const logs = await callMcpTool("localbridge_runtime_logs", {
      runtimeId: startRes.runtimeId,
      limit: 10,
    });
    expect(logs.entries.some((l: any) => l.text.includes("http://localhost:3000"))).toBe(true);

    // Clean up runtime
    await callMcpTool("localbridge_runtime_stop", {
      runtimeId: startRes.runtimeId,
    });
  });
});
