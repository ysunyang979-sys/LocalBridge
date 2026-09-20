import type { ProjectExecutionMode, ProjectAccessMode } from "@localbridge/protocol";
import type {
  CommandRiskAssessment,
  CommandExecutionPolicyDecision,
  CommandPolicyDecision,
  CommandPolicyEvaluationInput,
} from "./types.js";
import { CommandClassifier } from "./classifier.js";

export class CommandPolicy {
  /**
   * Unified evaluation of command execution policy across all security layers:
   * Emergency Stop -> Pause -> Token Scope -> Project Enabled -> Access Mode ->
   * Boundary / Risk -> Session Trust -> Trust Policy -> Category Defaults.
   */
  static evaluateUnified(input: CommandPolicyEvaluationInput): CommandPolicyDecision {
    const targetSpec = input.spec ?? input.command;
    if (!targetSpec) {
      throw new Error("CommandPolicy.evaluateUnified requires 'spec' or 'command'");
    }

    const {
      category = CommandClassifier.classifyCategory(targetSpec),
      assessment = CommandClassifier.classify(targetSpec),
      projectEnabled,
      projectAccessMode,
      projectExecutionMode = input.executionMode ?? "disabled",
      trustPolicy,
      isEmergencyStopped,
      isAiPaused,
      tokenScopes,
      isSessionTrusted,
    } = input;

    // 1. Emergency Stop Check (Highest Priority)
    if (isEmergencyStopped) {
      return {
        decision: "deny",
        allowed: false,
        decisionSource: "emergency-stop",
        category,
        reason: "Emergency stop is active. All command execution is blocked.",
        requiresApproval: false,
      };
    }

    // 2. Pause AI Check (Highest Priority)
    if (isAiPaused) {
      return {
        decision: "deny",
        allowed: false,
        decisionSource: "pause",
        category,
        reason: "AI access is paused. Command execution cannot proceed.",
        requiresApproval: false,
      };
    }

    // 3. MCP Token Scope Check
    if (tokenScopes && Array.isArray(tokenScopes)) {
      if (!tokenScopes.includes("commands") && !tokenScopes.includes("execute")) {
        return {
          decision: "deny",
          allowed: false,
          decisionSource: "token-scope",
          category,
          reason: "Token lacks required 'commands' or 'execute' scope for command execution",
          requiresApproval: false,
        };
      }
    }

    // 4. Project Enabled Check
    if (!projectEnabled) {
      return {
        decision: "deny",
        allowed: false,
        decisionSource: "project-enabled",
        category,
        reason: "Project is disabled.",
        requiresApproval: false,
      };
    }

    // 5. Dangerous / Security Boundary Check
    if (assessment.risk === "DANGEROUS") {
      return {
        decision: "deny",
        allowed: false,
        decisionSource: "security-boundary",
        category,
        reason: `Command is classified as DANGEROUS and cannot be executed: ${assessment.reasons.join("; ")}`,
        requiresApproval: false,
      };
    }

    // 6. Project Access Mode Check (Read-Only vs Read-Write)
    const requiresWrite =
      category === "build" ||
      category === "package-install" ||
      assessment.mayModifyFiles;
    if (requiresWrite && projectAccessMode !== "read-write") {
      return {
        decision: "deny",
        allowed: false,
        decisionSource: "access-mode",
        category,
        reason: `Command category '${category}' requires project accessMode 'read-write'.`,
        requiredAccessMode: "read-write",
        requiresApproval: false,
      };
    }

    // 7. Session Trust Check
    if (isSessionTrusted) {
      const cmdPolicy = trustPolicy?.commandPolicy ?? "ask";
      if (cmdPolicy === "deny") {
        return {
          decision: "deny",
          allowed: false,
          decisionSource: "session-trust",
          category,
          policyLevel: "session-trusted",
          reason: "Command execution is disabled by policy under Session Trust.",
          requiresApproval: false,
        };
      }
      if (cmdPolicy === "ask") {
        return {
          decision: "ask",
          allowed: false,
          decisionSource: "session-trust",
          category,
          policyLevel: "session-trusted",
          reason: "Command execution requires human approval under Session Trust.",
          requiresApproval: true,
        };
      }
      return {
        decision: "allow",
        allowed: true,
        decisionSource: "session-trust",
        category,
        policyLevel: "session-trusted",
        requiresApproval: false,
      };
    }

    // 8. Project Command Policy: Deny
    if (trustPolicy?.commandPolicy === "deny") {
      return {
        decision: "deny",
        allowed: false,
        decisionSource: "command-policy",
        category,
        policyLevel: trustPolicy.trustLevel,
        reason: "Command execution is disabled for this project.",
        requiresApproval: false,
      };
    }

    // 9. Custom Command Rules Check (Independent Axis)
    // Evaluates whenever custom command matrix is active:
    // (trustPolicy.commandPolicy === "controlled" || trustPolicy.trustLevel === "custom")
    // and customRules.commands is present.
    if (
      trustPolicy?.customRules?.commands &&
      (trustPolicy.commandPolicy === "controlled" || trustPolicy.trustLevel === "custom")
    ) {
      const customCmd = trustPolicy.customRules.commands;
      const rule =
        category === "inspect"
          ? customCmd.inspect
          : category === "test"
            ? customCmd.test
            : category === "lint"
              ? customCmd.lint
              : category === "typecheck"
                ? customCmd.typecheck
                : category === "build"
                  ? customCmd.build
                  : category === "dev-server"
                    ? customCmd.devServer
                    : category === "package-script"
                      ? customCmd.packageScript
                      : category === "package-install"
                        ? customCmd.packageInstall
                        : category === "git-read"
                          ? customCmd.gitRead
                          : category === "custom-safe"
                            ? customCmd.customSafe
                            : customCmd.controlledCommand;

      if (rule) {
        return {
          decision: rule,
          allowed: rule === "allow",
          decisionSource: "custom-rule",
          category,
          policyLevel: trustPolicy.trustLevel,
          reason:
            rule === "ask"
              ? `Command category '${category}' requires human approval per custom project policy.`
              : rule === "deny"
                ? `Command category '${category}' is denied per custom project policy.`
                : undefined,
          requiresApproval: rule === "ask",
        };
      }
    }

    // 10. Project Command Policy: Ask
    if (trustPolicy?.commandPolicy === "ask") {
      return {
        decision: "ask",
        allowed: false,
        decisionSource: "command-policy",
        category,
        policyLevel: trustPolicy.trustLevel,
        reason: "Command execution requires human approval per project policy.",
        requiresApproval: true,
      };
    }

    // 11. Project Command Policy: Allow
    if (trustPolicy?.commandPolicy === "allow") {
      return {
        decision: "allow",
        allowed: true,
        decisionSource: "command-policy",
        category,
        policyLevel: trustPolicy.trustLevel,
        requiresApproval: false,
      };
    }

    // 12. Full Project Trust Check (Independent Axis)
    if (trustPolicy?.trustLevel === "full-project-trust") {
      const cmdPolicy = trustPolicy.commandPolicy ?? "ask";
      if (cmdPolicy === "controlled") {
        if (
          category === "inspect" ||
          category === "test" ||
          category === "lint" ||
          category === "typecheck" ||
          category === "git-read" ||
          category === "custom-safe"
        ) {
          return {
            decision: "allow",
            allowed: true,
            decisionSource: "command-policy",
            category,
            policyLevel: "full-project-trust",
            requiresApproval: false,
          };
        }
        return {
          decision: "ask",
          allowed: false,
          decisionSource: "command-policy",
          category,
          policyLevel: "full-project-trust",
          reason: `Command category '${category}' requires human approval under controlled policy.`,
          requiresApproval: true,
        };
      }
    }

    // 10. Legacy executionMode Check (Migration & Backwards Compatibility)
    if (projectExecutionMode === "disabled") {
      return {
        decision: "deny",
        allowed: false,
        decisionSource: "command-policy",
        category,
        reason: "Command execution is disabled for this project.",
        requiresApproval: false,
      };
    }

    if (projectExecutionMode === "safe-only") {
      if (category === "inspect" || (category === "test" && assessment.risk === "SAFE")) {
        return {
          decision: "allow",
          allowed: true,
          decisionSource: "command-policy",
          category,
          requiresApproval: false,
        };
      }
      return {
        decision: "deny",
        allowed: false,
        decisionSource: "command-policy",
        category,
        reason: "Project executionMode 'safe-only' permits only safe inspection.",
        requiresApproval: false,
      };
    }

    // 11. Default Command Policy per category (Standard / Safe Development)
    switch (category) {
      case "inspect":
      case "test":
      case "lint":
      case "typecheck":
      case "git-read":
      case "custom-safe":
        return {
          decision: "allow",
          allowed: true,
          decisionSource: "command-policy",
          category,
          requiresApproval: false,
        };

      case "build":
        if (projectExecutionMode === "project-code" && !trustPolicy) {
          return {
            decision: "allow",
            allowed: true,
            decisionSource: "command-policy",
            category,
            requiresApproval: false,
          };
        }
        return {
          decision: "ask",
          allowed: false,
          decisionSource: "command-policy",
          category,
          reason: "Build command requires human approval.",
          requiresApproval: true,
        };

      case "dev-server":
        return {
          decision: "ask",
          allowed: false,
          decisionSource: "command-policy",
          category,
          reason: "Dev server command requires human approval.",
          requiresApproval: true,
        };

      case "package-script":
        if (projectExecutionMode === "project-code" && !trustPolicy) {
          return {
            decision: "allow",
            allowed: true,
            decisionSource: "command-policy",
            category,
            requiresApproval: false,
          };
        }
        return {
          decision: "ask",
          allowed: false,
          decisionSource: "command-policy",
          category,
          reason: "Package script command requires human approval.",
          requiresApproval: true,
        };

      case "package-install":
        return {
          decision: "ask",
          allowed: false,
          decisionSource: "command-policy",
          category,
          reason: "Package installation command requires human approval.",
          requiresApproval: true,
        };

      default:
        return {
          decision: "deny",
          allowed: false,
          decisionSource: "command-policy",
          category,
          reason: `Unknown command category '${category}'.`,
          requiresApproval: false,
        };
    }
  }

  /**
   * Backwards compatible evaluate method for callers passing (executionMode, accessMode, assessment).
   */
  static evaluate(
    executionMode: ProjectExecutionMode,
    accessMode: ProjectAccessMode,
    assessment: CommandRiskAssessment
  ): CommandExecutionPolicyDecision {
    const decision = this.evaluateUnified({
      command: { kind: "tool-version", projectId: "compat", tool: "node" },
      category: assessment.category,
      assessment,
      projectEnabled: true,
      projectAccessMode: accessMode,
      projectExecutionMode: executionMode,
    });

    return {
      allowed: decision.allowed,
      reason: decision.reason,
      requiredAccessMode: decision.requiredAccessMode,
      decision: decision.decision,
    };
  }

  evaluate(
    executionMode: ProjectExecutionMode,
    accessMode: ProjectAccessMode,
    assessment: CommandRiskAssessment
  ): CommandExecutionPolicyDecision {
    return CommandPolicy.evaluate(executionMode, accessMode, assessment);
  }
}

export const CommandPolicyEngine = CommandPolicy;

