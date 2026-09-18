import type { CommandRunParams, CommandRunResult } from "@localbridge/protocol";
import type { CommandExecutionService } from "../../process/index.js";

export function createCommandRunHandler(commandService: CommandExecutionService) {
  return async (params: CommandRunParams): Promise<CommandRunResult> => {
    return commandService.run(params);
  };
}
