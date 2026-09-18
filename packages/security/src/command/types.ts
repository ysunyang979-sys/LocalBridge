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
}

export interface CommandExecutionPolicyDecision {
  allowed: boolean;
  reason?: string;
  requiredAccessMode?: "read-write";
}
