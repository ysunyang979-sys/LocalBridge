import type { AgentTaskCreateParams, AgentTaskCreateResult } from "@localbridge/protocol";
import type { AgentTaskManager } from "../../agent-task/agent-task-manager.js";

export function createAgentTaskCreateHandler(agentTaskManager: AgentTaskManager) {
  return async (params: AgentTaskCreateParams): Promise<AgentTaskCreateResult> => {
    return agentTaskManager.create(params);
  };
}
