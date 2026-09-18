import { describe, it, expect, beforeAll, afterAll } from "vitest";
import os from "node:os";
import path from "node:path";
import fs from "node:fs";
import child_process from "node:child_process";
import { GitProcessRunner } from "../apps/runner/src/git/process.js";
import { GitService } from "../apps/runner/src/git/service.js";
import { ProjectRegistry } from "../apps/runner/src/projects/registry.js";
import { LocalBridgeErrorCode } from "@localbridge/protocol";
import { createLogger } from "@localbridge/shared";

describe("Git Diff Engine (git.diff)", () => {
  let tmpDir: string;
  let repoDir: string;
  let gitService: GitService;
  let projectId: string;

  beforeAll(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "lb-git-diff-"));
    repoDir = path.join(tmpDir, "repo");
    fs.mkdirSync(repoDir, { recursive: true });

    child_process.execFileSync("git", ["init"], { cwd: repoDir });
    child_process.execFileSync("git", ["config", "user.name", "Test User"], { cwd: repoDir });
    child_process.execFileSync("git", ["config", "user.email", "test@example.com"], { cwd: repoDir });

    fs.writeFileSync(
      path.join(repoDir, "file1.txt"),
      "line 1\nline 2\nline 3\nline 4\nline 5\n"
    );
    fs.writeFileSync(
      path.join(repoDir, "file2.txt"),
      "alpha\nbeta\ngamma\n"
    );

    child_process.execFileSync("git", ["add", "."], { cwd: repoDir });
    child_process.execFileSync("git", ["commit", "-m", "Initial commit"], { cwd: repoDir });

    const projectsFile = path.join(tmpDir, "projects.json");
    const silentLogger = createLogger({ level: "silent" });
    const registry = new ProjectRegistry(projectsFile, silentLogger);
    const proj = registry.add(repoDir, { name: "DiffRepo" });
    projectId = proj.id;

    gitService = new GitService(registry, new GitProcessRunner(silentLogger), silentLogger);
  });

  afterAll(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("inspects unstaged unified diff across project and respects contextLines", async () => {
    // Modify file1 unstaged
    fs.writeFileSync(
      path.join(repoDir, "file1.txt"),
      "line 1\nline 2\nline 3 modified\nline 4\nline 5\n"
    );

    const diffResult = await gitService.getDiff({
      projectId,
      scope: "unstaged",
      contextLines: 1,
    });

    expect(diffResult.scope).toBe("unstaged");
    expect(diffResult.files).toContain("file1.txt");
    expect(diffResult.diff).toContain("-line 3");
    expect(diffResult.diff).toContain("+line 3 modified");
    // Standard git diff headers use relative paths a/ and b/
    expect(diffResult.diff).toContain("a/file1.txt");
    expect(diffResult.diff).toContain("b/file1.txt");
  });

  it("inspects staged unified diff", async () => {
    // Modify file2 and stage it
    fs.writeFileSync(
      path.join(repoDir, "file2.txt"),
      "alpha\nbeta changed\ngamma\n"
    );
    child_process.execFileSync("git", ["add", "file2.txt"], { cwd: repoDir });

    const stagedDiff = await gitService.getDiff({
      projectId,
      scope: "staged",
    });

    expect(stagedDiff.scope).toBe("staged");
    expect(stagedDiff.files).toContain("file2.txt");
    expect(stagedDiff.diff).toContain("-beta");
    expect(stagedDiff.diff).toContain("+beta changed");

    // Unstaged diff should NOT contain file2.txt changes
    const unstagedDiff = await gitService.getDiff({
      projectId,
      scope: "unstaged",
    });
    expect(unstagedDiff.files).not.toContain("file2.txt");
  });

  it("inspects diff for a targeted single file", async () => {
    const singleDiff = await gitService.getDiff({
      projectId,
      scope: "unstaged",
      path: "file1.txt",
    });

    expect(singleDiff.files).toEqual(["file1.txt"]);
    expect(singleDiff.diff).toContain("+line 3 modified");
  });

  it("blocks diff on sensitive file targets with GIT_SENSITIVE_PATH_BLOCKED", async () => {
    fs.writeFileSync(path.join(repoDir, ".env"), "SECRET=val");

    await expect(
      gitService.getDiff({
        projectId,
        path: ".env",
      })
    ).rejects.toMatchObject({
      code: LocalBridgeErrorCode.GIT_SENSITIVE_PATH_BLOCKED,
    });
  });

  it("blocks path traversal outside project sandbox", async () => {
    await expect(
      gitService.getDiff({
        projectId,
        path: "../outside.txt",
      })
    ).rejects.toThrow();
  });

  it("filters sensitive files from project-wide diff automatically", async () => {
    // Stage .env
    fs.writeFileSync(path.join(repoDir, ".env"), "NEW_KEY=1");
    child_process.execFileSync("git", ["add", "-f", ".env"], { cwd: repoDir });

    const stagedDiff = await gitService.getDiff({
      projectId,
      scope: "staged",
    });

    expect(stagedDiff.sensitiveEntriesFiltered).toBe(true);
    expect(stagedDiff.files).not.toContain(".env");
    expect(stagedDiff.diff).not.toContain("NEW_KEY=1");
  });
});
