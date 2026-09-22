import { describe, expect, it, beforeAll, afterAll } from "vitest";
import path from "node:path";
import os from "node:os";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { buildApp, type BuiltAppResult } from "../apps/server/src/app.js";
import { AppConfigSchema } from "@localbridge/shared";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const migrationsDir = path.resolve(__dirname, "../apps/server/src/db/migrations");

describe("Skills Compatible Candidate Default & Quality Evaluation", () => {
  let tmpDir: string;
  let dbFilePath: string;
  let serverInstance: BuiltAppResult;
  let serverPort: number;

  beforeAll(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "candidate-default-"));
    dbFilePath = path.join(tmpDir, "test.db");

    const config = AppConfigSchema.parse({
      server: { host: "127.0.0.1", port: 0, dbPath: dbFilePath },
      logging: { level: "silent", pretty: false },
    });

    serverInstance = await buildApp({ config, migrationsDir, enableLogging: false });
    await serverInstance.app.listen({ port: 0, host: "127.0.0.1" });
    serverPort = (serverInstance.app.server.address() as any).port;
  });

  afterAll(async () => {
    if (serverInstance) {
      serverInstance.app.server.closeAllConnections?.();
      await serverInstance.app.close();
    }
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {}
  });

  it("identifies real reverse-skill archive candidates and assesses root quality", async () => {
    const zipPath = fs.existsSync("E:/22365/下载/reverse-skill-main.zip")
      ? "E:/22365/下载/reverse-skill-main.zip"
      : "E:/22365/下载/reverse-skill-main(1)/reverse-skill-main.zip";

    const res = await fetch(`http://127.0.0.1:${serverPort}/api/skills/preview`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        sourceType: "zip",
        sourcePath: zipPath,
        target: "user",
      }),
    });

    expect(res.status).toBe(200);
    const data = (await res.json()) as any;
    expect(data.candidateSkills).toBeDefined();
    expect(data.candidateSkills.length).toBeGreaterThan(10);

    // Root quality notice should be present if root is not a skill
    if (data.candidateQualityScore !== undefined && data.candidateQualityScore < 30) {
      expect(data.rootQualityNotice).toBeDefined();
    }

    // High quality candidate has positive score
    const targetCandidate = data.candidateSkills.find((c: any) =>
      c.path.includes("competition-ad-certificate-abuse")
    );
    expect(targetCandidate).toBeDefined();
    expect(targetCandidate.isValidCandidate).toBe(true);
    expect(targetCandidate.qualityScore).toBeGreaterThanOrEqual(50);
  });
});
