import { describe, it, expect, beforeAll, afterAll } from "vitest";
import path from "node:path";
import os from "node:os";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../apps/server/src/app.js";
import { LocalBridgeRunner } from "../apps/runner/src/runner.js";
import { AppConfigSchema, createLogger } from "@localbridge/shared";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const migrationsDir = path.resolve(__dirname, "../apps/server/src/db/migrations");

describe("Phase 11: Human-in-the-Loop Approvals", () => {
  let app: FastifyInstance;
  let tmpDir: string;
  let dbFilePath: string;
  let runner: LocalBridgeRunner;
  let runnerToken: string;
  let projectDir: string;
  let serverPort: number;
  let projectId: string;

  beforeAll(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "lb-approval-test-"));
    dbFilePath = path.join(tmpDir, "approval-test.db");
    projectDir = path.join(tmpDir, "sample-project");
    fs.mkdirSync(projectDir, { recursive: true });
    fs.writeFileSync(path.join(projectDir, "test.txt"), "hello");

    serverPort = 19181;
    const config = AppConfigSchema.parse({
      server: { host: "127.0.0.1", port: serverPort, dbPath: dbFilePath },
      logging: { level: "silent", pretty: false },
    });

    const result = await buildApp({
      config,
      migrationsDir,
      enableLogging: false,
    });
    app = result.app;
    await app.listen({ port: serverPort, host: "127.0.0.1" });

    // Generate runner token
    const tok = result.tokenService.createToken({
      name: "approval-test-runner",
      type: "runner",
    });
    runnerToken = tok.token;

    // Start runner daemon
    const silentLogger = createLogger({ level: "silent" });
    runner = new LocalBridgeRunner(
      {
        serverUrl: `ws://127.0.0.1:${serverPort}/runner/ws`,
        token: runnerToken,
        runnerName: "approval-test-runner",
        projectsPath: path.join(tmpDir, "projects.json"),
        statePath: path.join(tmpDir, "runner-state.json"),
        heartbeatIntervalMs: 5000,
        logging: { level: "silent", pretty: false },
        reconnect: {
          enabled: true,
          initialDelayMs: 500,
          maxDelayMs: 5000,
          factor: 2,
          jitter: 0.1,
        },
      },
      silentLogger
    );

    await runner.start();
    await new Promise((r) => setTimeout(r, 600));

    // Authorize project
    const authRes = await app.inject({
      method: "POST",
      url: "/api/management/projects/authorize",
      payload: {
        path: projectDir,
        name: "Approval Test Project",
        accessMode: "read-write",
      },
    });
    const proj = JSON.parse(authRes.body);
    projectId = proj.id;
  });

  afterAll(async () => {
    await runner?.stop();
    await app?.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("creates an approval request with SHA-256 hash binding and 5-min TTL", async () => {
    const payload = { file: "test.txt", patch: "+new line" };
    const createRes = await app.inject({
      method: "POST",
      url: "/api/approvals",
      payload: {
        projectId,
        operation: "file.patch",
        payload,
        risk: "CAUTION",
        summary: "Patching test.txt with new line",
        ttlSeconds: 300,
      },
    });

    expect(createRes.statusCode).toBe(201);
    const approval = JSON.parse(createRes.body);
    expect(approval.id).toMatch(/^approval_[0-9a-f-]{36}$/);
    expect(approval.projectId).toBe(projectId);
    expect(approval.operation).toBe("file.patch");
    expect(approval.risk).toBe("CAUTION");
    expect(approval.status).toBe("pending");
    expect(approval.payloadHash).toMatch(/^[0-9a-f]{64}$/);
    expect(approval.expiresAt).toBeGreaterThan(Date.now());
  });

  it("lists approvals and gets single approval details by ID", async () => {
    const listRes = await app.inject({
      method: "GET",
      url: "/api/approvals",
      query: { projectId, status: "pending" },
    });
    expect(listRes.statusCode).toBe(200);
    const listBody = JSON.parse(listRes.body);
    expect(listBody.approvals.length).toBeGreaterThanOrEqual(1);

    const target = listBody.approvals[0];
    const getRes = await app.inject({
      method: "GET",
      url: `/api/approvals/${target.id}`,
    });
    expect(getRes.statusCode).toBe(200);
    const getBody = JSON.parse(getRes.body);
    expect(getBody.id).toBe(target.id);
    expect(getBody.summary).toBe(target.summary);
  });

  it("resolves an approval as approved, then rejects repeated resolution", async () => {
    // Create new approval
    const createRes = await app.inject({
      method: "POST",
      url: "/api/approvals",
      payload: {
        projectId,
        operation: "command.run",
        payload: { command: "npm test" },
        risk: "DANGEROUS",
        summary: "Run project tests",
      },
    });
    const approval = JSON.parse(createRes.body);

    // Resolve as approved
    const resolveRes = await app.inject({
      method: "POST",
      url: `/api/approvals/${approval.id}/resolve`,
      payload: {
        action: "approve",
        resolvedBy: "test-admin",
      },
    });
    expect(resolveRes.statusCode).toBe(200);
    const resolved = JSON.parse(resolveRes.body);
    expect(resolved.status).toBe("approved");
    expect(resolved.resolvedBy).toBe("test-admin");
    expect(resolved.resolvedAt).toBeDefined();

    // Repeated resolution must fail (one-time execution guarantee)
    const repeatRes = await app.inject({
      method: "POST",
      url: `/api/approvals/${approval.id}/resolve`,
      payload: {
        action: "approve",
      },
    });
    expect(repeatRes.statusCode).toBe(400);
    const repeatBody = JSON.parse(repeatRes.body);
    expect(repeatBody.code).toBe("APPROVAL_ALREADY_RESOLVED");
  });

  it("resolves an approval as denied", async () => {
    const createRes = await app.inject({
      method: "POST",
      url: "/api/approvals",
      payload: {
        projectId,
        operation: "file.delete",
        payload: { file: "important.db" },
        risk: "DANGEROUS",
        summary: "Delete critical file",
      },
    });
    const approval = JSON.parse(createRes.body);

    const denyRes = await app.inject({
      method: "POST",
      url: `/api/approvals/${approval.id}/resolve`,
      payload: {
        action: "deny",
        resolvedBy: "security-auditor",
      },
    });
    expect(denyRes.statusCode).toBe(200);
    const denied = JSON.parse(denyRes.body);
    expect(denied.status).toBe("denied");
    expect(denied.resolvedBy).toBe("security-auditor");
  });
});
