import type { TerminalStatusParams, TerminalStatusResult } from "@localbridge/protocol";
import type { TerminalManager } from "../../terminal/terminal-manager.js";

export function createTerminalStatusHandler(terminalManager: TerminalManager) {
  return async (params: TerminalStatusParams): Promise<TerminalStatusResult> => {
    return terminalManager.status(params);
  };
}
