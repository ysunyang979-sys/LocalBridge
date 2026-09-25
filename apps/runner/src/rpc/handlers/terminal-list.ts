import type { TerminalListParams, TerminalListResult } from "@localbridge/protocol";
import type { TerminalManager } from "../../terminal/terminal-manager.js";

export function createTerminalListHandler(terminalManager: TerminalManager) {
  return async (params: TerminalListParams): Promise<TerminalListResult> => {
    return terminalManager.list(params);
  };
}
