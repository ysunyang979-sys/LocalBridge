import {
  LocalBridgeError,
  LocalBridgeErrorCode,
  type DirectoryListParams,
  type DirectoryListResult,
  type FileStatParams,
  type FileStatResult,
  type FileReadParams,
  type FileReadResult,
} from "@localbridge/protocol";
import type { Logger } from "@localbridge/shared";
import type { ProjectRegistry } from "../projects/index.js";
import { listDirectory } from "./directory.js";
import { statFile } from "./file-stat.js";
import { readTextFile } from "./file-read.js";

/**
 * Runner Filesystem Service.
 * Exposes strictly read-only filesystem operations within authorized project boundaries.
 * Guarantees that physical paths never leave the Runner.
 */
export class FilesystemService {
  constructor(
    private readonly projectRegistry: ProjectRegistry,
    private readonly logger?: Logger
  ) {}

  /**
   * Resolve authorized and enabled project by ID.
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
        `Project "${projectId}" is currently disabled`
      );
    }

    return project;
  }

  /**
   * List single-level directory contents (non-recursive).
   */
  async listDirectory(params: DirectoryListParams): Promise<DirectoryListResult> {
    const project = this.getAuthorizedProject(params.projectId);

    this.logger?.debug(
      {
        event: "fs_list_directory",
        projectId: params.projectId,
        path: params.path,
      },
      `Listing directory "${params.path ?? "."}" in project "${params.projectId}"`
    );

    return listDirectory({
      projectId: project.id,
      canonicalRoot: project.canonicalRoot,
      projectRelativePath: params.path,
      limit: params.limit,
      cursor: params.cursor,
    });
  }

  /**
   * Inspect file or directory metadata.
   */
  async stat(params: FileStatParams): Promise<FileStatResult> {
    const project = this.getAuthorizedProject(params.projectId);

    this.logger?.debug(
      {
        event: "fs_stat",
        projectId: params.projectId,
        path: params.path,
      },
      `Inspecting metadata for "${params.path}" in project "${params.projectId}"`
    );

    return statFile({
      projectId: project.id,
      canonicalRoot: project.canonicalRoot,
      projectRelativePath: params.path,
    });
  }

  /**
   * Read UTF-8 text file lines.
   */
  async readText(params: FileReadParams): Promise<FileReadResult> {
    const project = this.getAuthorizedProject(params.projectId);

    this.logger?.debug(
      {
        event: "fs_read_text",
        projectId: params.projectId,
        path: params.path,
        startLine: params.startLine,
        maxLines: params.maxLines,
      },
      `Reading text lines from "${params.path}" in project "${params.projectId}"`
    );

    return readTextFile({
      projectId: project.id,
      canonicalRoot: project.canonicalRoot,
      projectRelativePath: params.path,
      startLine: params.startLine,
      maxLines: params.maxLines,
    });
  }
}
