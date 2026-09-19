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

export const ProjectAccessModeSchema = z.enum(["read-only", "read-write"]);
export type ProjectAccessMode = z.infer<typeof ProjectAccessModeSchema>;

export const ProjectExecutionModeSchema = z.enum(["disabled", "safe-only", "project-code"]);
export type ProjectExecutionMode = z.infer<typeof ProjectExecutionModeSchema>;

// 3. project.list
export const ProjectListParamsSchema = z.object({}).strict();
export type ProjectListParams = z.infer<typeof ProjectListParamsSchema>;

export const ProjectListItemSchema = z.object({
  id: z.string(),
  name: z.string(),
  enabled: z.boolean(),
  accessMode: ProjectAccessModeSchema.default("read-only"),
  executionMode: ProjectExecutionModeSchema.default("disabled"),
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
  accessMode: ProjectAccessModeSchema.default("read-only"),
  executionMode: ProjectExecutionModeSchema.default("disabled"),
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
    contentHash: z.string(),
    startLine: z.number().int().min(1),
    endLine: z.number().int().min(0),
    nextLine: z.number().int().min(1).nullable(),
    truncated: z.boolean(),
    lines: z.array(FileLineSchema),
  })
  .strict();
export type FileReadResult = z.infer<typeof FileReadResultSchema>;

// 9. file.create
export const FileCreateParamsSchema = z
  .object({
    projectId: z.string(),
    path: z.string(),
    content: z.string(),
  })
  .strict();
export type FileCreateParams = z.infer<typeof FileCreateParamsSchema>;

export const FileCreateResultSchema = z
  .object({
    operationId: z.string(),
    projectId: z.string(),
    path: z.string(),
    newHash: z.string(),
    bytes: z.number().int().nonnegative(),
  })
  .strict();
export type FileCreateResult = z.infer<typeof FileCreateResultSchema>;

// 10. file.write
export const FileWriteParamsSchema = z
  .object({
    projectId: z.string(),
    path: z.string(),
    expectedHash: z.string(),
    content: z.string(),
  })
  .strict();
export type FileWriteParams = z.infer<typeof FileWriteParamsSchema>;

export const FileWriteResultSchema = z
  .object({
    operationId: z.string(),
    projectId: z.string(),
    path: z.string(),
    oldHash: z.string(),
    newHash: z.string(),
    bytesBefore: z.number().int().nonnegative(),
    bytesAfter: z.number().int().nonnegative(),
    backupCreated: z.boolean(),
  })
  .strict();
export type FileWriteResult = z.infer<typeof FileWriteResultSchema>;

// 11. file.patch
export const PatchReplacementSchema = z
  .object({
    search: z.string().min(1, "Search text cannot be empty"),
    replace: z.string(),
  })
  .strict();
export type PatchReplacement = z.infer<typeof PatchReplacementSchema>;

export const FilePatchParamsSchema = z
  .object({
    projectId: z.string(),
    path: z.string(),
    expectedHash: z.string(),
    replacements: z.array(PatchReplacementSchema).min(1, "At least one replacement is required"),
  })
  .strict();
export type FilePatchParams = z.infer<typeof FilePatchParamsSchema>;

export const FilePatchResultSchema = z
  .object({
    operationId: z.string(),
    projectId: z.string(),
    path: z.string(),
    oldHash: z.string(),
    newHash: z.string(),
    bytesBefore: z.number().int().nonnegative(),
    bytesAfter: z.number().int().nonnegative(),
    replacementsApplied: z.number().int().positive(),
  })
  .strict();
export type FilePatchResult = z.infer<typeof FilePatchResultSchema>;

// 12. file.delete
export const FileDeleteParamsSchema = z
  .object({
    projectId: z.string(),
    path: z.string(),
    expectedHash: z.string(),
  })
  .strict();
export type FileDeleteParams = z.infer<typeof FileDeleteParamsSchema>;

export const FileDeleteResultSchema = z
  .object({
    operationId: z.string(),
    projectId: z.string(),
    path: z.string(),
    oldHash: z.string(),
    deleted: z.boolean(),
    backupCreated: z.boolean(),
  })
  .strict();
export type FileDeleteResult = z.infer<typeof FileDeleteResultSchema>;

// 13. file.restore
export const FileRestoreParamsSchema = z
  .object({
    projectId: z.string(),
    operationId: z.string(),
  })
  .strict();
export type FileRestoreParams = z.infer<typeof FileRestoreParamsSchema>;

export const FileRestoreResultSchema = z
  .object({
    operationId: z.string(),
    projectId: z.string(),
    path: z.string(),
    restoredHash: z.string(),
    bytesRestored: z.number().int().nonnegative(),
  })
  .strict();
export type FileRestoreResult = z.infer<typeof FileRestoreResultSchema>;

// 14. git.info
export const GitInfoParamsSchema = z
  .object({
    projectId: z.string(),
  })
  .strict();
export type GitInfoParams = z.infer<typeof GitInfoParamsSchema>;

export const GitInfoResultSchema = z
  .object({
    projectId: z.string(),
    isRepository: z.boolean(),
    branch: z.string().nullable(),
    detached: z.boolean(),
    head: z.string().nullable(),
    shortHead: z.string().nullable(),
    hasUpstream: z.boolean(),
  })
  .strict();
export type GitInfoResult = z.infer<typeof GitInfoResultSchema>;

// 15. git.status
export const GitStatusEntryKindSchema = z.enum([
  "modified",
  "added",
  "deleted",
  "renamed",
  "typechanged",
  "untracked",
  "conflicted",
]);
export type GitStatusEntryKind = z.infer<typeof GitStatusEntryKindSchema>;

export const GitStatusEntrySchema = z
  .object({
    path: z.string(),
    indexStatus: z.string(),
    worktreeStatus: z.string(),
    kind: GitStatusEntryKindSchema,
    oldPath: z.string().optional(),
  })
  .strict();
export type GitStatusEntry = z.infer<typeof GitStatusEntrySchema>;

export const GitStatusParamsSchema = z
  .object({
    projectId: z.string(),
  })
  .strict();
export type GitStatusParams = z.infer<typeof GitStatusParamsSchema>;

export const GitStatusResultSchema = z
  .object({
    projectId: z.string(),
    branch: z.string().nullable(),
    detached: z.boolean(),
    ahead: z.number().int().nonnegative(),
    behind: z.number().int().nonnegative(),
    clean: z.boolean(),
    entries: z.array(GitStatusEntrySchema),
    sensitiveEntriesFiltered: z.boolean(),
    truncated: z.boolean(),
  })
  .strict();
export type GitStatusResult = z.infer<typeof GitStatusResultSchema>;

// 16. git.diff
export const GitDiffScopeSchema = z.enum(["unstaged", "staged"]);
export type GitDiffScope = z.infer<typeof GitDiffScopeSchema>;

export const GitDiffParamsSchema = z
  .object({
    projectId: z.string(),
    scope: GitDiffScopeSchema.default("unstaged"),
    path: z.string().optional(),
    contextLines: z.number().int().min(0).max(20).default(3),
  })
  .strict();
export type GitDiffParams = z.infer<typeof GitDiffParamsSchema>;

export const GitDiffResultSchema = z
  .object({
    projectId: z.string(),
    scope: GitDiffScopeSchema,
    files: z.array(z.string()),
    diff: z.string(),
    sensitiveEntriesFiltered: z.boolean(),
    symlinkEntriesFiltered: z.boolean(),
    submoduleEntriesFiltered: z.boolean(),
  })
  .strict();
export type GitDiffResult = z.infer<typeof GitDiffResultSchema>;

// 17. git.log
export const GitCommitSummarySchema = z
  .object({
    hash: z.string(),
    shortHash: z.string(),
    authorName: z.string(),
    timestamp: z.number().int(),
    subject: z.string(),
  })
  .strict();
export type GitCommitSummary = z.infer<typeof GitCommitSummarySchema>;

export const GitLogParamsSchema = z
  .object({
    projectId: z.string(),
    limit: z.number().int().min(1).max(100).default(20),
    path: z.string().optional(),
  })
  .strict();
export type GitLogParams = z.infer<typeof GitLogParamsSchema>;

export const GitLogResultSchema = z
  .object({
    projectId: z.string(),
    commits: z.array(GitCommitSummarySchema),
  })
  .strict();
export type GitLogResult = z.infer<typeof GitLogResultSchema>;

// Command Risk Level
export const CommandRiskLevelSchema = z.enum(["SAFE", "CAUTION", "DANGEROUS"]);
export type CommandRiskLevel = z.infer<typeof CommandRiskLevelSchema>;

// CommandSpec Discriminated Union
export const ToolVersionCommandSchema = z
  .object({
    kind: z.literal("tool-version"),
    projectId: z.string(),
    tool: z.enum(["node", "npm", "pnpm", "python"]),
  })
  .strict();
export type ToolVersionCommand = z.infer<typeof ToolVersionCommandSchema>;

export const NodeScriptCommandSchema = z
  .object({
    kind: z.literal("node-script"),
    projectId: z.string(),
    path: z.string(),
    args: z.array(z.string()).max(64).default([]),
    cwd: z.string().default("."),
    timeoutMs: z.number().int().min(1000).max(300000).default(60000),
  })
  .strict();
export type NodeScriptCommand = z.infer<typeof NodeScriptCommandSchema>;

export const PythonScriptCommandSchema = z
  .object({
    kind: z.literal("python-script"),
    projectId: z.string(),
    path: z.string(),
    args: z.array(z.string()).max(64).default([]),
    cwd: z.string().default("."),
    timeoutMs: z.number().int().min(1000).max(300000).default(60000),
  })
  .strict();
export type PythonScriptCommand = z.infer<typeof PythonScriptCommandSchema>;

export const PackageScriptCommandSchema = z
  .object({
    kind: z.literal("package-script"),
    projectId: z.string(),
    manager: z.enum(["npm", "pnpm"]),
    script: z.string(),
    args: z.array(z.string()).max(64).default([]),
    cwd: z.string().default("."),
    timeoutMs: z.number().int().min(1000).max(300000).default(60000),
  })
  .strict();
export type PackageScriptCommand = z.infer<typeof PackageScriptCommandSchema>;

export const CommandSpecSchema = z.discriminatedUnion("kind", [
  ToolVersionCommandSchema,
  NodeScriptCommandSchema,
  PythonScriptCommandSchema,
  PackageScriptCommandSchema,
]);
export type CommandSpec = z.infer<typeof CommandSpecSchema>;

// 18. command.classify
export const CommandClassifyParamsSchema = CommandSpecSchema;
export type CommandClassifyParams = z.infer<typeof CommandClassifyParamsSchema>;

export const CommandClassifyResultSchema = z
  .object({
    risk: CommandRiskLevelSchema,
    reasons: z.array(z.string()),
    executesProjectCode: z.boolean(),
    mayModifyFiles: z.boolean(),
    mayAccessNetwork: z.boolean(),
    allowed: z.boolean(),
    reason: z.string().optional(),
  })
  .strict();
export type CommandClassifyResult = z.infer<typeof CommandClassifyResultSchema>;

// 19. command.run
export const CommandRunParamsSchema = CommandSpecSchema;
export type CommandRunParams = z.infer<typeof CommandRunParamsSchema>;

export const CommandRunResultSchema = z
  .object({
    projectId: z.string(),
    risk: z.enum(["SAFE", "CAUTION"]),
    exitCode: z.number().int(),
    signal: z.string().nullable(),
    durationMs: z.number().int().nonnegative(),
    stdout: z.string(),
    stderr: z.string(),
    timedOut: z.boolean(),
  })
  .strict();
export type CommandRunResult = z.infer<typeof CommandRunResultSchema>;

// Phase 9: Job States
export const JobStateSchema = z.enum([
  "queued",
  "running",
  "succeeded",
  "failed",
  "cancelled",
  "timed-out",
]);
export type JobState = z.infer<typeof JobStateSchema>;

// 20. job.start
export const JobStartParamsSchema = z
  .object({
    command: CommandSpecSchema,
    timeoutMs: z.number().int().min(1000).max(3600000).default(600000),
  })
  .strict();
export type JobStartParams = z.infer<typeof JobStartParamsSchema>;

export const JobStartResultSchema = z
  .object({
    jobId: z.string(),
    state: JobStateSchema,
    createdAt: z.number().int(),
  })
  .strict();
export type JobStartResult = z.infer<typeof JobStartResultSchema>;

// 21. job.status
export const JobStatusParamsSchema = z
  .object({
    jobId: z.string(),
  })
  .strict();
export type JobStatusParams = z.infer<typeof JobStatusParamsSchema>;

export const JobStatusResultSchema = z
  .object({
    jobId: z.string(),
    projectId: z.string(),
    state: JobStateSchema,
    risk: CommandRiskLevelSchema,
    createdAt: z.number().int(),
    startedAt: z.number().int().nullable(),
    finishedAt: z.number().int().nullable(),
    exitCode: z.number().int().nullable(),
    signal: z.string().nullable(),
    durationMs: z.number().int().nonnegative(),
  })
  .strict();
export type JobStatusResult = z.infer<typeof JobStatusResultSchema>;

// 22. job.logs
export const JobLogChunkSchema = z
  .object({
    seq: z.number().int().positive(),
    stream: z.enum(["stdout", "stderr"]),
    timestamp: z.number().int(),
    text: z.string(),
  })
  .strict();
export type JobLogChunk = z.infer<typeof JobLogChunkSchema>;

export const JobLogsParamsSchema = z
  .object({
    jobId: z.string(),
    cursor: z.string().nullable().optional(),
    limit: z.number().int().min(1).max(200).default(100),
  })
  .strict();
export type JobLogsParams = z.infer<typeof JobLogsParamsSchema>;

export const JobLogsResultSchema = z
  .object({
    jobId: z.string(),
    chunks: z.array(JobLogChunkSchema),
    nextCursor: z.string().nullable(),
    truncated: z.boolean(),
    droppedBytes: z.number().int().nonnegative(),
  })
  .strict();
export type JobLogsResult = z.infer<typeof JobLogsResultSchema>;

// 23. job.cancel
export const JobCancelParamsSchema = z
  .object({
    jobId: z.string(),
  })
  .strict();
export type JobCancelParams = z.infer<typeof JobCancelParamsSchema>;

export const JobCancelResultSchema = z
  .object({
    jobId: z.string(),
    state: JobStateSchema,
    alreadyTerminal: z.boolean(),
  })
  .strict();
export type JobCancelResult = z.infer<typeof JobCancelResultSchema>;

// 24. job.list
export const JobListParamsSchema = z
  .object({
    projectId: z.string().optional(),
    state: JobStateSchema.optional(),
    limit: z.number().int().min(1).max(100).default(50),
  })
  .strict();
export type JobListParams = z.infer<typeof JobListParamsSchema>;

export const JobSummarySchema = z
  .object({
    jobId: z.string(),
    projectId: z.string(),
    state: JobStateSchema,
    commandKind: z.string(),
    risk: CommandRiskLevelSchema,
    createdAt: z.number().int(),
    startedAt: z.number().int().nullable(),
    finishedAt: z.number().int().nullable(),
    exitCode: z.number().int().nullable(),
  })
  .strict();
export type JobSummary = z.infer<typeof JobSummarySchema>;

export const JobListResultSchema = z
  .object({
    jobs: z.array(JobSummarySchema),
  })
  .strict();
export type JobListResult = z.infer<typeof JobListResultSchema>;

// 25. build.start
export const BuildStartParamsSchema = z
  .object({
    projectId: z.string(),
    manager: z.enum(["npm", "pnpm"]).default("pnpm"),
    script: z.string().default("build"),
    args: z.array(z.string()).max(64).default([]),
    cwd: z.string().default("."),
    timeoutMs: z.number().int().min(1000).max(3600000).default(600000),
  })
  .strict();
export type BuildStartParams = z.infer<typeof BuildStartParamsSchema>;

export const BuildStartResultSchema = z
  .object({
    jobId: z.string(),
    state: JobStateSchema,
    createdAt: z.number().int(),
  })
  .strict();
export type BuildStartResult = z.infer<typeof BuildStartResultSchema>;

// 26. test.start
export const TestStartParamsSchema = z
  .object({
    projectId: z.string(),
    manager: z.enum(["npm", "pnpm"]).default("pnpm"),
    script: z.string().default("test"),
    args: z.array(z.string()).max(64).default([]),
    cwd: z.string().default("."),
    timeoutMs: z.number().int().min(1000).max(3600000).default(600000),
  })
  .strict();
export type TestStartParams = z.infer<typeof TestStartParamsSchema>;

export const TestStartResultSchema = z
  .object({
    jobId: z.string(),
    state: JobStateSchema,
    createdAt: z.number().int(),
  })
  .strict();
export type TestStartResult = z.infer<typeof TestStartResultSchema>;

// 28. project.authorize
export const ProjectAuthorizeParamsSchema = z
  .object({
    path: z.string(),
    name: z.string().optional(),
    accessMode: ProjectAccessModeSchema.default("read-only"),
  })
  .strict();
export type ProjectAuthorizeParams = z.infer<typeof ProjectAuthorizeParamsSchema>;

export const ProjectAuthorizeResultSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    root: z.string(),
    enabled: z.boolean(),
    accessMode: ProjectAccessModeSchema,
    executionMode: ProjectExecutionModeSchema,
  })
  .strict();
export type ProjectAuthorizeResult = z.infer<typeof ProjectAuthorizeResultSchema>;

// 29. project.setAccess
export const ProjectSetAccessParamsSchema = z
  .object({
    projectId: z.string(),
    accessMode: ProjectAccessModeSchema,
  })
  .strict();
export type ProjectSetAccessParams = z.infer<typeof ProjectSetAccessParamsSchema>;

export const ProjectSetAccessResultSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    accessMode: ProjectAccessModeSchema,
    executionMode: ProjectExecutionModeSchema,
    cancelledJobsCount: z.number().int().default(0),
  })
  .strict();
export type ProjectSetAccessResult = z.infer<typeof ProjectSetAccessResultSchema>;

// 30. project.setExecution
export const ProjectSetExecutionParamsSchema = z
  .object({
    projectId: z.string(),
    executionMode: ProjectExecutionModeSchema,
  })
  .strict();
export type ProjectSetExecutionParams = z.infer<typeof ProjectSetExecutionParamsSchema>;

export const ProjectSetExecutionResultSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    executionMode: ProjectExecutionModeSchema,
    cancelledJobsCount: z.number().int().default(0),
  })
  .strict();
export type ProjectSetExecutionResult = z.infer<typeof ProjectSetExecutionResultSchema>;

// 31. project.remove
export const ProjectRemoveParamsSchema = z
  .object({
    projectId: z.string(),
  })
  .strict();
export type ProjectRemoveParams = z.infer<typeof ProjectRemoveParamsSchema>;

export const ProjectRemoveResultSchema = z
  .object({
    id: z.string(),
    removed: z.boolean(),
    cancelledJobsCount: z.number().int().default(0),
  })
  .strict();
export type ProjectRemoveResult = z.infer<typeof ProjectRemoveResultSchema>;

// 32. project.enable
export const ProjectEnableParamsSchema = z
  .object({
    projectId: z.string(),
  })
  .strict();
export type ProjectEnableParams = z.infer<typeof ProjectEnableParamsSchema>;

export const ProjectEnableResultSchema = z
  .object({
    id: z.string(),
    enabled: z.literal(true),
  })
  .strict();
export type ProjectEnableResult = z.infer<typeof ProjectEnableResultSchema>;

// 33. project.disable
export const ProjectDisableParamsSchema = z
  .object({
    projectId: z.string(),
  })
  .strict();
export type ProjectDisableParams = z.infer<typeof ProjectDisableParamsSchema>;

export const ProjectDisableResultSchema = z
  .object({
    id: z.string(),
    disabled: z.literal(true),
    cancelledJobsCount: z.number().int().default(0),
  })
  .strict();
export type ProjectDisableResult = z.infer<typeof ProjectDisableResultSchema>;

// Approvals
export const ApprovalRiskSchema = z.enum(["CAUTION", "DANGEROUS"]);
export type ApprovalRisk = z.infer<typeof ApprovalRiskSchema>;

export const ApprovalStatusSchema = z.enum(["pending", "approved", "denied", "expired"]);
export type ApprovalStatus = z.infer<typeof ApprovalStatusSchema>;

export const ApprovalRequestSchema = z
  .object({
    id: z.string(),
    projectId: z.string(),
    operation: z.string(),
    risk: ApprovalRiskSchema,
    summary: z.string(),
    payloadHash: z.string(),
    createdAt: z.number().int(),
    expiresAt: z.number().int(),
    status: ApprovalStatusSchema,
    resolvedAt: z.number().int().nullable().optional(),
    resolvedBy: z.string().nullable().optional(),
  })
  .strict();
export type ApprovalRequest = z.infer<typeof ApprovalRequestSchema>;

// 34. approval.create
export const ApprovalCreateParamsSchema = z
  .object({
    projectId: z.string(),
    operation: z.string(),
    risk: ApprovalRiskSchema,
    summary: z.string(),
    payloadHash: z.string(),
    timeoutMs: z.number().int().min(1000).max(3600000).default(300000),
  })
  .strict();
export type ApprovalCreateParams = z.infer<typeof ApprovalCreateParamsSchema>;

export const ApprovalCreateResultSchema = ApprovalRequestSchema;
export type ApprovalCreateResult = z.infer<typeof ApprovalCreateResultSchema>;

// 35. approval.resolve
export const ApprovalResolveParamsSchema = z
  .object({
    approvalId: z.string(),
    action: z.enum(["approve", "deny"]),
    resolvedBy: z.string().default("local-user"),
  })
  .strict();
export type ApprovalResolveParams = z.infer<typeof ApprovalResolveParamsSchema>;

export const ApprovalResolveResultSchema = ApprovalRequestSchema;
export type ApprovalResolveResult = z.infer<typeof ApprovalResolveResultSchema>;

// 36. approval.list
export const ApprovalListParamsSchema = z
  .object({
    projectId: z.string().optional(),
    status: ApprovalStatusSchema.optional(),
  })
  .strict();
export type ApprovalListParams = z.infer<typeof ApprovalListParamsSchema>;

export const ApprovalListResultSchema = z.array(ApprovalRequestSchema);
export type ApprovalListResult = z.infer<typeof ApprovalListResultSchema>;

// 37. approval.get
export const ApprovalGetParamsSchema = z
  .object({
    approvalId: z.string(),
  })
  .strict();
export type ApprovalGetParams = z.infer<typeof ApprovalGetParamsSchema>;

export const ApprovalGetResultSchema = ApprovalRequestSchema;
export type ApprovalGetResult = z.infer<typeof ApprovalGetResultSchema>;

// 38. job.cancelAll
export const JobCancelAllParamsSchema = z
  .object({
    reason: z.string().optional(),
  })
  .strict();
export type JobCancelAllParams = z.infer<typeof JobCancelAllParamsSchema>;

export const JobCancelAllResultSchema = z
  .object({
    cancelledCount: z.number().int().nonnegative(),
    jobIds: z.array(z.string()),
  })
  .strict();
export type JobCancelAllResult = z.infer<typeof JobCancelAllResultSchema>;

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
  [RunnerRpcMethods.FileCreate]: {
    params: FileCreateParams;
    result: FileCreateResult;
  };
  [RunnerRpcMethods.FileWrite]: {
    params: FileWriteParams;
    result: FileWriteResult;
  };
  [RunnerRpcMethods.FilePatch]: {
    params: FilePatchParams;
    result: FilePatchResult;
  };
  [RunnerRpcMethods.FileDelete]: {
    params: FileDeleteParams;
    result: FileDeleteResult;
  };
  [RunnerRpcMethods.FileRestore]: {
    params: FileRestoreParams;
    result: FileRestoreResult;
  };
  [RunnerRpcMethods.GitInfo]: {
    params: GitInfoParams;
    result: GitInfoResult;
  };
  [RunnerRpcMethods.GitStatus]: {
    params: GitStatusParams;
    result: GitStatusResult;
  };
  [RunnerRpcMethods.GitDiff]: {
    params: GitDiffParams;
    result: GitDiffResult;
  };
  [RunnerRpcMethods.GitLog]: {
    params: GitLogParams;
    result: GitLogResult;
  };
  [RunnerRpcMethods.CommandClassify]: {
    params: CommandClassifyParams;
    result: CommandClassifyResult;
  };
  [RunnerRpcMethods.CommandRun]: {
    params: CommandRunParams;
    result: CommandRunResult;
  };
  [RunnerRpcMethods.JobStart]: {
    params: JobStartParams;
    result: JobStartResult;
  };
  [RunnerRpcMethods.JobStatus]: {
    params: JobStatusParams;
    result: JobStatusResult;
  };
  [RunnerRpcMethods.JobLogs]: {
    params: JobLogsParams;
    result: JobLogsResult;
  };
  [RunnerRpcMethods.JobCancel]: {
    params: JobCancelParams;
    result: JobCancelResult;
  };
  [RunnerRpcMethods.JobList]: {
    params: JobListParams;
    result: JobListResult;
  };
  [RunnerRpcMethods.BuildStart]: {
    params: BuildStartParams;
    result: BuildStartResult;
  };
  [RunnerRpcMethods.TestStart]: {
    params: TestStartParams;
    result: TestStartResult;
  };
  [RunnerRpcMethods.ProjectAuthorize]: {
    params: ProjectAuthorizeParams;
    result: ProjectAuthorizeResult;
  };
  [RunnerRpcMethods.ProjectSetAccess]: {
    params: ProjectSetAccessParams;
    result: ProjectSetAccessResult;
  };
  [RunnerRpcMethods.ProjectSetExecution]: {
    params: ProjectSetExecutionParams;
    result: ProjectSetExecutionResult;
  };
  [RunnerRpcMethods.ProjectRemove]: {
    params: ProjectRemoveParams;
    result: ProjectRemoveResult;
  };
  [RunnerRpcMethods.ProjectEnable]: {
    params: ProjectEnableParams;
    result: ProjectEnableResult;
  };
  [RunnerRpcMethods.ProjectDisable]: {
    params: ProjectDisableParams;
    result: ProjectDisableResult;
  };
  [RunnerRpcMethods.ApprovalCreate]: {
    params: ApprovalCreateParams;
    result: ApprovalCreateResult;
  };
  [RunnerRpcMethods.ApprovalResolve]: {
    params: ApprovalResolveParams;
    result: ApprovalResolveResult;
  };
  [RunnerRpcMethods.ApprovalList]: {
    params: ApprovalListParams;
    result: ApprovalListResult;
  };
  [RunnerRpcMethods.ApprovalGet]: {
    params: ApprovalGetParams;
    result: ApprovalGetResult;
  };
  [RunnerRpcMethods.JobCancelAll]: {
    params: JobCancelAllParams;
    result: JobCancelAllResult;
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
  [RunnerRpcMethods.FileCreate]: {
    params: FileCreateParamsSchema,
    result: FileCreateResultSchema,
  },
  [RunnerRpcMethods.FileWrite]: {
    params: FileWriteParamsSchema,
    result: FileWriteResultSchema,
  },
  [RunnerRpcMethods.FilePatch]: {
    params: FilePatchParamsSchema,
    result: FilePatchResultSchema,
  },
  [RunnerRpcMethods.FileDelete]: {
    params: FileDeleteParamsSchema,
    result: FileDeleteResultSchema,
  },
  [RunnerRpcMethods.FileRestore]: {
    params: FileRestoreParamsSchema,
    result: FileRestoreResultSchema,
  },
  [RunnerRpcMethods.GitInfo]: {
    params: GitInfoParamsSchema,
    result: GitInfoResultSchema,
  },
  [RunnerRpcMethods.GitStatus]: {
    params: GitStatusParamsSchema,
    result: GitStatusResultSchema,
  },
  [RunnerRpcMethods.GitDiff]: {
    params: GitDiffParamsSchema,
    result: GitDiffResultSchema,
  },
  [RunnerRpcMethods.GitLog]: {
    params: GitLogParamsSchema,
    result: GitLogResultSchema,
  },
  [RunnerRpcMethods.CommandClassify]: {
    params: CommandClassifyParamsSchema,
    result: CommandClassifyResultSchema,
  },
  [RunnerRpcMethods.CommandRun]: {
    params: CommandRunParamsSchema,
    result: CommandRunResultSchema,
  },
  [RunnerRpcMethods.JobStart]: {
    params: JobStartParamsSchema,
    result: JobStartResultSchema,
  },
  [RunnerRpcMethods.JobStatus]: {
    params: JobStatusParamsSchema,
    result: JobStatusResultSchema,
  },
  [RunnerRpcMethods.JobLogs]: {
    params: JobLogsParamsSchema,
    result: JobLogsResultSchema,
  },
  [RunnerRpcMethods.JobCancel]: {
    params: JobCancelParamsSchema,
    result: JobCancelResultSchema,
  },
  [RunnerRpcMethods.JobList]: {
    params: JobListParamsSchema,
    result: JobListResultSchema,
  },
  [RunnerRpcMethods.BuildStart]: {
    params: BuildStartParamsSchema,
    result: BuildStartResultSchema,
  },
  [RunnerRpcMethods.TestStart]: {
    params: TestStartParamsSchema,
    result: TestStartResultSchema,
  },
  [RunnerRpcMethods.ProjectAuthorize]: {
    params: ProjectAuthorizeParamsSchema,
    result: ProjectAuthorizeResultSchema,
  },
  [RunnerRpcMethods.ProjectSetAccess]: {
    params: ProjectSetAccessParamsSchema,
    result: ProjectSetAccessResultSchema,
  },
  [RunnerRpcMethods.ProjectSetExecution]: {
    params: ProjectSetExecutionParamsSchema,
    result: ProjectSetExecutionResultSchema,
  },
  [RunnerRpcMethods.ProjectRemove]: {
    params: ProjectRemoveParamsSchema,
    result: ProjectRemoveResultSchema,
  },
  [RunnerRpcMethods.ProjectEnable]: {
    params: ProjectEnableParamsSchema,
    result: ProjectEnableResultSchema,
  },
  [RunnerRpcMethods.ProjectDisable]: {
    params: ProjectDisableParamsSchema,
    result: ProjectDisableResultSchema,
  },
  [RunnerRpcMethods.ApprovalCreate]: {
    params: ApprovalCreateParamsSchema,
    result: ApprovalCreateResultSchema,
  },
  [RunnerRpcMethods.ApprovalResolve]: {
    params: ApprovalResolveParamsSchema,
    result: ApprovalResolveResultSchema,
  },
  [RunnerRpcMethods.ApprovalList]: {
    params: ApprovalListParamsSchema,
    result: ApprovalListResultSchema,
  },
  [RunnerRpcMethods.ApprovalGet]: {
    params: ApprovalGetParamsSchema,
    result: ApprovalGetResultSchema,
  },
  [RunnerRpcMethods.JobCancelAll]: {
    params: JobCancelAllParamsSchema,
    result: JobCancelAllResultSchema,
  },
} as const;
