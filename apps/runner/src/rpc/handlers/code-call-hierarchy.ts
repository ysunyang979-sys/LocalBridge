import type {
  CodeCallHierarchyParams,
  CallHierarchyResult,
} from "@localbridge/protocol";
import type { LspManager } from "../../lsp/manager.js";

export function createCodeCallHierarchyHandler(lspManager: LspManager) {
  return async (params: CodeCallHierarchyParams): Promise<CallHierarchyResult> => {
    return lspManager.getCallHierarchy(
      params.projectId,
      params.path,
      params.line,
      params.character,
      params.direction,
      params.depth,
      params.sessionId
    );
  };
}
