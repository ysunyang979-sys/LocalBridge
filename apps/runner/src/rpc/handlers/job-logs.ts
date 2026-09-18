import type { JobLogsParams, JobLogsResult } from "@localbridge/protocol";
import type { JobManager } from "../../jobs/index.js";

export function createJobLogsHandler(jobManager: JobManager) {
  return async (params: JobLogsParams): Promise<JobLogsResult> => {
    return jobManager.getJobLogs(params);
  };
}
