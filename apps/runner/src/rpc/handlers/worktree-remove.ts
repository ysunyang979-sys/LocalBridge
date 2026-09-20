import {
  LocalBridgeError,
  LocalBridgeErrorCode,
  type WorktreeRemoveParams,
  type WorktreeRemoveResult,
} from "@localbridge/protocol";
import { canonicalPayloadHash } from "@localbridge/shared";
import { TrustPolicyEvaluator } from "@localbridge/security";
import type { ManagedWorktreeService } from "../../worktree/index.js";
import type { ApprovalManager } from "../../approvals/index.js";
import type { ProjectRegistry } from "../../projects/index.js";
import type { LspManager } from "../../lsp/index.js";

export function createWorktreeRemoveHandler(
  worktreeService: ManagedWorktreeService,
  approvalManager: ApprovalManager,
  projectRegistry: ProjectRegistry,
  lspManager?: LspManager
) {
  return async (
    params: WorktreeRemoveParams & { approvalId?: string }
  ): Promise<WorktreeRemoveResult> => {
    const worktree = worktreeService.getWorktree(params.worktreeId);
    if (!worktree || worktree.state === "removed") {
      throw new LocalBridgeError(
        LocalBridgeErrorCode.WORKTREE_NOT_FOUND,
        `Managed worktree "${params.worktreeId}" not found or already removed`
      );
    }

    const projectId = worktree.projectId;
    const project = projectRegistry.get(projectId);
    if (!project) {
      throw new LocalBridgeError(
        LocalBridgeErrorCode.PROJECT_NOT_FOUND,
        `Project "${projectId}" not found`
      );
    }

    if (!project.enabled) {
      throw new LocalBridgeError(
        LocalBridgeErrorCode.PROJECT_DISABLED,
        `Project "${projectId}" is disabled`
      );
    }

    if (project.accessMode !== "read-write") {
      throw new LocalBridgeError(
        LocalBridgeErrorCode.PROJECT_READ_ONLY,
        `Project "${projectId}" is in read-only mode. Worktree removal requires read-write access.`
      );
    }

    const isSessionTrusted = projectRegistry.isSessionTrusted(projectId);
    const evalResult = TrustPolicyEvaluator.evaluate({
      projectId,
      operation: "worktree.remove",
      projectEnabled: project.enabled,
      projectAccessMode: project.accessMode as "read-only" | "read-write",
      trustPolicy: project.trustPolicy,
      isSessionTrusted,
    });

    if (evalResult.decision === "deny") {
      throw new LocalBridgeError(
        LocalBridgeErrorCode.POLICY_DENIED,
        evalResult.reason || `Operation "worktree.remove" denied by policy.`
      );
    }

    const payload = {
      projectId,
      operation: "worktree.remove",
      worktreeId: params.worktreeId,
    };
    const pHash = canonicalPayloadHash(payload);

    if (evalResult.decision === "ask") {
      approvalManager.handleOperationApproval({
        projectId,
        operation: "worktree.remove",
        risk: "DANGEROUS",
        summary: `Remove managed worktree "${params.worktreeId}" (branch: "${worktree.branchName}") in project "${projectId}"`,
        payloadHash: pHash,
        approvalId: params.approvalId,
        timeoutMs: 300000,
        decisionSource: evalResult.decisionSource,
        isProtectedFile: false,
      });
    }

    const res = await worktreeService.remove(params);
    if (lspManager) {
      await lspManager.stopWorktreeServers(projectId, params.worktreeId);
    }
    return res;
  };
}
