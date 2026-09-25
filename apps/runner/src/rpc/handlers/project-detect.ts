import type { ProjectDetectParams, ProjectDetectResult } from "@localbridge/protocol";
import type { ProjectDetectionService } from "../../process/project-detector.js";

export function createProjectDetectHandler(projectDetectionService: ProjectDetectionService) {
  return async (params: ProjectDetectParams): Promise<ProjectDetectResult> => {
    return projectDetectionService.detect(params);
  };
}
