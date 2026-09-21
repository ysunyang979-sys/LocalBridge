import type child_process from "node:child_process";
import type {
  RuntimeLaunchSpec,
  RuntimeState,
  CommandCategory,
} from "@localbridge/protocol";
import type { RuntimeLogBuffer } from "./log-buffer.js";

export const MAX_RUNTIMES_GLOBAL = 8;
export const MAX_RUNTIMES_PER_PROJECT = 4;
export const MAX_RUNTIMES_PER_SESSION = 3;
export const MAX_RUNTIME_LOG_BYTES = 5 * 1024 * 1024; // 5 MiB ring buffer
export const DEFAULT_GRACE_PERIOD_MS = 3000;

export interface RuntimeGenerationInfo {
  generation: number;
  pid?: number;
  state: RuntimeState;
  exitCode?: number | null;
  signal?: string | null;
  startedAt: number;
  stoppedAt?: number | null;
  intentionalTermination?: "restart" | "user_stop" | "project_disabled" | "emergency_stop" | null;
}

export interface PersistentRuntimeRecord {
  id: string;
  projectId: string;
  sessionId?: string;
  worktreeId?: string;
  name?: string;
  kind: "package-script" | "registered-command";
  commandCategory: CommandCategory;
  state: RuntimeState;
  generation: number;
  launchSpec: RuntimeLaunchSpec;
  workspaceMode: "direct" | "managed-worktree";
  effectiveCwd: string;
  pid?: number;
  exitCode?: number | null;
  signal?: string | null;
  restartCount: number;
  lastErrorCode?: string | null;
  lastError?: string | null;
  createdAt: number;
  startedAt?: number | null;
  stoppedAt?: number | null;
  updatedAt: number;
  createdBy: "chat" | "desktop";
  process?: child_process.ChildProcess;
  stoppingPromise?: Promise<void>;
  generationLogs: Map<number, RuntimeLogBuffer>;
  generations: RuntimeGenerationInfo[];
}
