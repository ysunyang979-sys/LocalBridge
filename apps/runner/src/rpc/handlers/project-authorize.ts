import type {
  ProjectAuthorizeParams,
  ProjectAuthorizeResult,
} from "@localbridge/protocol";
import type { ProjectRegistry } from "../../projects/index.js";

export function createProjectAuthorizeHandler(registry: ProjectRegistry) {
  return async (params: ProjectAuthorizeParams): Promise<ProjectAuthorizeResult> => {
    const record = registry.add(params.path, {
      name: params.name,
      accessMode: params.accessMode,
    });
    return {
      id: record.id,
      name: record.name,
      root: record.root,
      enabled: record.enabled,
      accessMode: record.accessMode ?? "read-only",
      executionMode: record.executionMode ?? "disabled",
    };
  };
}
