import type { ProjectValidateParams, ProjectValidateResult } from "@localbridge/protocol";
import type { ProjectRegistry } from "../../projects/index.js";

export function createProjectValidateHandler(registry: ProjectRegistry) {
  return async (params: ProjectValidateParams): Promise<ProjectValidateResult> => {
    return registry.validate(params.projectId, params.path);
  };
}
