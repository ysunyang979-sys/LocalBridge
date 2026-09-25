import { z } from "zod";
import { ProcessOwnershipGradeSchema } from "../process/index.js";

export const PortSummarySchema = z.object({
  port: z.number().int().min(1).max(65535),
  protocol: z.enum(["TCP", "UDP"]),
  address: z.string(),
  state: z.string(),
  pid: z.number().int().positive().nullable(),
  processName: z.string().nullable().optional(),
  commandLine: z.string().nullable().optional(),
  projectId: z.string().nullable().optional(),
  runtimeId: z.string().nullable().optional(),
  agentTaskId: z.string().nullable().optional(),
  terminalSessionId: z.string().nullable().optional(),
  ownership: ProcessOwnershipGradeSchema,
});
export type PortSummary = z.infer<typeof PortSummarySchema>;

// 1. Port List
export const PortListParamsSchema = z.object({
  projectId: z.string().optional(),
  port: z.number().int().min(1).max(65535).optional(),
  ownership: z.union([ProcessOwnershipGradeSchema, z.literal("ALL")]).optional(),
});
export type PortListParams = z.infer<typeof PortListParamsSchema>;

export const PortListResultSchema = z.object({
  ports: z.array(PortSummarySchema),
  total: z.number().int(),
});
export type PortListResult = z.infer<typeof PortListResultSchema>;

// 2. Port Kill
export const PortKillParamsSchema = z.object({
  port: z.number().int().min(1).max(65535),
  force: z.boolean().default(false),
  approvalId: z.string().optional(),
});
export type PortKillParams = z.infer<typeof PortKillParamsSchema>;

export const PortKillResultSchema = z.object({
  port: z.number().int().min(1).max(65535),
  pid: z.number().int().positive().nullable(),
  killed: z.boolean(),
  ownership: ProcessOwnershipGradeSchema,
  message: z.string(),
  released: z.boolean(),
});
export type PortKillResult = z.infer<typeof PortKillResultSchema>;
