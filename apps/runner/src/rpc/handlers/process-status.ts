import type { ProcessStatusParams, ProcessStatusResult } from "@localbridge/protocol";
import type { ProcessOwnershipTracker } from "../../process/ownership-tracker.js";

export function createProcessStatusHandler(ownershipTracker: ProcessOwnershipTracker) {
  return async (params: ProcessStatusParams): Promise<ProcessStatusResult> => {
    const res = await ownershipTracker.getProcessStatus(params.pid);
    return {
      ...res.summary,
      children: res.children,
      isSystemProtected: res.isSystemProtected,
      killable: res.killable,
      ownershipReasons: res.ownershipReasons,
    };
  };
}
