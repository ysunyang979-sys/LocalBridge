import { describe, it, expect, beforeAll, afterAll } from "vitest";
import WebSocket from "ws";
import path from "node:path";
import os from "node:os";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { buildApp, type BuiltAppResult } from "../apps/server/src/app.js";
import { AppConfigSchema } from "@localbridge/shared";
import { PROTOCOL_VERSION, RunnerMethod } from "@localbridge/protocol";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const migrationsDir = path.resolve(__dirname, "../apps/server/src/db/migrations");

describe("Runner Handshake Protocol", () => {
  let serverInstance: BuiltAppResult;
  let serverPort: number;
  let tmpDir: string;
  let dbFilePath: string;
  let validRunnerToken: string;

  beforeAll(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "lb-handshake-test-"));
    dbFilePath = path.join(tmpDir, "handshake-test.db");

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

    const tokenRes = serverInstance.tokenService.createToken({
      name: "Handshake Test Runner",
      type: "runner",
    });
    validRunnerToken = tokenRes.token;
  });

  afterAll(async () => {
    await serverInstance.app.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  function connectSocket(): Promise<WebSocket> {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(`ws://127.0.0.1:${serverPort}/runner/ws`, {
        headers: { Authorization: `Bearer ${validRunnerToken}` },
      });
      ws.on("open", () => resolve(ws));
      ws.on("error", reject);
    });
  }

  it("accepts valid runner.hello handshake and registers runner", async () => {
    const ws = await connectSocket();

    const handshakeMsg = {
      jsonrpc: "2.0",
      id: "req_1",
      method: RunnerMethod.RUNNER_HELLO,
      params: {
        protocolVersion: PROTOCOL_VERSION,
        runnerId: "runner_valid_1",
        runnerVersion: "0.2.0",
        name: "Test Runner PC",
        system: {
          platform: "win32",
          arch: "x64",
          hostname: "test-pc",
          nodeVersion: "v24.0.0",
          tools: {
            git: "2.46.2",
            node: "24.0.0",
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

    const responsePromise = new Promise<Record<string, unknown>>((resolve) => {
      ws.on("message", (data) => {
        resolve(JSON.parse(data.toString()) as Record<string, unknown>);
      });
    });

    ws.send(JSON.stringify(handshakeMsg));
    const response = await responsePromise;

    expect(response.jsonrpc).toBe("2.0");
    expect(response.id).toBe("req_1");
    expect(response.result).toBeDefined();
    expect(response.result.accepted).toBe(true);
    expect(response.result.protocolVersion).toBe("1.0");
    expect(response.result.serverVersion).toBe("0.6.0");
    expect(response.result.heartbeatIntervalMs).toBe(15000);

    // Verify registered in memory registry
    expect(serverInstance.runnerRegistry.count()).toBe(1);
    expect(serverInstance.runnerRegistry.get("runner_valid_1")).toBeDefined();

    ws.close();
  });

  it("rejects mismatched protocol version and closes connection", async () => {
    const ws = await connectSocket();

    const handshakeMsg = {
      jsonrpc: "2.0",
      id: "req_mismatch",
      method: RunnerMethod.RUNNER_HELLO,
      params: {
        protocolVersion: "999.0", // Unsupported
        runnerId: "runner_mismatch",
        runnerVersion: "0.2.0",
        name: "Mismatch PC",
        system: {
          platform: "linux",
          arch: "arm64",
          hostname: "arm-host",
          nodeVersion: "v24.0.0",
          tools: {
            git: null,
            node: "24.0.0",
            npm: null,
            pnpm: null,
            python: null,
            docker: null,
          },
        },
        capabilities: {
          filesystem: true,
          shell: true,
          git: false,
          build: false,
          test: false,
          docker: false,
        },
      },
    };

    const responsePromise = new Promise<Record<string, unknown>>((resolve) => {
      ws.on("message", (data) => {
        resolve(JSON.parse(data.toString()) as Record<string, unknown>);
      });
    });

    const closePromise = new Promise<{ code: number; reason: string }>((resolve) => {
      ws.on("close", (code, reason) => {
        resolve({ code, reason: reason.toString() });
      });
    });

    ws.send(JSON.stringify(handshakeMsg));
    const response = await responsePromise;
    const closeInfo = await closePromise;

    expect(response.error).toBeDefined();
    expect(response.error.data?.code).toBe("PROTOCOL_VERSION_UNSUPPORTED");
    expect(closeInfo.code).toBe(4002);
  });

  it("rejects malformed hello with invalid parameters", async () => {
    const ws = await connectSocket();

    const malformedMsg = {
      jsonrpc: "2.0",
      id: "req_bad",
      method: RunnerMethod.RUNNER_HELLO,
      params: {
        // Missing runnerId, system, capabilities
        protocolVersion: PROTOCOL_VERSION,
        name: "Broken Runner",
      },
    };

    const responsePromise = new Promise<Record<string, unknown>>((resolve) => {
      ws.on("message", (data) => {
        resolve(JSON.parse(data.toString()) as Record<string, unknown>);
      });
    });

    const closePromise = new Promise<{ code: number }>((resolve) => {
      ws.on("close", (code) => resolve({ code }));
    });

    ws.send(JSON.stringify(malformedMsg));
    const response = await responsePromise;
    const closeInfo = await closePromise;

    expect(response.error).toBeDefined();
    expect(closeInfo.code).toBe(4002);
  });
});
