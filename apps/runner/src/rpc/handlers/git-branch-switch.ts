import type { GitBranchSwitchParams, GitBranchSwitchResult } from "@localbridge/protocol";
import { LocalBridgeError, LocalBridgeErrorCode } from "@localbridge/protocol";
import { canonicalPayloadHash } from "@localbridge/shared";
import { validateBranchNameFormat, TrustPolicyEvaluator } from "@localbridge/security";
import type { GitService } from "../../git/index.js";
import type { ApprovalManager } from "../../approvals/index.js";
import type { ProjectRegistry } from "../../projects/index.js";

export function createGitBranchSwitchHandler(
  gitService: GitService,
  approvalManager: ApprovalManager,
  projectRegistry: ProjectRegistry
) {
  return async (params: GitBranchSwitchParams): Promise<GitBranchSwitchResult> => {
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

    const branchName = validateBranchNameFormat(params.branchName);

    const isSessionTrusted = projectRegistry.isSessionTrusted(params.projectId);
    const evalResult = TrustPolicyEvaluator.evaluate({
      projectId: params.projectId,
      operation: "git.branchSwitch",
      projectEnabled: project.enabled,
      projectAccessMode: project.accessMode as "read-only" | "read-write",
      trustPolicy: project.trustPolicy,
      isSessionTrusted,
    });

    if (evalResult.decision === "deny") {
      throw new LocalBridgeError(
        LocalBridgeErrorCode.POLICY_DENIED,
        evalResult.reason || `Operation "git.branchSwitch" denied by policy.`
      );
    }

    const payload = {
      projectId: params.projectId,
      operation: "git.branchSwitch",
      branchName,
    };
    const pHash = canonicalPayloadHash(payload);

    if (evalResult.decision === "ask") {
      approvalManager.handleOperationApproval({
        projectId: params.projectId,
        operation: "git.branchSwitch",
        risk: "DANGEROUS",
        summary: `Switch to branch "${branchName}" in project "${params.projectId}"`,
        payloadHash: pHash,
        approvalId: params.approvalId,
        timeoutMs: 300000,
        decisionSource: evalResult.decisionSource,
        isProtectedFile: evalResult.decisionSource === "protected-file",
      });
    }

    return gitService.branchSwitch({
      projectId: params.projectId,
      branchName,
    });
  };
}
