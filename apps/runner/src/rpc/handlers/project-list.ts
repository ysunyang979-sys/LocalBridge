import type { ProjectListResult } from "@localbridge/protocol";
import type { ProjectRegistry } from "../../projects/index.js";

export function createProjectListHandler(registry: ProjectRegistry) {
  return async (): Promise<ProjectListResult> => {
    return registry.listPublic();
  };
}
