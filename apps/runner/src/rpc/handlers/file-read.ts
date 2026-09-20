import type {
  FileReadParams,
  FileReadResult,
} from "@localbridge/protocol";
import type { FilesystemService } from "../../filesystem/index.js";
import { LocalBridgeError, LocalBridgeErrorCode } from "@localbridge/protocol";
import { canonicalPayloadHash } from "@localbridge/shared";
import type { ApprovalManager } from "../../approvals/index.js";
import type { ProjectRegistry } from "../../projects/index.js";
import { TrustPolicyEvaluator } from "@localbridge/security";

export function createFileReadHandler(
  fsService: FilesystemService,
  approvalManager?: ApprovalManager,
  projectRegistry?: ProjectRegistry
) {
  return async (params: FileReadParams): Promise<FileReadResult> => {
    const project = projectRegistry
      ? projectRegistry.get(params.projectId)
      : { enabled: true, accessMode: "read-write", trustPolicy: undefined };

    if (!project) {
      throw new LocalBridgeError(
        LocalBridgeErrorCode.PROJECT_NOT_FOUND,
        `Project "${params.projectId}" not found`
      );
    }

    if (!project.enabled) {
      throw new LocalBridgeError(
        LocalBridgeErrorCode.PROJECT_DISABLED,
        `Project "${params.projectId}" is currently disabled`
      );
    }

    const isSessionTrusted = projectRegistry
      ? projectRegistry.isSessionTrusted(params.projectId)
      : false;

    const evalResult = TrustPolicyEvaluator.evaluate({
      projectId: params.projectId,
      operation: "file.read",
      relativePath: params.path,
      projectEnabled: project.enabled,
      projectAccessMode: project.accessMode as "read-only" | "read-write",
      trustPolicy: project.trustPolicy,
      isSessionTrusted,
    });

    if (evalResult.decision === "deny") {
      if (evalResult.decisionSource === "protected-file") {
        throw new LocalBridgeError(
          LocalBridgeErrorCode.SENSITIVE_FILE_BLOCKED,
          evalResult.reason || `Access to sensitive file "${params.path}" is blocked.`
        );
      }
      throw new LocalBridgeError(
        LocalBridgeErrorCode.POLICY_DENIED,
        evalResult.reason || `Operation "file.read" denied by policy.`
      );
    }

    const payload = {
      projectId: params.projectId,
      path: params.path,
    };
    const pHash = canonicalPayloadHash(payload);

    if (evalResult.decision === "ask") {
      if (!approvalManager) {
        throw new LocalBridgeError(
          LocalBridgeErrorCode.APPROVAL_REQUIRED,
          `Operation "file.read" requires human approval.`
        );
      }

      if (!params.approvalId) {
        const approval = approvalManager.create({
          projectId: params.projectId,
          operation: "file.read",
          risk: "CAUTION",
          summary: `Read file "${params.path}" in project "${params.projectId}"`,
          payloadHash: pHash,
          timeoutMs: 300000,
        });
        throw new LocalBridgeError(
          LocalBridgeErrorCode.APPROVAL_REQUIRED,
          `Operation requires human approval. Approval request "${approval.id}" created for reading "${params.path}". Please ask the user to review and approve in LocalBridge Desktop, check status with localbridge_approval_status(approvalId: "${approval.id}"), and retry with approvalId: "${approval.id}".`,
          {
            code: LocalBridgeErrorCode.APPROVAL_REQUIRED,
            approvalId: approval.id,
            operation: "file.read",
            projectId: params.projectId,
            summary: approval.summary,
            expiresAt: approval.expiresAt,
          }
        );
      }

      approvalManager.verifyAndConsume(
        params.approvalId,
        params.projectId,
        "file.read",
        pHash
      );
    }

    return fsService.readText(params);
  };
}
