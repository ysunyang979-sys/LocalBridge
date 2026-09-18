import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { ProjectRegistry } from "../apps/runner/src/projects/registry.js";
import { LocalBridgeErrorCode } from "@localbridge/protocol";

describe("Runner ProjectRegistry", () => {
  let tmpDir: string;
  let projectsFile: string;
  let projectADir: string;
  let projectBDir: string;
  let notADirFile: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "lb-proj-reg-test-"));
    projectsFile = path.join(tmpDir, "projects.json");
    projectADir = path.join(tmpDir, "repo-alpha");
    projectBDir = path.join(tmpDir, "repo-beta");
    notADirFile = path.join(tmpDir, "some-file.txt");

    fs.mkdirSync(projectADir, { recursive: true });
    fs.mkdirSync(projectBDir, { recursive: true });
    fs.writeFileSync(notADirFile, "hello world", "utf-8");
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("adds project successfully with stable UUIDv4 proj_ prefix and canonical root", () => {
    const registry = new ProjectRegistry(projectsFile);
    const proj = registry.add(projectADir, { name: "repo-alpha" });

    expect(proj.id).toMatch(/^proj_[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
    expect(proj.name).toBe("repo-alpha");
    expect(proj.enabled).toBe(true);
    expect(fs.realpathSync.native(projectADir)).toBe(proj.canonicalRoot);

    // Persistence check
    expect(fs.existsSync(projectsFile)).toBe(true);
    const content = JSON.parse(fs.readFileSync(projectsFile, "utf-8"));
    expect(content.projects).toHaveLength(1);
    expect(content.projects[0].id).toBe(proj.id);
  });

  it("persists stable project IDs across registry restarts", () => {
    const reg1 = new ProjectRegistry(projectsFile);
    const proj1 = reg1.add(projectADir, { name: "repo-alpha" });

    // Re-instantiate registry from same file
    const reg2 = new ProjectRegistry(projectsFile);
    const list = reg2.list();
    expect(list).toHaveLength(1);
    expect(list[0].id).toBe(proj1.id);
    expect(list[0].name).toBe("repo-alpha");
    expect(list[0].canonicalRoot).toBe(proj1.canonicalRoot);
  });

  it("removes project successfully", () => {
    const registry = new ProjectRegistry(projectsFile);
    const proj = registry.add(projectADir, { name: "repo-alpha" });

    const removed = registry.remove(proj.id);
    expect(removed).toBe(true);
    expect(registry.list()).toHaveLength(0);
    expect(registry.get(proj.id)).toBeUndefined();

    // False for unknown ID
    expect(registry.remove("proj_unknown")).toBe(false);
  });

  it("enables and disables projects", () => {
    const registry = new ProjectRegistry(projectsFile);
    const proj = registry.add(projectADir, { name: "repo-alpha" });
    expect(proj.enabled).toBe(true);

    const disabled = registry.disable(proj.id);
    expect(disabled).toBe(true);
    expect(registry.get(proj.id)?.enabled).toBe(false);

    const enabled = registry.enable(proj.id);
    expect(enabled).toBe(true);
    expect(registry.get(proj.id)?.enabled).toBe(true);
  });

  it("rejects duplicate physical roots (direct, trailing slashes, case differences)", () => {
    const registry = new ProjectRegistry(projectsFile);
    registry.add(projectADir, { name: "repo-alpha" });

    // 1. Direct duplicate
    expect(() => registry.add(projectADir, { name: "dup-1" })).toThrowError(
      expect.objectContaining({ code: LocalBridgeErrorCode.PROJECT_ALREADY_EXISTS })
    );

    // 2. Trailing slash
    const withSlash = projectADir + path.sep;
    expect(() => registry.add(withSlash, { name: "dup-2" })).toThrowError(
      expect.objectContaining({ code: LocalBridgeErrorCode.PROJECT_ALREADY_EXISTS })
    );

    // 3. Dot normalization: path/./sub/..
    const withDot = path.join(projectADir, "sub", "..");
    fs.mkdirSync(path.join(projectADir, "sub"), { recursive: true });
    expect(() => registry.add(withDot, { name: "dup-3" })).toThrowError(
      expect.objectContaining({ code: LocalBridgeErrorCode.PROJECT_ALREADY_EXISTS })
    );

    // 4. Windows case-insensitivity if on Windows
    if (process.platform === "win32") {
      const lowerOrUpper =
        projectADir === projectADir.toLowerCase()
          ? projectADir.toUpperCase()
          : projectADir.toLowerCase();
      expect(() => registry.add(lowerOrUpper, { name: "dup-4" })).toThrowError(
        expect.objectContaining({ code: LocalBridgeErrorCode.PROJECT_ALREADY_EXISTS })
      );
    }
  });

  it("rejects non-existent directory with PROJECT_ROOT_NOT_FOUND", () => {
    const registry = new ProjectRegistry(projectsFile);
    const nonExistent = path.join(tmpDir, "does-not-exist");

    expect(() => registry.add(nonExistent, { name: "ghost" })).toThrowError(
      expect.objectContaining({ code: LocalBridgeErrorCode.PROJECT_ROOT_NOT_FOUND })
    );
  });

  it("rejects regular file with PROJECT_ROOT_NOT_DIRECTORY", () => {
    const registry = new ProjectRegistry(projectsFile);

    expect(() => registry.add(notADirFile, { name: "file-proj" })).toThrowError(
      expect.objectContaining({ code: LocalBridgeErrorCode.PROJECT_ROOT_NOT_DIRECTORY })
    );
  });

  it("supports nested projects as distinct authorized projects", () => {
    const registry = new ProjectRegistry(projectsFile);
    const nestedSubDir = path.join(projectADir, "packages", "pkg-a");
    fs.mkdirSync(nestedSubDir, { recursive: true });

    const parentProj = registry.add(projectADir, { name: "parent" });
    const nestedProj = registry.add(nestedSubDir, { name: "nested" });

    expect(parentProj.id).not.toBe(nestedProj.id);
    expect(registry.list()).toHaveLength(2);
    expect(registry.get(parentProj.id)?.name).toBe("parent");
    expect(registry.get(nestedProj.id)?.name).toBe("nested");
  });

  it("atomic write protects state from corruption if serialization fails", () => {
    const registry = new ProjectRegistry(projectsFile);
    const proj = registry.add(projectADir, { name: "repo-alpha" });

    const originalContent = fs.readFileSync(projectsFile, "utf-8");

    // Mock fs.writeFileSync to throw on temp file
    const spy = vi.spyOn(fs, "writeFileSync").mockImplementationOnce(() => {
      throw new Error("Simulated disk write failure");
    });

    try {
      expect(() => registry.add(projectBDir, { name: "repo-beta" })).toThrow("Simulated disk write failure");
    } finally {
      spy.mockRestore();
    }

    // projectsFile must remain untouched and valid
    expect(fs.readFileSync(projectsFile, "utf-8")).toBe(originalContent);
    const recoveredRegistry = new ProjectRegistry(projectsFile);
    expect(recoveredRegistry.list()).toHaveLength(1);
    expect(recoveredRegistry.list()[0].id).toBe(proj.id);
  });
});
