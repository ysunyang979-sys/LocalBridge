import type {
  ApprovalListParams,
  ApprovalListResult,
} from "@localbridge/protocol";
import type { ApprovalManager } from "../../approvals/index.js";

export function createApprovalListHandler(approvalManager: ApprovalManager) {
  return async (params: ApprovalListParams): Promise<ApprovalListResult> => {
    return approvalManager.list(params);
  };
}
