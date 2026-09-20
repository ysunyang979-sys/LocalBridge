import { z } from "zod";

export const RuntimeStateSchema = z.enum([
  "starting",
  "running",
  "stopping",
  "stopped",
  "failed",
  "interrupted",
]);

export const RuntimeLaunchSpecPackageScriptSchema = z
  .object({
    kind: z.literal("package-script"),
    manager: z.enum(["npm", "pnpm", "yarn", "bun"]),
    script: z.string().min(1, "script name is required"),
    args: z.array(z.string()).optional(),
    relativeCwd: z.string().optional(),
    name: z.string().max(100).optional(),
    approvalId: z.string().optional(),
  })
  .strict();

export const RuntimeLaunchSpecRegisteredCommandSchema = z
  .object({
    kind: z.literal("registered-command"),
    tool: z.enum(["node", "npm", "pnpm", "python"]),
    args: z.array(z.string()),
    relativeCwd: z.string().optional(),
    name: z.string().max(100).optional(),
    approvalId: z.string().optional(),
  })
  .strict();

export const RuntimeLaunchSpecSchema = z.discriminatedUnion("kind", [
  RuntimeLaunchSpecPackageScriptSchema,
  RuntimeLaunchSpecRegisteredCommandSchema,
]);

export const RuntimeSummarySchema = z
  .object({
    runtimeId: z.string(),
    name: z.string().optional(),
    state: RuntimeStateSchema,
    processState: RuntimeStateSchema.optional(),
    listeningPorts: z.array(z.number()).optional(),
    generation: z.number(),
    projectId: z.string(),
    sessionId: z.string().optional(),
    worktreeId: z.string().optional(),
    kind: z.enum(["package-script", "registered-command"]),
    commandCategory: z.string(),
    workspaceMode: z.enum(["direct", "managed-worktree"]),
    startedAt: z.number().nullable().optional(),
    stoppedAt: z.number().nullable().optional(),
    uptimeMs: z.number().optional(),
    pid: z.number().nullable().optional(),
    exitCode: z.number().nullable().optional(),
    signal: z.string().nullable().optional(),
    restartCount: z.number(),
    lastErrorCode: z.string().nullable().optional(),
    lastError: z.string().nullable().optional(),
    outputTruncated: z.boolean().optional(),
    createdAt: z.number(),
    updatedAt: z.number(),
  })
  .passthrough();

// 1. localbridge_runtime_start
export const RuntimeStartParamsSchema = z
  .object({
    projectId: z.string().min(1, "projectId is required"),
    sessionId: z.string().optional(),
    launch: RuntimeLaunchSpecSchema,
    name: z.string().max(100).optional(),
    approvalId: z.string().optional(),
  })
  .strict();

export const RuntimeStartResultSchema = z
  .object({
    runtimeId: z.string(),
    name: z.string().optional(),
    state: RuntimeStateSchema,
    generation: z.number(),
    createdAt: z.number(),
    workspaceMode: z.enum(["direct", "managed-worktree"]),
    worktreeId: z.string().optional(),
  })
  .passthrough();

// 2. localbridge_runtime_list
export const RuntimeListParamsSchema = z
  .object({
    projectId: z.string().optional(),
    sessionId: z.string().optional(),
    worktreeId: z.string().optional(),
    state: RuntimeStateSchema.optional(),
    limit: z.number().int().min(1).max(100).default(50).optional(),
    cursor: z.string().optional(),
  })
  .strict();

export const RuntimeListResultSchema = z
  .object({
    runtimes: z.array(RuntimeSummarySchema),
    total: z.number(),
    nextCursor: z.string().optional(),
    hasMore: z.boolean().optional(),
  })
  .passthrough();

// 3. localbridge_runtime_status
export const RuntimeStatusParamsSchema = z
  .object({
    runtimeId: z.string().min(1, "runtimeId is required"),
  })
  .strict();

export const RuntimeStatusResultSchema = RuntimeSummarySchema;

// 4. localbridge_runtime_logs
export const RuntimeLogChunkSchema = z.object({
  seq: z.number(),
  stream: z.enum(["stdout", "stderr"]),
  timestamp: z.number(),
  text: z.string(),
  generation: z.number().optional(),
});

export const RuntimeLogsParamsSchema = z
  .object({
    runtimeId: z.string().min(1, "runtimeId is required"),
    generation: z.number().int().min(1).optional(),
    afterSequence: z.number().int().min(0).optional(),
    limit: z.number().int().min(1).max(500).default(100).optional(),
  })
  .strict();

export const RuntimeLogsResultSchema = z
  .object({
    runtimeId: z.string(),
    generation: z.number(),
    entries: z.array(RuntimeLogChunkSchema),
    nextSequence: z.number(),
    hasMore: z.boolean(),
    outputTruncated: z.boolean(),
  })
  .passthrough();

// 5. localbridge_runtime_restart
export const RuntimeRestartParamsSchema = z
  .object({
    runtimeId: z.string().min(1, "runtimeId is required"),
    approvalId: z.string().optional(),
  })
  .strict();

export const RuntimeRestartResultSchema = z
  .object({
    runtimeId: z.string(),
    state: RuntimeStateSchema,
    generation: z.number(),
    restartedAt: z.number(),
    pid: z.number().optional(),
  })
  .passthrough();

// 6. localbridge_runtime_stop
export const RuntimeStopParamsSchema = z
  .object({
    runtimeId: z.string().min(1, "runtimeId is required"),
    gracePeriodMs: z.number().int().min(100).max(10000).optional(),
  })
  .strict();

export const RuntimeStopResultSchema = z
  .object({
    runtimeId: z.string(),
    state: RuntimeStateSchema,
    stopped: z.boolean(),
    stoppedAt: z.number(),
  })
  .passthrough();
