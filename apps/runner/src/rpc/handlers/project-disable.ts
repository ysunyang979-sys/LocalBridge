import type {
  ProjectDisableParams,
  ProjectDisableResult,
} from "@localbridge/protocol";
import type { ProjectRegistry } from "../../projects/index.js";

export function createProjectDisableHandler(registry: ProjectRegistry) {
  return async (params: ProjectDisableParams): Promise<ProjectDisableResult> => {
    registry.disable(params.projectId);
    return {
      id: params.projectId,
      disabled: true,
      cancelledJobsCount: 0,
    };
  };
}
