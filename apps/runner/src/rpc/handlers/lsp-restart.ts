import type {
  LspRestartParams,
  LspRestartResult,
} from "@localbridge/protocol";
import type { LspManager } from "../../lsp/manager.js";

export function createLspRestartHandler(lspManager: LspManager) {
  return async (params: LspRestartParams): Promise<LspRestartResult> => {
    const status = await lspManager.restartServer(params.projectId, params.sessionId);
    return {
      projectId: params.projectId,
      restarted: true,
      status,
    };
  };
}
