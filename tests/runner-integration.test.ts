import { describe, it, expect, beforeAll, afterAll } from "vitest";
import path from "node:path";
import os from "node:os";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { buildApp, type BuiltAppResult } from "../apps/server/src/app.js";
import { LocalBridgeRunner } from "../apps/runner/src/runner.js";
import { AppConfigSchema, createLogger } from "@localbridge/shared";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const migrationsDir = path.resolve(__dirname, "../apps/server/src/db/migrations");

describe("Runner Daemon & Server End-to-End Integration", () => {
  let serverInstance: BuiltAppResult;
  let serverPort: number;
  let tmpDir: string;
  let dbFilePath: string;
  let runnerStatePath: string;
  let runnerToken: string;

  beforeAll(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "lb-integ-test-"));
    dbFilePath = path.join(tmpDir, "integ-test.db");
    runnerStatePath = path.join(tmpDir, "runner-state.json");

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

    // Create temporary runner token
    const tokenResult = serverInstance.tokenService.createToken({
      name: "Integration Test Daemon",
      type: "runner",
    });
    runnerToken = tokenResult.token;
  });

  afterAll(async () => {
    await serverInstance.app.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("completes full lifecycle: connect -> handshake -> registry -> api check -> disconnect", async () => {
    // 1. Initial state: 0 runners connected
    const initialStatusRes = await serverInstance.app.inject({
      method: "GET",
      url: "/api/status",
    });
    expect(initialStatusRes.statusCode).toBe(200);
    const initialStatus = JSON.parse(initialStatusRes.body) as {
      runners_connected: number;
      version: string;
    };
    expect(initialStatus.runners_connected).toBe(0);
    expect(initialStatus.version).toBe("0.7.0");

    // 2. Instantiate and start Runner daemon
    const silentLogger = createLogger({ level: "silent" });
    const runner = new LocalBridgeRunner(
      {
        serverUrl: `ws://127.0.0.1:${serverPort}/runner/ws`,
        token: runnerToken,
        runnerName: "Integration-PC",
        statePath: runnerStatePath,
        heartbeatIntervalMs: 5000,
        reconnect: {
          enabled: true,
          initialDelayMs: 500,
          maxDelayMs: 2000,
          factor: 2,
          jitter: false,
        },
        logging: { level: "silent", pretty: false },
      },
      silentLogger
    );

    await runner.start();
    expect(runner.isOnline).toBe(true);

    // 3. Probe GET /api/status -> runners_connected === 1
    const connectedStatusRes = await serverInstance.app.inject({
      method: "GET",
      url: "/api/status",
    });
    expect(connectedStatusRes.statusCode).toBe(200);
    const connectedStatus = JSON.parse(connectedStatusRes.body) as {
      runners_connected: number;
      server: string;
      version: string;
      mcp_active: boolean;
    };
    expect(connectedStatus.runners_connected).toBe(1);
    expect(connectedStatus.mcp_active).toBe(false);

    // 4. Probe GET /api/runners -> contains the runner
    const runnersListRes = await serverInstance.app.inject({
      method: "GET",
      url: "/api/runners",
    });
    expect(runnersListRes.statusCode).toBe(200);
    const runnersList = JSON.parse(runnersListRes.body) as Array<{
      id: string;
      name: string;
      status: string;
      platform: string;
      version: string;
    }>;
    expect(runnersList).toHaveLength(1);
    expect(runnersList[0]?.id).toBe(runner.runnerId);
    expect(runnersList[0]?.name).toBe("Integration-PC");
    expect(runnersList[0]?.status).toBe("online");

    // 5. Stop Runner daemon
    await runner.stop();
    expect(runner.isOnline).toBe(false);

    // Wait 200ms for disconnect event propagation
    await new Promise((resolve) => setTimeout(resolve, 200));

    // 6. Probe GET /api/status -> runners_connected === 0
    const disconnectedStatusRes = await serverInstance.app.inject({
      method: "GET",
      url: "/api/status",
    });
    expect(disconnectedStatusRes.statusCode).toBe(200);
    const disconnectedStatus = JSON.parse(disconnectedStatusRes.body) as {
      runners_connected: number;
    };
    expect(disconnectedStatus.runners_connected).toBe(0);
  });
});
