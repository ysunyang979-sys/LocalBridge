import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import crypto from "node:crypto";
import { ProjectRegistry } from "../apps/runner/src/projects/registry.js";
import { FilesystemService } from "../apps/runner/src/filesystem/service.js";
import { BackupService } from "../apps/runner/src/backup/service.js";

describe("Universal FileSystem - Recursive Directory Deletion Suite", () => {
  let tmpDir: string;
  let projectDir: string;
  let registry: ProjectRegistry;
  let backupService: BackupService;
  let fsService: FilesystemService;
  let projectId: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "lb-fs-rec-"));
    projectDir = path.join(tmpDir, "project");
    const backupDir = path.join(tmpDir, "backups");
    fs.mkdirSync(projectDir, { recursive: true });

    registry = new ProjectRegistry(path.join(tmpDir, "projects.json"));
    const proj = registry.add(projectDir, { name: "test-myweb" });
    registry.setAccessMode(proj.id, "read-write");
    projectId = proj.id;

    backupService = new BackupService(backupDir);
    fsService = new FilesystemService(registry, backupService);
  });

  afterEach(() => {
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {}
  });

  it("fails to delete directory if recursive is not set to true", async () => {
    const blogDir = path.join(projectDir, "hexo-blog");
    fs.mkdirSync(blogDir, { recursive: true });
    fs.writeFileSync(path.join(blogDir, "config.yml"), "title: My Blog");

    await expect(
      fsService.fsDelete({
        projectId,
        path: "hexo-blog",
        recursive: false,
        force: true,
      })
    ).rejects.toThrowError(/Directory "hexo-blog" is not empty\. Specify recursive: true/);

    expect(fs.existsSync(blogDir)).toBe(true);
  });

  it("recursively deletes nested directory tree matching real-world case (hexo-blog)", async () => {
    // Reconstruct user's real folder structure:
    // hexo-blog/
    // ├ node_modules/nested/index.js
    // ├ node_modules/.cache/build.dat
    // ├ public/index.html
    // ├ source/_posts/hello.md
    // ├ themes/landscape/layout.ejs
    // ├ .env
    // └ package.json
    const blogDir = path.join(projectDir, "hexo-blog");
    fs.mkdirSync(path.join(blogDir, "node_modules", "nested"), { recursive: true });
    fs.mkdirSync(path.join(blogDir, "node_modules", ".cache"), { recursive: true });
    fs.mkdirSync(path.join(blogDir, "public"), { recursive: true });
    fs.mkdirSync(path.join(blogDir, "source", "_posts"), { recursive: true });
    fs.mkdirSync(path.join(blogDir, "themes", "landscape"), { recursive: true });

    fs.writeFileSync(path.join(blogDir, "node_modules", "nested", "index.js"), "module.exports = {};");
    fs.writeFileSync(path.join(blogDir, "node_modules", ".cache", "build.dat"), crypto.randomBytes(512));
    fs.writeFileSync(path.join(blogDir, "public", "index.html"), "<html><body>Blog</body></html>");
    fs.writeFileSync(path.join(blogDir, "source", "_posts", "hello.md"), "# Hello World");
    fs.writeFileSync(path.join(blogDir, "themes", "landscape", "layout.ejs"), "<!DOCTYPE html>");
    fs.writeFileSync(path.join(blogDir, ".env"), "SECRET_KEY=12345");
    fs.writeFileSync(path.join(blogDir, "package.json"), '{"name":"blog"}');

    // Execute recursive delete
    const result = await fsService.fsDelete({
      projectId,
      path: "hexo-blog",
      recursive: true,
      force: true,
    });

    expect(result.success).toBe(true);
    expect(result.filesAffected).toBe(7);
    expect(result.directoriesAffected).toBeGreaterThanOrEqual(6); // blog, node_modules, nested, .cache, public, source, _posts, themes, landscape
    expect(result.bytesAffected).toBeGreaterThan(512);

    // Verify directory is completely removed from disk
    expect(fs.existsSync(blogDir)).toBe(false);
  });

  it("empties root of project cleanly when path is . or empty", async () => {
    // Add multiple files and directories to project root
    fs.writeFileSync(path.join(projectDir, "root.txt"), "Root file");
    fs.writeFileSync(path.join(projectDir, "image.png"), crypto.randomBytes(1024));
    fs.mkdirSync(path.join(projectDir, "subfolder"), { recursive: true });
    fs.writeFileSync(path.join(projectDir, "subfolder", "nested.txt"), "Nested");

    const result = await fsService.fsDelete(
      {
        projectId,
        path: ".",
        recursive: true,
        force: true,
      },
      true // isFullControl
    );

    expect(result.success).toBe(true);
    expect(result.filesAffected).toBe(3);
    expect(result.directoriesAffected).toBeGreaterThanOrEqual(1);

    // Project root itself still exists, but all contents are emptied
    expect(fs.existsSync(projectDir)).toBe(true);
    const remaining = fs.readdirSync(projectDir);
    expect(remaining.length).toBe(0);
  });
});
