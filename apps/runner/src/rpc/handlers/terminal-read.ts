import type { TerminalReadParams, TerminalReadResult } from "@localbridge/protocol";
import type { TerminalManager } from "../../terminal/terminal-manager.js";

export function createTerminalReadHandler(terminalManager: TerminalManager) {
  return async (params: TerminalReadParams): Promise<TerminalReadResult> => {
    return terminalManager.read(params);
  };
}
