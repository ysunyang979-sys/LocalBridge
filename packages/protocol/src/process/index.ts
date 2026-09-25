import { z } from "zod";

export const ProcessOwnershipGradeSchema = z.enum([
  "OWNED",
  "VERIFIED_DERIVED",
  "PROBABLE",
  "UNOWNED",
  "SYSTEM",
  "FOREIGN",
]);
export type ProcessOwnershipGrade = z.infer<typeof ProcessOwnershipGradeSchema>;

export const ProcessSummarySchema = z.object({
  pid: z.number().int().positive(),
  ppid: z.number().int().nonnegative().optional(),
  name: z.string(),
  commandLine: z.string().optional(),
  executablePath: z.string().optional(),
  cwd: z.string().optional(),
  memoryBytes: z.number().int().nonnegative().optional(),
  cpuTimeMs: z.number().int().nonnegative().optional(),
  state: z.string(),
  ownership: ProcessOwnershipGradeSchema,
  score: z.number().int().nonnegative(),
  projectId: z.string().optional(),
  sessionId: z.string().optional(),
  agentTaskId: z.string().optional(),
  runtimeId: z.string().optional(),
  terminalSessionId: z.string().optional(),
  ports: z.array(z.number().int().positive()).default([]),
  startTime: z.string().optional(),
});
export type ProcessSummary = z.infer<typeof ProcessSummarySchema>;

// 1. Process List
export const ProcessListParamsSchema = z.object({
  projectId: z.string().optional(),
  ownership: z.union([ProcessOwnershipGradeSchema, z.literal("ALL")]).optional(),
});
export type ProcessListParams = z.infer<typeof ProcessListParamsSchema>;

export const ProcessListResultSchema = z.object({
  processes: z.array(ProcessSummarySchema),
  total: z.number().int(),
});
export type ProcessListResult = z.infer<typeof ProcessListResultSchema>;

// 2. Process Status
export const ProcessStatusParamsSchema = z.object({
  pid: z.number().int().positive(),
});
export type ProcessStatusParams = z.infer<typeof ProcessStatusParamsSchema>;

export const ProcessStatusResultSchema = ProcessSummarySchema.extend({
  children: z.array(z.number().int().positive()).optional(),
  isSystemProtected: z.boolean(),
  killable: z.boolean(),
  ownershipReasons: z.array(z.string()).default([]),
});
export type ProcessStatusResult = z.infer<typeof ProcessStatusResultSchema>;

// 3. Process Kill
export const ProcessKillParamsSchema = z.object({
  pid: z.number().int().positive(),
  force: z.boolean().default(false),
  signal: z.string().optional(),
  approvalId: z.string().optional(),
});
export type ProcessKillParams = z.infer<typeof ProcessKillParamsSchema>;

export const ProcessKillResultSchema = z.object({
  pid: z.number().int().positive(),
  killed: z.boolean(),
  ownership: ProcessOwnershipGradeSchema,
  message: z.string(),
  exitVerified: z.boolean(),
});
export type ProcessKillResult = z.infer<typeof ProcessKillResultSchema>;

// 4. Process Tree
export const ProcessTreeParamsSchema = z.object({
  pid: z.number().int().positive().optional(),
  projectId: z.string().optional(),
  terminalSessionId: z.string().optional(),
  runtimeId: z.string().optional(),
});
export type ProcessTreeParams = z.infer<typeof ProcessTreeParamsSchema>;

export type ProcessTreeNode = ProcessSummary & {
  children: ProcessTreeNode[];
};

export const ProcessTreeNodeSchema: z.ZodType<ProcessTreeNode, z.ZodTypeDef, any> = ProcessSummarySchema.extend({
  children: z.lazy(() => z.array(ProcessTreeNodeSchema)),
}) as any;


export const ProcessTreeResultSchema = z.object({
  roots: z.array(ProcessTreeNodeSchema),
  totalProcesses: z.number().int(),
});
export type ProcessTreeResult = z.infer<typeof ProcessTreeResultSchema>;
