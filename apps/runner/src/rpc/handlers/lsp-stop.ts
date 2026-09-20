import type {
  LspStopParams,
  LspStopResult,
} from "@localbridge/protocol";
import type { LspManager } from "../../lsp/manager.js";

export function createLspStopHandler(lspManager: LspManager) {
  return async (params: LspStopParams): Promise<LspStopResult> => {
    const stopped = await lspManager.stopProject(params.projectId);
    return {
      projectId: params.projectId,
      stopped,
    };
  };
}
