import { describe, it, expect, beforeAll, afterAll } from "vitest";
import os from "node:os";
import path from "node:path";
import fs from "node:fs";
import child_process from "node:child_process";
import { GitProcessRunner } from "../apps/runner/src/git/process.js";
import { GitService } from "../apps/runner/src/git/service.js";
import { ProjectRegistry } from "../apps/runner/src/projects/registry.js";
import { createLogger } from "@localbridge/shared";

describe("Git Log & Commit History (git.log)", () => {
  let tmpDir: string;
  let repoDir: string;
  let emptyRepoDir: string;
  let gitService: GitService;
  let projectId: string;
  let emptyProjectId: string;

  beforeAll(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "lb-git-log-"));
    repoDir = path.join(tmpDir, "repo");
    emptyRepoDir = path.join(tmpDir, "empty-repo");
    fs.mkdirSync(repoDir, { recursive: true });
    fs.mkdirSync(emptyRepoDir, { recursive: true });

    // 1. Setup standard repo with multiple commits
    child_process.execFileSync("git", ["init"], { cwd: repoDir });
    child_process.execFileSync("git", ["config", "user.name", "Alice Developer"], { cwd: repoDir });
    child_process.execFileSync("git", ["config", "user.email", "alice@secret-corp.internal"], { cwd: repoDir });

    // Commit 1: Basic
    fs.writeFileSync(path.join(repoDir, "shared.txt"), "shared v1");
    fs.writeFileSync(path.join(repoDir, "feature.txt"), "feature v1");
    child_process.execFileSync("git", ["add", "."], { cwd: repoDir });
    child_process.execFileSync("git", ["commit", "-m", "Initial commit\n\nDetailed secret body that should not leak."], { cwd: repoDir });

    // Commit 2: Chinese characters and emoji
    fs.writeFileSync(path.join(repoDir, "feature.txt"), "feature v2");
    child_process.execFileSync("git", ["add", "feature.txt"], { cwd: repoDir });
    child_process.execFileSync("git", ["commit", "-m", "feat: 增加安全检查 🚀\n\n内部审计详情不应泄露"], { cwd: repoDir });

    // Commit 3: Another shared update
    fs.writeFileSync(path.join(repoDir, "shared.txt"), "shared v2");
    child_process.execFileSync("git", ["add", "shared.txt"], { cwd: repoDir });
    child_process.execFileSync("git", ["commit", "-m", "docs: update shared docs"], { cwd: repoDir });

    // 2. Setup empty repo (no commits)
    child_process.execFileSync("git", ["init"], { cwd: emptyRepoDir });
    child_process.execFileSync("git", ["config", "user.name", "Bob"], { cwd: emptyRepoDir });
    child_process.execFileSync("git", ["config", "user.email", "bob@example.com"], { cwd: emptyRepoDir });

    const projectsFile = path.join(tmpDir, "projects.json");
    const silentLogger = createLogger({ level: "silent" });
    const registry = new ProjectRegistry(projectsFile, silentLogger);

    const proj = registry.add(repoDir, { name: "LogRepo" });
    projectId = proj.id;

    const emptyProj = registry.add(emptyRepoDir, { name: "EmptyRepo" });
    emptyProjectId = emptyProj.id;

    gitService = new GitService(registry, new GitProcessRunner(silentLogger), silentLogger);
  });

  afterAll(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("retrieves commit history with sanitized subjects and metadata", async () => {
    const result = await gitService.getLog({ projectId });

    expect(result.projectId).toBe(projectId);
    expect(result.commits.length).toBe(3);

    // Latest commit
    const latest = result.commits[0]!;
    expect(latest.subject).toBe("docs: update shared docs");
    expect(latest.authorName).toBe("Alice Developer");
    expect(latest.hash).toMatch(/^[0-9a-f]{40}$/);
    expect(latest.shortHash).toMatch(/^[0-9a-f]{7,}$/);
    expect(latest.timestamp).toBeGreaterThan(0);

    // Commit with Chinese & emoji
    const second = result.commits[1]!;
    expect(second.subject).toBe("feat: 增加安全检查 🚀");

    // Strictly ensure no email and no body leaked in any commit
    for (const commit of result.commits) {
      const commitStr = JSON.stringify(commit);
      expect(commitStr).not.toContain("alice@secret-corp.internal");
      expect(commitStr).not.toContain("Detailed secret body");
      expect(commitStr).not.toContain("内部审计详情");
    }
  });

  it("respects the limit parameter", async () => {
    const result = await gitService.getLog({ projectId, limit: 1 });
    expect(result.commits.length).toBe(1);
    expect(result.commits[0]?.subject).toBe("docs: update shared docs");
  });

  it("scopes commit history to specific file path", async () => {
    const result = await gitService.getLog({
      projectId,
      path: "feature.txt",
    });

    // feature.txt was modified in commits 1 and 2, but NOT in commit 3
    expect(result.commits.length).toBe(2);
    expect(result.commits.map((c) => c.subject)).toEqual([
      "feat: 增加安全检查 🚀",
      "Initial commit",
    ]);
  });

  it("handles empty repository without commits gracefully", async () => {
    const result = await gitService.getLog({ projectId: emptyProjectId });
    expect(result.projectId).toBe(emptyProjectId);
    expect(result.commits).toEqual([]);
  });
});
