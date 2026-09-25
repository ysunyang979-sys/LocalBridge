import type { AgentTaskStatusParams, AgentTaskStatusResult } from "@localbridge/protocol";
import type { AgentTaskManager } from "../../agent-task/agent-task-manager.js";

export function createAgentTaskStatusHandler(agentTaskManager: AgentTaskManager) {
  return async (params: AgentTaskStatusParams): Promise<AgentTaskStatusResult> => {
    return agentTaskManager.status(params);
  };
}
