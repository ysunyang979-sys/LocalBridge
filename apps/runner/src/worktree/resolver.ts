import {
  LocalBridgeError,
  LocalBridgeErrorCode,
  type ResolvedWorkspace,
} from "@localbridge/protocol";
import type { Logger } from "@localbridge/shared";
import type { ProjectRegistry } from "../projects/index.js";
import type { ManagedWorktreeService } from "./service.js";

export class WorkspaceResolver {
  constructor(
    private readonly projectRegistry: ProjectRegistry,
    private readonly worktreeService: ManagedWorktreeService,
    private readonly logger?: Logger
  ) {}

  /**
   * Resolves the effective development workspace root for a given project and optional session.
   * If the project has an active session bound to a managed worktree, returns the worktreeRoot.
   * Otherwise returns the project's canonical root.
   */
  resolve(projectId: string, sessionId?: string): ResolvedWorkspace {
    if (sessionId) {
      const worktree = this.worktreeService.getActiveWorktree(projectId, sessionId);
      if (worktree && worktree.state === "ready") {
        this.logger?.debug(
          { projectId, sessionId, worktreeId: worktree.id, worktreePath: worktree.worktreePath },
          "Resolved workspace to managed worktree"
        );
        return {
          workspaceRoot: worktree.worktreePath,
          workspaceMode: "managed-worktree",
          worktreeId: worktree.id,
          branchName: worktree.branchName,
        };
      }
    }

    const project = this.projectRegistry.get(projectId);
    if (!project) {
      throw new LocalBridgeError(
        LocalBridgeErrorCode.PROJECT_NOT_FOUND,
        `Project "${projectId}" not found in project registry`
      );
    }

    return {
      workspaceRoot: project.canonicalRoot,
      workspaceMode: "direct",
    };
  }

  getWorktreeService(): ManagedWorktreeService {
    return this.worktreeService;
  }
}
