import type { GitStageParams, GitStageResult } from "@localbridge/protocol";
import { LocalBridgeError, LocalBridgeErrorCode } from "@localbridge/protocol";
import { canonicalPayloadHash } from "@localbridge/shared";
import { canonicalizeGitPaths, TrustPolicyEvaluator } from "@localbridge/security";
import type { GitService } from "../../git/index.js";
import type { ApprovalManager } from "../../approvals/index.js";
import type { ProjectRegistry } from "../../projects/index.js";

export function createGitStageHandler(
  gitService: GitService,
  approvalManager: ApprovalManager,
  projectRegistry: ProjectRegistry
) {
  return async (params: GitStageParams): Promise<GitStageResult> => {
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

    const canonicalPaths = canonicalizeGitPaths(params.paths);

    const isSessionTrusted = projectRegistry.isSessionTrusted(params.projectId);
    const evalResult = TrustPolicyEvaluator.evaluate({
      projectId: params.projectId,
      operation: "git.stage",
      projectEnabled: project.enabled,
      projectAccessMode: project.accessMode as "read-only" | "read-write",
      trustPolicy: project.trustPolicy,
      isSessionTrusted,
    });

    if (evalResult.decision === "deny") {
      throw new LocalBridgeError(
        LocalBridgeErrorCode.POLICY_DENIED,
        evalResult.reason || `Operation "git.stage" denied by policy.`
      );
    }

    const payload = {
      projectId: params.projectId,
      operation: "git.stage",
      paths: canonicalPaths,
    };
    const pHash = canonicalPayloadHash(payload);

    if (evalResult.decision === "ask") {
      if (!params.approvalId) {
        const approval = approvalManager.create({
          projectId: params.projectId,
          operation: "git.stage",
          risk: "CAUTION",
          summary: `Stage ${canonicalPaths.length} file(s) in project "${params.projectId}": ${canonicalPaths.slice(0, 3).join(", ")}${canonicalPaths.length > 3 ? "..." : ""}`,
          payloadHash: pHash,
          timeoutMs: 300000,
        });
        throw new LocalBridgeError(
          LocalBridgeErrorCode.APPROVAL_REQUIRED,
          `Operation requires human approval. Approval request "${approval.id}" created for staging ${canonicalPaths.length} file(s). Please review and approve in Nexus Desktop, and retry with approvalId: "${approval.id}".`,
          {
            code: LocalBridgeErrorCode.APPROVAL_REQUIRED,
            approvalId: approval.id,
            operation: "git.stage",
            projectId: params.projectId,
            summary: approval.summary,
            expiresAt: approval.expiresAt,
          }
        );
      }

      approvalManager.verifyAndConsume(
        params.approvalId,
        params.projectId,
        "git.stage",
        pHash
      );
    }

    return gitService.stage({
      projectId: params.projectId,
      paths: canonicalPaths,
    });
  };
}
