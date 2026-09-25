import type {
  FileCreateParams,
  FileCreateResult,
} from "@localbridge/protocol";
import type { FilesystemService } from "../../filesystem/index.js";
import { LocalBridgeError, LocalBridgeErrorCode } from "@localbridge/protocol";
import { canonicalPayloadHash } from "@localbridge/shared";
import type { ApprovalManager } from "../../approvals/index.js";
import type { ProjectRegistry } from "../../projects/index.js";
import { TrustPolicyEvaluator, isProtectedFile, isBuildDefinitionFile } from "@localbridge/security";

export function createFileCreateHandler(
  fsService: FilesystemService,
  approvalManager?: ApprovalManager,
  projectRegistry?: ProjectRegistry
) {
  return async (params: FileCreateParams): Promise<FileCreateResult> => {
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
      operation: "file.create",
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
        evalResult.reason || `Operation "file.create" denied by policy.`
      );
    }

    const payload = {
      projectId: params.projectId,
      path: params.path,
      content: params.content,
    };
    const pHash = canonicalPayloadHash(payload);

    const isFollowPolicy = project.trustPolicy?.protectedFilesPolicy === "follow-policy" && evalResult.decision === "allow";
    const isProtected = !isFollowPolicy && (evalResult.decisionSource === "protected-file" || isProtectedFile(params.path));
    const isBuildDef = !isFollowPolicy && isBuildDefinitionFile(params.path);
    const needsApproval = evalResult.decision === "ask" || isProtected || isBuildDef;

    if (needsApproval) {
      if (!approvalManager) {
        throw new LocalBridgeError(
          LocalBridgeErrorCode.APPROVAL_REQUIRED,
          `Operation "file.create" requires human approval.`
        );
      }

      approvalManager.handleOperationApproval({
        projectId: params.projectId,
        operation: "file.create",
        risk: isProtected || isBuildDef ? "DANGEROUS" : "CAUTION",
        summary: `Create file "${params.path}" in project "${params.projectId}"`,
        payloadHash: pHash,
        approvalId: params.approvalId,
        timeoutMs: 300000,
        decisionSource: isProtected
          ? "protected-file"
          : isBuildDef
          ? "build-definition"
          : evalResult.decisionSource,
        isProtectedFile: isProtected,
        isBuildDefinition: isBuildDef,
        callerPurpose: params.callerPurpose,
      });
    }

    return fsService.createFile({
      ...payload,
      sessionId: params.sessionId,
    });
  };
}
