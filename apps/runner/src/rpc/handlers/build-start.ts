import type { BuildStartParams, BuildStartResult } from "@localbridge/protocol";
import type { JobManager } from "../../jobs/index.js";

export function createBuildStartHandler(jobManager: JobManager) {
  return async (params: BuildStartParams): Promise<BuildStartResult> => {
    return jobManager.startBuild(params);
  };
}
