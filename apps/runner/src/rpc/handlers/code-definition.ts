import type {
  CodeDefinitionParams,
  DefinitionResult,
} from "@localbridge/protocol";
import type { LspManager } from "../../lsp/manager.js";

export function createCodeDefinitionHandler(lspManager: LspManager) {
  return async (params: CodeDefinitionParams): Promise<DefinitionResult> => {
    return lspManager.getDefinition(
      params.projectId,
      params.path,
      params.line,
      params.character,
      params.sessionId
    );
  };
}
