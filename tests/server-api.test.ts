import { describe, it, expect, beforeAll, afterAll } from "vitest";
import path from "node:path";
import os from "node:os";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../apps/server/src/app.js";
import { AppConfigSchema } from "@localbridge/shared";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const migrationsDir = path.resolve(__dirname, "../apps/server/src/db/migrations");

describe("Server REST API", () => {
  let app: FastifyInstance;
  let tmpDir: string;
  let dbFilePath: string;

  beforeAll(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "lb-api-test-"));
    dbFilePath = path.join(tmpDir, "api-test.db");

    const config = AppConfigSchema.parse({
      server: { host: "127.0.0.1", port: 18080, dbPath: dbFilePath },
      logging: { level: "silent", pretty: false },
    });

    const result = await buildApp({
      config,
      migrationsDir,
      enableLogging: false,
    });
    app = result.app;
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("GET /api/health returns status ok", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/api/health",
    });

    expect(response.statusCode).toBe(200);
    const json = JSON.parse(response.body);
    expect(json).toEqual({
      status: "ok",
    });
  });

  it("GET /api/status returns server metadata", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/api/status",
    });

    expect(response.statusCode).toBe(200);
    const json = JSON.parse(response.body);
    expect(json).toEqual({
      server: "LocalBridge Server",
      version: "0.10.0",
      runners_connected: 0,
      mcp_active: true,
    });
  });

  it("GET /api/unknown returns 404", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/api/unknown-endpoint",
    });

    expect(response.statusCode).toBe(404);
  });
});
