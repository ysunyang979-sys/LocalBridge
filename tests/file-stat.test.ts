import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { ProjectRegistry } from "../apps/runner/src/projects/registry.js";
import { FilesystemService } from "../apps/runner/src/filesystem/service.js";
import { LocalBridgeErrorCode } from "@localbridge/protocol";

describe("file.stat RPC & Filesystem Service", () => {
  let tmpDir: string;
  let projectsFile: string;
  let projectDir: string;
  let outsideDir: string;
  let registry: ProjectRegistry;
  let fsService: FilesystemService;
  let projectId: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "lb-file-stat-test-"));
    projectsFile = path.join(tmpDir, "projects.json");
    projectDir = path.join(tmpDir, "my-app");
    outsideDir = path.join(tmpDir, "outside");

    fs.mkdirSync(projectDir, { recursive: true });
    fs.mkdirSync(outsideDir, { recursive: true });

    fs.mkdirSync(path.join(projectDir, "src"), { recursive: true });
    fs.writeFileSync(path.join(projectDir, "src", "index.ts"), "export const a = 1;\n");
    fs.writeFileSync(path.join(projectDir, ".env"), "SECRET=42\n");
    fs.writeFileSync(path.join(outsideDir, "secret.txt"), "outside\n");

    registry = new ProjectRegistry(projectsFile);
    const added = registry.add(projectDir, { name: "my-app" });
    projectId = added.id;

    fsService = new FilesystemService(registry);
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("inspects regular file metadata correctly", async () => {
    const res = await fsService.stat({
      projectId,
      path: "src/index.ts",
    });

    expect(res.projectId).toBe(projectId);
    expect(res.path).toBe("src/index.ts");
    expect(res.name).toBe("index.ts");
    expect(res.type).toBe("file");
    expect(res.size).toBeGreaterThan(0);
    expect(typeof res.modifiedAt).toBe("number");

    // Zero physical path leakage
    const serialized = JSON.stringify(res);
    expect(serialized).not.toContain(projectDir);
    expect(serialized).not.toContain("canonicalRoot");
    expect(serialized).not.toContain("absolutePath");
  });

  it("inspects directory metadata correctly", async () => {
    const res = await fsService.stat({
      projectId,
      path: "src",
    });

    expect(res.projectId).toBe(projectId);
    expect(res.path).toBe("src");
    expect(res.name).toBe("src");
    expect(res.type).toBe("directory");
    expect(typeof res.modifiedAt).toBe("number");
  });

  it("inspects safe symlink pointing inside project", () => {
    const target = path.join(projectDir, "src");
    const link = path.join(projectDir, "link_internal");

    try {
      fs.symlinkSync(target, link, "junction");
    } catch (err: unknown) {
      if ((err as NodeJS.ErrnoException).code === "EPERM") {
        return;
      }
      throw err;
    }

    return fsService.stat({ projectId, path: "link_internal" }).then((res) => {
      expect(res.type).toBe("directory"); // junction points to dir
      expect(res.name).toBe("link_internal");
    });
  });

  it("blocks escaping symlink pointing outside with PATH_SYMLINK_ESCAPE", async () => {
    const link = path.join(projectDir, "link_outside");
    try {
      fs.symlinkSync(outsideDir, link, "junction");
    } catch (err: unknown) {
      if ((err as NodeJS.ErrnoException).code === "EPERM") {
        return;
      }
      throw err;
    }

    await expect(
      fsService.stat({
        projectId,
        path: "link_outside/secret.txt",
      })
    ).rejects.toThrowError(
      expect.objectContaining({ code: LocalBridgeErrorCode.PATH_SYMLINK_ESCAPE })
    );
  });

  it("blocks absolute security boundary files with PATH_NOT_ALLOWED", async () => {
    fs.mkdirSync(path.join(projectDir, ".git"), { recursive: true });
    fs.writeFileSync(path.join(projectDir, ".git", "config"), "[core]");

    await expect(
      fsService.stat({
        projectId,
        path: ".git/config",
      })
    ).rejects.toThrowError(
      expect.objectContaining({ code: LocalBridgeErrorCode.PATH_NOT_ALLOWED })
    );
  });

  it("throws FILE_NOT_FOUND when file does not exist", async () => {
    await expect(
      fsService.stat({
        projectId,
        path: "src/ghost.ts",
      })
    ).rejects.toThrowError(
      expect.objectContaining({ code: LocalBridgeErrorCode.FILE_NOT_FOUND })
    );
  });

  it("blocks directory traversal with PATH_TRAVERSAL", async () => {
    await expect(
      fsService.stat({
        projectId,
        path: "../outside/secret.txt",
      })
    ).rejects.toThrowError(
      expect.objectContaining({ code: LocalBridgeErrorCode.PATH_TRAVERSAL })
    );
  });

  it("throws PROJECT_DISABLED when project is disabled", async () => {
    registry.disable(projectId);

    await expect(
      fsService.stat({
        projectId,
        path: "src/index.ts",
      })
    ).rejects.toThrowError(
      expect.objectContaining({ code: LocalBridgeErrorCode.PROJECT_DISABLED })
    );
  });

  it("throws PROJECT_NOT_FOUND when project ID is unknown", async () => {
    await expect(
      fsService.stat({
        projectId: "proj_unknown",
        path: "src/index.ts",
      })
    ).rejects.toThrowError(
      expect.objectContaining({ code: LocalBridgeErrorCode.PROJECT_NOT_FOUND })
    );
  });
});
