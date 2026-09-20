import type {
  CodeDiagnosticsParams,
  DiagnosticsResult,
} from "@localbridge/protocol";
import type { LspManager } from "../../lsp/manager.js";

export function createCodeDiagnosticsHandler(lspManager: LspManager) {
  return async (params: CodeDiagnosticsParams): Promise<DiagnosticsResult> => {
    return lspManager.getDiagnostics(params.projectId, params.path, params.limit);
  };
}
