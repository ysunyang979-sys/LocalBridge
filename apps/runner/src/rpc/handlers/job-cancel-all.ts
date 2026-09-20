import type { JobCancelAllParams, JobCancelAllResult } from "@localbridge/protocol";
import type { JobManager } from "../../jobs/manager.js";
import type { LspManager } from "../../lsp/manager.js";

export function createJobCancelAllHandler(
  jobManager: JobManager,
  lspManager?: LspManager
): (params: JobCancelAllParams) => Promise<JobCancelAllResult> {
  return async (params: JobCancelAllParams): Promise<JobCancelAllResult> => {
    if (lspManager) {
      await lspManager.stopAll().catch(() => {});
    }
    return jobManager.cancelAllJobs(params?.reason);
  };
}
