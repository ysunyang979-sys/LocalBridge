import { z } from "zod";

export const AgentTaskStateSchema = z.enum([
  "queued",
  "planning",
  "running",
  "waiting",
  "paused",
  "completed",
  "failed",
  "cancelled",
  "timed_out",
  "resource_limited",
]);
export type AgentTaskState = z.infer<typeof AgentTaskStateSchema>;

export const AgentResourcePolicySchema = z.object({
  maxWallTimeMs: z.number().int().positive().default(7200000), // 2 hours
  maxIterations: z.number().int().positive().default(100),
  maxCpuTimeMs: z.number().int().positive().optional(),
  maxMemoryBytes: z.number().int().positive().default(4294967296), // 4 GB
  maxDiskWriteBytes: z.number().int().positive().default(5368709120), // 5 GB
  maxOutputBytes: z.number().int().positive().default(104857600), // 100 MB
  maxTerminalSessions: z.number().int().positive().default(4),
  maxRuntimes: z.number().int().positive().default(8),
  maxProcesses: z.number().int().positive().default(64),
  maxConcurrentActions: z.number().int().positive().default(5),
  maxSameActionRepeats: z.number().int().positive().default(3),
  maxFailures: z.number().int().positive().default(10),
  maxActions: z.number().int().positive().default(500),
});
export type AgentResourcePolicy = z.infer<typeof AgentResourcePolicySchema>;

export const AgentResourceUsageSchema = z.object({
  wallTimeMs: z.number().nonnegative().default(0),
  cpuTimeMs: z.number().nonnegative().default(0),
  memoryBytes: z.number().nonnegative().default(0),
  diskWriteBytes: z.number().nonnegative().default(0),
  outputBytes: z.number().nonnegative().default(0),
  activeTerminalSessions: z.number().nonnegative().default(0),
  activeRuntimes: z.number().nonnegative().default(0),
  activeProcesses: z.number().nonnegative().default(0),
  actionsExecuted: z.number().nonnegative().default(0),
  iterations: z.number().nonnegative().default(0),
  failures: z.number().nonnegative().default(0),
});
export type AgentResourceUsage = z.infer<typeof AgentResourceUsageSchema>;

export const AgentCheckpointSchema = z.object({
  schemaVersion: z.literal(1),
  checkpointId: z.string(),
  agentTaskId: z.string(),
  iteration: z.number().int().nonnegative(),
  phase: z.enum(["observe", "plan", "execute", "evaluate"]),
  goal: z.string(),
  observations: z.array(z.any()).default([]),
  actions: z.array(z.any()).default([]),
  activeRuntimeIds: z.array(z.string()).default([]),
  activeTerminalSessionIds: z.array(z.string()).default([]),
  activeProcessIds: z.array(z.number().int().positive()).default([]),
  modifiedFiles: z.array(z.string()).default([]),
  lastCommand: z.string().optional(),
  lastOutputSequence: z.number().optional(),
  nextAction: z.string().optional(),
  timestamp: z.string(),
});
export type AgentCheckpoint = z.infer<typeof AgentCheckpointSchema>;

export const AgentTaskLogTypeSchema = z.enum([
  "system",
  "observation",
  "plan",
  "action",
  "command",
  "terminal",
  "process",
  "port",
  "approval",
  "error",
  "checkpoint",
  "resource",
]);
export type AgentTaskLogType = z.infer<typeof AgentTaskLogTypeSchema>;

export const AgentTaskLogEntrySchema = z.object({
  id: z.string(),
  agentTaskId: z.string(),
  sequence: z.number().int().nonnegative(),
  logType: AgentTaskLogTypeSchema,
  level: z.enum(["info", "warn", "error", "debug"]),
  message: z.string(),
  data: z.record(z.any()).optional(),
  timestamp: z.number(),
});
export type AgentTaskLogEntry = z.infer<typeof AgentTaskLogEntrySchema>;

export const AgentTaskSummarySchema = z.object({
  agentTaskId: z.string(),
  projectId: z.string(),
  sessionId: z.string().optional(),
  title: z.string(),
  goal: z.string(),
  state: AgentTaskStateSchema,
  iteration: z.number().int(),
  actionCount: z.number().int(),
  failureCount: z.number().int(),
  waitingForApproval: z.boolean(),
  createdAt: z.number(),
  startedAt: z.number().nullable().optional(),
  deadlineAt: z.number(),
  finishedAt: z.number().nullable().optional(),
});
export type AgentTaskSummary = z.infer<typeof AgentTaskSummarySchema>;

// 1. Agent Task Create
export const AgentTaskCreateParamsSchema = z.object({
  projectId: z.string(),
  sessionId: z.string().optional(),
  title: z.string().min(1).max(200),
  goal: z.string().min(1),
  resourcePolicy: AgentResourcePolicySchema.partial().optional(),
});
export type AgentTaskCreateParams = z.infer<typeof AgentTaskCreateParamsSchema>;

export const AgentTaskCreateResultSchema = z.object({
  agentTaskId: z.string(),
  projectId: z.string(),
  sessionId: z.string().optional(),
  title: z.string(),
  goal: z.string(),
  state: AgentTaskStateSchema,
  deadlineAt: z.number(),
  resourcePolicy: AgentResourcePolicySchema,
  createdAt: z.number(),
});
export type AgentTaskCreateResult = z.infer<typeof AgentTaskCreateResultSchema>;

// 2. Agent Task Status
export const AgentTaskStatusParamsSchema = z.object({
  agentTaskId: z.string(),
});
export type AgentTaskStatusParams = z.infer<typeof AgentTaskStatusParamsSchema>;

export const AgentTaskStatusResultSchema = AgentTaskSummarySchema.extend({
  resourcePolicy: AgentResourcePolicySchema,
  resourceUsage: AgentResourceUsageSchema,
  pendingApprovalId: z.string().nullable().optional(),
  lastFailureFingerprint: z.string().nullable().optional(),
  sameActionRepeats: z.number().int(),
  latestCheckpoint: AgentCheckpointSchema.nullable().optional(),
});
export type AgentTaskStatusResult = z.infer<typeof AgentTaskStatusResultSchema>;

// 3. Agent Task Logs
export const AgentTaskLogsParamsSchema = z.object({
  agentTaskId: z.string(),
  fromSequence: z.number().int().min(0).default(0),
  limit: z.number().int().min(1).max(1000).default(100),
  logType: AgentTaskLogTypeSchema.optional(),
});
export type AgentTaskLogsParams = z.infer<typeof AgentTaskLogsParamsSchema>;

export const AgentTaskLogsResultSchema = z.object({
  agentTaskId: z.string(),
  logs: z.array(AgentTaskLogEntrySchema),
  latestSequence: z.number().int(),
  hasMore: z.boolean(),
});
export type AgentTaskLogsResult = z.infer<typeof AgentTaskLogsResultSchema>;

// 4. Agent Task Cancel
export const AgentTaskCancelParamsSchema = z.object({
  agentTaskId: z.string(),
  reason: z.string().optional(),
});
export type AgentTaskCancelParams = z.infer<typeof AgentTaskCancelParamsSchema>;

export const AgentTaskCancelResultSchema = z.object({
  agentTaskId: z.string(),
  state: z.literal("cancelled"),
  cancelledAt: z.number(),
  reason: z.string().optional(),
});
export type AgentTaskCancelResult = z.infer<typeof AgentTaskCancelResultSchema>;

// 5. Agent Task Pause
export const AgentTaskPauseParamsSchema = z.object({
  agentTaskId: z.string(),
  reason: z.string().optional(),
});
export type AgentTaskPauseParams = z.infer<typeof AgentTaskPauseParamsSchema>;

export const AgentTaskPauseResultSchema = z.object({
  agentTaskId: z.string(),
  state: z.literal("paused"),
  pausedAt: z.number(),
  reason: z.string().optional(),
});
export type AgentTaskPauseResult = z.infer<typeof AgentTaskPauseResultSchema>;

// 6. Agent Task Resume
export const AgentTaskResumeParamsSchema = z.object({
  agentTaskId: z.string(),
});
export type AgentTaskResumeParams = z.infer<typeof AgentTaskResumeParamsSchema>;

export const AgentTaskResumeResultSchema = z.object({
  agentTaskId: z.string(),
  state: z.literal("running"),
  resumedAt: z.number(),
  reconciledActualState: z.record(z.any()).optional(),
});
export type AgentTaskResumeResult = z.infer<typeof AgentTaskResumeResultSchema>;

// 7. Agent Task List
export const AgentTaskListParamsSchema = z.object({
  projectId: z.string().optional(),
  state: AgentTaskStateSchema.optional(),
});
export type AgentTaskListParams = z.infer<typeof AgentTaskListParamsSchema>;

export const AgentTaskListResultSchema = z.object({
  tasks: z.array(AgentTaskSummarySchema),
  total: z.number().int(),
});
export type AgentTaskListResult = z.infer<typeof AgentTaskListResultSchema>;

// 8. Agent Task Approve
export const AgentTaskApproveParamsSchema = z.object({
  agentTaskId: z.string(),
  approvalId: z.string(),
  action: z.enum(["approve", "reject"]),
  reason: z.string().optional(),
});
export type AgentTaskApproveParams = z.infer<typeof AgentTaskApproveParamsSchema>;

export const AgentTaskApproveResultSchema = z.object({
  agentTaskId: z.string(),
  approvalId: z.string(),
  action: z.enum(["approve", "reject"]),
  state: AgentTaskStateSchema,
  message: z.string(),
});
export type AgentTaskApproveResult = z.infer<typeof AgentTaskApproveResultSchema>;
