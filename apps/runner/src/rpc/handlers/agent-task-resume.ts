import type { AgentTaskResumeParams, AgentTaskResumeResult } from "@localbridge/protocol";
import type { AgentTaskManager } from "../../agent-task/agent-task-manager.js";

export function createAgentTaskResumeHandler(agentTaskManager: AgentTaskManager) {
  return async (params: AgentTaskResumeParams): Promise<AgentTaskResumeResult> => {
    return agentTaskManager.resume(params);
  };
}
