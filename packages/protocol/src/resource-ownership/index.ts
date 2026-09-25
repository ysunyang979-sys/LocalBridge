import { z } from "zod";

export const ResourceTypeSchema = z.enum([
  "terminal",
  "runtime",
  "job",
  "process",
  "port",
]);
export type ResourceType = z.infer<typeof ResourceTypeSchema>;

export const ResourceOwnershipSchema = z.object({
  resourceId: z.string(),
  resourceType: ResourceTypeSchema,
  projectId: z.string(),
  sessionId: z.string().optional(),
  agentTaskId: z.string().optional(),
  terminalSessionId: z.string().optional(),
  runtimeId: z.string().optional(),
  jobId: z.string().optional(),
  parentResourceId: z.string().optional(),
  createdBy: z.literal("nexus"),
  createdAt: z.string(),
  processStartTime: z.string().optional(),
  pid: z.number().int().positive().optional(),
  parentPid: z.number().int().positive().optional(),
});
export type ResourceOwnership = z.infer<typeof ResourceOwnershipSchema>;
