import type { ProcessKillParams, ProcessKillResult } from "@localbridge/protocol";
import type { ProcessOwnershipTracker } from "../../process/ownership-tracker.js";

export function createProcessKillHandler(ownershipTracker: ProcessOwnershipTracker) {
  return async (params: ProcessKillParams): Promise<ProcessKillResult> => {
    const res = await ownershipTracker.killProcess(params.pid, {
      force: params.force,
      signal: params.signal,
      hasApproval: !!params.approvalId,
    });
    return {
      pid: params.pid,
      killed: res.killed,
      ownership: res.ownership,
      message: res.message,
      exitVerified: res.exitVerified,
    };
  };
}
