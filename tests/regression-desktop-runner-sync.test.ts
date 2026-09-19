import { describe, it, expect, beforeEach, afterEach } from "vitest";
import path from "node:path";
import fs from "node:fs";
import os from "node:os";
import { WebSocket } from "ws";
import { buildApp, type BuiltAppResult } from "../apps/server/src/app.js";
import { loadConfig } from "@localbridge/shared";

describe("Regression: Desktop Runner Connection Status Synchronization", () => {
  let tmpDir: string;
  let serverInstance: BuiltAppResult;
  let serverPort: number;
  let runnerToken: string;

  beforeEach(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "lb-runner-sync-reg-"));
    const dbPath = path.join(tmpDir, "server.db");

    const baseConfig = loadConfig({
      configPath: path.join(tmpDir, "config.json"),
      cliArgs: ["--port", "0", "--db-path", dbPath],
    });

    serverInstance = await buildApp({
      config: baseConfig,
      enableLogging: false,
    });

    const runnerRes = serverInstance.tokenService.createToken({
      name: "Desktop Embedded Runner",
      type: "runner",
    });
    runnerToken = runnerRes.token;

    await serverInstance.app.listen({
      host: "127.0.0.1",
      port: 0,
    });
    const addr = serverInstance.app.server.address();
    serverPort = typeof addr === "object" && addr ? addr.port : 18080;
  });

  afterEach(async () => {
    if (serverInstance?.app) {
      await serverInstance.app.close();
    }
    if (fs.existsSync(tmpDir)) {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it("ensures summary count strictly equals actual runner list length when 0 runners connected", async () => {
    // 1. Query status
    const statusRes = await serverInstance.app.inject({
      method: "GET",
      url: "/api/status",
    });
    expect(statusRes.statusCode).toBe(200);
    const status = JSON.parse(statusRes.body);

    // 2. Query runners list
    const runnersRes = await serverInstance.app.inject({
      method: "GET",
      url: "/api/runners",
    });
    expect(runnersRes.statusCode).toBe(200);
    const runnersRaw = JSON.parse(runnersRes.body);
    const runnersList = Array.isArray(runnersRaw)
      ? runnersRaw
      : Array.isArray(runnersRaw?.runners)
        ? runnersRaw.runners
        : [];

    // 3. Verify absolute synchronization: summary count === actual list length
    expect(status.runners_connected).toBe(0);
    expect(runnersList).toHaveLength(0);
    expect(status.runners_connected).toBe(runnersList.length);
  });

  it("ensures summary count strictly equals actual runner list length when a runner connects", async () => {
    // 1. Connect a simulated runner via WebSocket
    const ws = await new Promise<WebSocket>((resolve, reject) => {
      const socket = new WebSocket(`ws://127.0.0.1:${serverPort}/runner/ws`, {
        headers: { Authorization: `Bearer ${runnerToken}` },
      });
      socket.on("open", () => resolve(socket));
      socket.on("error", reject);
    });

    const handshakeMsg = {
      jsonrpc: "2.0",
      id: "req_hello",
      method: "runner.hello",
      params: {
        protocolVersion: "1.0",
        runnerId: "run_test_desktop_sync_001",
        runnerVersion: "1.0.0",
        name: "Desktop-Bundled-Runner",
        system: {
          platform: "win32",
          arch: "x64",
          hostname: "test-pc",
          nodeVersion: "v24.21.0",
          tools: {
            git: "2.46.2",
            node: "24.21.0",
            npm: "10.0.0",
            pnpm: "10.14.0",
            python: null,
            docker: null,
          },
        },
        capabilities: {
          filesystem: true,
          shell: true,
          git: true,
          build: true,
          test: true,
          docker: false,
        },
      },
    };

    const responsePromise = new Promise<Record<string, any>>((resolve) => {
      ws.on("message", (data) => {
        resolve(JSON.parse(data.toString()));
      });
    });

    ws.send(JSON.stringify(handshakeMsg));
    const response = await responsePromise;
    expect(response.result?.accepted).toBe(true);

    // 2. Query status
    const statusRes = await serverInstance.app.inject({
      method: "GET",
      url: "/api/status",
    });
    expect(statusRes.statusCode).toBe(200);
    const status = JSON.parse(statusRes.body);

    // 3. Query runners list
    const runnersRes = await serverInstance.app.inject({
      method: "GET",
      url: "/api/runners",
    });
    expect(runnersRes.statusCode).toBe(200);
    const runnersRaw = JSON.parse(runnersRes.body);
    const runnersList = Array.isArray(runnersRaw)
      ? runnersRaw
      : Array.isArray(runnersRaw?.runners)
        ? runnersRaw.runners
        : [];

    // 4. Verify absolute synchronization: summary count === actual list length
    expect(status.runners_connected).toBe(1);
    expect(runnersList).toHaveLength(1);
    expect(status.runners_connected).toBe(runnersList.length);

    // Verify detailed attributes
    expect(runnersList[0].id).toBe("run_test_desktop_sync_001");
    expect(runnersList[0].name).toBe("Desktop-Bundled-Runner");
    expect(runnersList[0].status).toBe("online");
    expect(runnersList[0].platform).toBe("win32");
    expect(runnersList[0].capabilities.filesystem).toBe(true);

    // 5. Test Desktop mapping normalization logic
    // Case A: Raw Array response from /api/runners
    const normalizeFromRawArray = (raw: any) =>
      Array.isArray(raw) ? raw : (raw?.runners || []);
    expect(normalizeFromRawArray(runnersRaw)).toHaveLength(1);
    expect(normalizeFromRawArray(runnersRaw).length).toBe(status.runners_connected);

    // Case B: Wrapped { runners: [...] } response from Tauri IPC
    const wrappedTauriRes = { runners: runnersRaw };
    expect(normalizeFromRawArray(wrappedTauriRes)).toHaveLength(1);
    expect(normalizeFromRawArray(wrappedTauriRes).length).toBe(status.runners_connected);

    ws.close();
  });
});
