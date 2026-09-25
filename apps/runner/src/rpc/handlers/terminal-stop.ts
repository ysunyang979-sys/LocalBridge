import type { TerminalStopParams, TerminalStopResult } from "@localbridge/protocol";
import type { TerminalManager } from "../../terminal/terminal-manager.js";

export function createTerminalStopHandler(terminalManager: TerminalManager) {
  return async (params: TerminalStopParams): Promise<TerminalStopResult> => {
    return terminalManager.stop(params);
  };
}
