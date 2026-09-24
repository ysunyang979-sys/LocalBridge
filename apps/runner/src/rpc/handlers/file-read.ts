import type {
  FileReadParams,
  FileReadResult,
} from "@localbridge/protocol";
import type { FilesystemService } from "../../filesystem/index.js";
import { LocalBridgeError, LocalBridgeErrorCode } from "@localbridge/protocol";
import { canonicalPayloadHash } from "@localbridge/shared";
import type { ApprovalManager } from "../../approvals/index.js";
import type { ProjectRegistry } from "../../projects/index.js";
import { TrustPolicyEvaluator, isProtectedFile } from "@localbridge/security";

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

    const isProtected = evalResult.decisionSource === "protected-file" || isProtectedFile(params.path);
    const needsApproval = evalResult.decision === "ask" || isProtected;

    if (needsApproval) {
      if (!approvalManager) {
        throw new LocalBridgeError(
          LocalBridgeErrorCode.APPROVAL_REQUIRED,
          `Operation "file.read" requires human approval.`
        );
      }

      approvalManager.handleOperationApproval({
        projectId: params.projectId,
        operation: "file.read",
        risk: isProtected ? "DANGEROUS" : "CAUTION",
        summary: `Read file "${params.path}" in project "${params.projectId}"`,
        payloadHash: pHash,
        approvalId: params.approvalId,
        timeoutMs: 300000,
        decisionSource: isProtected ? "protected-file" : evalResult.decisionSource,
        isProtectedFile: isProtected,
        callerPurpose: params.callerPurpose,
      });
    }

    return fsService.readText(params);
  };
}
