import type {
  ApprovalSetModeParams,
  ApprovalSetModeResult,
} from "@localbridge/protocol";
import type { ApprovalManager } from "../../approvals/index.js";

export function createApprovalSetModeHandler(approvalManager: ApprovalManager) {
  return async (params: ApprovalSetModeParams): Promise<ApprovalSetModeResult> => {
    approvalManager.setRoutingMode(params.mode);
    return {
      mode: approvalManager.getRoutingMode(),
      success: true,
    };
  };
}
