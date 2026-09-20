import type { JobCancelParams, JobCancelResult } from "@localbridge/protocol";
import type { JobManager } from "../../jobs/index.js";

export function createJobCancelHandler(jobManager: JobManager) {
  return async (params: JobCancelParams): Promise<JobCancelResult> => {
    return jobManager.cancelJob(params.jobId, params.projectId);
  };
}
