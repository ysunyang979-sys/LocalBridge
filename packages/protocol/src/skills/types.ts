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

export type SkillValidationStatus = "valid" | "invalid" | "conflict" | "warning" | "needs_setup";

export interface SkillCandidate {
  id: string;
  name: string;
  path: string;
  hasManifest: boolean;
  docPath?: string;
  qualityScore?: number;
  isValidCandidate?: boolean;
  qualityReasons?: string[];
  isRoot?: boolean;
}

export interface SkillI18nText {
  "zh-CN": string;
  "en-US": string;
  [lang: string]: string;
}

export type SkillType = "nexus" | "raw";

export interface SkillCollection {
  id: string;
  name: string;
  description?: string;
  source: SkillSource;
  skillsCount: number;
  enabledSkillsCount: number;
  skillIds: string[];
  importedAt?: string;
}

export interface SkillMatchInfo {
  skillId: string;
  name: string;
  confidence: number;
  reason: string;
  collectionId?: string;
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
  type?: SkillType;
  collectionId?: string;
  collectionName?: string;
  summary?: string;
  keywords?: string[];
  primaryDocument?: string;
  availableDocuments?: string[];
  documents?: string[];
  importedAt?: string;
  filesCount?: number;
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
  primarySkill?: SkillMatchInfo;
  relatedSkills?: SkillMatchInfo[];
  allMatches?: SkillMatchInfo[];
  skill?: SkillMetadata | null;
  matched?: boolean;
}

export interface SkillListFilter {
  projectId?: string;
  category?: string;
  source?: SkillSource;
  enabledOnly?: boolean;
  collectionId?: string;
  type?: SkillType;
}

export interface SkillListParams {
  projectId?: string;
  collectionId?: string;
  source?: SkillSource;
  enabledOnly?: boolean;
  type?: SkillType;
}

export interface SkillListResult {
  skills: SkillMetadata[];
  collection?: {
    id: string;
    name: string;
  };
  count?: number;
}

export interface SkillGetParams {
  skillId: string;
  projectId?: string;
  documentPath?: string;
}

export interface SkillGetResult {
  skill: SkillDefinition;
  id?: string;
  skillId?: string;
  name?: string | SkillI18nText;
  type?: SkillType;
  source?: SkillSource;
  collectionId?: string;
  collectionName?: string;
  enabled?: boolean;
  primaryDocument?: string;
  documentPath?: string;
  content?: string;
  availableDocuments?: string[];
  documents?: string[];
}

export interface SkillMatchParams {
  query: string;
  projectId?: string;
  collectionId?: string;
  layaRecommendation?: string;
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
  importMode?: "native" | "compatible" | "raw";
  skillType?: SkillType;
  primaryDocument?: string;
  availableDocuments?: string[];
  documents?: string[];
  filesCount?: number;
  detectedRoot?: string;
  manifestFound?: boolean;
  skillDocFound?: boolean;
  candidateSkills?: SkillCandidate[];
  excludedFilesCount?: number;
  archiveTotalExecutables?: number;
  candidateExecutablesCount?: number;
  manifestRoundTripValid?: boolean;
  rootQualityNotice?: string;
  candidateQualityScore?: number;
  candidateQualityReasons?: string[];
}

export interface SkillImportParams {
  sourceType: "folder" | "zip";
  sourcePath?: string;
  zipBase64?: string;
  target: "user" | "project";
  projectId?: string;
  projectRoot?: string;
  overwrite?: boolean;
  customYaml?: string;
  subPath?: string;
}

export interface SkillImportResult {
  success: boolean;
  skill?: SkillMetadata;
  skills?: SkillMetadata[];
  collection?: {
    id: string;
    name: string;
    count: number;
  };
  error?: string;
  code?: string;
  stage?: string;
  message?: string;
  details?: any;
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
