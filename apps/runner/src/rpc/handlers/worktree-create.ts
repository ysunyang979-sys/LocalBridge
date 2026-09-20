import {
  LocalBridgeError,
  LocalBridgeErrorCode,
  type WorktreeCreateParams,
  type WorktreeCreateResult,
} from "@localbridge/protocol";
import { canonicalPayloadHash } from "@localbridge/shared";
import { TrustPolicyEvaluator } from "@localbridge/security";
import type { ManagedWorktreeService } from "../../worktree/index.js";
import type { ApprovalManager } from "../../approvals/index.js";
import type { ProjectRegistry } from "../../projects/index.js";

export function createWorktreeCreateHandler(
  worktreeService: ManagedWorktreeService,
  approvalManager: ApprovalManager,
  projectRegistry: ProjectRegistry
) {
  return async (
    params: WorktreeCreateParams & { approvalId?: string }
  ): Promise<WorktreeCreateResult> => {
    const project = projectRegistry.get(params.projectId);
    if (!project) {
      throw new LocalBridgeError(
        LocalBridgeErrorCode.PROJECT_NOT_FOUND,
        `Project "${params.projectId}" not found`
      );
    }

    if (!project.enabled) {
      throw new LocalBridgeError(
        LocalBridgeErrorCode.PROJECT_DISABLED,
        `Project "${params.projectId}" is disabled`
      );
    }

    if (project.accessMode !== "read-write") {
      throw new LocalBridgeError(
        LocalBridgeErrorCode.PROJECT_READ_ONLY,
        `Project "${params.projectId}" is in read-only mode. Worktree creation requires read-write access.`
      );
    }

    const isSessionTrusted = projectRegistry.isSessionTrusted(params.projectId);
    const evalResult = TrustPolicyEvaluator.evaluate({
      projectId: params.projectId,
      operation: "worktree.create",
      projectEnabled: project.enabled,
      projectAccessMode: project.accessMode as "read-only" | "read-write",
      trustPolicy: project.trustPolicy,
      isSessionTrusted,
    });

    if (evalResult.decision === "deny") {
      throw new LocalBridgeError(
        LocalBridgeErrorCode.POLICY_DENIED,
        evalResult.reason || `Operation "worktree.create" denied by policy.`
      );
    }

    const payload = {
      projectId: params.projectId,
      operation: "worktree.create",
      branchName: params.branchName,
      baseRef: params.baseRef || "HEAD",
    };
    const pHash = canonicalPayloadHash(payload);

    if (evalResult.decision === "ask") {
      approvalManager.handleOperationApproval({
        projectId: params.projectId,
        operation: "worktree.create",
        risk: "CAUTION",
        summary: `Create managed worktree for branch "${params.branchName}" in project "${params.projectId}"`,
        payloadHash: pHash,
        approvalId: params.approvalId,
        timeoutMs: 300000,
        decisionSource: evalResult.decisionSource,
        isProtectedFile: false,
      });
    }

    return worktreeService.create(params);
  };
}
