import { describe, it, expect, beforeAll, afterAll } from "vitest";
import os from "node:os";
import path from "node:path";
import fs from "node:fs";
import child_process from "node:child_process";
import { GitProcessRunner } from "../apps/runner/src/git/process.js";
import { GitService } from "../apps/runner/src/git/service.js";
import { ProjectRegistry } from "../apps/runner/src/projects/registry.js";
import { createLogger } from "@localbridge/shared";

describe("Git Status & Change Detection (git.status)", () => {
  let tmpDir: string;
  let repoDir: string;
  let gitService: GitService;
  let projectId: string;

  beforeAll(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "lb-git-status-"));
    repoDir = path.join(tmpDir, "repo");
    fs.mkdirSync(repoDir, { recursive: true });

    child_process.execFileSync("git", ["init"], { cwd: repoDir });
    child_process.execFileSync("git", ["config", "user.name", "Test User"], { cwd: repoDir });
    child_process.execFileSync("git", ["config", "user.email", "test@example.com"], { cwd: repoDir });

    // Initial files
    fs.writeFileSync(path.join(repoDir, "clean.txt"), "hello clean");
    fs.writeFileSync(path.join(repoDir, "to-modify.txt"), "original");
    fs.writeFileSync(path.join(repoDir, "to-rename.txt"), "rename me");
    fs.writeFileSync(path.join(repoDir, "to-delete.txt"), "delete me");

    child_process.execFileSync("git", ["add", "."], { cwd: repoDir });
    child_process.execFileSync("git", ["commit", "-m", "Initial commit"], { cwd: repoDir });

    const projectsFile = path.join(tmpDir, "projects.json");
    const silentLogger = createLogger({ level: "silent" });
    const registry = new ProjectRegistry(projectsFile, silentLogger);
    const proj = registry.add(repoDir, { name: "StatusRepo" });
    projectId = proj.id;

    gitService = new GitService(registry, new GitProcessRunner(silentLogger), silentLogger);
  });

  afterAll(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("reports clean repository with no entries", async () => {
    const status = await gitService.getStatus({ projectId });
    expect(status.clean).toBe(true);
    expect(status.entries).toHaveLength(0);
    expect(status.sensitiveEntriesFiltered).toBe(false);
    expect(status.truncated).toBe(false);
  });

  it("detects unstaged modifications, staged adds, renames, deletes, and untracked files", async () => {
    // 1. Unstaged modification
    fs.writeFileSync(path.join(repoDir, "to-modify.txt"), "modified in worktree");

    // 2. Staged addition
    fs.writeFileSync(path.join(repoDir, "new-staged.txt"), "new file");
    child_process.execFileSync("git", ["add", "new-staged.txt"], { cwd: repoDir });

    // 3. Staged rename
    child_process.execFileSync("git", ["mv", "to-rename.txt", "renamed.txt"], { cwd: repoDir });

    // 4. Deletion
    fs.unlinkSync(path.join(repoDir, "to-delete.txt"));

    // 5. Untracked file with spaces and Unicode
    const unicodeName = "测试 文件 🚀.txt";
    fs.writeFileSync(path.join(repoDir, unicodeName), "unicode content");

    const status = await gitService.getStatus({ projectId });
    expect(status.clean).toBe(false);

    const paths = status.entries.map((e) => e.path);
    expect(paths).toContain("to-modify.txt");
    expect(paths).toContain("new-staged.txt");
    expect(paths).toContain("renamed.txt");
    expect(paths).toContain("to-delete.txt");
    expect(paths).toContain(unicodeName);

    // Verify rename has oldPath
    const renameEntry = status.entries.find((e) => e.path === "renamed.txt");
    expect(renameEntry).toBeDefined();
    expect(renameEntry?.kind).toBe("renamed");
    expect(renameEntry?.oldPath).toBe("to-rename.txt");

    // Verify modified
    const modEntry = status.entries.find((e) => e.path === "to-modify.txt");
    expect(modEntry?.kind).toBe("modified");

    // Verify added
    const addEntry = status.entries.find((e) => e.path === "new-staged.txt");
    expect(addEntry?.kind).toBe("added");

    // Verify deleted
    const delEntry = status.entries.find((e) => e.path === "to-delete.txt");
    expect(delEntry?.kind).toBe("deleted");

    // Verify untracked
    const untrackedEntry = status.entries.find((e) => e.path === unicodeName);
    expect(untrackedEntry?.kind).toBe("untracked");
  });

  it("filters sensitive files and sets sensitiveEntriesFiltered = true", async () => {
    fs.writeFileSync(path.join(repoDir, ".env"), "SECRET_KEY=12345");
    fs.writeFileSync(path.join(repoDir, "server.key"), "PRIVATE KEY");

    const status = await gitService.getStatus({ projectId });
    expect(status.sensitiveEntriesFiltered).toBe(true);

    const paths = status.entries.map((e) => e.path);
    expect(paths).not.toContain(".env");
    expect(paths).not.toContain("server.key");
  });
});
