import type { TerminalResizeParams, TerminalResizeResult } from "@localbridge/protocol";
import type { TerminalManager } from "../../terminal/terminal-manager.js";

export function createTerminalResizeHandler(terminalManager: TerminalManager) {
  return async (params: TerminalResizeParams): Promise<TerminalResizeResult> => {
    return terminalManager.resize(params);
  };
}
