import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { ProjectRegistry } from "../apps/runner/src/projects/registry.js";
import { createProjectListHandler } from "../apps/runner/src/rpc/handlers/project-list.js";
import { createProjectInfoHandler } from "../apps/runner/src/rpc/handlers/project-info.js";
import { createProjectValidateHandler } from "../apps/runner/src/rpc/handlers/project-validate.js";
import { LocalBridgeErrorCode } from "@localbridge/protocol";

describe("Runner Project RPC Handlers & Sanitization", () => {
  let tmpDir: string;
  let projectsFile: string;
  let projectDir: string;
  let canonicalProjectDir: string;
  let registry: ProjectRegistry;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "lb-proj-rpc-test-"));
    projectsFile = path.join(tmpDir, "projects.json");
    projectDir = path.join(tmpDir, "demo-app");
    fs.mkdirSync(path.join(projectDir, "src"), { recursive: true });
    fs.writeFileSync(path.join(projectDir, "src", "index.ts"), "console.log(1);");
    fs.writeFileSync(path.join(projectDir, ".env"), "SECRET=123");
    canonicalProjectDir = fs.realpathSync.native(projectDir);

    registry = new ProjectRegistry(projectsFile);
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("project.list returns sanitized public metadata with NO physical paths", async () => {
    const proj = registry.add(projectDir, { name: "demo-app" });
    const handleList = createProjectListHandler(registry);

    const result = await handleList();
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({
      id: proj.id,
      name: "demo-app",
      enabled: true,
    });

    // Explicit check that sensitive physical properties are absent
    const item = result[0] as Record<string, unknown>;
    expect(item.root).toBeUndefined();
    expect(item.canonicalRoot).toBeUndefined();
    expect(item.absolutePath).toBeUndefined();
    expect(item.path).toBeUndefined();
  });

  it("project.info returns sanitized public metadata with NO physical paths", async () => {
    const proj = registry.add(projectDir, { name: "demo-app" });
    const handleInfo = createProjectInfoHandler(registry);

    const result = await handleInfo({ projectId: proj.id });
    expect(result).toEqual({
      id: proj.id,
      name: "demo-app",
      enabled: true,
      healthy: true,
    });

    const record = result as Record<string, unknown>;
    expect(record.root).toBeUndefined();
    expect(record.canonicalRoot).toBeUndefined();
    expect(record.absolutePath).toBeUndefined();
    expect(record.path).toBeUndefined();
  });

  it("project.validate validates safe relative paths correctly", async () => {
    const proj = registry.add(projectDir, { name: "demo-app" });
    const handleValidate = createProjectValidateHandler(registry);

    const res = await handleValidate({ projectId: proj.id, path: "src/index.ts" });
    expect(res.valid).toBe(true);
  });

  it("project.validate returns valid: false and reason for path traversal", async () => {
    const proj = registry.add(projectDir, { name: "demo-app" });
    const handleValidate = createProjectValidateHandler(registry);

    const res = await handleValidate({ projectId: proj.id, path: "../etc/passwd" });
    expect(res.valid).toBe(false);
    expect(res.reason).toBeDefined();
    expect(res.reason).toContain("Path traversal");
  });

  it("project.validate returns valid: false and isSensitive: true for credential files", async () => {
    const proj = registry.add(projectDir, { name: "demo-app" });
    const handleValidate = createProjectValidateHandler(registry);

    const res = await handleValidate({ projectId: proj.id, path: ".env" });
    expect(res.valid).toBe(false);
    expect(res.isSensitive).toBe(true);
  });

  it("project.validate throws PROJECT_DISABLED when project is disabled", async () => {
    const proj = registry.add(projectDir, { name: "demo-app" });
    registry.disable(proj.id);
    const handleValidate = createProjectValidateHandler(registry);

    await expect(handleValidate({ projectId: proj.id, path: "src/index.ts" })).rejects.toThrowError(
      expect.objectContaining({ code: LocalBridgeErrorCode.PROJECT_DISABLED })
    );
  });

  it("serializes all project.* responses and verifies zero physical paths leak into payload", async () => {
    const proj = registry.add(projectDir, { name: "demo-app" });
    const handleList = createProjectListHandler(registry);
    const handleInfo = createProjectInfoHandler(registry);
    const handleValidate = createProjectValidateHandler(registry);

    const listRes = await handleList();
    const infoRes = await handleInfo({ projectId: proj.id });
    const validateRes = await handleValidate({ projectId: proj.id, path: "src/index.ts" });

    const serializedList = JSON.stringify(listRes);
    const serializedInfo = JSON.stringify(infoRes);
    const serializedValidate = JSON.stringify(validateRes);

    // Root directory substring (forward and backslash versions)
    const rawPath = projectDir;
    const rawPathFwd = projectDir.replace(/\\/g, "/");
    const canonPath = canonicalProjectDir;
    const canonPathFwd = canonicalProjectDir.replace(/\\/g, "/");

    for (const serialized of [serializedList, serializedInfo, serializedValidate]) {
      expect(serialized.toLowerCase()).not.toContain(rawPath.toLowerCase());
      expect(serialized.toLowerCase()).not.toContain(rawPathFwd.toLowerCase());
      expect(serialized.toLowerCase()).not.toContain(canonPath.toLowerCase());
      expect(serialized.toLowerCase()).not.toContain(canonPathFwd.toLowerCase());
    }
  });
});
