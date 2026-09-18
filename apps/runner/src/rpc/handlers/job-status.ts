import type { JobStatusParams, JobStatusResult } from "@localbridge/protocol";
import type { JobManager } from "../../jobs/index.js";

export function createJobStatusHandler(jobManager: JobManager) {
  return async (params: JobStatusParams): Promise<JobStatusResult> => {
    return jobManager.getJobStatus(params.jobId);
  };
}
