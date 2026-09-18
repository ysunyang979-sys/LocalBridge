import type { ProjectExecutionMode, ProjectAccessMode } from "@localbridge/protocol";
import type { CommandRiskAssessment, CommandExecutionPolicyDecision } from "./types.js";

export class CommandPolicy {
  /**
   * Evaluates whether a classified command is permitted under the project's executionMode and accessMode.
   */
  static evaluate(
    executionMode: ProjectExecutionMode,
    accessMode: ProjectAccessMode,
    assessment: CommandRiskAssessment
  ): CommandExecutionPolicyDecision {
    if (executionMode === "disabled") {
      return {
        allowed: false,
        reason: "Project execution permission is disabled.",
      };
    }

    if (assessment.risk === "DANGEROUS") {
      return {
        allowed: false,
        reason: `Command is classified as DANGEROUS and cannot be executed: ${assessment.reasons.join("; ")}`,
      };
    }

    if (executionMode === "safe-only") {
      if (assessment.risk === "SAFE") {
        return { allowed: true };
      }
      return {
        allowed: false,
        reason: "Project executionMode 'safe-only' permits only SAFE commands.",
      };
    }

    if (executionMode === "project-code") {
      if (accessMode !== "read-write") {
        return {
          allowed: false,
          reason: "Project executionMode 'project-code' strictly requires accessMode 'read-write'.",
          requiredAccessMode: "read-write",
        };
      }

      if (assessment.risk === "SAFE" || assessment.risk === "CAUTION") {
        return { allowed: true };
      }
      return {
        allowed: false,
        reason: "Command is classified as DANGEROUS and cannot be executed.",
      };
    }

    return {
      allowed: false,
      reason: "Command execution is not permitted.",
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
