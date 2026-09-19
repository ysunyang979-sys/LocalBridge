import type {
  ProjectSetExecutionParams,
  ProjectSetExecutionResult,
} from "@localbridge/protocol";
import type { ProjectRegistry } from "../../projects/index.js";

export function createProjectSetExecutionHandler(registry: ProjectRegistry) {
  return async (params: ProjectSetExecutionParams): Promise<ProjectSetExecutionResult> => {
    registry.setExecutionMode(params.projectId, params.executionMode);
    const updated = registry.get(params.projectId);
    return {
      id: params.projectId,
      name: updated?.name ?? params.projectId,
      executionMode: updated?.executionMode ?? params.executionMode,
      cancelledJobsCount: 0,
    };
  };
}
