import type {
  CodeWorkspaceSymbolsParams,
  WorkspaceSymbolsResult,
} from "@localbridge/protocol";
import type { LspManager } from "../../lsp/manager.js";

export function createCodeWorkspaceSymbolsHandler(lspManager: LspManager) {
  return async (params: CodeWorkspaceSymbolsParams): Promise<WorkspaceSymbolsResult> => {
    return lspManager.getWorkspaceSymbols(params.projectId, params.query, params.limit);
  };
}
