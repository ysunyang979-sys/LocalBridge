import type { JobCancelAllParams, JobCancelAllResult } from "@localbridge/protocol";
import type { JobManager } from "../../jobs/manager.js";

export function createJobCancelAllHandler(
  jobManager: JobManager
): (params: JobCancelAllParams) => Promise<JobCancelAllResult> {
  return async (params: JobCancelAllParams): Promise<JobCancelAllResult> => {
    return jobManager.cancelAllJobs(params?.reason);
  };
}
