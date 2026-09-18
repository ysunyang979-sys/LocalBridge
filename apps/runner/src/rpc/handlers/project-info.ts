import type { ProjectInfoParams, ProjectInfoResult } from "@localbridge/protocol";
import type { ProjectRegistry } from "../../projects/index.js";

export function createProjectInfoHandler(registry: ProjectRegistry) {
  return async (params: ProjectInfoParams): Promise<ProjectInfoResult> => {
    return registry.infoPublic(params.projectId);
  };
}
