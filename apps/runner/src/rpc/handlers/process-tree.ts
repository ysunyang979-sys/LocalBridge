import type { ProcessTreeParams, ProcessTreeResult } from "@localbridge/protocol";
import type { ProcessOwnershipTracker } from "../../process/ownership-tracker.js";

export function createProcessTreeHandler(ownershipTracker: ProcessOwnershipTracker) {
  return async (params: ProcessTreeParams): Promise<ProcessTreeResult> => {
    return ownershipTracker.buildProcessTree(params);
  };
}
