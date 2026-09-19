import { describe, it, expect, beforeAll, afterAll } from "vitest";
import path from "node:path";
import os from "node:os";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { buildApp, type BuiltAppResult } from "../apps/server/src/app.js";
import { LocalBridgeRunner } from "../apps/runner/src/runner.js";
import { RunnerDaemonConfigSchema } from "../apps/runner/src/config/schema.js";
import {
  AppConfigSchema,
  createLogger,
} from "@localbridge/shared";
import {
  RunnerRpcMethods,
  LocalBridgeErrorCode,
  type SystemPingResult,
  type SystemInfoResult,
} from "@localbridge/protocol";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const migrationsDir = path.resolve(__dirname, "../apps/server/src/db/migrations");

describe("Server ↔ Runner RPC Integration & Concurrency", () => {
  let serverInstance: BuiltAppResult;
  let serverPort: number;
  let tmpDir: string;
  let dbFilePath: string;
  let runnerToken: string;
  let runnerStatePath: string;
  let runner: LocalBridgeRunner;
  let connectedRunnerId: string;

  beforeAll(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "lb-rpc-integration-"));
    dbFilePath = path.join(tmpDir, "server.db");
    runnerStatePath = path.join(tmpDir, "runner-state.json");

    // 1. Build & Start Fastify Server on ephemeral port
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
      name: "Integration Runner Token",
      type: "runner",
    });
    runnerToken = created.token;

    // 3. Start LocalBridge Runner
    const runnerConfig = RunnerDaemonConfigSchema.parse({
      serverUrl: `ws://127.0.0.1:${serverPort}/runner/ws`,
      token: runnerToken,
      runnerName: "Integration-PC",
      statePath: runnerStatePath,
      logging: { level: "silent", pretty: false },
      reconnect: { enabled: false },
      heartbeatIntervalMs: 5000,
    });

    const silentLogger = createLogger({ level: "silent", pretty: false, enabled: false });
    runner = new LocalBridgeRunner(runnerConfig, silentLogger);

    await runner.start();

    // 4. Wait for runner to establish handshake and appear in server registry
    const startWait = Date.now();
    while (serverInstance.runnerRegistry.count() === 0) {
      if (Date.now() - startWait > 5000) {
        throw new Error("Runner did not register within 5000ms");
      }
      await new Promise((r) => setTimeout(r, 50));
    }

    const list = serverInstance.runnerRegistry.list();
    expect(list.length).toBe(1);
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

  it("executes Server RPC: system.ping and receives typed response", async () => {
    const result: SystemPingResult = await serverInstance.rpcService.request(
      connectedRunnerId,
      RunnerRpcMethods.SystemPing,
      {}
    );

    expect(result.pong).toBe(true);
    expect(result.runnerId).toBe(connectedRunnerId);
    expect(typeof result.timestamp).toBe("number");
    expect(Date.now() - result.timestamp).toBeLessThan(5000);
  });

  it("executes Server RPC: system.info and receives sanitized system information", async () => {
    const result: SystemInfoResult = await serverInstance.rpcService.request(
      connectedRunnerId,
      RunnerRpcMethods.SystemInfo,
      {}
    );

    expect(result.runnerId).toBe(connectedRunnerId);
    expect(result.runnerVersion).toBe("0.11.0");
    expect(result.protocolVersion).toBe("1.0");
    expect(result.platform).toBe(process.platform);
    expect(result.arch).toBe(process.arch);
    expect(typeof result.hostname).toBe("string");
    expect(result.capabilities).toBeDefined();
    expect(result.capabilities.filesystem).toBe(true);

    expect(result.tools).toBeDefined();
    expect(result.tools).toHaveProperty("git");
    expect(result.tools).toHaveProperty("node");
    expect(result.tools).toHaveProperty("npm");
    expect(result.tools).toHaveProperty("pnpm");
    expect(result.tools).toHaveProperty("python");
    expect(result.tools).toHaveProperty("docker");

    // Verify zero secret leakage
    const raw = result as unknown as Record<string, unknown>;
    expect(raw.token).toBeUndefined();
    expect(raw.env).toBeUndefined();
    expect(raw.password).toBeUndefined();
  });

  it("handles 20 concurrent system.ping requests without mismatch or pending leak", async () => {
    const connection = serverInstance.runnerRegistry.get(connectedRunnerId)!;
    expect(connection.pendingRequests.size).toBe(0);

    const count = 20;
    const promises: Promise<SystemPingResult>[] = [];

    for (let i = 0; i < count; i++) {
      promises.push(
        serverInstance.rpcService.request(connectedRunnerId, RunnerRpcMethods.SystemPing, {})
      );
    }

    const results = await Promise.all(promises);
    expect(results.length).toBe(count);

    for (const res of results) {
      expect(res.pong).toBe(true);
      expect(res.runnerId).toBe(connectedRunnerId);
    }

    // Zero pending request leaks
    expect(connection.pendingRequests.size).toBe(0);
  });

  it("handles RPC timeout cleanly and leaves zero pending request leaks", async () => {
    // Inject test-only delayed handler on runner
    runner.router.register("test.delayed", async () => {
      await new Promise((resolve) => setTimeout(resolve, 2000));
      return { delayed: true };
    });

    const connection = serverInstance.runnerRegistry.get(connectedRunnerId)!;
    const initialPending = connection.pendingRequests.size;

    // Send with 1000ms timeout (min timeout is 1000ms)
    await expect(
      connection.request(
        "test.delayed" as unknown as typeof RunnerRpcMethods.SystemPing,
        {},
        { timeoutMs: 1000 }
      )
    ).rejects.toMatchObject({
      code: LocalBridgeErrorCode.RPC_TIMEOUT,
    });

    // Zero pending leaks
    expect(connection.pendingRequests.size).toBe(initialPending);
  });

  it("verifies management debug REST APIs: /ping and /system-info", async () => {
    // 1. POST /api/runners/:id/ping
    const pingRes = await serverInstance.app.inject({
      method: "POST",
      url: `/api/runners/${connectedRunnerId}/ping`,
    });
    expect(pingRes.statusCode).toBe(200);
    const pingBody = JSON.parse(pingRes.body);
    expect(pingBody.pong).toBe(true);
    expect(pingBody.runnerId).toBe(connectedRunnerId);

    // 2. GET /api/runners/:id/system-info
    const infoRes = await serverInstance.app.inject({
      method: "GET",
      url: `/api/runners/${connectedRunnerId}/system-info`,
    });
    expect(infoRes.statusCode).toBe(200);
    const infoBody = JSON.parse(infoRes.body);
    expect(infoBody.runnerId).toBe(connectedRunnerId);
    expect(infoBody.runnerVersion).toBe("0.11.0");

    // 3. Offline runner test -> 404 RUNNER_OFFLINE
    const offlineRes = await serverInstance.app.inject({
      method: "POST",
      url: "/api/runners/non-existent-runner-id/ping",
    });
    expect(offlineRes.statusCode).toBe(404);
    const offlineBody = JSON.parse(offlineRes.body);
    expect(offlineBody.code).toBe(LocalBridgeErrorCode.RUNNER_OFFLINE);
  });

  it("rejects pending requests with RUNNER_DISCONNECTED when runner socket disconnects", async () => {
    // Inject hanging handler that never returns
    runner.router.register("test.hanging", () => new Promise(() => {}));

    const connection = serverInstance.runnerRegistry.get(connectedRunnerId)!;

    const pendingPromise = connection.request(
      "test.hanging" as unknown as typeof RunnerRpcMethods.SystemPing,
      {},
      { timeoutMs: 15000 }
    );

    expect(connection.pendingRequests.size).toBe(1);

    // Force disconnect
    await runner.stop();

    await expect(pendingPromise).rejects.toMatchObject({
      code: LocalBridgeErrorCode.RUNNER_DISCONNECTED,
    });

    expect(connection.pendingRequests.size).toBe(0);
  });
});
