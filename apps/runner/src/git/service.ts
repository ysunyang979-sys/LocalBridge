import fs from "node:fs";
import path from "node:path";
import {
  LocalBridgeError,
  LocalBridgeErrorCode,
  type GitInfoParams,
  type GitInfoResult,
  type GitStatusParams,
  type GitStatusResult,
  type GitDiffParams,
  type GitDiffResult,
  type GitLogParams,
  type GitLogResult,
} from "@localbridge/protocol";
import { resolveProjectPath, isSensitiveFile } from "@localbridge/security";
import type { Logger } from "@localbridge/shared";
import type { ProjectRegistry } from "../projects/index.js";
import { GitProcessRunner, MAX_GIT_DIFF_BYTES } from "./process.js";
import { validateRepository } from "./repository.js";
import { parsePorcelainV2 } from "./parsers/porcelain-v2.js";
import { parseGitLog } from "./parsers/log.js";

/**
 * Strips physical paths and project root paths from unified diff output.
 */
export function sanitizeDiffOutput(diff: string, canonicalRoot: string): string {
  if (!diff) return "";
  let sanitized = diff;
  if (canonicalRoot) {
    const escaped = canonicalRoot.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    sanitized = sanitized.replace(new RegExp(escaped, "gi"), "<project-root>");
  }
  // Windows absolute paths
  sanitized = sanitized.replace(/[a-zA-Z]:\\[^:\n\r"']+/g, "<redacted-path>");
  return sanitized;
}

/**
 * Runner Git Service.
 * Provides safe, strictly read-only Git operations within authorized project boundaries.
 * Enforces repository root boundary, privacy protections, and direct process execution.
 */
export class GitService {
  private readonly processRunner: GitProcessRunner;

  constructor(
    private readonly projectRegistry: ProjectRegistry,
    processRunnerOrLogger?: GitProcessRunner | Logger,
    private readonly logger?: Logger
  ) {
    if (processRunnerOrLogger && "exec" in processRunnerOrLogger) {
      this.processRunner = processRunnerOrLogger;
    } else {
      this.logger = processRunnerOrLogger as Logger | undefined;
      this.processRunner = new GitProcessRunner(this.logger);
    }
  }

  getProcessRunner(): GitProcessRunner {
    return this.processRunner;
  }

  /**
   * Resolve authorized and enabled project by ID.
   * Both read-only and read-write projects can execute Git inspection.
   */
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
   * git.info: inspect repository metadata (branch, detached, HEAD, upstream).
   */
  async getInfo(params: GitInfoParams): Promise<GitInfoResult> {
    const project = this.getAuthorizedProject(params.projectId);

    // Validate repository boundary
    try {
      await validateRepository(this.processRunner, project.canonicalRoot);
    } catch (err) {
      if (
        err instanceof LocalBridgeError &&
        err.code === LocalBridgeErrorCode.GIT_NOT_REPOSITORY
      ) {
        this.logger?.info(
          { event: "git_info", projectId: params.projectId, isRepository: false },
          `Project "${params.projectId}" is not a Git repository`
        );
        return {
          projectId: params.projectId,
          isRepository: false,
          branch: null,
          detached: false,
          head: null,
          shortHead: null,
          hasUpstream: false,
        };
      }
      throw err;
    }

    const result = await this.processRunner.exec({
      cwd: project.canonicalRoot,
      args: ["status", "--porcelain=v2", "--branch", "-z"],
    });

    const parsed = parsePorcelainV2(result.stdout);
    const shortHead = parsed.head ? parsed.head.slice(0, 7) : null;
    const hasUpstream = parsed.upstream !== null;

    this.logger?.info(
      {
        event: "git_info",
        projectId: params.projectId,
        branch: parsed.branch,
        detached: parsed.detached,
        head: shortHead,
        hasUpstream,
      },
      `Git info inspected for project "${params.projectId}"`
    );

    return {
      projectId: params.projectId,
      isRepository: true,
      branch: parsed.branch,
      detached: parsed.detached,
      head: parsed.head,
      shortHead,
      hasUpstream,
    };
  }

  /**
   * git.status: inspect working tree and index status.
   */
  async getStatus(params: GitStatusParams): Promise<GitStatusResult> {
    const project = this.getAuthorizedProject(params.projectId);
    await validateRepository(this.processRunner, project.canonicalRoot);

    const result = await this.processRunner.exec({
      cwd: project.canonicalRoot,
      args: ["status", "--porcelain=v2", "--branch", "-uall", "-z"],
    });

    const parsed = parsePorcelainV2(result.stdout);

    this.logger?.info(
      {
        event: "git_status",
        projectId: params.projectId,
        clean: parsed.clean,
        entriesCount: parsed.entries.length,
        sensitiveFiltered: parsed.sensitiveEntriesFiltered,
        truncated: parsed.truncated,
      },
      `Git status inspected for project "${params.projectId}"`
    );

    return {
      projectId: params.projectId,
      branch: parsed.branch,
      detached: parsed.detached,
      ahead: parsed.ahead,
      behind: parsed.behind,
      clean: parsed.clean,
      entries: parsed.entries,
      sensitiveEntriesFiltered: parsed.sensitiveEntriesFiltered,
      truncated: parsed.truncated,
    };
  }

  /**
   * git.diff: inspect unified diff for unstaged or staged changes.
   */
  async getDiff(params: GitDiffParams): Promise<GitDiffResult> {
    const project = this.getAuthorizedProject(params.projectId);
    await validateRepository(this.processRunner, project.canonicalRoot);

    const scope = params.scope ?? "unstaged";
    const contextLines = params.contextLines ?? 3;

    // Common diff args disabling external tools and custom textconv filters
    const baseDiffArgs = [
      "diff",
      "--no-color",
      "--no-ext-diff",
      "--no-textconv",
      `-U${contextLines}`,
    ];
    if (scope === "staged") {
      baseDiffArgs.push("--staged");
    }

    if (params.path !== undefined && params.path.trim().length > 0) {
      // Single-file diff path
      const resolved = resolveProjectPath(project.canonicalRoot, params.path, {
        allowSensitive: true,
        mustExist: false,
      });

      if (isSensitiveFile(resolved.relativePath)) {
        throw new LocalBridgeError(
          LocalBridgeErrorCode.GIT_SENSITIVE_PATH_BLOCKED,
          `Diff on sensitive file "${resolved.relativePath}" is blocked`
        );
      }

      // Check if symlink or submodule
      const fullPath = resolved.absolutePath;
      try {
        if (fs.existsSync(fullPath) && fs.lstatSync(fullPath).isSymbolicLink()) {
          throw new LocalBridgeError(
            LocalBridgeErrorCode.GIT_SYMLINK_DIFF_BLOCKED,
            `Diff on symlink "${resolved.relativePath}" is blocked`
          );
        }
      } catch (err) {
        if (err instanceof LocalBridgeError) throw err;
      }

      // Check index mode for symlink or submodule
      const lsResult = await this.processRunner.exec({
        cwd: project.canonicalRoot,
        args: ["ls-files", "-s", "-z", "--", resolved.relativePath],
      });
      const lsEntry = lsResult.stdout.split("\0")[0] || "";
      if (lsEntry.startsWith("120000")) {
        throw new LocalBridgeError(
          LocalBridgeErrorCode.GIT_SYMLINK_DIFF_BLOCKED,
          `Diff on symlink "${resolved.relativePath}" is blocked`
        );
      }
      if (lsEntry.startsWith("160000")) {
        throw new LocalBridgeError(
          LocalBridgeErrorCode.GIT_SUBMODULE_NOT_SUPPORTED,
          `Submodules are not supported: "${resolved.relativePath}"`
        );
      }

      const diffArgs = [...baseDiffArgs, "--", resolved.relativePath];
      const diffResult = await this.processRunner.exec({
        cwd: project.canonicalRoot,
        args: diffArgs,
        maxBufferBytes: MAX_GIT_DIFF_BYTES,
        isDiff: true,
      });

      const sanitizedDiff = sanitizeDiffOutput(diffResult.stdout, project.canonicalRoot);
      const files = sanitizedDiff.trim().length > 0 ? [resolved.relativePath] : [];

      this.logger?.info(
        {
          event: "git_diff",
          projectId: params.projectId,
          scope,
          path: resolved.relativePath,
          diffBytes: Buffer.byteLength(sanitizedDiff, "utf-8"),
        },
        `Git diff inspected for single file in project "${params.projectId}"`
      );

      return {
        projectId: params.projectId,
        scope,
        files,
        diff: sanitizedDiff,
        sensitiveEntriesFiltered: false,
        symlinkEntriesFiltered: false,
        submoduleEntriesFiltered: false,
      };
    }

    // Project-wide diff: discover changed files first
    const nameArgs = scope === "staged" ? ["diff", "--name-only", "--staged", "-z"] : ["diff", "--name-only", "-z"];
    const nameResult = await this.processRunner.exec({
      cwd: project.canonicalRoot,
      args: nameArgs,
    });

    const changedFiles = nameResult.stdout.split("\0").map((f) => f.trim()).filter(Boolean);

    let sensitiveEntriesFiltered = false;
    let symlinkEntriesFiltered = false;
    let submoduleEntriesFiltered = false;
    const safeFiles: string[] = [];

    // Query file modes from git index for symlinks/submodules
    const indexModes = new Map<string, string>();
    if (changedFiles.length > 0) {
      const lsResult = await this.processRunner.exec({
        cwd: project.canonicalRoot,
        args: ["ls-files", "-s", "-z", "--", ...changedFiles],
      });
      const entries = lsResult.stdout.split("\0").filter(Boolean);
      for (const entry of entries) {
        const tabIdx = entry.indexOf("\t");
        if (tabIdx !== -1) {
          const modePart = entry.slice(0, 6);
          const entryPath = entry.slice(tabIdx + 1);
          indexModes.set(entryPath, modePart);
        }
      }
    }

    for (const file of changedFiles) {
      if (isSensitiveFile(file)) {
        sensitiveEntriesFiltered = true;
        continue;
      }

      // Check index mode
      const mode = indexModes.get(file);
      if (mode === "120000") {
        symlinkEntriesFiltered = true;
        continue;
      }
      if (mode === "160000") {
        submoduleEntriesFiltered = true;
        continue;
      }

      // Check filesystem symlink
      const fullPath = path.join(project.canonicalRoot, file);
      try {
        if (fs.existsSync(fullPath) && fs.lstatSync(fullPath).isSymbolicLink()) {
          symlinkEntriesFiltered = true;
          continue;
        }
      } catch {
        // ignore
      }

      safeFiles.push(file);
    }

    if (safeFiles.length === 0) {
      return {
        projectId: params.projectId,
        scope,
        files: [],
        diff: "",
        sensitiveEntriesFiltered,
        symlinkEntriesFiltered,
        submoduleEntriesFiltered,
      };
    }

    const diffArgs = [...baseDiffArgs, "--", ...safeFiles];
    const diffResult = await this.processRunner.exec({
      cwd: project.canonicalRoot,
      args: diffArgs,
      maxBufferBytes: MAX_GIT_DIFF_BYTES,
      isDiff: true,
    });

    const sanitizedDiff = sanitizeDiffOutput(diffResult.stdout, project.canonicalRoot);

    this.logger?.info(
      {
        event: "git_diff",
        projectId: params.projectId,
        scope,
        filesCount: safeFiles.length,
        sensitiveFiltered: sensitiveEntriesFiltered,
        symlinksFiltered: symlinkEntriesFiltered,
        submodulesFiltered: submoduleEntriesFiltered,
        diffBytes: Buffer.byteLength(sanitizedDiff, "utf-8"),
      },
      `Git diff inspected for project "${params.projectId}"`
    );

    return {
      projectId: params.projectId,
      scope,
      files: safeFiles,
      diff: sanitizedDiff,
      sensitiveEntriesFiltered,
      symlinkEntriesFiltered,
      submoduleEntriesFiltered,
    };
  }

  /**
   * git.log: retrieve recent commit history.
   */
  async getLog(params: GitLogParams): Promise<GitLogResult> {
    const project = this.getAuthorizedProject(params.projectId);
    await validateRepository(this.processRunner, project.canonicalRoot);

    const limit = Math.min(Math.max(params.limit ?? 20, 1), 100);
    const args = ["log", "-n", String(limit), "-z", "--format=%H%x00%h%x00%an%x00%at%x00%s"];

    let scopedPath: string | undefined;
    if (params.path !== undefined && params.path.trim().length > 0) {
      const resolved = resolveProjectPath(project.canonicalRoot, params.path, {
        allowSensitive: true,
        mustExist: false,
      });
      if (isSensitiveFile(resolved.relativePath)) {
        throw new LocalBridgeError(
          LocalBridgeErrorCode.GIT_SENSITIVE_PATH_BLOCKED,
          `Log on sensitive file "${resolved.relativePath}" is blocked`
        );
      }
      scopedPath = resolved.relativePath;
      args.push("--", scopedPath);
    }

    try {
      const result = await this.processRunner.exec({
        cwd: project.canonicalRoot,
        args,
      });

      const commits = parseGitLog(result.stdout);

      this.logger?.info(
        {
          event: "git_log",
          projectId: params.projectId,
          commitsCount: commits.length,
          scopedPath,
        },
        `Git log inspected for project "${params.projectId}"`
      );

      return {
        projectId: params.projectId,
        commits,
      };
    } catch (err) {
      // If repo has no commits yet, git log fails with 128
      if (
        err instanceof LocalBridgeError &&
        (err.message.includes("does not have any commits yet") ||
          err.message.includes("unknown revision or path"))
      ) {
        return {
          projectId: params.projectId,
          commits: [],
        };
      }
      throw err;
    }
  }
}
