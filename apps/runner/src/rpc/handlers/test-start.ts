import type { TestStartParams, TestStartResult } from "@localbridge/protocol";
import type { JobManager } from "../../jobs/index.js";

export function createTestStartHandler(jobManager: JobManager) {
  return async (params: TestStartParams): Promise<TestStartResult> => {
    return jobManager.startTest(params);
  };
}
