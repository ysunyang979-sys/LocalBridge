import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { EventEmitter } from "node:events";
import {
  LocalBridgeError,
  LocalBridgeErrorCode,
  type ProjectListItem,
  type ProjectInfoResult,
  type ProjectValidateResult,
} from "@localbridge/protocol";
import { resolveProjectPath, isSensitiveFile } from "@localbridge/security";
import type { Logger } from "@localbridge/shared";
import type { RunnerProjectRecord, ProjectStateFile } from "./types.js";
import { loadProjectsState, saveProjectsState } from "./storage.js";

function normalizeCanonicalPath(p: string): string {
  let resolved: string;
  try {
    resolved = fs.realpathSync.native ? fs.realpathSync.native(p) : fs.realpathSync(p);
  } catch {
    resolved = fs.realpathSync(p);
  }
  if (process.platform === "win32" && resolved.startsWith("\\\\?\\")) {
    resolved = resolved.slice(4);
  }
  return path.normalize(resolved);
}

function getComparisonKey(p: string): string {
  return process.platform === "win32" ? p.toLowerCase() : p;
}

export class ProjectRegistry extends EventEmitter {
  private readonly projects = new Map<string, RunnerProjectRecord>();

  constructor(
    private readonly storagePath: string,
    private readonly logger?: Logger
  ) {
    super();
    this.reload();
  }

  /**
   * Reload projects from persistent storage
   */
  reload(): void {
    this.projects.clear();
    const state: ProjectStateFile = loadProjectsState(this.storagePath);
    for (const p of state.projects) {
      this.projects.set(p.id, {
        ...p,
        accessMode: p.accessMode ?? "read-only",
        executionMode: p.executionMode ?? "disabled",
      });
    }
    this.logger?.debug(
      { count: this.projects.size, storagePath: this.storagePath },
      "Loaded authorized projects from disk"
    );
  }

  private save(): void {
    const state: ProjectStateFile = {
      version: 1,
      projects: Array.from(this.projects.values()),
    };
    saveProjectsState(this.storagePath, state);
  }

  /**
   * Authorize a new local directory.
   * Only runnable by local machine user via CLI.
   */
  add(projectPath: string, options?: { name?: string; accessMode?: "read-only" | "read-write" }): RunnerProjectRecord {
    const resolvedInput = path.resolve(projectPath);

    // 1. Must exist on disk
    if (!fs.existsSync(resolvedInput)) {
      throw new LocalBridgeError(
        LocalBridgeErrorCode.PROJECT_ROOT_NOT_FOUND,
        `Project directory does not exist: "${resolvedInput}"`
      );
    }

    // 2. Must be a directory
    const stat = fs.statSync(resolvedInput);
    if (!stat.isDirectory()) {
      throw new LocalBridgeError(
        LocalBridgeErrorCode.PROJECT_ROOT_NOT_DIRECTORY,
        `Project path is not a directory: "${resolvedInput}"`
      );
    }

    // 3. Resolve physical canonical root
    const canonicalRoot = normalizeCanonicalPath(resolvedInput);

    // 4. Duplicate root detection (Section 34)
    const newKey = getComparisonKey(canonicalRoot);
    for (const existing of this.projects.values()) {
      if (getComparisonKey(existing.canonicalRoot) === newKey) {
        throw new LocalBridgeError(
          LocalBridgeErrorCode.PROJECT_ALREADY_EXISTS,
          `A project with physical root "${canonicalRoot}" is already authorized (ID: ${existing.id})`
        );
      }
    }

    // 5. Generate stable project ID: proj_<UUIDv4>
    const id = `proj_${crypto.randomUUID()}`;
    const name = options?.name?.trim() || path.basename(canonicalRoot) || "Unnamed Project";

    const record: RunnerProjectRecord = {
      id,
      name,
      root: resolvedInput,
      canonicalRoot,
      enabled: true,
      accessMode: options?.accessMode ?? "read-only",
      executionMode: "disabled",
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    this.projects.set(id, record);
    this.save();

    this.logger?.info(
      { event: "project_authorized", projectId: id, name },
      `Authorized project "${name}" (${id})`
    );

    return record;
  }

  /**
   * Remove an authorized project.
   */
  remove(projectId: string): boolean {
    const existing = this.projects.get(projectId);
    if (!existing) {
      return false;
    }

    this.projects.delete(projectId);
    this.save();

    this.logger?.info(
      { event: "project_removed", projectId },
      `Removed authorized project "${existing.name}" (${projectId})`
    );

    this.emit("project:removed", projectId);
    return true;
  }

  /**
   * Enable an authorized project.
   */
  enable(projectId: string): boolean {
    const project = this.projects.get(projectId);
    if (!project) return false;

    project.enabled = true;
    project.updatedAt = Date.now();
    this.save();
    this.emit("project:enabled", projectId);
    return true;
  }

  /**
   * Disable an authorized project.
   */
  disable(projectId: string): boolean {
    const project = this.projects.get(projectId);
    if (!project) return false;

    project.enabled = false;
    project.updatedAt = Date.now();
    this.save();
    this.emit("project:disabled", projectId);
    return true;
  }

  /**
   * Set project access mode ("read-only" or "read-write").
   * Only callable by local machine user via CLI.
   */
  setAccessMode(
    projectId: string,
    accessMode: "read-only" | "read-write"
  ): RunnerProjectRecord {
    const project = this.projects.get(projectId);
    if (!project) {
      throw new LocalBridgeError(
        LocalBridgeErrorCode.PROJECT_NOT_FOUND,
        `Project "${projectId}" not found`
      );
    }

    if (accessMode !== "read-only" && accessMode !== "read-write") {
      throw new LocalBridgeError(
        LocalBridgeErrorCode.INVALID_REQUEST,
        `Invalid access mode: "${accessMode}". Must be "read-only" or "read-write"`
      );
    }

    project.accessMode = accessMode;
    let downgradedExecution = false;
    // Security coupling: if accessMode is downgraded to read-only, project-code execution must be disabled
    if (accessMode === "read-only" && project.executionMode === "project-code") {
      project.executionMode = "disabled";
      downgradedExecution = true;
      this.logger?.warn(
        { event: "project_execution_mode_downgraded", projectId },
        `Downgraded executionMode to "disabled" because accessMode was set to "read-only"`
      );
    }
    project.updatedAt = Date.now();
    this.save();

    this.logger?.info(
      { event: "project_access_mode_changed", projectId, accessMode },
      `Set access mode for project "${project.name}" (${projectId}) to "${accessMode}"`
    );

    this.emit("project:access_mode_changed", projectId, accessMode);
    if (downgradedExecution) {
      this.emit("project:execution_mode_changed", projectId, "disabled");
    }

    return project;
  }

  /**
   * Set project execution mode ("disabled", "safe-only", or "project-code").
   * Only callable by local machine user via CLI.
   */
  setExecutionMode(
    projectId: string,
    executionMode: "disabled" | "safe-only" | "project-code"
  ): RunnerProjectRecord {
    const project = this.projects.get(projectId);
    if (!project) {
      throw new LocalBridgeError(
        LocalBridgeErrorCode.PROJECT_NOT_FOUND,
        `Project "${projectId}" not found`
      );
    }

    if (
      executionMode !== "disabled" &&
      executionMode !== "safe-only" &&
      executionMode !== "project-code"
    ) {
      throw new LocalBridgeError(
        LocalBridgeErrorCode.INVALID_REQUEST,
        `Invalid execution mode: "${executionMode}". Must be "disabled", "safe-only", or "project-code"`
      );
    }

    // Safety rule: project-code strictly requires read-write access
    if (executionMode === "project-code" && project.accessMode !== "read-write") {
      throw new LocalBridgeError(
        LocalBridgeErrorCode.PROJECT_EXECUTION_REQUIRES_WRITE_ACCESS,
        `Enabling executionMode "project-code" requires project accessMode to be "read-write"`
      );
    }

    project.executionMode = executionMode;
    project.updatedAt = Date.now();
    this.save();

    this.logger?.info(
      { event: "project_execution_mode_changed", projectId, executionMode },
      `Set execution mode for project "${project.name}" (${projectId}) to "${executionMode}"`
    );

    this.emit("project:execution_mode_changed", projectId, executionMode);
    return project;
  }

  /**
   * Get internal project record (Runner-private, contains physical root).
   */
  get(projectId: string): RunnerProjectRecord | undefined {
    return this.projects.get(projectId);
  }

  /**
   * Get all internal project records.
   */
  list(): RunnerProjectRecord[] {
    return Array.from(this.projects.values());
  }

  /**
   * List public project metadata for remote RPC (strictly no physical paths).
   */
  listPublic(): ProjectListItem[] {
    return Array.from(this.projects.values()).map((p) => ({
      id: p.id,
      name: p.name,
      enabled: p.enabled,
      accessMode: p.accessMode ?? "read-only",
      executionMode: p.executionMode ?? "disabled",
    }));
  }

  /**
   * Get public project info for remote RPC (strictly no physical paths).
   */
  infoPublic(projectId: string): ProjectInfoResult {
    const project = this.projects.get(projectId);
    if (!project) {
      throw new LocalBridgeError(
        LocalBridgeErrorCode.PROJECT_NOT_FOUND,
        `Project "${projectId}" not found`
      );
    }

    const healthy =
      fs.existsSync(project.canonicalRoot) &&
      fs.statSync(project.canonicalRoot).isDirectory();

    return {
      id: project.id,
      name: project.name,
      enabled: project.enabled,
      healthy,
      accessMode: project.accessMode ?? "read-only",
      executionMode: project.executionMode ?? "disabled",
    };
  }

  /**
   * Validate project health, authorization state, and optionally a relative target path.
   */
  validate(projectId: string, targetPath?: string): ProjectValidateResult {
    const project = this.projects.get(projectId);
    if (!project) {
      throw new LocalBridgeError(
        LocalBridgeErrorCode.PROJECT_NOT_FOUND,
        `Project "${projectId}" not found`
      );
    }

    if (!project.enabled) {
      throw new LocalBridgeError(
        LocalBridgeErrorCode.PROJECT_DISABLED,
        `Project "${projectId}" is currently disabled`
      );
    }

    if (!fs.existsSync(project.canonicalRoot)) {
      throw new LocalBridgeError(
        LocalBridgeErrorCode.PROJECT_ROOT_NOT_FOUND,
        `Project "${projectId}" root directory no longer exists on disk`
      );
    }

    const stat = fs.statSync(project.canonicalRoot);
    if (!stat.isDirectory()) {
      throw new LocalBridgeError(
        LocalBridgeErrorCode.PROJECT_ROOT_NOT_DIRECTORY,
        `Project "${projectId}" root is no longer a directory`
      );
    }

    if (targetPath !== undefined && targetPath !== "") {
      if (isSensitiveFile(targetPath)) {
        return {
          valid: false,
          isSensitive: true,
          reason: "File matches sensitive credential file pattern",
        };
      }

      try {
        resolveProjectPath(project.canonicalRoot, targetPath, { mustExist: false });
      } catch (err: unknown) {
        return {
          valid: false,
          reason: err instanceof Error ? err.message : String(err),
        };
      }
    }

    return { valid: true };
  }
}
