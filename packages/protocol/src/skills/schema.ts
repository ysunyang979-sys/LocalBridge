import { z } from "zod";

export const SKILL_ID_REGEX = /^[a-z0-9][a-z0-9._-]{1,62}[a-z0-9]$/;

export const SkillIdSchema = z
  .string()
  .min(3, "Skill ID must be at least 3 characters")
  .max(64, "Skill ID cannot exceed 64 characters")
  .regex(
    SKILL_ID_REGEX,
    "Skill ID must contain only lowercase alphanumeric characters, dots, hyphens, and underscores, and cannot start or end with a special character"
  )
  .refine(
    (id) => !id.includes("..") && !id.includes("/") && !id.includes("\\"),
    "Skill ID cannot contain directory traversal characters or slashes"
  )
  .refine(
    (id) => !/[;&|`$><]/.test(id),
    "Skill ID cannot contain shell special characters"
  );

export const SkillI18nTextSchema = z
  .object({
    "zh-CN": z.string().min(1, "zh-CN text is required"),
    "en-US": z.string().min(1, "en-US text is required"),
  })
  .catchall(z.string());

export const SkillYamlSchema = z.object({
  id: SkillIdSchema,
  version: z.union([z.string(), z.number()]),
  name: SkillI18nTextSchema,
  description: SkillI18nTextSchema,
  category: z.enum([
    "inspection",
    "debugging",
    "testing",
    "refactoring",
    "review",
    "runtime",
    "maintenance",
    "general",
  ]),
  risk: z.enum(["low", "medium", "high"]),
  triggers: z.array(z.string().min(1)).min(1, "At least one trigger keyword is required"),
  tools: z.array(z.string().min(1)).min(1, "At least one tool must be declared"),
  workflow: z.array(z.string().min(1)).min(1, "At least one workflow step is required"),
  enabled: z.boolean().default(true),
});

export type SkillYamlInput = z.infer<typeof SkillYamlSchema>;

export const SkillListParamsSchema = z.object({
  projectId: z.string().optional(),
  collectionId: z.string().optional(),
  source: z.enum(["builtin", "user", "project"]).optional(),
  enabledOnly: z.boolean().optional(),
  type: z.enum(["nexus", "raw"]).optional(),
});

export const SkillGetParamsSchema = z.object({
  skillId: z.string().min(1, "skillId is required"),
  projectId: z.string().optional(),
  documentPath: z.string().optional(),
});

export const SkillMatchParamsSchema = z.object({
  query: z.string().min(1, "query is required"),
  projectId: z.string().optional(),
  collectionId: z.string().optional(),
  layaRecommendation: z.string().optional(),
});
