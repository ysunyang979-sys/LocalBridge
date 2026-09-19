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
    if (!params.approvalId) {
      throw new LocalBridgeError(
        LocalBridgeErrorCode.APPROVAL_REQUIRED,
        "file.delete requires an approved, one-time approvalId"
      );
    }
    const payload = {
      projectId: params.projectId,
      path: params.path,
      expectedHash: params.expectedHash,
    };
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
