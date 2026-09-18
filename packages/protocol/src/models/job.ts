import { z } from "zod";

export const JobStatus = {
  RUNNING: "RUNNING",
  SUCCESS: "SUCCESS",
  FAILED: "FAILED",
  CANCELLED: "CANCELLED",
} as const;
export type JobStatus = (typeof JobStatus)[keyof typeof JobStatus];

export const JobInfoSchema = z.object({
  id: z.string(),
  projectId: z.string(),
  command: z.string(),
  cwd: z.string().optional(),
  status: z.nativeEnum(JobStatus),
  startedAt: z.number(),
  endedAt: z.number().optional(),
  exitCode: z.number().optional(),
  error: z.string().optional(),
});
export type JobInfo = z.infer<typeof JobInfoSchema>;
