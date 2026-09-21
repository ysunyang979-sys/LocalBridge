import { z } from "zod";

export type FullControlScope = "current-project" | "device";

export const FullControlScopeSchema = z.enum(["current-project", "device"]);

export const FullControlSessionSchema = z.object({
  id: z.string(),
  clientId: z.string(),
  clientName: z.string().optional(),
  scope: FullControlScopeSchema,
  projectId: z.string().optional(),
  projectName: z.string().optional(),
  startedAt: z.number(),
  expiresAt: z.number(),
  reason: z.string().optional(),
  operatorConfirmedAt: z.number(),
  active: z.boolean(),
});
export type FullControlSession = z.infer<typeof FullControlSessionSchema>;

export const StartFullControlParamsSchema = z.object({
  clientId: z.string().min(1),
  scope: FullControlScopeSchema,
  projectId: z.string().optional(),
  durationMinutes: z.number().int().min(0).max(1440).default(30),
  reason: z.string().optional(),
  confirmedDeviceFullControl: z.boolean().optional(),
});
export type StartFullControlParams = z.infer<typeof StartFullControlParamsSchema>;

export const StopFullControlParamsSchema = z.object({
  sessionId: z.string().optional(),
  clientId: z.string().optional(),
});
export type StopFullControlParams = z.infer<typeof StopFullControlParamsSchema>;

export const FullControlStatusDtoSchema = z.object({
  enabled: z.boolean(),
  activeSession: FullControlSessionSchema.nullable(),
  allSessions: z.array(FullControlSessionSchema),
  isPaused: z.boolean().optional(),
});
export type FullControlStatusDto = z.infer<typeof FullControlStatusDtoSchema>;

// Universal FileSystem Schemas
export const FsDeleteParamsSchema = z.object({
  projectId: z.string().optional(),
  path: z.string().min(1),
  recursive: z.boolean().default(false),
  force: z.boolean().default(false),
  expectedHash: z.string().optional(),
  workspaceId: z.string().optional(),
  approvalId: z.string().optional(),
  sessionId: z.string().optional(),
});
export type FsDeleteParams = z.infer<typeof FsDeleteParamsSchema>;

export const FsDeleteFailedItemSchema = z.object({
  path: z.string(),
  reason: z.string(),
});
export type FsDeleteFailedItem = z.infer<typeof FsDeleteFailedItemSchema>;

export const FsDeleteResultSchema = z.object({
  success: z.boolean(),
  affectedPaths: z.array(z.string()),
  filesAffected: z.number(),
  directoriesAffected: z.number(),
  bytesAffected: z.number(),
  partialSuccess: z.boolean().optional(),
  failed: z.array(FsDeleteFailedItemSchema).optional(),
  operationId: z.string().optional(),
  backupCreated: z.boolean().optional(),
  message: z.string().optional(),
});
export type FsDeleteResult = z.infer<typeof FsDeleteResultSchema>;

export const FsMoveParamsSchema = z.object({
  projectId: z.string().optional(),
  sourcePath: z.string().min(1),
  targetPath: z.string().min(1),
  overwrite: z.boolean().default(false),
  approvalId: z.string().optional(),
  sessionId: z.string().optional(),
});
export type FsMoveParams = z.infer<typeof FsMoveParamsSchema>;

export const FsMoveResultSchema = z.object({
  success: z.boolean(),
  sourcePath: z.string(),
  targetPath: z.string(),
  filesAffected: z.number(),
  directoriesAffected: z.number(),
});
export type FsMoveResult = z.infer<typeof FsMoveResultSchema>;

export const FsCopyParamsSchema = z.object({
  projectId: z.string().optional(),
  sourcePath: z.string().min(1),
  targetPath: z.string().min(1),
  recursive: z.boolean().default(true),
  overwrite: z.boolean().default(false),
  approvalId: z.string().optional(),
  sessionId: z.string().optional(),
});
export type FsCopyParams = z.infer<typeof FsCopyParamsSchema>;

export const FsCopyResultSchema = z.object({
  success: z.boolean(),
  sourcePath: z.string(),
  targetPath: z.string(),
  filesAffected: z.number(),
  directoriesAffected: z.number(),
  bytesAffected: z.number(),
});
export type FsCopyResult = z.infer<typeof FsCopyResultSchema>;

export const FsMkdirParamsSchema = z.object({
  projectId: z.string().optional(),
  path: z.string().min(1),
  recursive: z.boolean().default(true),
  approvalId: z.string().optional(),
  sessionId: z.string().optional(),
});
export type FsMkdirParams = z.infer<typeof FsMkdirParamsSchema>;

export const FsMkdirResultSchema = z.object({
  success: z.boolean(),
  path: z.string(),
  created: z.boolean(),
});
export type FsMkdirResult = z.infer<typeof FsMkdirResultSchema>;
