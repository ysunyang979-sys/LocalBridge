import type {
  ProjectEnableParams,
  ProjectEnableResult,
} from "@localbridge/protocol";
import type { ProjectRegistry } from "../../projects/index.js";

export function createProjectEnableHandler(registry: ProjectRegistry) {
  return async (params: ProjectEnableParams): Promise<ProjectEnableResult> => {
    registry.enable(params.projectId);
    return {
      id: params.projectId,
      enabled: true,
    };
  };
}
