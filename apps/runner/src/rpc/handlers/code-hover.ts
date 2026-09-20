import type {
  CodeHoverParams,
  HoverResult,
} from "@localbridge/protocol";
import type { LspManager } from "../../lsp/manager.js";

export function createCodeHoverHandler(lspManager: LspManager) {
  return async (params: CodeHoverParams): Promise<HoverResult> => {
    return lspManager.getHover(params.projectId, params.path, params.line, params.character);
  };
}
