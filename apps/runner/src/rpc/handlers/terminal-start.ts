import type { TerminalStartParams, TerminalStartResult } from "@localbridge/protocol";
import type { TerminalManager } from "../../terminal/terminal-manager.js";

export function createTerminalStartHandler(terminalManager: TerminalManager) {
  return async (params: TerminalStartParams): Promise<TerminalStartResult> => {
    return terminalManager.start(params);
  };
}
