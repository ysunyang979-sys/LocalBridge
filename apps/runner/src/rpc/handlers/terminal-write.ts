import type { TerminalWriteParams, TerminalWriteResult } from "@localbridge/protocol";
import type { TerminalManager } from "../../terminal/terminal-manager.js";

export function createTerminalWriteHandler(terminalManager: TerminalManager) {
  return async (params: TerminalWriteParams): Promise<TerminalWriteResult> => {
    return terminalManager.write(params);
  };
}
