import { describe, it, expect, beforeEach, afterEach } from "vitest";
import path from "node:path";
import fs from "node:fs";
import os from "node:os";
import { buildApp, type BuiltAppResult } from "../apps/server/src/app.js";
import { loadConfig } from "@localbridge/shared";

describe("Phase 12 - XSS, HTML Injection & Desktop UI Hardening", () => {
  let tmpDir: string;
  let serverInstance: BuiltAppResult;

  beforeEach(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "lb-xss-test-"));
    const dbPath = path.join(tmpDir, "server.db");

    const baseConfig = loadConfig({
      configPath: path.join(tmpDir, "config.json"),
      cliArgs: ["--port", "0", "--db-path", dbPath],
    });

    serverInstance = await buildApp({
      config: baseConfig,
      enableLogging: false,
    });
  });

  afterEach(async () => {
    if (serverInstance?.app) {
      await serverInstance.app.close();
    }
    if (fs.existsSync(tmpDir)) {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it("safely handles XSS and script injection payloads in project names and audit logs", async () => {
    const xssProjectName = '<img src=x onerror=alert(1)>';
    const xssScript = '<script>alert("pwned")</script>';

    // 1. Authorize project with XSS in name
    const projectDir = path.join(tmpDir, "xss-proj");
    fs.mkdirSync(projectDir, { recursive: true });

    // 2. Log an audit event containing XSS payload
    serverInstance.mcpContext.logAudit("mcp_tool_started", {
      toolName: xssScript,
      projectId: xssProjectName,
      relativePath: 'src/<svg onload=alert(1)>.ts',
    });

    const auditEvents = serverInstance.mcpContext.getAuditEvents(10);
    expect(auditEvents.length).toBeGreaterThan(0);

    const latest = auditEvents[0]!;
    expect(latest.toolName).toBe(xssScript);
    expect(latest.projectId).toBe(xssProjectName);
    expect(latest.relativePath).toBe('src/<svg onload=alert(1)>.ts');

    // 3. API response outputs as plain text/json, preserving raw values without evaluating
    const res = await serverInstance.app.inject({
      method: "GET",
      url: "/api/audit",
    });

    expect(res.statusCode).toBe(200);
    expect(res.headers["content-type"]).toContain("application/json");
    const json = JSON.parse(res.body);
    expect(json.events[0].toolName).toBe(xssScript);
  });

  it("verifies Desktop React source code contains ZERO dangerouslySetInnerHTML occurrences", () => {
    const desktopSrcDir = path.resolve(process.cwd(), "apps/desktop/src");
    expect(fs.existsSync(desktopSrcDir)).toBe(true);

    const checkDir = (dir: string): void => {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          checkDir(fullPath);
        } else if (entry.name.endsWith(".tsx") || entry.name.endsWith(".ts")) {
          const content = fs.readFileSync(fullPath, "utf-8");
          expect(content).not.toContain("dangerouslySetInnerHTML");
          expect(content).not.toContain("javascript:");
        }
      }
    };

    checkDir(desktopSrcDir);
  });
});
