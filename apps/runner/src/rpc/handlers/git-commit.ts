import type { GitCommitParams, GitCommitResult } from "@localbridge/protocol";
import { LocalBridgeError, LocalBridgeErrorCode } from "@localbridge/protocol";
import { canonicalPayloadHash } from "@localbridge/shared";
import { TrustPolicyEvaluator } from "@localbridge/security";
import type { GitService } from "../../git/index.js";
import type { ApprovalManager } from "../../approvals/index.js";
import type { ProjectRegistry } from "../../projects/index.js";

export function createGitCommitHandler(
  gitService: GitService,
  approvalManager: ApprovalManager,
  projectRegistry: ProjectRegistry
) {
  return async (params: GitCommitParams): Promise<GitCommitResult> => {
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
        `Project "${params.projectId}" is in read-only mode. Git write operations require read-write access.`
      );
    }

    if (!params.message || !params.message.trim()) {
      throw new LocalBridgeError(
        LocalBridgeErrorCode.INVALID_REQUEST,
        "Commit message must not be empty"
      );
    }

    const message = params.message.trim();
    if (message.length > 4096) {
      throw new LocalBridgeError(
        LocalBridgeErrorCode.INVALID_REQUEST,
        "Commit message exceeds maximum allowed length of 4096 characters"
      );
    }

    const isSessionTrusted = projectRegistry.isSessionTrusted(params.projectId);
    const evalResult = TrustPolicyEvaluator.evaluate({
      projectId: params.projectId,
      operation: "git.commit",
      projectEnabled: project.enabled,
      projectAccessMode: project.accessMode as "read-only" | "read-write",
      trustPolicy: project.trustPolicy,
      isSessionTrusted,
    });

    if (evalResult.decision === "deny") {
      throw new LocalBridgeError(
        LocalBridgeErrorCode.POLICY_DENIED,
        evalResult.reason || `Operation "git.commit" denied by policy.`
      );
    }

    const payload = {
      projectId: params.projectId,
      operation: "git.commit",
      message,
    };
    const pHash = canonicalPayloadHash(payload);

    if (evalResult.decision === "ask") {
      if (!params.approvalId) {
        const shortMsg = message.length > 80 ? message.slice(0, 77) + "..." : message;
        const approval = approvalManager.create({
          projectId: params.projectId,
          operation: "git.commit",
          risk: "DANGEROUS",
          summary: `Commit staged changes in project "${params.projectId}": "${shortMsg}"`,
          payloadHash: pHash,
          timeoutMs: 300000,
        });
        throw new LocalBridgeError(
          LocalBridgeErrorCode.APPROVAL_REQUIRED,
          `Operation requires human approval. Approval request "${approval.id}" created for git commit: "${shortMsg}". Please review and approve in Nexus Desktop, and retry with approvalId: "${approval.id}".`,
          {
            code: LocalBridgeErrorCode.APPROVAL_REQUIRED,
            approvalId: approval.id,
            operation: "git.commit",
            projectId: params.projectId,
            summary: approval.summary,
            expiresAt: approval.expiresAt,
          }
        );
      }

      approvalManager.verifyAndConsume(
        params.approvalId,
        params.projectId,
        "git.commit",
        pHash
      );
    }

    return gitService.commit({
      projectId: params.projectId,
      message,
    });
  };
}
