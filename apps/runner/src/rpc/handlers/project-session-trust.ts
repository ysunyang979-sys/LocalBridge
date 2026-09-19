import type {
  ProjectSessionTrustParams,
  ProjectSessionTrustResult,
} from "@localbridge/protocol";
import type { ProjectRegistry } from "../../projects/index.js";

export function createProjectSessionTrustHandler(registry: ProjectRegistry) {
  return async (
    params: ProjectSessionTrustParams
  ): Promise<ProjectSessionTrustResult> => {
    if (params.action === "grant") {
      registry.grantSessionTrust(params.projectId, params.operations);
      return {
        projectId: params.projectId,
        active: true,
        operations: registry.getSessionTrustOperations(params.projectId),
      };
    } else {
      registry.revokeSessionTrust(params.projectId);
      return {
        projectId: params.projectId,
        active: false,
        operations: [],
      };
    }
  };
}
