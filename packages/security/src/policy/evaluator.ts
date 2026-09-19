import type {
  ProjectTrustLevel,
  CommandActionPolicy,
  ProtectedFilesPolicy,
  ProjectCustomRules,
  ProjectTrustPolicy,
} from "@localbridge/protocol";
import { isProtectedFile, isAbsoluteDenyPath } from "../path/sensitive.js";

export interface PolicyEvaluationInput {
  projectId: string;
  operation: string;
  relativePath?: string;
  projectEnabled: boolean;
  projectAccessMode: "read-only" | "read-write";
  tokenScopes?: string[];
  isEmergencyStopped?: boolean;
  isAiPaused?: boolean;
  trustPolicy?: ProjectTrustPolicy;
  isSessionTrusted?: boolean;
}

export type PolicyDecision = "allow" | "ask" | "deny";

export interface PolicyEvaluationResult {
  decision: PolicyDecision;
  decisionSource:
    | "security-boundary"
    | "protected-file"
    | "project-policy"
    | "session-trust"
    | "custom-rule"
    | "manual-approval";
  policyLevel?: ProjectTrustLevel;
  reason?: string;
  requiresApproval: boolean;
}

export class TrustPolicyEvaluator {
  static evaluate(input: PolicyEvaluationInput): PolicyEvaluationResult {
    const {
      operation,
      relativePath,
      projectEnabled,
      projectAccessMode,
      tokenScopes,
      isEmergencyStopped,
      isAiPaused,
      trustPolicy,
      isSessionTrusted,
    } = input;

    // 1. Emergency Stop Check (Highest Priority)
    if (isEmergencyStopped) {
      return {
        decision: "deny",
        decisionSource: "security-boundary",
        reason: "Emergency stop is active. All operations are blocked.",
        requiresApproval: false,
      };
    }

    // 2. Pause AI Check (Highest Priority)
    if (isAiPaused) {
      return {
        decision: "deny",
        decisionSource: "security-boundary",
        reason: "AI access is paused. Operation cannot proceed.",
        requiresApproval: false,
      };
    }

    // 3. MCP Token Scope Check
    if (tokenScopes && Array.isArray(tokenScopes)) {
      const requiredScope = this.getRequiredScope(operation);
      if (requiredScope && !tokenScopes.includes(requiredScope)) {
        return {
          decision: "deny",
          decisionSource: "security-boundary",
          reason: `Token lacks required '${requiredScope}' scope for operation '${operation}'`,
          requiresApproval: false,
        };
      }
    }

    // 4. Project Enabled Check
    if (!projectEnabled) {
      return {
        decision: "deny",
        decisionSource: "security-boundary",
        reason: "Project is disabled.",
        requiresApproval: false,
      };
    }

    // 5. Project Access Mode Check
    if (this.requiresWriteAccess(operation)) {
      if (projectAccessMode !== "read-write") {
        return {
          decision: "deny",
          decisionSource: "security-boundary",
          reason: "Project is in read-only mode.",
          requiresApproval: false,
        };
      }
    }

    // 6. Absolute Security Boundary Check (Paths that can NEVER be accessed or approved)
    if (relativePath && isAbsoluteDenyPath(relativePath)) {
      return {
        decision: "deny",
        decisionSource: "security-boundary",
        reason: `Access to absolute protected path '${relativePath}' is denied by security boundary.`,
        requiresApproval: false,
      };
    }

    // 7. Protected File Policy Check (.env, *.key, credentials, etc.)
    if (relativePath && isProtectedFile(relativePath)) {
      const protectedPolicy: ProtectedFilesPolicy =
        trustPolicy?.protectedFilesPolicy ?? "always-ask";

      if (protectedPolicy === "deny") {
        return {
          decision: "deny",
          decisionSource: "protected-file",
          reason: `Protected file '${relativePath}' is blocked by security policy.`,
          requiresApproval: false,
        };
      }

      if (protectedPolicy === "always-ask") {
        return {
          decision: "ask",
          decisionSource: "protected-file",
          reason: `Protected file '${relativePath}' requires explicit human approval.`,
          requiresApproval: true,
        };
      }
      // "follow-policy" (expert mode) falls through to project trust policy below
    }

    // 7. Session Trust Check
    if (isSessionTrusted) {
      // Command execution in session trust still adheres to command policy / scopes
      if (this.isCommandOperation(operation)) {
        const cmdPolicy: CommandActionPolicy = trustPolicy?.commandPolicy ?? "ask";
        if (cmdPolicy === "deny") {
          return {
            decision: "deny",
            decisionSource: "project-policy",
            policyLevel: "session-trusted",
            reason: "Command execution is disabled by policy.",
            requiresApproval: false,
          };
        }
        if (cmdPolicy === "ask") {
          return {
            decision: "ask",
            decisionSource: "project-policy",
            policyLevel: "session-trusted",
            reason: "Command execution requires human approval.",
            requiresApproval: true,
          };
        }
      }

      return {
        decision: "allow",
        decisionSource: "session-trust",
        policyLevel: "session-trusted",
        requiresApproval: false,
      };
    }

    // 8. Project Trust Policy Check
    const trustLevel: ProjectTrustLevel = trustPolicy?.trustLevel ?? "standard";

    if (trustLevel === "full-project-trust") {
      // Command execution is isolated: Full Trust on files does NOT auto-allow commands!
      if (this.isCommandOperation(operation)) {
        const cmdPolicy: CommandActionPolicy = trustPolicy?.commandPolicy ?? "ask";
        if (cmdPolicy === "deny") {
          return {
            decision: "deny",
            decisionSource: "project-policy",
            policyLevel: "full-project-trust",
            reason: "Command execution is disabled for this project.",
            requiresApproval: false,
          };
        }
        if (cmdPolicy === "controlled") {
          return {
            decision: "allow",
            decisionSource: "project-policy",
            policyLevel: "full-project-trust",
            requiresApproval: false,
          };
        }
        return {
          decision: "ask",
          decisionSource: "project-policy",
          policyLevel: "full-project-trust",
          reason: "Command execution requires human approval.",
          requiresApproval: true,
        };
      }

      // Normal file and git operations under Full Project Trust are Auto Allowed
      return {
        decision: "allow",
        decisionSource: "project-policy",
        policyLevel: "full-project-trust",
        requiresApproval: false,
      };
    }

    if (trustLevel === "custom" && trustPolicy?.customRules) {
      const customDecision = this.evaluateCustomRules(operation, trustPolicy.customRules);
      if (customDecision) {
        return {
          decision: customDecision,
          decisionSource: "custom-rule",
          policyLevel: "custom",
          reason:
            customDecision === "ask"
              ? "Operation requires approval per custom project policy."
              : customDecision === "deny"
                ? "Operation denied per custom project policy."
                : undefined,
          requiresApproval: customDecision === "ask",
        };
      }
    }

    // Standard Policy (Safe Defaults)
    return this.evaluateStandardPolicy(operation);
  }

  private static evaluateStandardPolicy(operation: string): PolicyEvaluationResult {
    // Dangerous or sensitive operations require approval by default
    if (
      operation === "file.delete" ||
      operation === "file.rename" ||
      operation === "git.commit" ||
      operation === "git.createBranch" ||
      operation === "git.restore" ||
      this.isCommandOperation(operation)
    ) {
      return {
        decision: "ask",
        decisionSource: "project-policy",
        policyLevel: "standard",
        reason: `Operation '${operation}' requires human approval under Standard policy.`,
        requiresApproval: true,
      };
    }

    // Safe read, write, create, patch, stat, list, git status/diff/log are auto-allowed
    return {
      decision: "allow",
      decisionSource: "project-policy",
      policyLevel: "standard",
      requiresApproval: false,
    };
  }

  private static evaluateCustomRules(
    operation: string,
    rules: ProjectCustomRules
  ): PolicyDecision | null {
    // Files
    if (operation.startsWith("file.")) {
      const op = operation.slice(5) as keyof NonNullable<typeof rules.files>;
      if (rules.files && rules.files[op]) {
        return rules.files[op] as PolicyDecision;
      }
    }

    // Git
    if (operation.startsWith("git.")) {
      const op = operation.slice(4) as keyof NonNullable<typeof rules.git>;
      if (rules.git && rules.git[op]) {
        return rules.git[op] as PolicyDecision;
      }
    }

    // Commands
    if (this.isCommandOperation(operation) && rules.commands) {
      if (operation === "build.start" && rules.commands.build) {
        return rules.commands.build as PolicyDecision;
      }
      if (operation === "test.start" && rules.commands.test) {
        return rules.commands.test as PolicyDecision;
      }
      if (rules.commands.controlledCommand) {
        return rules.commands.controlledCommand as PolicyDecision;
      }
    }

    return null;
  }

  private static getRequiredScope(operation: string): "read" | "write" | "execute" | null {
    if (
      operation === "file.read" ||
      operation === "file.stat" ||
      operation === "directory.list" ||
      operation === "git.status" ||
      operation === "git.diff" ||
      operation === "git.log" ||
      operation === "git.info"
    ) {
      return "read";
    }

    if (
      operation === "file.create" ||
      operation === "file.write" ||
      operation === "file.patch" ||
      operation === "file.delete" ||
      operation === "file.restore" ||
      operation === "file.rename" ||
      operation.startsWith("git.stage") ||
      operation.startsWith("git.unstage") ||
      operation.startsWith("git.commit") ||
      operation.startsWith("git.createBranch") ||
      operation.startsWith("git.restore")
    ) {
      return "write";
    }

    if (
      operation === "command.run" ||
      operation === "command.classify" ||
      operation === "job.start" ||
      operation === "build.start" ||
      operation === "test.start"
    ) {
      return "execute";
    }

    return null;
  }

  private static requiresWriteAccess(operation: string): boolean {
    return (
      operation === "file.create" ||
      operation === "file.write" ||
      operation === "file.patch" ||
      operation === "file.delete" ||
      operation === "file.restore" ||
      operation === "file.rename"
    );
  }

  private static isCommandOperation(operation: string): boolean {
    return (
      operation === "command.run" ||
      operation === "command.classify" ||
      operation === "job.start" ||
      operation === "build.start" ||
      operation === "test.start"
    );
  }
}
