import { z } from "zod";

export const ProjectSchema = z.object({
  id: z.string(),
  name: z.string(),
  root: z.string(),
  enabled: z.boolean().default(true),
  createdAt: z.number(),
  updatedAt: z.number(),
});
export type Project = z.infer<typeof ProjectSchema>;

/**
 * Public project representation visible to AI clients.
 * Absolute root path is strictly redacted.
 */
export const ProjectPublicSchema = z.object({
  id: z.string(),
  name: z.string(),
  enabled: z.boolean(),
  gitBranch: z.string().optional(),
  gitClean: z.boolean().optional(),
});
export type ProjectPublic = z.infer<typeof ProjectPublicSchema>;
