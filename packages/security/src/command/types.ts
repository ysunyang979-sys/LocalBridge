import type {
  CommandCategory,
  CommandSpec,
  ProjectTrustLevel,
  ProjectExecutionMode,
  ProjectAccessMode,
  ProjectTrustPolicy,
} from "@localbridge/protocol";

export const CommandRiskLevel = {
  SAFE: "SAFE",
  CAUTION: "CAUTION",
  DANGEROUS: "DANGEROUS",
} as const;

export type CommandRiskLevel =
  (typeof CommandRiskLevel)[keyof typeof CommandRiskLevel];

export interface CommandRiskAssessment {
  risk: CommandRiskLevel;
  reasons: string[];
  executesProjectCode: boolean;
  mayModifyFiles: boolean;
  mayAccessNetwork: boolean;
  category: CommandCategory;
}

export type CommandPolicyDecisionType = "allow" | "ask" | "deny";

export interface CommandPolicyDecision {
  decision: CommandPolicyDecisionType;
  allowed: boolean;
  reason?: string;
  decisionSource:
    | "emergency-stop"
    | "pause"
    | "token-scope"
    | "project-enabled"
    | "execution-mode"
    | "access-mode"
    | "security-boundary"
    | "command-policy"
    | "session-trust"
    | "custom-rule";
  category: CommandCategory;
  requiresApproval: boolean;
  policyLevel?: ProjectTrustLevel;
  requiredAccessMode?: "read-write";
}

export interface CommandExecutionPolicyDecision {
  allowed: boolean;
  reason?: string;
  requiredAccessMode?: "read-write";
  decision?: CommandPolicyDecisionType;
}

export interface CommandPolicyEvaluationInput {
  spec?: CommandSpec;
  command?: CommandSpec;
  projectId?: string;
  category?: CommandCategory;
  assessment?: CommandRiskAssessment;
  projectEnabled: boolean;
  projectAccessMode: ProjectAccessMode;
  executionMode?: ProjectExecutionMode;
  projectExecutionMode?: ProjectExecutionMode;
  trustPolicy?: ProjectTrustPolicy;
  isEmergencyStopped?: boolean;
  isAiPaused?: boolean;
  tokenScopes?: string[];
  isSessionTrusted?: boolean;
}

