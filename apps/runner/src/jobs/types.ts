import type { ChildProcess } from "node:child_process";
import type { CommandRiskLevel, JobState } from "@localbridge/protocol";
import type { JobLogBuffer } from "./log-buffer.js";

export interface JobRecord {
  id: string;
  projectId: string;
  commandKind: string;
  risk: CommandRiskLevel;
  state: JobState;
  createdAt: number;
  startedAt: number | null;
  finishedAt: number | null;
  exitCode: number | null;
  signal: string | null;
  process?: ChildProcess;
  logs: JobLogBuffer;
  timeoutTimer?: NodeJS.Timeout;
  canonicalProjectRoot: string;
}

export const MAX_RUNNING_JOBS_PER_RUNNER = 4;
export const MAX_RUNNING_JOBS_PER_PROJECT = 2;
export const MAX_JOB_STARTS_PER_MINUTE = 20;

export const DEFAULT_JOB_TIMEOUT_MS = 60000; // 1 minute
export const MIN_JOB_TIMEOUT_MS = 1000; // 1 second
export const MAX_JOB_TIMEOUT_MS = 300000; // 5 minutes

export const MAX_JOB_LOG_BYTES = 4 * 1024 * 1024; // 4 MiB ring buffer
export const MAX_LOG_RESPONSE_BYTES = 128 * 1024; // 128 KiB max per job.logs RPC
export const MAX_LOG_CHUNKS_PER_RESPONSE = 200;

export const MAX_JOB_HISTORY = 100;
export const JOB_HISTORY_MAX_AGE_MS = 24 * 60 * 60 * 1000; // 24 hours
