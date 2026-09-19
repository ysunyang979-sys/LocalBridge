import type {
  ApprovalResolveParams,
  ApprovalResolveResult,
} from "@localbridge/protocol";
import type { ApprovalManager } from "../../approvals/index.js";

export function createApprovalResolveHandler(approvalManager: ApprovalManager) {
  return async (params: ApprovalResolveParams): Promise<ApprovalResolveResult> => {
    return approvalManager.resolve(params);
  };
}
