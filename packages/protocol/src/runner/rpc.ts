import { z } from "zod";
import crypto from "node:crypto";
import { RunnerRpcMethods } from "./methods.js";
import { RunnerCapabilitiesSchema, RunnerToolsSchema } from "../models/runner.js";

// Constraints
export const MIN_RPC_TIMEOUT = 1000;
export const MAX_RPC_TIMEOUT = 300000;
export const DEFAULT_RPC_TIMEOUT = 10000;
export const SYSTEM_PING_TIMEOUT = 5000;
export const SYSTEM_INFO_TIMEOUT = 10000;
export const PROJECT_LIST_TIMEOUT = 10000;
export const PROJECT_INFO_TIMEOUT = 5000;
export const PROJECT_VALIDATE_TIMEOUT = 5000;

export const MAX_RPC_MESSAGE_SIZE = 1024 * 1024; // 1 MiB (1,048,576 bytes)
export const MAX_PENDING_REQUESTS = 64;

export interface RpcRequestOptions {
  timeoutMs?: number;
  signal?: AbortSignal;
}

/**
 * Generate a cryptographically random, unique JSON-RPC 2.0 Request ID.
 * Format: req_<UUIDv4>
 */
export function generateRequestId(): string {
  return `req_${crypto.randomUUID()}`;
}

// 1. system.ping
export const SystemPingParamsSchema = z.object({}).strict();
export type SystemPingParams = z.infer<typeof SystemPingParamsSchema>;

export const SystemPingResultSchema = z.object({
  pong: z.literal(true),
  timestamp: z.number(),
  runnerId: z.string(),
});
export type SystemPingResult = z.infer<typeof SystemPingResultSchema>;

// 2. system.info
export const SystemInfoParamsSchema = z.object({}).strict();
export type SystemInfoParams = z.infer<typeof SystemInfoParamsSchema>;

export const SystemInfoResultSchema = z.object({
  runnerId: z.string(),
  runnerVersion: z.string(),
  protocolVersion: z.string(),
  platform: z.string(),
  arch: z.string(),
  hostname: z.string(),
  nodeVersion: z.string(),
  capabilities: RunnerCapabilitiesSchema,
  tools: RunnerToolsSchema,
});
export type SystemInfoResult = z.infer<typeof SystemInfoResultSchema>;

// 3. project.list
export const ProjectListParamsSchema = z.object({}).strict();
export type ProjectListParams = z.infer<typeof ProjectListParamsSchema>;

export const ProjectListItemSchema = z.object({
  id: z.string(),
  name: z.string(),
  enabled: z.boolean(),
});
export type ProjectListItem = z.infer<typeof ProjectListItemSchema>;

export const ProjectListResultSchema = z.array(ProjectListItemSchema);
export type ProjectListResult = z.infer<typeof ProjectListResultSchema>;

// 4. project.info
export const ProjectInfoParamsSchema = z.object({
  projectId: z.string(),
}).strict();
export type ProjectInfoParams = z.infer<typeof ProjectInfoParamsSchema>;

export const ProjectInfoResultSchema = z.object({
  id: z.string(),
  name: z.string(),
  enabled: z.boolean(),
  healthy: z.boolean(),
});
export type ProjectInfoResult = z.infer<typeof ProjectInfoResultSchema>;

// 5. project.validate
export const ProjectValidateParamsSchema = z.object({
  projectId: z.string(),
  path: z.string().optional(),
}).strict();
export type ProjectValidateParams = z.infer<typeof ProjectValidateParamsSchema>;

export const ProjectValidateResultSchema = z.object({
  valid: z.boolean(),
  isSensitive: z.boolean().optional(),
  reason: z.string().optional(),
});
export type ProjectValidateResult = z.infer<typeof ProjectValidateResultSchema>;

// 6. directory.list
export const DirectoryListParamsSchema = z
  .object({
    projectId: z.string(),
    path: z.string().default("."),
    limit: z.number().int().min(1).max(200).default(100),
    cursor: z.string().nullable().optional(),
  })
  .strict();
export type DirectoryListParams = z.infer<typeof DirectoryListParamsSchema>;

export const DirectoryEntrySchema = z
  .object({
    name: z.string(),
    type: z.enum(["file", "directory", "symlink"]),
    size: z.number().optional(),
    modifiedAt: z.number().optional(),
    accessible: z.boolean().optional(),
  })
  .strict();
export type DirectoryEntry = z.infer<typeof DirectoryEntrySchema>;

export const DirectoryListResultSchema = z
  .object({
    projectId: z.string(),
    path: z.string(),
    entries: z.array(DirectoryEntrySchema),
    nextCursor: z.string().nullable(),
    sensitiveEntriesFiltered: z.boolean(),
  })
  .strict();
export type DirectoryListResult = z.infer<typeof DirectoryListResultSchema>;

// 7. file.stat
export const FileStatParamsSchema = z
  .object({
    projectId: z.string(),
    path: z.string(),
  })
  .strict();
export type FileStatParams = z.infer<typeof FileStatParamsSchema>;

export const FileStatResultSchema = z
  .object({
    projectId: z.string(),
    path: z.string(),
    name: z.string(),
    type: z.enum(["file", "directory", "symlink"]),
    size: z.number().optional(),
    modifiedAt: z.number(),
    accessible: z.boolean().optional(),
  })
  .strict();
export type FileStatResult = z.infer<typeof FileStatResultSchema>;

// 8. file.read
export const FileReadParamsSchema = z
  .object({
    projectId: z.string(),
    path: z.string(),
    startLine: z.number().int().min(1).default(1),
    maxLines: z.number().int().min(1).max(500).default(300),
  })
  .strict();
export type FileReadParams = z.infer<typeof FileReadParamsSchema>;

export const FileLineSchema = z
  .object({
    line: z.number().int().min(1),
    text: z.string(),
  })
  .strict();
export type FileLine = z.infer<typeof FileLineSchema>;

export const FileReadResultSchema = z
  .object({
    projectId: z.string(),
    path: z.string(),
    encoding: z.literal("utf-8"),
    startLine: z.number().int().min(1),
    endLine: z.number().int().min(0),
    nextLine: z.number().int().min(1).nullable(),
    truncated: z.boolean(),
    lines: z.array(FileLineSchema),
  })
  .strict();
export type FileReadResult = z.infer<typeof FileReadResultSchema>;

// Typed RPC Map
export interface RunnerRpcMap {
  [RunnerRpcMethods.SystemPing]: {
    params: SystemPingParams;
    result: SystemPingResult;
  };
  [RunnerRpcMethods.SystemInfo]: {
    params: SystemInfoParams;
    result: SystemInfoResult;
  };
  [RunnerRpcMethods.ProjectList]: {
    params: ProjectListParams;
    result: ProjectListResult;
  };
  [RunnerRpcMethods.ProjectInfo]: {
    params: ProjectInfoParams;
    result: ProjectInfoResult;
  };
  [RunnerRpcMethods.ProjectValidate]: {
    params: ProjectValidateParams;
    result: ProjectValidateResult;
  };
  [RunnerRpcMethods.DirectoryList]: {
    params: DirectoryListParams;
    result: DirectoryListResult;
  };
  [RunnerRpcMethods.FileStat]: {
    params: FileStatParams;
    result: FileStatResult;
  };
  [RunnerRpcMethods.FileRead]: {
    params: FileReadParams;
    result: FileReadResult;
  };
}

export type RunnerRpcMethodName = keyof RunnerRpcMap;

// Schema mapping for dual-ended validation
export const RunnerRpcSchemas = {
  [RunnerRpcMethods.SystemPing]: {
    params: SystemPingParamsSchema,
    result: SystemPingResultSchema,
  },
  [RunnerRpcMethods.SystemInfo]: {
    params: SystemInfoParamsSchema,
    result: SystemInfoResultSchema,
  },
  [RunnerRpcMethods.ProjectList]: {
    params: ProjectListParamsSchema,
    result: ProjectListResultSchema,
  },
  [RunnerRpcMethods.ProjectInfo]: {
    params: ProjectInfoParamsSchema,
    result: ProjectInfoResultSchema,
  },
  [RunnerRpcMethods.ProjectValidate]: {
    params: ProjectValidateParamsSchema,
    result: ProjectValidateResultSchema,
  },
  [RunnerRpcMethods.DirectoryList]: {
    params: DirectoryListParamsSchema,
    result: DirectoryListResultSchema,
  },
  [RunnerRpcMethods.FileStat]: {
    params: FileStatParamsSchema,
    result: FileStatResultSchema,
  },
  [RunnerRpcMethods.FileRead]: {
    params: FileReadParamsSchema,
    result: FileReadResultSchema,
  },
} as const;
