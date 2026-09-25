import type { AgentTaskCancelParams, AgentTaskCancelResult } from "@localbridge/protocol";
import type { AgentTaskManager } from "../../agent-task/agent-task-manager.js";

export function createAgentTaskCancelHandler(agentTaskManager: AgentTaskManager) {
  return async (params: AgentTaskCancelParams): Promise<AgentTaskCancelResult> => {
    return agentTaskManager.cancel(params);
  };
}
