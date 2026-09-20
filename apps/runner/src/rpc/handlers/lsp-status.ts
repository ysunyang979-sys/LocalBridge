import type {
  LspStatusParams,
  LspStatusResult,
} from "@localbridge/protocol";
import type { LspManager } from "../../lsp/manager.js";

export function createLspStatusHandler(lspManager: LspManager) {
  return async (params: LspStatusParams): Promise<LspStatusResult> => {
    const servers = lspManager.getStatus(params?.projectId);
    return { servers };
  };
}
