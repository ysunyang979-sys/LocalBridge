import type { WorktreeStatusParams, WorktreeStatusResult } from "@localbridge/protocol";
import type { ManagedWorktreeService } from "../../worktree/index.js";

export function createWorktreeStatusHandler(worktreeService: ManagedWorktreeService) {
  return async (params: WorktreeStatusParams): Promise<WorktreeStatusResult> => {
    return worktreeService.status(params);
  };
}
