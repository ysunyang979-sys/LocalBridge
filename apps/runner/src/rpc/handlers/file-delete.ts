import type {
  FileDeleteParams,
  FileDeleteResult,
} from "@localbridge/protocol";
import type { FilesystemService } from "../../filesystem/index.js";
import { LocalBridgeError, LocalBridgeErrorCode } from "@localbridge/protocol";
import { canonicalPayloadHash } from "@localbridge/shared";
import type { ApprovalManager } from "../../approvals/index.js";

export function createFileDeleteHandler(
  fsService: FilesystemService,
  approvalManager: ApprovalManager
) {
  return async (params: FileDeleteParams): Promise<FileDeleteResult> => {
    fsService.assertDeleteAuthorized(params.projectId);
    const payload = {
      projectId: params.projectId,
      path: params.path,
      expectedHash: params.expectedHash,
    };
    const pHash = canonicalPayloadHash(payload);

    if (!params.approvalId) {
      const approval = approvalManager.create({
        projectId: params.projectId,
        operation: "file.delete",
        risk: "DANGEROUS",
        summary: `Delete file "${params.path}" in project "${params.projectId}"`,
        payloadHash: pHash,
        timeoutMs: 300000,
      });
      throw new LocalBridgeError(
        LocalBridgeErrorCode.APPROVAL_REQUIRED,
        `Operation requires human approval. Approval request "${approval.id}" created for deleting "${params.path}". Please ask the user to review and approve in LocalBridge Desktop, check status with localbridge_approval_status(approvalId: "${approval.id}"), and retry with approvalId: "${approval.id}".`,
        {
          code: LocalBridgeErrorCode.APPROVAL_REQUIRED,
          approvalId: approval.id,
          operation: "file.delete",
          projectId: params.projectId,
          summary: approval.summary,
          expiresAt: approval.expiresAt,
        }
      );
    }
    // Consume before execution. A failing delete still consumes the approval,
    // preventing retries with stale human intent.
    approvalManager.verifyAndConsume(
      params.approvalId,
      params.projectId,
      "file.delete",
      canonicalPayloadHash(payload)
    );
    return fsService.deleteFile(payload);
  };
}
