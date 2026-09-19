import type {
  FilePatchParams,
  FilePatchResult,
} from "@localbridge/protocol";
import type { FilesystemService } from "../../filesystem/index.js";
import { LocalBridgeError, LocalBridgeErrorCode } from "@localbridge/protocol";
import { canonicalPayloadHash } from "@localbridge/shared";
import type { ApprovalManager } from "../../approvals/index.js";
import type { ProjectRegistry } from "../../projects/index.js";
import { TrustPolicyEvaluator } from "@localbridge/security";

export function createFilePatchHandler(
  fsService: FilesystemService,
  approvalManager?: ApprovalManager,
  projectRegistry?: ProjectRegistry
) {
  return async (params: FilePatchParams): Promise<FilePatchResult> => {
    const project = projectRegistry
      ? projectRegistry.get(params.projectId)
      : { enabled: true, accessMode: "read-write", trustPolicy: undefined };

    if (!project) {
      throw new LocalBridgeError(
        LocalBridgeErrorCode.PROJECT_NOT_FOUND,
        `Project "${params.projectId}" not found`
      );
    }

    const isSessionTrusted = projectRegistry
      ? projectRegistry.isSessionTrusted(params.projectId)
      : false;

    const evalResult = TrustPolicyEvaluator.evaluate({
      projectId: params.projectId,
      operation: "file.patch",
      relativePath: params.path,
      projectEnabled: project.enabled,
      projectAccessMode: project.accessMode as "read-only" | "read-write",
      trustPolicy: project.trustPolicy,
      isSessionTrusted,
    });

    if (evalResult.decision === "deny") {
      if (project.accessMode !== "read-write") {
        throw new LocalBridgeError(
          LocalBridgeErrorCode.PROJECT_READ_ONLY,
          `Project "${params.projectId}" is in read-only mode`
        );
      }
      throw new LocalBridgeError(
        LocalBridgeErrorCode.POLICY_DENIED,
        evalResult.reason || `Operation "file.patch" denied by policy.`
      );
    }

    const payload = {
      projectId: params.projectId,
      path: params.path,
      expectedHash: params.expectedHash,
      replacements: params.replacements,
    };
    const pHash = canonicalPayloadHash(payload);

    if (evalResult.decision === "ask") {
      if (!approvalManager) {
        throw new LocalBridgeError(
          LocalBridgeErrorCode.APPROVAL_REQUIRED,
          `Operation "file.patch" requires human approval.`
        );
      }

      if (!params.approvalId) {
        const approval = approvalManager.create({
          projectId: params.projectId,
          operation: "file.patch",
          risk: "CAUTION",
          summary: `Patch file "${params.path}" in project "${params.projectId}"`,
          payloadHash: pHash,
          timeoutMs: 300000,
        });
        throw new LocalBridgeError(
          LocalBridgeErrorCode.APPROVAL_REQUIRED,
          `Operation requires human approval. Approval request "${approval.id}" created for patching "${params.path}". Please ask the user to review and approve in LocalBridge Desktop, check status with localbridge_approval_status(approvalId: "${approval.id}"), and retry with approvalId: "${approval.id}".`,
          {
            code: LocalBridgeErrorCode.APPROVAL_REQUIRED,
            approvalId: approval.id,
            operation: "file.patch",
            projectId: params.projectId,
            summary: approval.summary,
            expiresAt: approval.expiresAt,
          }
        );
      }

      approvalManager.verifyAndConsume(
        params.approvalId,
        params.projectId,
        "file.patch",
        pHash
      );
    }

    return fsService.patchFile(payload);
  };
}
