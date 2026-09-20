import type { WorktreeListParams, WorktreeListResult } from "@localbridge/protocol";
import type { ManagedWorktreeService } from "../../worktree/index.js";

export function createWorktreeListHandler(worktreeService: ManagedWorktreeService) {
  return async (params: WorktreeListParams): Promise<WorktreeListResult> => {
    return worktreeService.list(params);
  };
}
