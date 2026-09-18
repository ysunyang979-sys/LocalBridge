import type { JobListParams, JobListResult } from "@localbridge/protocol";
import type { JobManager } from "../../jobs/index.js";

export function createJobListHandler(jobManager: JobManager) {
  return async (params: JobListParams): Promise<JobListResult> => {
    return jobManager.listJobs(params);
  };
}
