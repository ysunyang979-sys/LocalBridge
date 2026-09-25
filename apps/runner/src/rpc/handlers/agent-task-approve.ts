import type { AgentTaskApproveParams, AgentTaskApproveResult } from "@localbridge/protocol";
import type { AgentTaskManager } from "../../agent-task/agent-task-manager.js";

export function createAgentTaskApproveHandler(agentTaskManager: AgentTaskManager) {
  return async (params: AgentTaskApproveParams): Promise<AgentTaskApproveResult> => {
    return agentTaskManager.approve(params);
  };
}
