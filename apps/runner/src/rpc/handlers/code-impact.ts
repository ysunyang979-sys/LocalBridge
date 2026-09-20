import type {
  CodeImpactParams,
  CodeImpactResult,
} from "@localbridge/protocol";
import type { LspManager } from "../../lsp/manager.js";

export function createCodeImpactHandler(lspManager: LspManager) {
  return async (params: CodeImpactParams): Promise<CodeImpactResult> => {
    return lspManager.getCodeImpact(
      params.projectId,
      params.path,
      params.line,
      params.character,
      params.sessionId
    );
  };
}
