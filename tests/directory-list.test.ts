import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { ProjectRegistry } from "../apps/runner/src/projects/registry.js";
import { FilesystemService } from "../apps/runner/src/filesystem/service.js";
import { LocalBridgeErrorCode } from "@localbridge/protocol";

describe("directory.list RPC & Filesystem Service", () => {
  let tmpDir: string;
  let projectsFile: string;
  let projectDir: string;
  let outsideDir: string;
  let registry: ProjectRegistry;
  let fsService: FilesystemService;
  let projectId: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "lb-dir-list-test-"));
    projectsFile = path.join(tmpDir, "projects.json");
    projectDir = path.join(tmpDir, "my-app");
    outsideDir = path.join(tmpDir, "outside");

    fs.mkdirSync(projectDir, { recursive: true });
    fs.mkdirSync(outsideDir, { recursive: true });

    // Populate project structure
    fs.mkdirSync(path.join(projectDir, "src", "components"), { recursive: true });
    fs.mkdirSync(path.join(projectDir, "empty-dir"), { recursive: true });

    fs.writeFileSync(path.join(projectDir, "README.md"), "# Title\n");
    fs.writeFileSync(path.join(projectDir, "package.json"), '{"name":"app"}\n');
    fs.writeFileSync(path.join(projectDir, "src", "index.ts"), "console.log(1);\n");
    fs.writeFileSync(path.join(projectDir, "src", "components", "Button.tsx"), "export const Button = () => null;\n");

    // Sensitive files
    fs.writeFileSync(path.join(projectDir, ".env"), "SECRET=123\n");
    fs.writeFileSync(path.join(projectDir, "private.key"), "PRIVATE KEY\n");
    fs.writeFileSync(path.join(projectDir, ".npmrc"), "//registry.npmjs.org/:_authToken=secret\n");

    // Outside file
    fs.writeFileSync(path.join(outsideDir, "secret.txt"), "forbidden\n");

    registry = new ProjectRegistry(projectsFile);
    const added = registry.add(projectDir, { name: "my-app" });
    projectId = added.id;

    fsService = new FilesystemService(registry);
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("lists root directory contents with default parameters", async () => {
    const res = await fsService.listDirectory({
      projectId,
    });

    expect(res.projectId).toBe(projectId);
    expect(res.path).toBe(".");
    expect(res.sensitiveEntriesFiltered).toBe(true); // .env, private.key, .npmrc were filtered out

    const names = res.entries.map((e) => e.name);
    expect(names).toContain("README.md");
    expect(names).toContain("package.json");
    expect(names).toContain("src");
    expect(names).toContain("empty-dir");

    // Assert sensitive files are completely omitted
    expect(names).not.toContain(".env");
    expect(names).not.toContain("private.key");
    expect(names).not.toContain(".npmrc");

    // Check entry properties
    const readme = res.entries.find((e) => e.name === "README.md");
    expect(readme?.type).toBe("file");
    expect(readme?.size).toBeGreaterThan(0);
    expect(typeof readme?.modifiedAt).toBe("number");

    const src = res.entries.find((e) => e.name === "src");
    expect(src?.type).toBe("directory");
    expect(typeof src?.modifiedAt).toBe("number");
  });

  it("lists nested directory contents", async () => {
    const res = await fsService.listDirectory({
      projectId,
      path: "src",
    });

    expect(res.path).toBe("src");
    expect(res.entries.map((e) => e.name)).toEqual(["components", "index.ts"]);
    expect(res.sensitiveEntriesFiltered).toBe(false);
  });

  it("lists empty directory returning entries = []", async () => {
    const res = await fsService.listDirectory({
      projectId,
      path: "empty-dir",
    });

    expect(res.entries).toEqual([]);
    expect(res.nextCursor).toBeNull();
    expect(res.sensitiveEntriesFiltered).toBe(false);
  });

  it("maintains deterministic stable sorting across all entries", async () => {
    // Add multiple files with mixed case and symbols
    fs.writeFileSync(path.join(projectDir, "zebra.txt"), "z");
    fs.writeFileSync(path.join(projectDir, "alpha.txt"), "a");
    fs.writeFileSync(path.join(projectDir, "Beta.txt"), "b");

    const res = await fsService.listDirectory({ projectId });
    const names = res.entries.map((e) => e.name);

    // Verify names are sorted alphabetically
    const sorted = [...names].sort((a, b) =>
      a.localeCompare(b, "en", { sensitivity: "base", numeric: true })
    );
    expect(names).toEqual(sorted);
  });

  it("paginates directory entries using limit and opaque cursor", async () => {
    // We have at least 4 visible entries in root: README.md, empty-dir, package.json, src
    const page1 = await fsService.listDirectory({
      projectId,
      limit: 2,
    });

    expect(page1.entries).toHaveLength(2);
    expect(page1.nextCursor).toBeDefined();
    expect(typeof page1.nextCursor).toBe("string");

    const page2 = await fsService.listDirectory({
      projectId,
      limit: 2,
      cursor: page1.nextCursor,
    });

    expect(page2.entries).toHaveLength(2);

    // Entries across page 1 and page 2 must not overlap
    const namesPage1 = page1.entries.map((e) => e.name);
    const namesPage2 = page2.entries.map((e) => e.name);
    for (const name of namesPage1) {
      expect(namesPage2).not.toContain(name);
    }
  });

  it("rejects invalid or malformed pagination cursor with INVALID_CURSOR", async () => {
    await expect(
      fsService.listDirectory({
        projectId,
        cursor: "not-a-valid-cursor-token!",
      })
    ).rejects.toThrowError(
      expect.objectContaining({ code: LocalBridgeErrorCode.INVALID_CURSOR })
    );

    const badJsonCursor = Buffer.from(JSON.stringify({ offset: -5 }), "utf-8").toString("base64url");
    await expect(
      fsService.listDirectory({
        projectId,
        cursor: badJsonCursor,
      })
    ).rejects.toThrowError(
      expect.objectContaining({ code: LocalBridgeErrorCode.INVALID_CURSOR })
    );
  });

  it("clamps limit between 1 and 200", async () => {
    const resMin = await fsService.listDirectory({ projectId, limit: 0 });
    expect(resMin.entries.length).toBe(1);

    const resMax = await fsService.listDirectory({ projectId, limit: 500 });
    expect(resMax.entries.length).toBeLessThanOrEqual(200);
  });

  it("throws NOT_A_DIRECTORY when path points to a file", async () => {
    await expect(
      fsService.listDirectory({
        projectId,
        path: "README.md",
      })
    ).rejects.toThrowError(
      expect.objectContaining({ code: LocalBridgeErrorCode.NOT_A_DIRECTORY })
    );
  });

  it("throws SENSITIVE_FILE_BLOCKED when attempting to list a sensitive directory", async () => {
    fs.mkdirSync(path.join(projectDir, ".ssh"), { recursive: true });
    fs.writeFileSync(path.join(projectDir, ".ssh", "id_rsa"), "key");

    await expect(
      fsService.listDirectory({
        projectId,
        path: ".ssh",
      })
    ).rejects.toThrowError(
      expect.objectContaining({ code: LocalBridgeErrorCode.SENSITIVE_FILE_BLOCKED })
    );
  });

  it("throws PROJECT_DISABLED when project is disabled", async () => {
    registry.disable(projectId);

    await expect(
      fsService.listDirectory({
        projectId,
      })
    ).rejects.toThrowError(
      expect.objectContaining({ code: LocalBridgeErrorCode.PROJECT_DISABLED })
    );
  });

  it("throws PROJECT_NOT_FOUND when project ID is unknown", async () => {
    await expect(
      fsService.listDirectory({
        projectId: "proj_ghost",
      })
    ).rejects.toThrowError(
      expect.objectContaining({ code: LocalBridgeErrorCode.PROJECT_NOT_FOUND })
    );
  });

  it("handles symlinks: internal as accessible: true, escaping as accessible: false", () => {
    const internalTarget = path.join(projectDir, "src");
    const internalLink = path.join(projectDir, "link_internal");

    const externalLink = path.join(projectDir, "link_external");

    try {
      fs.symlinkSync(internalTarget, internalLink, "junction");
      fs.symlinkSync(outsideDir, externalLink, "junction");
    } catch (err: unknown) {
      if ((err as NodeJS.ErrnoException).code === "EPERM") {
        return; // Skip if environment prevents junction
      }
      throw err;
    }

    return fsService.listDirectory({ projectId }).then((res) => {
      const internalEntry = res.entries.find((e) => e.name === "link_internal");
      expect(internalEntry).toBeDefined();
      expect(internalEntry?.type).toBe("symlink");
      expect(internalEntry?.accessible).toBe(true);

      const externalEntry = res.entries.find((e) => e.name === "link_external");
      expect(externalEntry).toBeDefined();
      expect(externalEntry?.type).toBe("symlink");
      expect(externalEntry?.accessible).toBe(false);

      // Verify no target path is leaked in serialization
      const serialized = JSON.stringify(res);
      expect(serialized).not.toContain(outsideDir);
    });
  });
});
