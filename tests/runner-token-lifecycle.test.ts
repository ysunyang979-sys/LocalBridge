import { afterEach, beforeEach, describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { buildApp, type BuiltAppResult } from "../apps/server/src/app.js";
import { LocalBridgeRunner } from "../apps/runner/src/runner.js";
import { RunnerDaemonConfigSchema } from "../apps/runner/src/config/schema.js";
import { AppConfigSchema, createLogger } from "@localbridge/shared";
import { RunnerRpcMethods } from "@localbridge/protocol";

describe("active Runner token lifecycle", () => {
  let dir: string;
  let server: BuiltAppResult;
  let runner: LocalBridgeRunner | undefined;
  let port: number;

  beforeEach(async () => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "lb-runner-token-life-"));
    server = await buildApp({
      config: AppConfigSchema.parse({ server: { host: "127.0.0.1", port: 0, dbPath: path.join(dir, "db.sqlite") }, logging: { level: "silent", pretty: false } }),
      enableLogging: false,
    });
    await server.app.listen({ host: "127.0.0.1", port: 0 });
    port = (server.app.server.address() as any).port;
  });

  afterEach(async () => {
    await runner?.stop();
    await server.app.close();
    fs.rmSync(dir, { recursive: true, force: true });
  });

  async function connect(expiresAt?: number, heartbeatIntervalMs = 100) {
    const created = server.tokenService.createToken({ name: "lifecycle", type: "runner", expiresAt });
    runner = new LocalBridgeRunner(RunnerDaemonConfigSchema.parse({
      serverUrl: `ws://127.0.0.1:${port}/runner/ws`, token: created.token,
      statePath: path.join(dir, "state.json"), projectsPath: path.join(dir, "projects.json"),
      reconnect: { enabled: false }, heartbeatIntervalMs,
      logging: { level: "silent", pretty: false },
    }), createLogger({ level: "silent", pretty: false, enabled: false }));
    await runner.start();
    const started = Date.now();
    while (server.runnerRegistry.count() !== 1) {
      if (Date.now() - started > 3000) throw new Error("runner registration timeout");
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    return created;
  }

  it("immediately closes the matching active connection when revoked", async () => {
    const token = await connect();
    const response = await server.app.inject({ method: "DELETE", url: `/api/tokens/${token.id}` });
    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.body).closedRunnerConnections).toBe(1);
    expect(server.runnerRegistry.count()).toBe(0);
  });

  it("rechecks expiry before RPC dispatch", async () => {
    const token = await connect(Date.now() + 3000, 10_000);
    await new Promise((resolve) => setTimeout(resolve, 3050));
    const runnerId = runner!.runnerId;
    await expect(server.rpcService.request(runnerId, RunnerRpcMethods.SystemPing, {}))
      .rejects.toMatchObject({ code: "UNAUTHORIZED" });
    expect(server.tokenService.isTokenActive(token.id, "runner")).toBe(false);
  });
});
