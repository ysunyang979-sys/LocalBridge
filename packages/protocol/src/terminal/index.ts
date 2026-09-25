import { z } from "zod";

export const TerminalStateSchema = z.enum(["running", "idle", "stopped"]);
export type TerminalState = z.infer<typeof TerminalStateSchema>;

export const TerminalSummarySchema = z.object({
  terminalSessionId: z.string(),
  projectId: z.string(),
  sessionId: z.string().optional(),
  agentTaskId: z.string().optional(),
  shell: z.string(),
  cols: z.number().int().positive(),
  rows: z.number().int().positive(),
  state: TerminalStateSchema,
  pid: z.number().int().positive().optional(),
  uptimeSeconds: z.number(),
  createdAt: numberOrString(),
  lastActivityAt: numberOrString(),
  exitCode: z.number().nullable().optional(),
});
export type TerminalSummary = z.infer<typeof TerminalSummarySchema>;

function numberOrString() {
  return z.union([z.number(), z.string()]);
}

// 1. Terminal Start
export const TerminalStartParamsSchema = z.object({
  projectId: z.string(),
  sessionId: z.string().optional(),
  agentTaskId: z.string().optional(),
  shell: z.string().optional(),
  cols: z.number().int().min(20).max(500).default(80),
  rows: z.number().int().min(5).max(200).default(24),
  cwd: z.string().optional(),
  env: z.record(z.string()).optional(),
});
export type TerminalStartParams = z.infer<typeof TerminalStartParamsSchema>;

export const TerminalStartResultSchema = z.object({
  terminalSessionId: z.string(),
  projectId: z.string(),
  sessionId: z.string().optional(),
  agentTaskId: z.string().optional(),
  shell: z.string(),
  pid: z.number().int().positive(),
  cols: z.number().int(),
  rows: z.number().int(),
  state: TerminalStateSchema,
  createdAt: z.number(),
});
export type TerminalStartResult = z.infer<typeof TerminalStartResultSchema>;

// 2. Terminal Write
export const TerminalWriteParamsSchema = z.object({
  terminalSessionId: z.string(),
  input: z.string(),
  execute: z.boolean().default(false),
  approvalId: z.string().optional(),
});
export type TerminalWriteParams = z.infer<typeof TerminalWriteParamsSchema>;

export const TerminalWriteResultSchema = z.object({
  terminalSessionId: z.string(),
  bytesWritten: z.number(),
  riskLevel: z.enum(["SAFE", "CAUTION", "DANGEROUS"]),
  state: TerminalStateSchema,
  executedCommand: z.string().optional(),
  requiresApproval: z.boolean().optional(),
  approvalId: z.string().optional(),
  message: z.string().optional(),
});
export type TerminalWriteResult = z.infer<typeof TerminalWriteResultSchema>;

// 3. Terminal Read
export const TerminalReadParamsSchema = z.object({
  terminalSessionId: z.string(),
  offset: z.number().int().min(0).default(0),
  maxBytes: z.number().int().min(1).max(1048576).default(65536),
});
export type TerminalReadParams = z.infer<typeof TerminalReadParamsSchema>;

export const TerminalReadResultSchema = z.object({
  terminalSessionId: z.string(),
  output: z.string(),
  nextOffset: z.number().int(),
  bytesRead: z.number().int(),
  isFinished: z.boolean(),
  exitCode: z.number().nullable().optional(),
  state: TerminalStateSchema,
});
export type TerminalReadResult = z.infer<typeof TerminalReadResultSchema>;

// 4. Terminal Resize
export const TerminalResizeParamsSchema = z.object({
  terminalSessionId: z.string(),
  cols: z.number().int().min(20).max(500),
  rows: z.number().int().min(5).max(200),
});
export type TerminalResizeParams = z.infer<typeof TerminalResizeParamsSchema>;

export const TerminalResizeResultSchema = z.object({
  terminalSessionId: z.string(),
  cols: z.number().int(),
  rows: z.number().int(),
  success: z.boolean(),
});
export type TerminalResizeResult = z.infer<typeof TerminalResizeResultSchema>;

// 5. Terminal Status
export const TerminalStatusParamsSchema = z.object({
  terminalSessionId: z.string(),
});
export type TerminalStatusParams = z.infer<typeof TerminalStatusParamsSchema>;

export const TerminalStatusResultSchema = z.object({
  terminalSessionId: z.string(),
  projectId: z.string(),
  sessionId: z.string().optional(),
  agentTaskId: z.string().optional(),
  shell: z.string(),
  cols: z.number().int(),
  rows: z.number().int(),
  state: TerminalStateSchema,
  pid: z.number().int().positive().optional(),
  uptimeSeconds: z.number(),
  createdAt: z.number(),
  lastActivityAt: z.number(),
  exitCode: z.number().nullable().optional(),
  bufferSize: z.number().int(),
});
export type TerminalStatusResult = z.infer<typeof TerminalStatusResultSchema>;

// 6. Terminal Stop
export const TerminalStopParamsSchema = z.object({
  terminalSessionId: z.string(),
  force: z.boolean().default(false),
  reason: z.string().optional(),
});
export type TerminalStopParams = z.infer<typeof TerminalStopParamsSchema>;

export const TerminalStopResultSchema = z.object({
  terminalSessionId: z.string(),
  state: z.literal("stopped"),
  stoppedAt: z.number(),
  exitCode: z.number().nullable().optional(),
});
export type TerminalStopResult = z.infer<typeof TerminalStopResultSchema>;

// 7. Terminal List
export const TerminalListParamsSchema = z.object({
  projectId: z.string().optional(),
  state: TerminalStateSchema.optional(),
});
export type TerminalListParams = z.infer<typeof TerminalListParamsSchema>;

export const TerminalListResultSchema = z.object({
  terminals: z.array(TerminalSummarySchema),
  total: z.number().int(),
});
export type TerminalListResult = z.infer<typeof TerminalListResultSchema>;
