import type { AgentTaskPauseParams, AgentTaskPauseResult } from "@localbridge/protocol";
import type { AgentTaskManager } from "../../agent-task/agent-task-manager.js";

export function createAgentTaskPauseHandler(agentTaskManager: AgentTaskManager) {
  return async (params: AgentTaskPauseParams): Promise<AgentTaskPauseResult> => {
    return agentTaskManager.pause(params);
  };
}
