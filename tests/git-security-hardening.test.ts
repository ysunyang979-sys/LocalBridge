import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import child_process from "node:child_process";
import { GitProcessRunner } from "../apps/runner/src/git/process.js";
import { GitService } from "../apps/runner/src/git/service.js";
import { LocalBridgeErrorCode } from "@localbridge/protocol";

describe("P2 Security: Git Hooks Isolation & Extension Hook Defense", () => {
  let tmpDir: string;
  let repoDir: string;
  let runner: GitProcessRunner;
  let gitService: GitService;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "nexus-git-sec-"));
    repoDir = path.join(tmpDir, "repo");
    fs.mkdirSync(repoDir, { recursive: true });

    // Initialize real git repo
    child_process.execSync("git init", { cwd: repoDir });
    child_process.execSync('git config user.name "Test Runner"', { cwd: repoDir });
    child_process.execSync('git config user.email "test@localbridge.dev"', { cwd: repoDir });

    fs.writeFileSync(path.join(repoDir, "file1.txt"), "hello world\n");
    child_process.execSync("git add file1.txt", { cwd: repoDir });
    child_process.execSync('git commit -m "initial commit"', { cwd: repoDir });

    runner = new GitProcessRunner();

    const mockProjectRegistry = {
      get: () => ({
        id: "proj_git",
        canonicalRoot: repoDir,
        accessMode: "read-write",
        enabled: true,
      }),
      isSessionTrusted: () => false,
    } as any;

    gitService = new GitService(mockProjectRegistry, runner);
  });

  afterEach(() => {
    if (tmpDir && fs.existsSync(tmpDir)) {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  describe("1. Secure Dynamic Hooks Directory", () => {
    it("uses a secure, randomized hooks directory instead of static 'localbridge-empty-hooks'", () => {
      const runner1 = new GitProcessRunner();
      const runner2 = new GitProcessRunner();

      const dir1 = (runner1 as any).emptyHooksDir;
      const dir2 = (runner2 as any).emptyHooksDir;

      expect(dir1).toBeDefined();
      expect(fs.existsSync(dir1)).toBe(true);

      const staticFixedPath = path.join(os.tmpdir(), "localbridge-empty-hooks");
      expect(dir1).not.toBe(staticFixedPath);

      // Unique per runner instance
      expect(dir1).not.toBe(dir2);
    });
  });

  describe("2. Defense against Malicious Git Extension Hooks / Drivers", () => {
    it("blocks git stage if local repository defines custom filter driver", async () => {
      // Inject custom filter driver into local git config
      child_process.execSync('git config --local filter.malicious.clean "calc.exe"', { cwd: repoDir });

      fs.writeFileSync(path.join(repoDir, "new-file.txt"), "dangerous content");

      let err: any = null;
      try {
        await gitService.stage({
          projectId: "proj_git",
          paths: ["new-file.txt"],
        });
      } catch (e) {
        err = e;
      }

      expect(err).not.toBeNull();
      expect(err.code).toBe(LocalBridgeErrorCode.GIT_CONFIG_UNSAFE);
      expect(err.message).toMatch(/filter|unsafe/i);
    });

    it("blocks git commit if local repository defines external gpg.program", async () => {
      // Inject external gpg.program
      child_process.execSync('git config --local gpg.program "C:\\malicious\\gpg.exe"', { cwd: repoDir });

      let err: any = null;
      try {
        await gitService.commit({
          projectId: "proj_git",
          message: "test commit",
        });
      } catch (e) {
        err = e;
      }

      expect(err).not.toBeNull();
      expect(err.code).toBe(LocalBridgeErrorCode.GIT_CONFIG_UNSAFE);
      expect(err.message).toMatch(/gpg|unsafe/i);
    });

    it("blocks git branch switch if local repository defines custom diff driver command", async () => {
      child_process.execSync('git config --local diff.custom.command "sh -c evil"', { cwd: repoDir });
      child_process.execSync("git branch feature-1", { cwd: repoDir });

      let err: any = null;
      try {
        await gitService.branchSwitch({
          projectId: "proj_git",
          branchName: "feature-1",
        });
      } catch (e) {
        err = e;
      }

      expect(err).not.toBeNull();
      expect(err.code).toBe(LocalBridgeErrorCode.GIT_CONFIG_UNSAFE);
    });

    it("blocks git branch create if local repository defines custom merge driver", async () => {
      child_process.execSync('git config --local merge.custom.driver "sh -c evil"', { cwd: repoDir });

      let err: any = null;
      try {
        await gitService.branchCreate({
          projectId: "proj_git",
          branchName: "feature-2",
        });
      } catch (e) {
        err = e;
      }

      expect(err).not.toBeNull();
      expect(err.code).toBe(LocalBridgeErrorCode.GIT_CONFIG_UNSAFE);
    });

    it("allows git operations when repository config is safe and standard", async () => {
      fs.writeFileSync(path.join(repoDir, "safe.txt"), "safe content");

      const stageRes = await gitService.stage({
        projectId: "proj_git",
        paths: ["safe.txt"],
      });
      expect(stageRes.staged).toContain("safe.txt");

      const commitRes = await gitService.commit({
        projectId: "proj_git",
        message: "feat: add safe file",
      });
      expect(commitRes.commitHash).toBeDefined();
    });
  });
});
