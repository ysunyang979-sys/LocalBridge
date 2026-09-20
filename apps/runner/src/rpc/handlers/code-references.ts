import type {
  CodeReferencesParams,
  ReferencesResult,
} from "@localbridge/protocol";
import type { LspManager } from "../../lsp/manager.js";

export function createCodeReferencesHandler(lspManager: LspManager) {
  return async (params: CodeReferencesParams): Promise<ReferencesResult> => {
    return lspManager.getReferences(
      params.projectId,
      params.path,
      params.line,
      params.character,
      params.includeDeclaration,
      params.limit,
      params.sessionId
    );
  };
}
