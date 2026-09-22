export type SkillSource = "builtin" | "user" | "project";

export type SkillRisk = "low" | "medium" | "high";

export type SkillCategory =
  | "inspection"
  | "debugging"
  | "testing"
  | "refactoring"
  | "review"
  | "runtime"
  | "maintenance"
  | "general";

export type SkillValidationStatus = "valid" | "invalid" | "conflict" | "warning";

export interface SkillI18nText {
  "zh-CN": string;
  "en-US": string;
  [lang: string]: string;
}

export interface SkillMetadata {
  id: string;
  version: string | number;
  name: SkillI18nText;
  description: SkillI18nText;
  category: SkillCategory;
  risk: SkillRisk;
  triggers: string[];
  tools: string[];
  workflow: string[];
  enabled: boolean;
  source: SkillSource;
  sourcePath: string;
  projectId?: string;
  validationStatus: SkillValidationStatus;
  validationErrors?: string[];
  securityWarning?: string;
}

export interface SkillDefinition extends SkillMetadata {
  instructions: string;
}

export interface SkillMatchResult {
  matchedSkill: SkillMetadata | null;
  confidence: number;
  reason: string;
  matchedTriggers?: string[];
  matchedIntent?: string;
}

export interface SkillListFilter {
  projectId?: string;
  category?: string;
  source?: SkillSource;
  enabledOnly?: boolean;
}

export interface SkillListParams {
  projectId?: string;
}

export interface SkillListResult {
  skills: SkillMetadata[];
}

export interface SkillGetParams {
  skillId: string;
  projectId?: string;
}

export interface SkillGetResult {
  skill: SkillDefinition;
}

export interface SkillMatchParams {
  query: string;
  projectId?: string;
}

export interface SkillImportPreview {
  valid: boolean;
  id: string;
  version: string | number;
  name: SkillI18nText;
  description: SkillI18nText;
  category: SkillCategory;
  risk: SkillRisk;
  toolsCount: number;
  workflowStepsCount: number;
  tools: string[];
  workflow: string[];
  triggers: string[];
  validationStatus: SkillValidationStatus;
  validationErrors: string[];
  securityWarning?: string;
  hasConflict: boolean;
  existingVersion?: string | number;
  existingSource?: SkillSource;
  isBuiltinConflict: boolean;
  executableFilesFound?: string[];
  rawYaml?: string;
  markdownContent?: string;
}

export interface SkillImportParams {
  sourceType: "folder" | "zip";
  sourcePath?: string;
  zipBase64?: string;
  target: "user" | "project";
  projectId?: string;
  overwrite?: boolean;
}

export interface SkillImportResult {
  success: boolean;
  skill?: SkillMetadata;
  error?: string;
  validationErrors?: string[];
}

export interface SkillDeleteResult {
  success: boolean;
  skillId: string;
  removedPath?: string;
  error?: string;
}

export interface SkillRawContentResult {
  skillId: string;
  rawYaml: string;
  markdownContent: string;
}
