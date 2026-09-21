import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import crypto from "node:crypto";
import { ProjectRegistry } from "../apps/runner/src/projects/registry.js";
import { FilesystemService } from "../apps/runner/src/filesystem/service.js";
import { BackupService } from "../apps/runner/src/backup/service.js";

describe("Real-world Acceptance: Emptying Myweb Project (PNG Binaries + Hexo Blog)", () => {
  it("successfully empties Myweb containing PNG images and hexo-blog nested directories", async () => {
    const tmpBase = fs.mkdtempSync(path.join(os.tmpdir(), "nexus-realworld-myweb-"));
    const mywebRoot = path.join(tmpBase, "Myweb");
    const backupDir = path.join(tmpBase, "backups");
    fs.mkdirSync(mywebRoot, { recursive: true });

    try {
      // 1. Setup exact real-world files from user scenario:
      const pngFileName = "ChatGPT Image 2026年9月19日 20_01_15.png";
      const pngPath = path.join(mywebRoot, pngFileName);
      fs.writeFileSync(
        pngPath,
        Buffer.concat([
          Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
          crypto.randomBytes(65536),
        ])
      );

      const hexoBlogDir = path.join(mywebRoot, "hexo-blog");
      const nodeModulesDir = path.join(hexoBlogDir, "node_modules");
      const publicDir = path.join(hexoBlogDir, "public");
      const sourceDir = path.join(hexoBlogDir, "source");
      const themesDir = path.join(hexoBlogDir, "themes");

      fs.mkdirSync(path.join(nodeModulesDir, "hexo", "lib"), { recursive: true });
      fs.mkdirSync(path.join(nodeModulesDir, "@babel", "core"), { recursive: true });
      fs.mkdirSync(path.join(publicDir, "css"), { recursive: true });
      fs.mkdirSync(path.join(publicDir, "js"), { recursive: true });
      fs.mkdirSync(path.join(sourceDir, "_posts"), { recursive: true });
      fs.mkdirSync(path.join(themesDir, "landscape", "layout"), { recursive: true });

      fs.writeFileSync(path.join(nodeModulesDir, "hexo", "lib", "hexo.js"), "module.exports = {};");
      fs.writeFileSync(path.join(nodeModulesDir, "@babel", "core", "index.js"), "module.exports = {};");
      fs.writeFileSync(path.join(publicDir, "index.html"), "<!DOCTYPE html><html><body>My Blog</body></html>");
      fs.writeFileSync(path.join(publicDir, "css", "style.css"), "body { margin: 0; }");
      fs.writeFileSync(path.join(sourceDir, "_posts", "hello-world.md"), "# Hello Hexo Blog");
      fs.writeFileSync(path.join(themesDir, "landscape", "layout", "index.ejs"), "<main></main>");
      fs.writeFileSync(path.join(hexoBlogDir, "_config.yml"), "title: Hexo\nauthor: user");
      fs.writeFileSync(path.join(hexoBlogDir, "package.json"), '{"name":"hexo-blog"}');

      // Regular root files
      fs.writeFileSync(path.join(mywebRoot, "README.md"), "# Myweb Project");
      fs.writeFileSync(path.join(mywebRoot, ".env.production"), "DATABASE_URL=postgres://localhost");

      // Verify files exist initially
      expect(fs.existsSync(pngPath)).toBe(true);
      expect(fs.existsSync(hexoBlogDir)).toBe(true);

      // Initialize Nexus Runner Filesystem Engine
      const registry = new ProjectRegistry(path.join(tmpBase, "projects.json"));
      const project = registry.add(mywebRoot, { name: "Myweb" });
      registry.setAccessMode(project.id, "read-write");

      const backupService = new BackupService(backupDir);
      const fsService = new FilesystemService(registry, backupService);

      // Step A: Delete binary PNG with force: true under Full Control
      const delPngResult = await fsService.fsDelete(
        {
          projectId: project.id,
          path: pngFileName,
          force: true,
        },
        true // isFullControl
      );
      expect(delPngResult.success).toBe(true);
      expect(fs.existsSync(pngPath)).toBe(false);

      // Step B: Delete hexo-blog directory recursively under Full Control
      const delHexoResult = await fsService.fsDelete(
        {
          projectId: project.id,
          path: "hexo-blog",
          recursive: true,
          force: true,
        },
        true // isFullControl
      );
      expect(delHexoResult.success).toBe(true);
      expect(delHexoResult.filesAffected).toBe(8);
      expect(delHexoResult.directoriesAffected).toBeGreaterThanOrEqual(6);
      expect(fs.existsSync(hexoBlogDir)).toBe(false);

      // Step C: Empty remaining project contents
      const emptyResult = await fsService.fsDelete(
        {
          projectId: project.id,
          path: ".",
          recursive: true,
          force: true,
        },
        true // isFullControl
      );
      expect(emptyResult.success).toBe(true);

      const remainingFiles = fs.readdirSync(mywebRoot);
      expect(remainingFiles).toEqual([]);
    } finally {
      try {
        fs.rmSync(tmpBase, { recursive: true, force: true });
      } catch {}
    }
  });
});
