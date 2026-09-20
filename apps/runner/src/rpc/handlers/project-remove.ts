import type {
  ProjectRemoveParams,
  ProjectRemoveResult,
} from "@localbridge/protocol";
import type { ProjectRegistry } from "../../projects/index.js";
import type { LspManager } from "../../lsp/manager.js";

export function createProjectRemoveHandler(registry: ProjectRegistry, lspManager?: LspManager) {
  return async (params: ProjectRemoveParams): Promise<ProjectRemoveResult> => {
    if (lspManager) {
      await lspManager.stopProject(params.projectId).catch(() => {});
    }
    const removed = registry.remove(params.projectId);
    return {
      id: params.projectId,
      removed,
      cancelledJobsCount: 0,
    };
  };
}
