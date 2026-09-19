import {
  LocalBridgeError,
  LocalBridgeErrorCode,
  type ApprovalGetParams,
  type ApprovalGetResult,
} from "@localbridge/protocol";
import type { ApprovalManager } from "../../approvals/index.js";

export function createApprovalGetHandler(approvalManager: ApprovalManager) {
  return async (params: ApprovalGetParams): Promise<ApprovalGetResult> => {
    const req = approvalManager.get(params.approvalId);
    if (!req) {
      throw new LocalBridgeError(
        LocalBridgeErrorCode.APPROVAL_NOT_FOUND,
        `Approval "${params.approvalId}" not found`
      );
    }
    return req;
  };
}
