import { describe, it, expect, beforeAll, afterAll } from "vitest";
import os from "node:os";
import path from "node:path";
import fs from "node:fs";
import child_process from "node:child_process";
import { GitProcessRunner } from "../apps/runner/src/git/process.js";
import { validateRepository } from "../apps/runner/src/git/repository.js";
import { GitService } from "../apps/runner/src/git/service.js";
import { ProjectRegistry } from "../apps/runner/src/projects/registry.js";
import { LocalBridgeErrorCode } from "@localbridge/protocol";
import { createLogger } from "@localbridge/shared";

describe("Git Repository Boundary & Security", () => {
  let tmpDir: string;
  let repoDir: string;
  let subDir: string;
  let nonRepoDir: string;
  let runner: GitProcessRunner;
  let projectRegistry: ProjectRegistry;
  let gitService: GitService;

  beforeAll(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "lb-git-boundary-"));
    repoDir = path.join(tmpDir, "repo");
    subDir = path.join(repoDir, "packages", "app");
    nonRepoDir = path.join(tmpDir, "not-a-repo");

    fs.mkdirSync(repoDir, { recursive: true });
    fs.mkdirSync(subDir, { recursive: true });
    fs.mkdirSync(nonRepoDir, { recursive: true });

    // Initialize git repository in repoDir
    child_process.execFileSync("git", ["init"], { cwd: repoDir });
    child_process.execFileSync("git", ["config", "user.name", "Test User"], { cwd: repoDir });
    child_process.execFileSync("git", ["config", "user.email", "test@example.com"], { cwd: repoDir });
    fs.writeFileSync(path.join(repoDir, "file.txt"), "hello root");
    fs.writeFileSync(path.join(subDir, "sub.txt"), "hello sub");
    child_process.execFileSync("git", ["add", "."], { cwd: repoDir });
    child_process.execFileSync("git", ["commit", "-m", "Initial commit"], { cwd: repoDir });

    const projectsFile = path.join(tmpDir, "projects.json");
    const silentLogger = createLogger({ level: "silent" });
    projectRegistry = new ProjectRegistry(projectsFile, silentLogger);
    runner = new GitProcessRunner(silentLogger);
    gitService = new GitService(projectRegistry, runner, silentLogger);
  });

  afterAll(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("allows repository when project root matches git worktree root exactly", async () => {
    const project = projectRegistry.add(repoDir, { name: "RootRepo" });
    const result = await validateRepository(runner, project.canonicalRoot);
    expect(result.isRepository).toBe(true);

    const info = await gitService.getInfo({ projectId: project.id });
    expect(info.isRepository).toBe(true);
    expect(info.detached).toBe(false);
  });

  it("rejects project configured on subdirectory of parent git repo with GIT_REPOSITORY_BOUNDARY", async () => {
    const subProject = projectRegistry.add(subDir, { name: "SubProject" });

    // Direct validation throws GIT_REPOSITORY_BOUNDARY
    await expect(
      validateRepository(runner, subProject.canonicalRoot)
    ).rejects.toMatchObject({
      code: LocalBridgeErrorCode.GIT_REPOSITORY_BOUNDARY,
    });

    // Service methods throw GIT_REPOSITORY_BOUNDARY
    await expect(
      gitService.getStatus({ projectId: subProject.id })
    ).rejects.toMatchObject({
      code: LocalBridgeErrorCode.GIT_REPOSITORY_BOUNDARY,
    });

    await expect(
      gitService.getInfo({ projectId: subProject.id })
    ).rejects.toMatchObject({
      code: LocalBridgeErrorCode.GIT_REPOSITORY_BOUNDARY,
    });
  });

  it("handles non-git directory appropriately", async () => {
    const nonRepoProject = projectRegistry.add(nonRepoDir, { name: "NonRepo" });

    // Direct validation throws GIT_NOT_REPOSITORY
    await expect(
      validateRepository(runner, nonRepoProject.canonicalRoot)
    ).rejects.toMatchObject({
      code: LocalBridgeErrorCode.GIT_NOT_REPOSITORY,
    });

    // git.info returns isRepository: false
    const info = await gitService.getInfo({ projectId: nonRepoProject.id });
    expect(info.isRepository).toBe(false);
    expect(info.branch).toBeNull();
    expect(info.head).toBeNull();

    // git.status throws GIT_NOT_REPOSITORY
    await expect(
      gitService.getStatus({ projectId: nonRepoProject.id })
    ).rejects.toMatchObject({
      code: LocalBridgeErrorCode.GIT_NOT_REPOSITORY,
    });
  });
});
