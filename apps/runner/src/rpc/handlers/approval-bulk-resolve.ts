import type {
  ApprovalBulkResolveParams,
  ApprovalBulkResolveResult,
} from "@localbridge/protocol";
import type { ApprovalManager } from "../../approvals/index.js";

export function createApprovalBulkResolveHandler(approvalManager: ApprovalManager) {
  return async (
    params: ApprovalBulkResolveParams
  ): Promise<ApprovalBulkResolveResult> => {
    return approvalManager.bulkResolve(params);
  };
}
