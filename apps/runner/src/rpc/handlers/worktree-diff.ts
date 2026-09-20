import type { WorktreeDiffParams, WorktreeDiffResult } from "@localbridge/protocol";
import type { ManagedWorktreeService } from "../../worktree/index.js";

export function createWorktreeDiffHandler(worktreeService: ManagedWorktreeService) {
  return async (params: WorktreeDiffParams): Promise<WorktreeDiffResult> => {
    return worktreeService.diff(params);
  };
}
