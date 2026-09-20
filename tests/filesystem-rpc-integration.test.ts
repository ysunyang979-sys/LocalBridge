import { describe, it, expect, beforeAll, afterAll } from "vitest";
import path from "node:path";
import os from "node:os";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { buildApp, type BuiltAppResult } from "../apps/server/src/app.js";
import { LocalBridgeRunner } from "../apps/runner/src/runner.js";
import { RunnerDaemonConfigSchema } from "../apps/runner/src/config/schema.js";
import { AppConfigSchema, createLogger } from "@localbridge/shared";
import {
  RunnerRpcMethods,
  LocalBridgeErrorCode,
  type DirectoryListResult,
  type FileStatResult,
  type FileReadResult,
} from "@localbridge/protocol";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const migrationsDir = path.resolve(__dirname, "../apps/server/src/db/migrations");

describe("Filesystem RPC End-to-End Integration (Phase 5)", () => {
  let serverInstance: BuiltAppResult;
  let serverPort: number;
  let tmpDir: string;
  let dbFilePath: string;
  let runnerToken: string;
  let runnerStatePath: string;
  let runnerProjectsPath: string;
  let sampleProjectDir: string;
  let runner: LocalBridgeRunner;
  let sampleProjectId: string;
  let connectedRunnerId: string;

  beforeAll(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "lb-fs-rpc-int-"));
    dbFilePath = path.join(tmpDir, "server.db");
    runnerStatePath = path.join(tmpDir, "runner-state.json");
    runnerProjectsPath = path.join(tmpDir, "projects.json");
    sampleProjectDir = path.join(tmpDir, "web-app");

    // Populate test files without trailing newline for deterministic line count
    fs.mkdirSync(path.join(sampleProjectDir, "src"), { recursive: true });
    fs.writeFileSync(
      path.join(sampleProjectDir, "src", "main.ts"),
      "line1: import express from 'express';\nline2: const app = express();\nline3: app.listen(3000);\nline4: console.log('ready');"
    );
    fs.writeFileSync(path.join(sampleProjectDir, "README.md"), "# Web App\nTest suite sample project.");
    fs.writeFileSync(path.join(sampleProjectDir, ".env"), "DATABASE_URL=postgres://user:pass@localhost/db");
    fs.writeFileSync(path.join(sampleProjectDir, "binary.bin"), Buffer.from([0x00, 0x01, 0x02, 0x03]));

    // 1. Build & Start Fastify Server
    const config = AppConfigSchema.parse({
      server: { host: "127.0.0.1", port: 0, dbPath: dbFilePath },
      logging: { level: "silent", pretty: false },
    });

    serverInstance = await buildApp({
      config,
      migrationsDir,
      enableLogging: false,
    });

    const address = await serverInstance.app.listen({ host: "127.0.0.1", port: 0 });
    const match = address.match(/:(\d+)$/);
    serverPort = match ? Number.parseInt(match[1]!, 10) : 18080;

    // 2. Generate Runner Token
    const created = serverInstance.tokenService.createToken({
      name: "FS Integration Runner Token",
      type: "runner",
    });
    runnerToken = created.token;

    // 3. Configure and Start Runner with sample project
    const runnerConfig = RunnerDaemonConfigSchema.parse({
      serverUrl: `ws://127.0.0.1:${serverPort}/runner/ws`,
      token: runnerToken,
      runnerName: "FS-Runner-PC",
      statePath: runnerStatePath,
      projectsPath: runnerProjectsPath,
      logging: { level: "silent", pretty: false },
      reconnect: { enabled: false },
      heartbeatIntervalMs: 5000,
    });

    const silentLogger = createLogger({ level: "silent", pretty: false, enabled: false });
    runner = new LocalBridgeRunner(runnerConfig, silentLogger);

    // Pre-authorize local project
    const authorized = runner.projectRegistry.add(sampleProjectDir, { name: "web-app" });
    sampleProjectId = authorized.id;
    runner.projectRegistry.setTrustPolicy({
      projectId: sampleProjectId,
      trustPolicy: {
        trustLevel: "standard",
        filePolicy: "controlled",
        commandPolicy: "ask",
        protectedFilesPolicy: "deny",
      },
    });

    await runner.start();

    // 4. Wait for runner to establish handshake
    const startWait = Date.now();
    while (serverInstance.runnerRegistry.count() === 0) {
      if (Date.now() - startWait > 5000) {
        throw new Error("Runner did not register within 5000ms");
      }
      await new Promise((r) => setTimeout(r, 50));
    }

    const list = serverInstance.runnerRegistry.list();
    connectedRunnerId = list[0]!.id;
  });

  afterAll(async () => {
    if (runner) {
      await runner.stop();
    }
    if (serverInstance) {
      await serverInstance.app.close();
    }
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  describe("directory.list RPC", () => {
    it("lists directory contents at root and filters sensitive files", async () => {
      const result: DirectoryListResult = await serverInstance.rpcService.request(
        connectedRunnerId,
        RunnerRpcMethods.DirectoryList,
        {
          projectId: sampleProjectId,
          path: ".",
        }
      );

      expect(result.projectId).toBe(sampleProjectId);
      expect(result.path).toBe(".");
      expect(result.sensitiveEntriesFiltered).toBe(true);

      const names = result.entries.map((e) => e.name);
      expect(names).toContain("src");
      expect(names).toContain("README.md");
      expect(names).toContain("binary.bin");
      expect(names).not.toContain(".env");

      // Verify zero host machine path leakage
      const raw = JSON.stringify(result);
      expect(raw.includes(sampleProjectDir)).toBe(false);
      expect(raw.includes(tmpDir)).toBe(false);
    });

    it("paginates directory entries deterministically via cursor and limit", async () => {
      const page1: DirectoryListResult = await serverInstance.rpcService.request(
        connectedRunnerId,
        RunnerRpcMethods.DirectoryList,
        {
          projectId: sampleProjectId,
          path: ".",
          limit: 2,
        }
      );

      expect(page1.entries).toHaveLength(2);
      expect(page1.nextCursor).not.toBeNull();
      expect(typeof page1.nextCursor).toBe("string");

      const page2: DirectoryListResult = await serverInstance.rpcService.request(
        connectedRunnerId,
        RunnerRpcMethods.DirectoryList,
        {
          projectId: sampleProjectId,
          path: ".",
          limit: 2,
          cursor: page1.nextCursor,
        }
      );

      expect(page2.entries.length).toBeGreaterThan(0);
      // Disjoint entries across pages
      const namesPage1 = page1.entries.map((e) => e.name);
      const namesPage2 = page2.entries.map((e) => e.name);
      for (const name of namesPage1) {
        expect(namesPage2).not.toContain(name);
      }
    });

    it("rejects path traversal in directory.list with PATH_TRAVERSAL", async () => {
      await expect(
        serverInstance.rpcService.request(connectedRunnerId, RunnerRpcMethods.DirectoryList, {
          projectId: sampleProjectId,
          path: "../",
        })
      ).rejects.toMatchObject({
        code: LocalBridgeErrorCode.PATH_TRAVERSAL,
      });
    });
  });

  describe("file.stat RPC", () => {
    it("returns metadata for directory and file without leaking physical path", async () => {
      // 1. Directory stat
      const dirStat: FileStatResult = await serverInstance.rpcService.request(
        connectedRunnerId,
        RunnerRpcMethods.FileStat,
        {
          projectId: sampleProjectId,
          path: "src",
        }
      );

      expect(dirStat.projectId).toBe(sampleProjectId);
      expect(dirStat.path).toBe("src");
      expect(dirStat.name).toBe("src");
      expect(dirStat.type).toBe("directory");

      // 2. File stat
      const fileStat: FileStatResult = await serverInstance.rpcService.request(
        connectedRunnerId,
        RunnerRpcMethods.FileStat,
        {
          projectId: sampleProjectId,
          path: "src/main.ts",
        }
      );

      expect(fileStat.projectId).toBe(sampleProjectId);
      expect(fileStat.path).toBe("src/main.ts");
      expect(fileStat.name).toBe("main.ts");
      expect(fileStat.type).toBe("file");
      expect(fileStat.size).toBeGreaterThan(0);
      expect(fileStat.modifiedAt).toBeGreaterThan(0);

      // Verify zero host machine path leakage
      const raw = JSON.stringify(fileStat);
      expect(raw.includes(sampleProjectDir)).toBe(false);
      expect(raw.includes(tmpDir)).toBe(false);
    });

    it("rejects stat on sensitive credential files with SENSITIVE_FILE_BLOCKED", async () => {
      await expect(
        serverInstance.rpcService.request(connectedRunnerId, RunnerRpcMethods.FileStat, {
          projectId: sampleProjectId,
          path: ".env",
        })
      ).rejects.toMatchObject({
        code: LocalBridgeErrorCode.SENSITIVE_FILE_BLOCKED,
      });
    });

    it("returns FILE_NOT_FOUND when file does not exist", async () => {
      await expect(
        serverInstance.rpcService.request(connectedRunnerId, RunnerRpcMethods.FileStat, {
          projectId: sampleProjectId,
          path: "src/non-existent.ts",
        })
      ).rejects.toMatchObject({
        code: LocalBridgeErrorCode.FILE_NOT_FOUND,
      });
    });
  });

  describe("file.read RPC", () => {
    it("reads UTF-8 text file lines correctly", async () => {
      const result: FileReadResult = await serverInstance.rpcService.request(
        connectedRunnerId,
        RunnerRpcMethods.FileRead,
        {
          projectId: sampleProjectId,
          path: "src/main.ts",
        }
      );

      expect(result.projectId).toBe(sampleProjectId);
      expect(result.path).toBe("src/main.ts");
      expect(result.encoding).toBe("utf-8");
      expect(result.startLine).toBe(1);
      expect(result.endLine).toBe(4);
      expect(result.nextLine).toBeNull();
      expect(result.truncated).toBe(false);
      expect(result.lines).toHaveLength(4);
      expect(result.lines[0]).toEqual({ line: 1, text: "line1: import express from 'express';" });
      expect(result.lines[3]).toEqual({ line: 4, text: "line4: console.log('ready');" });

      // Verify zero host machine path leakage
      const raw = JSON.stringify(result);
      expect(raw.includes(sampleProjectDir)).toBe(false);
      expect(raw.includes(tmpDir)).toBe(false);
    });

    it("reads slice window with startLine and maxLines", async () => {
      const result: FileReadResult = await serverInstance.rpcService.request(
        connectedRunnerId,
        RunnerRpcMethods.FileRead,
        {
          projectId: sampleProjectId,
          path: "src/main.ts",
          startLine: 2,
          maxLines: 2,
        }
      );

      expect(result.startLine).toBe(2);
      expect(result.endLine).toBe(3);
      expect(result.nextLine).toBe(4);
      expect(result.lines).toHaveLength(2);
      expect(result.lines[0]?.line).toBe(2);
      expect(result.lines[1]?.line).toBe(3);
    });

    it("rejects binary files with BINARY_FILE", async () => {
      await expect(
        serverInstance.rpcService.request(connectedRunnerId, RunnerRpcMethods.FileRead, {
          projectId: sampleProjectId,
          path: "binary.bin",
        })
      ).rejects.toMatchObject({
        code: LocalBridgeErrorCode.BINARY_FILE,
      });
    });

    it("rejects sensitive files with SENSITIVE_FILE_BLOCKED", async () => {
      await expect(
        serverInstance.rpcService.request(connectedRunnerId, RunnerRpcMethods.FileRead, {
          projectId: sampleProjectId,
          path: ".env",
        })
      ).rejects.toMatchObject({
        code: LocalBridgeErrorCode.SENSITIVE_FILE_BLOCKED,
      });
    });

    it("rejects non-existent file with FILE_NOT_FOUND", async () => {
      await expect(
        serverInstance.rpcService.request(connectedRunnerId, RunnerRpcMethods.FileRead, {
          projectId: sampleProjectId,
          path: "missing-file.ts",
        })
      ).rejects.toMatchObject({
        code: LocalBridgeErrorCode.FILE_NOT_FOUND,
      });
    });
  });

  describe("Project Status Enforcement", () => {
    it("rejects filesystem operations on unknown projectId with PROJECT_NOT_FOUND", async () => {
      await expect(
        serverInstance.rpcService.request(connectedRunnerId, RunnerRpcMethods.DirectoryList, {
          projectId: "proj_does_not_exist",
          path: ".",
        })
      ).rejects.toMatchObject({
        code: LocalBridgeErrorCode.PROJECT_NOT_FOUND,
      });
    });

    it("rejects filesystem operations on disabled project with PROJECT_DISABLED", async () => {
      runner.projectRegistry.disable(sampleProjectId);

      try {
        await expect(
          serverInstance.rpcService.request(connectedRunnerId, RunnerRpcMethods.DirectoryList, {
            projectId: sampleProjectId,
            path: ".",
          })
        ).rejects.toMatchObject({
          code: LocalBridgeErrorCode.PROJECT_DISABLED,
        });

        await expect(
          serverInstance.rpcService.request(connectedRunnerId, RunnerRpcMethods.FileStat, {
            projectId: sampleProjectId,
            path: "README.md",
          })
        ).rejects.toMatchObject({
          code: LocalBridgeErrorCode.PROJECT_DISABLED,
        });

        await expect(
          serverInstance.rpcService.request(connectedRunnerId, RunnerRpcMethods.FileRead, {
            projectId: sampleProjectId,
            path: "README.md",
          })
        ).rejects.toMatchObject({
          code: LocalBridgeErrorCode.PROJECT_DISABLED,
        });
      } finally {
        runner.projectRegistry.enable(sampleProjectId);
      }
    });
  });
});
