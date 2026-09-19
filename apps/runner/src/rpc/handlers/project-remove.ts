import type {
  ProjectRemoveParams,
  ProjectRemoveResult,
} from "@localbridge/protocol";
import type { ProjectRegistry } from "../../projects/index.js";

export function createProjectRemoveHandler(registry: ProjectRegistry) {
  return async (params: ProjectRemoveParams): Promise<ProjectRemoveResult> => {
    const removed = registry.remove(params.projectId);
    return {
      id: params.projectId,
      removed,
      cancelledJobsCount: 0,
    };
  };
}
