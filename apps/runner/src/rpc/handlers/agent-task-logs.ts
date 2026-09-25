import type { AgentTaskLogsParams, AgentTaskLogsResult } from "@localbridge/protocol";
import type { AgentTaskManager } from "../../agent-task/agent-task-manager.js";

export function createAgentTaskLogsHandler(agentTaskManager: AgentTaskManager) {
  return async (params: AgentTaskLogsParams): Promise<AgentTaskLogsResult> => {
    return agentTaskManager.logs(params);
  };
}
