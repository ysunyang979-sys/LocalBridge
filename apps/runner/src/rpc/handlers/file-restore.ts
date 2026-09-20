import type {
  FileRestoreParams,
  FileRestoreResult,
} from "@localbridge/protocol";
import type { FilesystemService } from "../../filesystem/index.js";
import { LocalBridgeError, LocalBridgeErrorCode } from "@localbridge/protocol";
import { canonicalPayloadHash } from "@localbridge/shared";
import type { ApprovalManager } from "../../approvals/index.js";
import type { ProjectRegistry } from "../../projects/index.js";
import { TrustPolicyEvaluator } from "@localbridge/security";

export function createFileRestoreHandler(
  fsService: FilesystemService,
  approvalManager?: ApprovalManager,
  projectRegistry?: ProjectRegistry
) {
  return async (params: FileRestoreParams): Promise<FileRestoreResult> => {
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
      operation: "file.restore",
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
        evalResult.reason || `Operation "file.restore" denied by policy.`
      );
    }

    const payload = {
      projectId: params.projectId,
      operationId: params.operationId,
    };
    const pHash = canonicalPayloadHash(payload);

    if (evalResult.decision === "ask") {
      if (!approvalManager) {
        throw new LocalBridgeError(
          LocalBridgeErrorCode.APPROVAL_REQUIRED,
          `Operation "file.restore" requires human approval.`
        );
      }

      const approvalId = (params as any).approvalId;
      approvalManager.handleOperationApproval({
        projectId: params.projectId,
        operation: "file.restore",
        risk: "DANGEROUS",
        summary: `Restore file for operation "${params.operationId}" in project "${params.projectId}"`,
        payloadHash: pHash,
        approvalId,
        timeoutMs: 300000,
        decisionSource: evalResult.decisionSource,
        isProtectedFile: evalResult.decisionSource === "protected-file",
      });
    }

    return fsService.restoreFile({
      ...payload,
      sessionId: (params as any).sessionId,
    });
  };
}
