import type { ProcessListParams, ProcessListResult } from "@localbridge/protocol";
import type { ProcessOwnershipTracker } from "../../process/ownership-tracker.js";

export function createProcessListHandler(ownershipTracker: ProcessOwnershipTracker) {
  return async (params: ProcessListParams): Promise<ProcessListResult> => {
    const list = await ownershipTracker.listProcesses(params.projectId, params.ownership);
    return {
      processes: list,
      total: list.length,
    };
  };
}
