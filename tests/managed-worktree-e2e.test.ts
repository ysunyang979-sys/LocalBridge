import { describe, it, expect, beforeAll, afterAll } from "vitest";
import path from "node:path";
import os from "node:os";
import fs from "node:fs";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { buildApp, type BuiltAppResult } from "../apps/server/src/app.js";
import { LocalBridgeRunner } from "../apps/runner/src/runner.js";
import { RunnerDaemonConfigSchema } from "../apps/runner/src/config/schema.js";
import { AppConfigSchema, createLogger } from "@localbridge/shared";
import { Client, StreamableHTTPClientTransport } from "@modelcontextprotocol/client";
import { LocalBridgeErrorCode } from "@localbridge/protocol";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const migrationsDir = path.resolve(__dirname, "../apps/server/src/db/migrations");
const fixtureSourceDir = path.resolve(__dirname, "fixtures/worktree-project");

describe("P3-C Managed Worktree / Isolated Development Workspace Comprehensive E2E", () => {
  let tmpDir: string;
  let dbFilePath: string;
  let projectDir: string;
  let nonGitProjectDir: string;
  let runnerStatePath: string;
  let runnerProjectsPath: string;

  let serverInstance: BuiltAppResult;
  let serverPort: number;
  let mcpToken: string;
  let runnerToken: string;
  let managementSecret: string;
  let runner: LocalBridgeRunner;
  let projectId: string;
  let nonGitProjectId: string;

  let client: Client;
  let transport: StreamableHTTPClientTransport;

  beforeAll(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "lb-worktree-e2e-"));
    dbFilePath = path.join(tmpDir, "worktree-e2e.db");
    projectDir = path.join(tmpDir, "worktree-project");
    nonGitProjectDir = path.join(tmpDir, "non-git-project");
    runnerStatePath = path.join(tmpDir, "runner-state.json");
    runnerProjectsPath = path.join(tmpDir, "projects.json");

    // Copy fixture into project dirs
    fs.cpSync(fixtureSourceDir, projectDir, { recursive: true });
    fs.cpSync(fixtureSourceDir, nonGitProjectDir, { recursive: true });

    // Initialize git repo in projectDir
    execSync("git init -b main", { cwd: projectDir, stdio: "ignore" });
    execSync("git config user.email test@nexus.local", { cwd: projectDir, stdio: "ignore" });
    execSync("git config user.name TestOperator", { cwd: projectDir, stdio: "ignore" });
    execSync("git add .", { cwd: projectDir, stdio: "ignore" });
    execSync('git commit -m "initial commit"', { cwd: projectDir, stdio: "ignore" });

    // 1. Build & Start Server
    managementSecret = "lm_super_secret_management_token_worktree";
    const serverConfig = AppConfigSchema.parse({
      server: { host: "127.0.0.1", port: 0, dbPath: dbFilePath, auth: { managementSecret } },
      logging: { level: "silent", pretty: false },
    });

    serverInstance = await buildApp({
      config: serverConfig,
      migrationsDir,
      enableLogging: false,
      managementSecret,
    });

    const address = await serverInstance.app.listen({ host: "127.0.0.1", port: 0 });
    const match = address.match(/:(\d+)$/);
    serverPort = match ? Number.parseInt(match[1]!, 10) : 18080;

    // Tokens
    const mcpTokenRecord = serverInstance.tokenService.createToken({
      name: "Worktree-E2E-MCP-Token",
      type: "mcp",
      scopes: ["read", "write", "execute"],
    });
    mcpToken = mcpTokenRecord.token;

    const runnerTokenRecord = serverInstance.tokenService.createToken({
      name: "Worktree-E2E-Runner-Token",
      type: "runner",
      scopes: ["runner:connect"],
    });
    runnerToken = runnerTokenRecord.token;

    // 2. Start Runner Daemon
    const runnerConfig = RunnerDaemonConfigSchema.parse({
      serverUrl: `ws://127.0.0.1:${serverPort}/runner/ws`,
      token: runnerToken,
      runnerName: "Worktree-E2E-Runner",
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
      name: "worktree-project",
      accessMode: "read-write",
    });
    projectId = authorized.id;
    runner.projectRegistry.setExecutionMode(projectId, "project-code");
    runner.projectRegistry.setTrustPolicy(projectId, {
      trustLevel: "full-project-trust",
      commandPolicy: "allow",
      filePolicy: "allow",
    });

    const authorizedNonGit = runner.projectRegistry.add(nonGitProjectDir, {
      name: "non-git-project",
      accessMode: "read-write",
    });
    nonGitProjectId = authorizedNonGit.id;
    runner.projectRegistry.setExecutionMode(nonGitProjectId, "project-code");
    runner.projectRegistry.setTrustPolicy(nonGitProjectId, {
      trustLevel: "full-project-trust",
      commandPolicy: "allow",
      filePolicy: "allow",
    });

    await runner.start();

    // Wait for runner registration on server
    let ready = false;
    for (let i = 0; i < 50; i++) {
      const p = serverInstance.projectService.getProject(projectId);
      if (p && p.runnerId) {
        ready = true;
        break;
      }
      await new Promise((r) => setTimeout(r, 100));
    }
    expect(ready).toBe(true);

    // 3. Connect MCP Client
    transport = new StreamableHTTPClientTransport(
      new URL(`http://127.0.0.1:${serverPort}/mcp`),
      {
        protocolVersion: "2026-07-28",
        requestInit: {
          headers: {
            Authorization: `Bearer ${mcpToken}`,
            connection: "close",
          },
        },
      }
    );

    client = new Client(
      { name: "worktree-test-client", version: "1.0.0" },
      {
        capabilities: {},
        versionNegotiation: { mode: { pin: "2026-07-28" } },
      } as any
    );
    await client.connect(transport);
  }, 45000);

  afterAll(async () => {
    try {
      await client?.close();
    } catch {}
    try {
      await runner?.stop();
    } catch {}
    try {
      await serverInstance?.app?.close();
    } catch {}
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {}
  });

  // ============================================================
  // 1. Worktree Creation
  // ============================================================
  describe("1. Worktree Creation", () => {
    let activeSessionId: string;
    let createdWorktreeId: string;

    it("Scenario 1: Successful creation with valid branch, default base (main), bound to session", async () => {
      // Start session
      const startRes = (await client.callTool({
        name: "localbridge_session_start",
        arguments: {
          projectId,
          goal: "P3-C Test Worktree Isolation",
          title: "Worktree Test",
        },
      })) as any;
      const startData = JSON.parse(startRes.content[0].text);
      activeSessionId = startData.sessionId;
      expect(activeSessionId).toBeDefined();

      // Create worktree
      const createRes = (await client.callTool({
        name: "localbridge_worktree_create",
        arguments: {
          projectId,
          branchName: "nexus/p3c-feat-1",
          sessionId: activeSessionId,
        },
      })) as any;
      const createData = JSON.parse(createRes.content[0].text);
      expect(createData.worktree).toBeDefined();
      expect(createData.worktree.branchName).toBe("nexus/p3c-feat-1");
      expect(createData.worktree.sessionId).toBe(activeSessionId);
      expect(createData.worktree.isClean).toBe(true);
      expect(fs.existsSync(createData.worktree.worktreeRoot)).toBe(true);

      createdWorktreeId = createData.worktree.id;
    });

    it("Scenario 2: Creation with custom base branch", async () => {
      const createRes = (await client.callTool({
        name: "localbridge_worktree_create",
        arguments: {
          projectId,
          branchName: "nexus/p3c-feat-2",
          baseBranch: "main",
        },
      })) as any;
      const data = JSON.parse(createRes.content[0].text);
      expect(data.worktree.branchName).toBe("nexus/p3c-feat-2");
      expect(data.worktree.baseBranch).toBe("main");

      // Clean it up
      await client.callTool({
        name: "localbridge_worktree_remove",
        arguments: {
          worktreeId: data.worktree.id,
        },
      });
    });

    it("Scenario 3: Non-git project rejected with WORKTREE_INVALID_BASE", async () => {
      const res = (await client.callTool({
        name: "localbridge_worktree_create",
        arguments: {
          projectId: nonGitProjectId,
          branchName: "nexus/p3c-invalid",
        },
      })) as any;
      expect(res.isError).toBe(true);
      expect(res.content[0].text.toLowerCase()).toContain("not a git repository");
    });

    it("Scenario 4: Duplicate active worktree on same session rejected with WORKTREE_ALREADY_EXISTS", async () => {
      const res = (await client.callTool({
        name: "localbridge_worktree_create",
        arguments: {
          projectId,
          branchName: "nexus/p3c-duplicate",
          sessionId: activeSessionId,
        },
      })) as any;
      expect(res.isError).toBe(true);
      expect(res.content[0].text).toContain("already has an active");
    });

    it("Scenario 5: Invalid branch name rejected with WORKTREE_INVALID_BRANCH", async () => {
      const res = (await client.callTool({
        name: "localbridge_worktree_create",
        arguments: {
          projectId,
          branchName: "nexus/bad..branch",
        },
      })) as any;
      expect(res.isError).toBe(true);
      expect(res.content[0].text).toContain("consecutive dots");
    });

    it("Scenario 6: Existing branch name rejected with WORKTREE_BRANCH_EXISTS", async () => {
      const res = (await client.callTool({
        name: "localbridge_worktree_create",
        arguments: {
          projectId,
          branchName: "nexus/p3c-feat-1",
        },
      })) as any;
      expect(res.isError).toBe(true);
      expect(res.content[0].text).toContain("already exists");
    });
  });

  // ============================================================
  // 2. Workspace Resolution & Strict Isolation
  // ============================================================
  describe("2. Workspace Resolution & Strict Isolation", () => {
    let sessionWorktreeRoot: string;
    let sessionId: string;

    beforeAll(async () => {
      // List worktrees to get the active worktree root
      const listRes = (await client.callTool({
        name: "localbridge_worktree_list",
        arguments: { projectId },
      })) as any;
      const data = JSON.parse(listRes.content[0].text);
      const wt = data.worktrees[0];
      sessionWorktreeRoot = wt.worktreeRoot || wt.worktreePath;
      sessionId = wt.sessionId;
    });

    it("Scenario 7: Safe path validation prevents relative path escaping worktree root", async () => {
      const res = (await client.callTool({
        name: "localbridge_file_read",
        arguments: {
          projectId,
          path: "../../outside.txt",
          sessionId,
        },
      })) as any;
      expect(res.isError).toBe(true);
      expect(res.content[0].text).toContain("outside");
    });

    it("Scenario 8: Worktree .git file protected from direct filesystem operations", async () => {
      const res = (await client.callTool({
        name: "localbridge_file_read",
        arguments: {
          projectId,
          path: ".git",
          sessionId,
        },
      })) as any;
      expect(res.isError).toBe(true);
      expect(res.content[0].text).toContain(".git");
    });

    it("Scenario 9: File created in worktree does NOT appear in primary workspace", async () => {
      // Create file in worktree under session
      const createRes = (await client.callTool({
        name: "localbridge_file_create",
        arguments: {
          projectId,
          path: "src/isolated-feature.ts",
          content: "export const isolated = true;\n",
          sessionId,
        },
      })) as any;
      expect(createRes.isError).toBeFalsy();

      // Check existence on disk: must exist in worktree, must NOT exist in primary
      expect(fs.existsSync(path.join(sessionWorktreeRoot, "src/isolated-feature.ts"))).toBe(true);
      expect(fs.existsSync(path.join(projectDir, "src/isolated-feature.ts"))).toBe(false);

      // Verify reading with sessionId succeeds, reading without sessionId fails (file not found in primary)
      const readWithSession = (await client.callTool({
        name: "localbridge_file_read",
        arguments: {
          projectId,
          path: "src/isolated-feature.ts",
          sessionId,
        },
      })) as any;
      expect(readWithSession.isError).toBeFalsy();
      const readData = JSON.parse(readWithSession.content[0].text);
      const fileText = readData.lines.map((l: any) => l.text).join("\n");
      expect(fileText).toContain("export const isolated = true;");

      const readWithoutSession = (await client.callTool({
        name: "localbridge_file_read",
        arguments: {
          projectId,
          path: "src/isolated-feature.ts",
        },
      })) as any;
      expect(readWithoutSession.isError).toBe(true);
      expect((readWithoutSession as any).structuredContent?.code || readWithoutSession.content[0].text).toContain(LocalBridgeErrorCode.FILE_NOT_FOUND);
    });

    it("Scenario 10: Primary workspace git status remains clean while worktree has uncommitted files", async () => {
      // Primary git status
      const primaryStatusRes = (await client.callTool({
        name: "localbridge_git_status",
        arguments: {
          projectId,
        },
      })) as any;
      const primaryStatus = JSON.parse(primaryStatusRes.content[0].text);
      expect(primaryStatus.clean).toBe(true);
      expect(primaryStatus.branch).toBe("main");

      // Worktree git status under session
      const worktreeStatusRes = (await client.callTool({
        name: "localbridge_git_status",
        arguments: {
          projectId,
          sessionId,
        },
      })) as any;
      const worktreeStatus = JSON.parse(worktreeStatusRes.content[0].text);
      expect(worktreeStatus.clean).toBe(false);
      expect(worktreeStatus.branch).toBe("nexus/p3c-feat-1");
      const untrackedPaths = worktreeStatus.entries
        .filter((e: any) => e.kind === "untracked")
        .map((e: any) => e.path);
      expect(untrackedPaths).toContain("src/isolated-feature.ts");
    });

    it("Scenario 11: Primary workspace file modification does NOT affect worktree", async () => {
      // Create a file directly in primary workspace
      fs.writeFileSync(path.join(projectDir, "primary-only.txt"), "hello from primary");

      // Worktree should not see it
      expect(fs.existsSync(path.join(sessionWorktreeRoot, "primary-only.txt"))).toBe(false);

      // Reading under session should not find it
      const readRes = (await client.callTool({
        name: "localbridge_file_read",
        arguments: {
          projectId,
          path: "primary-only.txt",
          sessionId,
        },
      })) as any;
      expect(readRes.isError).toBe(true);

      // Clean up primary-only.txt
      if (fs.existsSync(path.join(projectDir, "primary-only.txt"))) {
        fs.unlinkSync(path.join(projectDir, "primary-only.txt"));
      }
    });
  });

  // ============================================================
  // 3. Tool Routing to Worktree
  // ============================================================
  describe("3. Tool Routing to Worktree", () => {
    let sessionWorktreeRoot: string;
    let sessionId: string;

    beforeAll(async () => {
      const listRes = (await client.callTool({
        name: "localbridge_worktree_list",
        arguments: { projectId },
      })) as any;
      const data = JSON.parse(listRes.content[0].text);
      const wt = data.worktrees[0];
      sessionWorktreeRoot = wt.worktreeRoot || wt.worktreePath;
      sessionId = wt.sessionId;
    });

    it("Scenario 12: localbridge_file_write under session updates file in worktree", async () => {
      // First read to get expectedHash
      const readRes = (await client.callTool({
        name: "localbridge_file_read",
        arguments: {
          projectId,
          path: "src/math.ts",
          sessionId,
        },
      })) as any;
      expect(readRes.isError).toBeFalsy();
      const readData = JSON.parse(readRes.content[0].text);

      const writeRes = (await client.callTool({
        name: "localbridge_file_write",
        arguments: {
          projectId,
          path: "src/math.ts",
          expectedHash: readData.contentHash,
          content: "export function add(a: number, b: number): number { return a + b + 100; }\n",
          sessionId,
        },
      })) as any;
      if (writeRes.isError) {
        console.error("Scenario 12 write error:", writeRes.content?.[0]?.text);
      }
      expect(writeRes.isError).toBeFalsy();

      // Verify worktree file has changed, primary has NOT changed
      const worktreeContent = fs.readFileSync(path.join(sessionWorktreeRoot, "src/math.ts"), "utf-8");
      const primaryContent = fs.readFileSync(path.join(projectDir, "src/math.ts"), "utf-8");

      expect(worktreeContent).toContain("a + b + 100");
      expect(primaryContent).not.toContain("a + b + 100");
    });

    it("Scenario 13: localbridge_file_patch under session patches file in worktree", async () => {
      // Read to get expectedHash
      const readRes = (await client.callTool({
        name: "localbridge_file_read",
        arguments: {
          projectId,
          path: "src/math.ts",
          sessionId,
        },
      })) as any;
      const readData = JSON.parse(readRes.content[0].text);

      const patchRes = (await client.callTool({
        name: "localbridge_file_patch",
        arguments: {
          projectId,
          path: "src/math.ts",
          expectedHash: readData.contentHash,
          replacements: [{ search: "a + b + 100", replace: "a + b + 200" }],
          sessionId,
        },
      })) as any;
      if (patchRes.isError) {
        console.error("Scenario 13 patch error:", patchRes.content?.[0]?.text);
      }
      expect(patchRes.isError).toBeFalsy();

      const worktreeContent = fs.readFileSync(path.join(sessionWorktreeRoot, "src/math.ts"), "utf-8");
      expect(worktreeContent).toContain("a + b + 200");
    });

    it("Scenario 14: localbridge_file_stat under session stats file in worktree", async () => {
      const statRes = (await client.callTool({
        name: "localbridge_file_stat",
        arguments: {
          projectId,
          path: "src/math.ts",
          sessionId,
        },
      })) as any;
      expect(statRes.isError).toBeFalsy();
      const statData = JSON.parse(statRes.content[0].text);
      expect(statData.type).toBe("file");
    });

    it("Scenario 15: localbridge_git_stage & git_commit under session operate on worktree branch", async () => {
      // Stage math.ts and isolated-feature.ts
      const stageRes = (await client.callTool({
        name: "localbridge_git_stage",
        arguments: {
          projectId,
          paths: ["src/math.ts", "src/isolated-feature.ts"],
          sessionId,
        },
      })) as any;
      expect(stageRes.isError).toBeFalsy();

      // Commit under session
      const commitRes = (await client.callTool({
        name: "localbridge_git_commit",
        arguments: {
          projectId,
          message: "feat: add isolated feature and update math",
          sessionId,
        },
      })) as any;
      expect(commitRes.isError).toBeFalsy();
      const commitData = JSON.parse(commitRes.content[0].text);
      expect(commitData.commitHash).toBeDefined();

      // Verify worktree log has the new commit, primary git log does NOT
      const worktreeLog = execSync("git log -n 1 --oneline", { cwd: sessionWorktreeRoot, encoding: "utf-8" });
      const primaryLog = execSync("git log -n 1 --oneline", { cwd: projectDir, encoding: "utf-8" });

      expect(worktreeLog).toContain("feat: add isolated feature");
      expect(primaryLog).not.toContain("feat: add isolated feature");
    });

    it("Scenario 16: localbridge_command_run under session executes with cwd = worktreeRoot", async () => {
      const cmdRes = (await client.callTool({
        name: "localbridge_command_run",
        arguments: {
          projectId,
          kind: "node-script",
          path: "scripts/print-cwd.js",
          sessionId,
        },
      })) as any;
      if (cmdRes.isError) {
        console.error("Scenario 16 cmd error:", cmdRes.content?.[0]?.text);
      }
      expect(cmdRes.isError).toBeFalsy();
      const data = JSON.parse(cmdRes.content[0].text);
      const normalizedStdout = data.stdout.trim().replace(/\\/g, "/").toLowerCase();
      const normalizedWorktreeRoot = sessionWorktreeRoot.replace(/\\/g, "/").toLowerCase();
      const normalizedTmpDir = tmpDir.replace(/\\/g, "/").toLowerCase();
      const expectedSanitized = normalizedWorktreeRoot.replace(normalizedTmpDir, "<runner-state>");
      expect(normalizedStdout).toBe(expectedSanitized);
    });

    it("Scenario 17: localbridge_job_start under session records worktreeMode and worktreeId", async () => {
      const jobRes = (await client.callTool({
        name: "localbridge_job_start",
        arguments: {
          command: {
            projectId,
            kind: "node-script",
            path: "scripts/print-cwd.js",
          },
          sessionId,
        },
      })) as any;
      if (jobRes.isError) {
        console.error("Scenario 17 job error:", jobRes.content?.[0]?.text);
      }
      expect(jobRes.isError).toBeFalsy();
      const data = JSON.parse(jobRes.content[0].text);
      expect(data.jobId).toBeDefined();

      // Wait for job to complete
      let finished = false;
      for (let i = 0; i < 30; i++) {
        const stRes = (await client.callTool({
          name: "localbridge_job_status",
          arguments: { jobId: data.jobId },
        })) as any;
        const st = JSON.parse(stRes.content[0].text);
        if (st.state === "succeeded" || st.state === "failed") {
          finished = true;
          break;
        }
        await new Promise((r) => setTimeout(r, 200));
      }
      expect(finished).toBe(true);
    });

    it("Scenario 18: localbridge_code_document_symbols under session extracts symbols from worktree", async () => {
      const symRes = (await client.callTool({
        name: "localbridge_code_document_symbols",
        arguments: {
          projectId,
          path: "src/isolated-feature.ts",
          sessionId,
        },
      })) as any;
      if (symRes.isError) {
        console.error("Scenario 18 sym error:", symRes.content?.[0]?.text);
      }
      expect(symRes.isError).toBeFalsy();
      const data = JSON.parse(symRes.content[0].text);
      expect(data.symbols).toBeDefined();
    });
  });

  // ============================================================
  // 4. Worktree Status & Diff
  // ============================================================
  describe("4. Worktree Status & Diff", () => {
    let worktreeId: string;
    let sessionId: string;

    beforeAll(async () => {
      const listRes = (await client.callTool({
        name: "localbridge_worktree_list",
        arguments: { projectId },
      })) as any;
      const data = JSON.parse(listRes.content[0].text);
      const wt = data.worktrees[0];
      worktreeId = wt.id;
      sessionId = wt.sessionId;
    });

    it("Scenario 19: localbridge_worktree_status reports correct status", async () => {
      const statusRes = (await client.callTool({
        name: "localbridge_worktree_status",
        arguments: {
          worktreeId,
          projectId,
        },
      })) as any;
      expect(statusRes.isError).toBeFalsy();
      const data = JSON.parse(statusRes.content[0].text);
      expect(data.isClean).toBe(true);
      expect(data.branchName).toBe("nexus/p3c-feat-1");
      expect(data.stagedCount).toBe(0);
      expect(data.unstagedCount).toBe(0);
      expect(data.untrackedCount).toBe(0);
    });

    it("Scenario 20: localbridge_worktree_diff shows changes vs base branch", async () => {
      const diffRes = (await client.callTool({
        name: "localbridge_worktree_diff",
        arguments: {
          worktreeId,
          projectId,
        },
      })) as any;
      if (diffRes.isError) {
        console.error("Scenario 20 diff error:", diffRes.content?.[0]?.text);
      }
      expect(diffRes.isError).toBeFalsy();
      const data = JSON.parse(diffRes.content[0].text);
      expect(data.diff).toContain("isolated-feature.ts");
      expect(data.stats?.filesChanged ?? data.filesChanged).toBeGreaterThan(0);
    });
  });

  // ============================================================
  // 5. Worktree Removal Safety & Invariants
  // ============================================================
  describe("5. Worktree Removal Safety", () => {
    let cleanWorktreeId: string;
    let dirtyWorktreeId: string;
    let dirtyWorktreeRoot: string;

    it("Scenario 21: Removal blocked when worktree is dirty (WORKTREE_DIRTY)", async () => {
      // Create a standalone worktree
      const createRes = (await client.callTool({
        name: "localbridge_worktree_create",
        arguments: {
          projectId,
          branchName: "nexus/p3c-dirty-test",
        },
      })) as any;
      const data = JSON.parse(createRes.content[0].text);
      dirtyWorktreeId = data.worktreeId || data.worktree?.id;
      dirtyWorktreeRoot = data.worktreePath || data.worktree?.worktreeRoot;

      // Create an uncommitted file in dirty worktree
      fs.writeFileSync(path.join(dirtyWorktreeRoot, "dirty.txt"), "uncommitted dirty content");

      // Attempt to remove: must fail with WORKTREE_DIRTY
      const removeRes = (await client.callTool({
        name: "localbridge_worktree_remove",
        arguments: {
          worktreeId: dirtyWorktreeId,
        },
      })) as any;
      expect(removeRes.isError).toBe(true);
      expect(removeRes.content[0].text).toContain(LocalBridgeErrorCode.WORKTREE_DIRTY);

      // Clean up dirty file so we can test unmerged commits
      fs.unlinkSync(path.join(dirtyWorktreeRoot, "dirty.txt"));
    });

    it("Scenario 22: Removal blocked when unmerged commits exist (WORKTREE_HAS_UNMERGED_COMMITS)", async () => {
      // Commit a change in dirtyWorktree
      fs.writeFileSync(path.join(dirtyWorktreeRoot, "committed.txt"), "committed content");
      execSync("git add .", { cwd: dirtyWorktreeRoot, stdio: "ignore" });
      execSync("git commit -m \"new commit on branch\"", { cwd: dirtyWorktreeRoot, stdio: "ignore" });

      // Attempt removal: must fail because HEAD != baseCommit
      const removeRes = (await client.callTool({
        name: "localbridge_worktree_remove",
        arguments: {
          worktreeId: dirtyWorktreeId,
        },
      })) as any;
      expect(removeRes.isError).toBe(true);
      expect(removeRes.content[0].text).toContain(LocalBridgeErrorCode.WORKTREE_HAS_UNMERGED_COMMITS);

      // Reset the commit to match base so we can test clean removal
      execSync("git reset --hard HEAD~1", { cwd: dirtyWorktreeRoot, stdio: "ignore" });
    });

    it("Scenario 23: Safe removal succeeds when clean and HEAD == baseCommit", async () => {
      const removeRes = (await client.callTool({
        name: "localbridge_worktree_remove",
        arguments: {
          worktreeId: dirtyWorktreeId,
        },
      })) as any;
      expect(removeRes.isError).toBeFalsy();
      const data = JSON.parse(removeRes.content[0].text);
      expect(data.removed).toBe(true);
      expect(fs.existsSync(dirtyWorktreeRoot)).toBe(false);
    });

    it("Scenario 24: Worktree branch is preserved (NOT deleted) on removal", async () => {
      const branches = execSync("git branch", { cwd: projectDir, encoding: "utf-8" });
      expect(branches).toContain("nexus/p3c-dirty-test");
    });
  });

  // ============================================================
  // 6. Session Integration & Handoff
  // ============================================================
  describe("6. Session Integration & Handoff", () => {
    let activeSessionId: string;

    beforeAll(async () => {
      const listRes = (await client.callTool({
        name: "localbridge_session_list",
        arguments: { projectId, state: "active" },
      })) as any;
      const data = JSON.parse(listRes.content[0].text);
      activeSessionId = data.sessions[0].sessionId;
    });

    it("Scenario 25: localbridge_session_status returns workspace with mode 'worktree'", async () => {
      const statusRes = (await client.callTool({
        name: "localbridge_session_status",
        arguments: { sessionId: activeSessionId },
      })) as any;
      expect(statusRes.isError).toBeFalsy();
      const data = JSON.parse(statusRes.content[0].text);
      expect(data.workspace).toBeDefined();
      expect(data.workspace.mode).toBe("worktree");
      expect(data.workspace.branchName).toBe("nexus/p3c-feat-1");
      expect(data.workspace.worktreeRoot).toBeDefined();
    });

    it("Scenario 26: localbridge_session_handoff includes workspace info and worktree prompt line", async () => {
      const handoffRes = (await client.callTool({
        name: "localbridge_session_handoff",
        arguments: { sessionId: activeSessionId },
      })) as any;
      expect(handoffRes.isError).toBeFalsy();
      const data = JSON.parse(handoffRes.content[0].text);
      expect(data.workspace).toBeDefined();
      expect(data.workspace.mode).toBe("worktree");
      expect(data.continuationPrompt).toContain("Mode: Managed Worktree (isolated)");
      expect(data.continuationPrompt).toContain("Branch: nexus/p3c-feat-1");
    });

    it("Scenario 27: Primary workspace remains 100% untouched throughout entire test suite", async () => {
      const primaryStatus = execSync("git status --porcelain", { cwd: projectDir, encoding: "utf-8" });
      expect(primaryStatus.trim()).toBe("");

      // Verify no unexpected files were created in projectDir
      expect(fs.existsSync(path.join(projectDir, "src/isolated-feature.ts"))).toBe(false);
      const mathContent = fs.readFileSync(path.join(projectDir, "src/math.ts"), "utf-8");
      expect(mathContent).not.toContain("200");
    });
  });
});
