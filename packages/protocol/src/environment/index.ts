import { z } from "zod";

export const ToolCategorySchema = z.enum([
  "javascript",
  "python",
  "jvm",
  "go",
  "rust",
  "php",
  "ruby",
  "dotnet",
  "cpp",
  "shell",
  "container",
  "vcs",
]);
export type ToolCategory = z.infer<typeof ToolCategorySchema>;

export const DetectedToolSchema = z.object({
  tool: z.string(),
  category: ToolCategorySchema,
  installed: z.boolean(),
  version: z.string().nullable().optional(),
  path: z.string().nullable().optional(),
  details: z.record(z.any()).optional(),
});
export type DetectedTool = z.infer<typeof DetectedToolSchema>;

export const EnvironmentDetectParamsSchema = z
  .object({
    tools: z.array(z.string()).optional(),
  })
  .strict();
export type EnvironmentDetectParams = z.infer<typeof EnvironmentDetectParamsSchema>;

export const EnvironmentDetectResultSchema = z.object({
  platform: z.string(),
  arch: z.string(),
  tools: z.array(DetectedToolSchema),
});
export type EnvironmentDetectResult = z.infer<typeof EnvironmentDetectResultSchema>;

export const RecommendedCommandSchema = z.object({
  name: z.string(),
  command: z.string(),
  args: z.array(z.string()),
  category: z.string(),
  description: z.string().optional(),
});
export type RecommendedCommand = z.infer<typeof RecommendedCommandSchema>;

export const ProjectDetectParamsSchema = z
  .object({
    projectId: z.string().min(1, "projectId is required"),
    relativeCwd: z.string().optional(),
  })
  .strict();
export type ProjectDetectParams = z.infer<typeof ProjectDetectParamsSchema>;

export const ProjectDetectResultSchema = z.object({
  projectId: z.string(),
  projectType: z.string(),
  detectedRuntimes: z.array(z.string()),
  configFiles: z.array(z.string()),
  recommendedCommands: z.array(RecommendedCommandSchema),
  scripts: z.record(z.string()).optional(),
});
export type ProjectDetectResult = z.infer<typeof ProjectDetectResultSchema>;
