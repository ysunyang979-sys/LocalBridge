import type {
  ProjectDisableParams,
  ProjectDisableResult,
} from "@localbridge/protocol";
import type { ProjectRegistry } from "../../projects/index.js";
import type { LspManager } from "../../lsp/manager.js";

export function createProjectDisableHandler(registry: ProjectRegistry, lspManager?: LspManager) {
  return async (params: ProjectDisableParams): Promise<ProjectDisableResult> => {
    if (lspManager) {
      await lspManager.stopProject(params.projectId).catch(() => {});
    }
    registry.disable(params.projectId);
    return {
      id: params.projectId,
      disabled: true,
      cancelledJobsCount: 0,
    };
  };
}
