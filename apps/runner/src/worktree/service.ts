import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import {
  LocalBridgeError,
  LocalBridgeErrorCode,
  type WorktreeCreateParams,
  type WorktreeCreateResult,
  type WorktreeListParams,
  type WorktreeListResult,
  type WorktreeStatusParams,
  type WorktreeStatusResult,
  type WorktreeDiffParams,
  type WorktreeDiffResult,
  type WorktreeRemoveParams,
  type WorktreeRemoveResult,
  type ManagedWorktreeRecord,
} from "@localbridge/protocol";
import {
  validateBranchNameFormat,
  isPathInside,
} from "@localbridge/security";
import type { Logger } from "@localbridge/shared";
import type { ProjectRegistry } from "../projects/index.js";
import { GitProcessRunner, MAX_GIT_DIFF_BYTES } from "../git/process.js";
import { validateRepository } from "../git/repository.js";
import { parsePorcelainV2 } from "../git/parsers/porcelain-v2.js";
import { sanitizeDiffOutput } from "../git/service.js";

export interface ManagedWorktreeServiceOptions {
  runnerStateDir: string;
  projectRegistry: ProjectRegistry;
  processRunner?: GitProcessRunner;
  logger?: Logger;
}

export class ManagedWorktreeService {
  private readonly projectRegistry: ProjectRegistry;
  private readonly processRunner: GitProcessRunner;
  private readonly runnerStateDir: string;
  private readonly worktreesBaseDir: string;
  private readonly stateFilePath: string;
  private readonly logger?: Logger;
  private readonly worktrees = new Map<string, ManagedWorktreeRecord>();

  constructor(options: ManagedWorktreeServiceOptions) {
    this.projectRegistry = options.projectRegistry;
    this.runnerStateDir = options.runnerStateDir;
    this.logger = options.logger;
    this.processRunner = options.processRunner ?? new GitProcessRunner(options.logger);
    this.worktreesBaseDir = path.join(this.runnerStateDir, "worktrees");
    this.stateFilePath = path.join(this.runnerStateDir, "worktrees.json");

    if (!fs.existsSync(this.worktreesBaseDir)) {
      fs.mkdirSync(this.worktreesBaseDir, { recursive: true });
    }

    this.loadState();
  }

  private loadState(): void {
    try {
      if (fs.existsSync(this.stateFilePath)) {
        const data = fs.readFileSync(this.stateFilePath, "utf-8");
        const list: ManagedWorktreeRecord[] = JSON.parse(data);
        for (const item of list) {
          this.worktrees.set(item.id, item);
        }
      }
    } catch (err) {
      this.logger?.warn({ err }, "Failed to load worktrees state from disk");
    }
  }

  private saveState(): void {
    try {
      const list = Array.from(this.worktrees.values());
      fs.writeFileSync(this.stateFilePath, JSON.stringify(list, null, 2), "utf-8");
    } catch (err) {
      this.logger?.warn({ err }, "Failed to save worktrees state to disk");
    }
  }

  private getAuthorizedProject(projectId: string) {
    const project = this.projectRegistry.get(projectId);
    if (!project) {
      throw new LocalBridgeError(
        LocalBridgeErrorCode.PROJECT_NOT_FOUND,
        `Project "${projectId}" not found`
      );
    }
    if (!project.enabled) {
      throw new LocalBridgeError(
        LocalBridgeErrorCode.PROJECT_DISABLED,
        `Project "${projectId}" is disabled`
      );
    }
    return project;
  }

  /**
   * Find the active (state === 'ready') worktree for a project, optionally filtered by sessionId.
   */
  getActiveWorktree(projectId: string, sessionId?: string): ManagedWorktreeRecord | null {
    for (const record of this.worktrees.values()) {
      if (record.projectId === projectId && record.state === "ready") {
        if (sessionId) {
          if (record.sessionId === sessionId) {
            return record;
          }
        } else {
          return record;
        }
      }
    }
    return null;
  }

  getWorktree(worktreeId: string): ManagedWorktreeRecord | undefined {
    return this.worktrees.get(worktreeId);
  }

  /**
   * 1. Create a new managed git worktree
   */
  async create(params: WorktreeCreateParams): Promise<WorktreeCreateResult> {
    const project = this.getAuthorizedProject(params.projectId);
    const repoRoot = project.canonicalRoot;

    // Validate git repo boundary
    await validateRepository(this.processRunner, repoRoot);

    // Validate branch name
    const branchName = validateBranchNameFormat(params.branchName);

    // Validate branch with git check-ref-format --branch
    const checkRef = await this.processRunner.exec({
      cwd: repoRoot,
      args: ["check-ref-format", "--branch", branchName],
      allowNonZeroExit: true,
    });
    if (checkRef.exitCode !== 0) {
      throw new LocalBridgeError(
        LocalBridgeErrorCode.WORKTREE_INVALID_BRANCH,
        `Branch name "${branchName}" is not a valid git ref: ${checkRef.stderr.trim()}`
      );
    }

    // Check if branch already exists in repo
    const checkBranchExists = await this.processRunner.exec({
      cwd: repoRoot,
      args: ["rev-parse", "--verify", `refs/heads/${branchName}`],
      allowNonZeroExit: true,
    });
    if (checkBranchExists.exitCode === 0) {
      throw new LocalBridgeError(
        LocalBridgeErrorCode.WORKTREE_BRANCH_EXISTS,
        `Branch "${branchName}" already exists in the repository`
      );
    }

    // Check if session already has an active worktree
    if (params.sessionId) {
      const existing = this.getActiveWorktree(params.projectId, params.sessionId);
      if (existing) {
        throw new LocalBridgeError(
          LocalBridgeErrorCode.WORKTREE_ALREADY_EXISTS,
          `Session "${params.sessionId}" already has an active worktree "${existing.id}"`
        );
      }
    }

    // Resolve baseRef and baseCommit
    const baseRef = (params.baseRef || (params as any).baseBranch || (params as any).baseCommit)?.trim() || "HEAD";
    const revParseBase = await this.processRunner.exec({
      cwd: repoRoot,
      args: ["rev-parse", "--verify", `${baseRef}^{commit}`],
      allowNonZeroExit: true,
    });
    if (revParseBase.exitCode !== 0) {
      throw new LocalBridgeError(
        LocalBridgeErrorCode.WORKTREE_INVALID_BASE,
        `Base ref "${baseRef}" cannot be resolved to a valid commit: ${revParseBase.stderr.trim()}`
      );
    }
    const baseCommit = revParseBase.stdout.trim();

    // Prepare worktree directory
    const worktreeId = `worktree_${crypto.randomUUID()}`;
    const worktreePath = path.resolve(path.join(this.worktreesBaseDir, params.projectId, worktreeId));

    // Ensure worktreePath is NOT inside user repository root
    if (isPathInside(repoRoot, worktreePath)) {
      throw new LocalBridgeError(
        LocalBridgeErrorCode.WORKTREE_CREATION_FAILED,
        "Managed worktree directory cannot be located inside the repository root"
      );
    }

    fs.mkdirSync(path.dirname(worktreePath), { recursive: true });

    // Execute git worktree add -b <branchName> <worktreePath> <baseRef>
    const addResult = await this.processRunner.exec({
      cwd: repoRoot,
      args: ["worktree", "add", "-b", branchName, worktreePath, baseRef],
      allowNonZeroExit: true,
    });

    if (addResult.exitCode !== 0) {
      throw new LocalBridgeError(
        LocalBridgeErrorCode.WORKTREE_CREATION_FAILED,
        `Failed to create git worktree: ${addResult.stderr.trim()}`
      );
    }

    // Get headCommit of the new worktree
    const revParseHead = await this.processRunner.exec({
      cwd: worktreePath,
      args: ["rev-parse", "HEAD"],
      allowNonZeroExit: true,
    });
    const headCommit = revParseHead.stdout.trim() || baseCommit;

    const now = Date.now();
    const record: ManagedWorktreeRecord = {
      id: worktreeId,
      projectId: params.projectId,
      sessionId: params.sessionId,
      repositoryRoot: repoRoot,
      worktreePath,
      branchName,
      baseRef,
      baseCommit,
      headCommit,
      state: "ready",
      createdAt: now,
      updatedAt: now,
      removedAt: null,
      createdBy: "chat",
    };

    this.worktrees.set(worktreeId, record);
    this.saveState();

    this.logger?.info(
      { worktreeId, projectId: params.projectId, branchName, worktreePath },
      `Managed worktree created successfully`
    );

    return {
      worktreeId,
      projectId: params.projectId,
      sessionId: params.sessionId,
      repositoryRoot: repoRoot,
      worktreePath,
      branchName,
      baseRef,
      baseCommit,
      headCommit,
      state: "ready",
      createdAt: now,
      worktree: {
        id: worktreeId,
        worktreeId,
        projectId: params.projectId,
        sessionId: params.sessionId,
        repositoryRoot: repoRoot,
        worktreeRoot: worktreePath,
        worktreePath,
        branchName,
        baseRef,
        baseBranch: baseRef,
        baseCommit,
        headCommit,
        isClean: true,
        state: "ready",
        createdAt: now,
      },
    } as any;
  }

  /**
   * 2. List managed worktrees for a project
   */
  async list(params: WorktreeListParams): Promise<WorktreeListResult> {
    this.getAuthorizedProject(params.projectId);
    const results: ManagedWorktreeRecord[] = [];

    for (const record of this.worktrees.values()) {
      if (record.projectId === params.projectId && record.state !== "removed") {
        if (!params.sessionId || record.sessionId === params.sessionId) {
          results.push(record);
        }
      }
    }

    return {
      worktrees: results.map((r) => ({
        worktreeId: r.id,
        id: r.id,
        projectId: r.projectId,
        sessionId: r.sessionId,
        worktreePath: r.worktreePath,
        worktreeRoot: r.worktreePath,
        branchName: r.branchName,
        baseRef: r.baseRef,
        baseCommit: r.baseCommit,
        headCommit: r.headCommit,
        state: r.state,
        createdAt: r.createdAt,
        updatedAt: r.updatedAt,
        removedAt: r.removedAt,
      })),
      total: results.length,
    };
  }

  /**
   * 3. Get status of a managed worktree
   */
  async status(params: WorktreeStatusParams): Promise<WorktreeStatusResult> {
    let record: ManagedWorktreeRecord | undefined;
    if (params.worktreeId) {
      record = this.worktrees.get(params.worktreeId);
    } else if (params.projectId) {
      record = this.getActiveWorktree(params.projectId, params.sessionId) ?? undefined;
    }

    if (!record || record.state === "removed") {
      throw new LocalBridgeError(
        LocalBridgeErrorCode.WORKTREE_NOT_FOUND,
        `Managed worktree not found`
      );
    }

    if (!fs.existsSync(record.worktreePath)) {
      throw new LocalBridgeError(
        LocalBridgeErrorCode.WORKTREE_NOT_FOUND,
        `Worktree directory "${record.worktreePath}" does not exist on disk`
      );
    }

    // Run git status --porcelain=v2 --branch -z in worktreePath
    const statusResult = await this.processRunner.exec({
      cwd: record.worktreePath,
      args: ["status", "--porcelain=v2", "--branch", "-z"],
    });

    const parsed = parsePorcelainV2(statusResult.stdout);
    const revParseHead = await this.processRunner.exec({
      cwd: record.worktreePath,
      args: ["rev-parse", "HEAD"],
    });
    const headCommit = revParseHead.stdout.trim() || record.headCommit;

    let stagedCount = 0;
    let unstagedCount = 0;
    let untrackedCount = 0;
    for (const entry of parsed.entries) {
      if (entry.kind === "untracked") {
        untrackedCount++;
      } else {
        if (entry.indexStatus && entry.indexStatus !== "." && entry.indexStatus !== "?") {
          stagedCount++;
        }
        if (entry.worktreeStatus && entry.worktreeStatus !== "." && entry.worktreeStatus !== "?") {
          unstagedCount++;
        }
      }
    }
    const isClean = parsed.clean && untrackedCount === 0;
    const dirty = !isClean;

    record.headCommit = headCommit;
    record.updatedAt = Date.now();
    this.saveState();

    return {
      worktreeId: record.id,
      projectId: record.projectId,
      sessionId: record.sessionId,
      worktreePath: record.worktreePath,
      branchName: record.branchName,
      baseRef: record.baseRef,
      baseCommit: record.baseCommit,
      headCommit,
      state: record.state,
      isClean,
      dirty,
      stagedCount,
      unstagedCount,
      untrackedCount,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
    };
  }

  /**
   * 4. Get diff of a managed worktree against base or staged
   */
  async diff(params: WorktreeDiffParams): Promise<WorktreeDiffResult> {
    let record: ManagedWorktreeRecord | undefined;
    if (params.worktreeId) {
      record = this.worktrees.get(params.worktreeId);
    } else if (params.projectId) {
      record = this.getActiveWorktree(params.projectId, params.sessionId) ?? undefined;
    }

    if (!record || record.state === "removed") {
      throw new LocalBridgeError(
        LocalBridgeErrorCode.WORKTREE_NOT_FOUND,
        `Managed worktree not found`
      );
    }

    const diffArgs = params.cached
      ? ["diff", "--no-ext-diff", "--no-textconv", "--cached"]
      : ["diff", "--no-ext-diff", "--no-textconv", record.baseCommit];
    const diffResult = await this.processRunner.exec({
      cwd: record.worktreePath,
      args: diffArgs,
    });

    const sanitized = sanitizeDiffOutput(diffResult.stdout, record.worktreePath);
    let diffText = sanitized;
    let truncated = false;
    if (Buffer.byteLength(diffText, "utf-8") > MAX_GIT_DIFF_BYTES) {
      diffText = diffText.slice(0, MAX_GIT_DIFF_BYTES) + "\n\n... [diff truncated due to size limit]";
      truncated = true;
    }

    // Run numstat for stats
    const numstatArgs = params.cached
      ? ["diff", "--no-ext-diff", "--no-textconv", "--cached", "--numstat"]
      : ["diff", "--no-ext-diff", "--no-textconv", record.baseCommit, "--numstat"];
    const numstatResult = await this.processRunner.exec({
      cwd: record.worktreePath,
      args: numstatArgs,
      allowNonZeroExit: true,
    });

    let filesChanged = 0;
    let insertions = 0;
    let deletions = 0;
    if (numstatResult.exitCode === 0 && numstatResult.stdout) {
      const lines = numstatResult.stdout.trim().split("\n");
      for (const line of lines) {
        const parts = line.split("\t");
        if (parts.length >= 3) {
          filesChanged++;
          const ins = parseInt(parts[0]!, 10);
          const del = parseInt(parts[1]!, 10);
          if (!isNaN(ins)) insertions += ins;
          if (!isNaN(del)) deletions += del;
        }
      }
    }

    return {
      worktreeId: record.id,
      branchName: record.branchName,
      baseRef: record.baseRef,
      baseCommit: record.baseCommit,
      headCommit: record.headCommit,
      diff: diffText,
      truncated,
      stats: {
        filesChanged,
        insertions,
        deletions,
      },
    };
  }

  /**
   * 5. Remove a managed worktree safely
   */
  async remove(params: WorktreeRemoveParams): Promise<WorktreeRemoveResult> {
    const record = this.worktrees.get(params.worktreeId);
    if (!record || record.state === "removed") {
      throw new LocalBridgeError(
        LocalBridgeErrorCode.WORKTREE_NOT_FOUND,
        `Managed worktree "${params.worktreeId}" not found or already removed`
      );
    }

    // Safety checks:
    // 1. Must exist on disk
    if (fs.existsSync(record.worktreePath)) {
      // 2. Check if dirty
      const statusResult = await this.processRunner.exec({
        cwd: record.worktreePath,
        args: ["status", "--porcelain=v2", "--branch", "-z"],
      });
      const parsed = parsePorcelainV2(statusResult.stdout);
      let stagedCount = 0;
      let unstagedCount = 0;
      let untrackedCount = 0;
      for (const entry of parsed.entries) {
        if (entry.kind === "untracked") {
          untrackedCount++;
        } else {
          if (entry.indexStatus && entry.indexStatus !== "." && entry.indexStatus !== "?") {
            stagedCount++;
          }
          if (entry.worktreeStatus && entry.worktreeStatus !== "." && entry.worktreeStatus !== "?") {
            unstagedCount++;
          }
        }
      }
      const isClean = parsed.clean && untrackedCount === 0;
      if (!isClean) {
        throw new LocalBridgeError(
          LocalBridgeErrorCode.WORKTREE_DIRTY,
          `[${LocalBridgeErrorCode.WORKTREE_DIRTY}] Worktree "${record.id}" has uncommitted changes (staged: ${stagedCount}, unstaged: ${unstagedCount}, untracked: ${untrackedCount}) and cannot be removed safely`
        );
      }

      // 3. Check unmerged commits (HEAD !== baseCommit)
      const revParseHead = await this.processRunner.exec({
        cwd: record.worktreePath,
        args: ["rev-parse", "HEAD"],
      });
      const headCommit = revParseHead.stdout.trim();
      if (headCommit && headCommit !== record.baseCommit) {
        throw new LocalBridgeError(
          LocalBridgeErrorCode.WORKTREE_HAS_UNMERGED_COMMITS,
          `[${LocalBridgeErrorCode.WORKTREE_HAS_UNMERGED_COMMITS}] Worktree "${record.id}" has unmerged commits (HEAD: ${headCommit.slice(0, 8)}, base: ${record.baseCommit.slice(0, 8)}) and cannot be removed safely`
        );
      }
    }

    // Execute git worktree remove from main repo
    const removeResult = await this.processRunner.exec({
      cwd: record.repositoryRoot,
      args: ["worktree", "remove", record.worktreePath],
      allowNonZeroExit: true,
    });

    if (removeResult.exitCode !== 0 && fs.existsSync(record.worktreePath)) {
      // If git worktree remove failed, check if directory can be cleaned up
      try {
        fs.rmSync(record.worktreePath, { recursive: true, force: true, maxRetries: 10, retryDelay: 150 });
      } catch (err) {
        throw new LocalBridgeError(
          LocalBridgeErrorCode.WORKTREE_REMOVAL_FAILED,
          `Failed to remove worktree directory: ${err instanceof Error ? err.message : String(err)}`
        );
      }
    }

    // Prune worktree list in git
    await this.processRunner.exec({
      cwd: record.repositoryRoot,
      args: ["worktree", "prune"],
      allowNonZeroExit: true,
    });

    const now = Date.now();
    record.state = "removed";
    record.removedAt = now;
    record.updatedAt = now;
    this.saveState();

    this.logger?.info(
      { worktreeId: record.id, projectId: record.projectId },
      `Managed worktree removed successfully`
    );

    return {
      worktreeId: record.id,
      removed: true,
      removedAt: now,
    };
  }
}
