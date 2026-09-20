import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import child_process from "node:child_process";
import {
  LocalBridgeError,
  LocalBridgeErrorCode,
} from "@localbridge/protocol";
import { ProjectRegistry } from "../apps/runner/src/projects/index.js";
import { ApprovalManager } from "../apps/runner/src/approvals/index.js";
import { GitService } from "../apps/runner/src/git/service.js";
import { createGitStageHandler } from "../apps/runner/src/rpc/handlers/git-stage.js";
import { createGitUnstageHandler } from "../apps/runner/src/rpc/handlers/git-unstage.js";
import { createGitBranchCreateHandler } from "../apps/runner/src/rpc/handlers/git-branch-create.js";
import { createGitBranchSwitchHandler } from "../apps/runner/src/rpc/handlers/git-branch-switch.js";
import { createGitCommitHandler } from "../apps/runner/src/rpc/handlers/git-commit.js";

describe("P1-B: Git Write Control E2E Tests", () => {
  let tempDir: string;
  let registryPath: string;
  let gitRepoDir: string;
  let nonGitRepoDir: string;
  let projectRegistry: ProjectRegistry;
  let approvalManager: ApprovalManager;
  let gitService: GitService;
  let projectId: string;
  let nonGitProjectId: string;

  let stageHandler: ReturnType<typeof createGitStageHandler>;
  let unstageHandler: ReturnType<typeof createGitUnstageHandler>;
  let branchCreateHandler: ReturnType<typeof createGitBranchCreateHandler>;
  let branchSwitchHandler: ReturnType<typeof createGitBranchSwitchHandler>;
  let commitHandler: ReturnType<typeof createGitCommitHandler>;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "lb-git-write-test-"));
    registryPath = path.join(tempDir, "projects.json");
    gitRepoDir = path.join(tempDir, "repo");
    nonGitRepoDir = path.join(tempDir, "not-a-repo");

    fs.mkdirSync(gitRepoDir, { recursive: true });
    fs.mkdirSync(nonGitRepoDir, { recursive: true });

    // Initialize real git repo
    child_process.execFileSync("git", ["init", "-b", "main"], { cwd: gitRepoDir });
    child_process.execFileSync("git", ["config", "user.name", "P1B Tester"], { cwd: gitRepoDir });
    child_process.execFileSync("git", ["config", "user.email", "tester@nexus.local"], { cwd: gitRepoDir });

    fs.writeFileSync(path.join(gitRepoDir, "initial.txt"), "hello world\n");
    child_process.execFileSync("git", ["add", "."], { cwd: gitRepoDir });
    child_process.execFileSync("git", ["commit", "-m", "Initial commit"], { cwd: gitRepoDir });

    projectRegistry = new ProjectRegistry(registryPath);
    const rec = projectRegistry.add(gitRepoDir, {
      name: "Git Write Test Project",
      accessMode: "read-write",
    });
    projectId = rec.id;

    const nonGitRec = projectRegistry.add(nonGitRepoDir, {
      name: "Non-Git Project",
      accessMode: "read-write",
    });
    nonGitProjectId = nonGitRec.id;

    approvalManager = new ApprovalManager();
    gitService = new GitService(projectRegistry);

    stageHandler = createGitStageHandler(gitService, approvalManager, projectRegistry);
    unstageHandler = createGitUnstageHandler(gitService, approvalManager, projectRegistry);
    branchCreateHandler = createGitBranchCreateHandler(gitService, approvalManager, projectRegistry);
    branchSwitchHandler = createGitBranchSwitchHandler(gitService, approvalManager, projectRegistry);
    commitHandler = createGitCommitHandler(gitService, approvalManager, projectRegistry);
  });

  afterEach(() => {
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {}
  });

  it("stages and unstages files cleanly without affecting working tree content", async () => {
    // Configure project custom rules to allow stage/unstage/commit
    projectRegistry.setTrustPolicy(projectId, {
      trustLevel: "custom",
      commandPolicy: "controlled",
      protectedFilesPolicy: "always-ask",
      customRules: {
        git: {
          stage: "allow",
          unstage: "allow",
          commit: "allow",
        },
      },
    });

    // Create a new file and modify existing file
    const newFilePath = path.join(gitRepoDir, "feature.txt");
    fs.writeFileSync(newFilePath, "feature content v1\n");
    fs.writeFileSync(path.join(gitRepoDir, "initial.txt"), "initial modified\n");

    // 1. Stage the new file and modified file
    const stageResult = await stageHandler({
      projectId,
      paths: ["feature.txt", "initial.txt"],
    });

    expect(stageResult.staged).toEqual(["feature.txt", "initial.txt"]);

    // Verify git status shows both staged
    const statusBefore = await gitService.getStatus({ projectId });
    expect(statusBefore.entries.some((e) => e.path === "feature.txt" && e.indexStatus === "A")).toBe(true);
    expect(statusBefore.entries.some((e) => e.path === "initial.txt" && e.indexStatus === "M")).toBe(true);

    // 2. Unstage feature.txt
    const unstageResult = await unstageHandler({
      projectId,
      paths: ["feature.txt"],
    });

    expect(unstageResult.unstaged).toEqual(["feature.txt"]);

    // Verify working tree file is NOT deleted or modified!
    expect(fs.readFileSync(newFilePath, "utf-8")).toBe("feature content v1\n");

    // Verify status: initial.txt is still staged, feature.txt is untracked
    const statusAfter = await gitService.getStatus({ projectId });
    expect(statusAfter.entries.some((e) => e.path === "feature.txt" && e.kind === "untracked")).toBe(true);
    expect(statusAfter.entries.some((e) => e.path === "initial.txt" && e.indexStatus === "M")).toBe(true);
  });

  it("creates a new branch with strict name validation and switches branches", async () => {
    projectRegistry.setTrustPolicy(projectId, {
      trustLevel: "custom",
      commandPolicy: "controlled",
      protectedFilesPolicy: "always-ask",
      customRules: {
        git: {
          createBranch: "allow",
          switchBranch: "allow",
        },
      },
    });

    // 1. Create a valid branch
    const createResult = await branchCreateHandler({
      projectId,
      branchName: "feature/p1b-control",
    });

    expect(createResult.branch).toBe("feature/p1b-control");
    expect(createResult.commitHash).toBeTruthy();

    // 2. Switch to the newly created branch
    const switchResult = await branchSwitchHandler({
      projectId,
      branchName: "feature/p1b-control",
    });

    expect(switchResult.currentBranch).toBe("feature/p1b-control");
    expect(switchResult.previousBranch).toBe("main");

    // 3. Reject invalid branch names
    await expect(
      branchCreateHandler({
        projectId,
        branchName: "-invalid-leading-dash",
      })
    ).rejects.toThrow();

    await expect(
      branchCreateHandler({
        projectId,
        branchName: "branch..double-dot",
      })
    ).rejects.toThrow();

    // 4. Reject creating branch that already exists
    await expect(
      branchCreateHandler({
        projectId,
        branchName: "feature/p1b-control",
      })
    ).rejects.toMatchObject({
      code: LocalBridgeErrorCode.GIT_BRANCH_EXISTS,
    });
  });

  it("detects dirty worktree conflict on branch switch", async () => {
    projectRegistry.setTrustPolicy(projectId, {
      trustLevel: "custom",
      commandPolicy: "controlled",
      protectedFilesPolicy: "always-ask",
      customRules: {
        git: {
          createBranch: "allow",
          switchBranch: "allow",
          stage: "allow",
          commit: "allow",
        },
      },
    });

    // Create branch-a and commit a file there
    await branchCreateHandler({ projectId, branchName: "branch-a" });
    await branchSwitchHandler({ projectId, branchName: "branch-a" });
    fs.writeFileSync(path.join(gitRepoDir, "conflict.txt"), "content branch-a\n");
    await stageHandler({ projectId, paths: ["conflict.txt"] });
    await commitHandler({ projectId, message: "Add conflict.txt on branch-a" });

    // Switch back to main
    await branchSwitchHandler({ projectId, branchName: "main" });

    // Now create untracked conflict.txt on main with different content
    fs.writeFileSync(path.join(gitRepoDir, "conflict.txt"), "uncommitted conflicting content on main\n");

    // Attempting to switch to branch-a where conflict.txt exists would overwrite it
    await expect(
      branchSwitchHandler({
        projectId,
        branchName: "branch-a",
      })
    ).rejects.toMatchObject({
      code: LocalBridgeErrorCode.GIT_WORKTREE_CONFLICT,
    });
  });

  it("commits staged changes and fails when index is empty", async () => {
    projectRegistry.setTrustPolicy(projectId, {
      trustLevel: "custom",
      commandPolicy: "controlled",
      protectedFilesPolicy: "always-ask",
      customRules: {
        git: {
          stage: "allow",
          commit: "allow",
        },
      },
    });

    // 1. Commit with nothing staged should fail with GIT_NOTHING_STAGED
    await expect(
      commitHandler({
        projectId,
        message: "Should fail because nothing is staged",
      })
    ).rejects.toMatchObject({
      code: LocalBridgeErrorCode.GIT_NOTHING_STAGED,
    });

    // 2. Stage a file and commit
    fs.writeFileSync(path.join(gitRepoDir, "committed.txt"), "ready to commit\n");
    await stageHandler({ projectId, paths: ["committed.txt"] });

    const commitResult = await commitHandler({
      projectId,
      message: "feat: add committed.txt file",
    });

    expect(commitResult.commitHash).toBeTruthy();
    expect(commitResult.shortHash.length).toBeGreaterThanOrEqual(7);
    expect(commitResult.branch).toBe("main");
    expect(commitResult.summary).toContain("feat: add committed.txt file");
  });

  it("enforces approval closed loop: approvalId generation, approval execution, replay rejection, tamper rejection", async () => {
    // Set standard policy (all write ops default to "ask")
    projectRegistry.setTrustPolicy(projectId, {
      trustLevel: "standard",
      commandPolicy: "ask",
      protectedFilesPolicy: "always-ask",
    });

    fs.writeFileSync(path.join(gitRepoDir, "approval-test.txt"), "needs approval\n");

    // Step 1: Call git.stage without approvalId -> APPROVAL_REQUIRED
    let approvalId: string | undefined;
    try {
      await stageHandler({
        projectId,
        paths: ["approval-test.txt"],
      });
      expect.fail("Expected APPROVAL_REQUIRED error");
    } catch (err: any) {
      expect(err).toBeInstanceOf(LocalBridgeError);
      expect(err.code).toBe(LocalBridgeErrorCode.APPROVAL_REQUIRED);
      expect(err.details?.approvalId).toBeTruthy();
      approvalId = err.details.approvalId as string;
    }

    expect(approvalId).toBeTruthy();

    // Verify approval is pending in manager
    const pending = approvalManager.get(approvalId!);
    expect(pending?.status).toBe("pending");
    expect(pending?.operation).toBe("git.stage");

    // Step 2: Approve the pending request
    approvalManager.resolve({ approvalId: approvalId!, action: "approve", resolvedBy: "test-user" });

    // Step 3: Tamper test: send approvalId with different parameters
    await expect(
      stageHandler({
        projectId,
        paths: ["different-path.txt"],
        approvalId,
      })
    ).rejects.toMatchObject({
      code: LocalBridgeErrorCode.APPROVAL_PAYLOAD_MISMATCH,
    });

    // Step 4: Retry with exact original parameters -> SUCCESS & CONSUMED
    const successResult = await stageHandler({
      projectId,
      paths: ["approval-test.txt"],
      approvalId,
    });
    expect(successResult.staged).toEqual(["approval-test.txt"]);

    // Step 5: Replay attack: retry again with already consumed approvalId
    await expect(
      stageHandler({
        projectId,
        paths: ["approval-test.txt"],
        approvalId,
      })
    ).rejects.toMatchObject({
      code: LocalBridgeErrorCode.APPROVAL_ALREADY_RESOLVED,
    });
  });

  it("rejects git write operations on read-only projects", async () => {
    // Set accessMode to read-only
    projectRegistry.setAccessMode(projectId, "read-only");

    fs.writeFileSync(path.join(gitRepoDir, "readonly.txt"), "content\n");

    await expect(
      stageHandler({
        projectId,
        paths: ["readonly.txt"],
      })
    ).rejects.toMatchObject({
      code: LocalBridgeErrorCode.PROJECT_READ_ONLY,
    });

    await expect(
      unstageHandler({
        projectId,
        paths: ["readonly.txt"],
      })
    ).rejects.toMatchObject({
      code: LocalBridgeErrorCode.PROJECT_READ_ONLY,
    });

    await expect(
      branchCreateHandler({
        projectId,
        branchName: "new-branch",
      })
    ).rejects.toMatchObject({
      code: LocalBridgeErrorCode.PROJECT_READ_ONLY,
    });

    await expect(
      branchSwitchHandler({
        projectId,
        branchName: "main",
      })
    ).rejects.toMatchObject({
      code: LocalBridgeErrorCode.PROJECT_READ_ONLY,
    });

    await expect(
      commitHandler({
        projectId,
        message: "Commit on read-only",
      })
    ).rejects.toMatchObject({
      code: LocalBridgeErrorCode.PROJECT_READ_ONLY,
    });
  });

  it("rejects operations on non-git repositories without creating git repository", async () => {
    projectRegistry.setTrustPolicy(nonGitProjectId, {
      trustLevel: "custom",
      commandPolicy: "controlled",
      protectedFilesPolicy: "always-ask",
      customRules: {
        git: {
          stage: "allow",
          createBranch: "allow",
        },
      },
    });

    await expect(
      stageHandler({
        projectId: nonGitProjectId,
        paths: ["test.txt"],
      })
    ).rejects.toMatchObject({
      code: LocalBridgeErrorCode.GIT_NOT_REPOSITORY,
    });

    await expect(
      branchCreateHandler({
        projectId: nonGitProjectId,
        branchName: "test-branch",
      })
    ).rejects.toMatchObject({
      code: LocalBridgeErrorCode.GIT_NOT_REPOSITORY,
    });

    // Ensure .git directory was NOT auto initialized
    expect(fs.existsSync(path.join(nonGitRepoDir, ".git"))).toBe(false);
  });

  it("rejects staging sensitive files and escaping outside repository", async () => {
    projectRegistry.setTrustPolicy(projectId, {
      trustLevel: "custom",
      commandPolicy: "controlled",
      protectedFilesPolicy: "always-ask",
      customRules: {
        git: { stage: "allow" },
      },
    });

    // Staging .git/* directly should be blocked
    await expect(
      stageHandler({
        projectId,
        paths: [".git/config"],
      })
    ).rejects.toThrow();

    // Path traversal outside project should be blocked
    await expect(
      stageHandler({
        projectId,
        paths: ["../../outside.txt"],
      })
    ).rejects.toThrow();
  });
});
