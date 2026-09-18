import type { CommandClassifyParams, CommandClassifyResult } from "@localbridge/protocol";
import type { CommandExecutionService } from "../../process/index.js";

export function createCommandClassifyHandler(commandService: CommandExecutionService) {
  return async (params: CommandClassifyParams): Promise<CommandClassifyResult> => {
    return commandService.classify(params);
  };
}
