import type {
  CodeDocumentSymbolsParams,
  DocumentSymbolsResult,
} from "@localbridge/protocol";
import type { LspManager } from "../../lsp/manager.js";

export function createCodeDocumentSymbolsHandler(lspManager: LspManager) {
  return async (params: CodeDocumentSymbolsParams): Promise<DocumentSymbolsResult> => {
    return lspManager.getDocumentSymbols(params.projectId, params.path, params.sessionId);
  };
}
