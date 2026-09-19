import type {
  ApprovalCreateParams,
  ApprovalCreateResult,
} from "@localbridge/protocol";
import type { ApprovalManager } from "../../approvals/index.js";

export function createApprovalCreateHandler(approvalManager: ApprovalManager) {
  return async (params: ApprovalCreateParams): Promise<ApprovalCreateResult> => {
    return approvalManager.create(params);
  };
}
