import type { AgentTaskListParams, AgentTaskListResult } from "@localbridge/protocol";
import type { AgentTaskManager } from "../../agent-task/agent-task-manager.js";

export function createAgentTaskListHandler(agentTaskManager: AgentTaskManager) {
  return async (params: AgentTaskListParams): Promise<AgentTaskListResult> => {
    return agentTaskManager.list(params);
  };
}
