import type { JobStartParams, JobStartResult } from "@localbridge/protocol";
import type { JobManager } from "../../jobs/index.js";

export function createJobStartHandler(jobManager: JobManager) {
  return async (params: JobStartParams): Promise<JobStartResult> => {
    return jobManager.startJob(params);
  };
}
