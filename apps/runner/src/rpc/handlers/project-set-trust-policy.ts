import type {
  ProjectSetTrustPolicyParams,
  ProjectSetTrustPolicyResult,
} from "@localbridge/protocol";
import type { ProjectRegistry } from "../../projects/index.js";

export function createProjectSetTrustPolicyHandler(registry: ProjectRegistry) {
  return async (
    params: ProjectSetTrustPolicyParams
  ): Promise<ProjectSetTrustPolicyResult> => {
    return registry.setTrustPolicy(params.projectId, params);
  };
}
