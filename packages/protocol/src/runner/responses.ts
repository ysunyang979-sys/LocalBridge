import { z } from "zod";

export const RunnerHelloResponseSchema = z.object({
  accepted: z.literal(true),
  serverVersion: z.string(),
  protocolVersion: z.string(),
  heartbeatIntervalMs: z.number().int().positive(),
});
export type RunnerHelloResponse = z.infer<typeof RunnerHelloResponseSchema>;

export const FileReadResponseSchema = z.object({
  path: z.string(),
  content: z.string(),
  encoding: z.string(),
  size: z.number(),
  isTruncated: z.boolean(),
  isBinary: z.boolean(),
});
export type FileReadResponse = z.infer<typeof FileReadResponseSchema>;

export const FileWriteResponseSchema = z.object({
  path: z.string(),
  oldHash: z.string(),
  newHash: z.string(),
  bytesChanged: z.number(),
  diff: z.string().optional(),
});
export type FileWriteResponse = z.infer<typeof FileWriteResponseSchema>;

export const FilePatchResponseSchema = z.object({
  path: z.string(),
  oldHash: z.string(),
  newHash: z.string(),
  applied: z.boolean(),
});
export type FilePatchResponse = z.infer<typeof FilePatchResponseSchema>;

export const FileDeleteResponseSchema = z.object({
  path: z.string(),
  deleted: z.boolean(),
});
export type FileDeleteResponse = z.infer<typeof FileDeleteResponseSchema>;

export const DirectoryEntrySchema = z.object({
  name: z.string(),
  path: z.string(),
  isDirectory: z.boolean(),
  isFile: z.boolean(),
  isSymlink: z.boolean(),
  size: z.number(),
  mtime: z.number(),
});
export type DirectoryEntry = z.infer<typeof DirectoryEntrySchema>;

export const DirectoryListResponseSchema = z.object({
  path: z.string(),
  entries: z.array(DirectoryEntrySchema),
});
export type DirectoryListResponse = z.infer<typeof DirectoryListResponseSchema>;

export const FileSearchMatchSchema = z.object({
  path: z.string(),
  isDirectory: z.boolean(),
});
export type FileSearchMatch = z.infer<typeof FileSearchMatchSchema>;

export const FileSearchResponseSchema = z.object({
  matches: z.array(FileSearchMatchSchema),
  total: z.number(),
});
export type FileSearchResponse = z.infer<typeof FileSearchResponseSchema>;

export const TextSearchMatchSchema = z.object({
  path: z.string(),
  lineNumber: z.number(),
  lineContent: z.string(),
});
export type TextSearchMatch = z.infer<typeof TextSearchMatchSchema>;

export const TextSearchResponseSchema = z.object({
  matches: z.array(TextSearchMatchSchema),
  total: z.number(),
});
export type TextSearchResponse = z.infer<typeof TextSearchResponseSchema>;

export const ShellRunResponseSchema = z.object({
  exitCode: z.number(),
  stdout: z.string(),
  stderr: z.string(),
  durationMs: z.number(),
  killed: z.boolean(),
});
export type ShellRunResponse = z.infer<typeof ShellRunResponseSchema>;

export const GitStatusResponseSchema = z.object({
  branch: z.string(),
  clean: z.boolean(),
  staged: z.array(z.string()),
  unstaged: z.array(z.string()),
  untracked: z.array(z.string()),
});
export type GitStatusResponse = z.infer<typeof GitStatusResponseSchema>;

export const GitDiffResponseSchema = z.object({
  diff: z.string(),
});
export type GitDiffResponse = z.infer<typeof GitDiffResponseSchema>;

export const GitLogEntrySchema = z.object({
  hash: z.string(),
  author: z.string(),
  date: z.string(),
  message: z.string(),
});
export type GitLogEntry = z.infer<typeof GitLogEntrySchema>;

export const GitLogResponseSchema = z.object({
  commits: z.array(GitLogEntrySchema),
});
export type GitLogResponse = z.infer<typeof GitLogResponseSchema>;

export const JobStartResponseSchema = z.object({
  jobId: z.string(),
  status: z.string(),
});
export type JobStartResponse = z.infer<typeof JobStartResponseSchema>;

export const JobStatusResponseSchema = z.object({
  jobId: z.string(),
  status: z.string(),
  exitCode: z.number().optional(),
  startedAt: z.number(),
  endedAt: z.number().optional(),
});
export type JobStatusResponse = z.infer<typeof JobStatusResponseSchema>;

export const JobLogsResponseSchema = z.object({
  jobId: z.string(),
  logs: z.string(),
  isComplete: z.boolean(),
});
export type JobLogsResponse = z.infer<typeof JobLogsResponseSchema>;

export const JobCancelResponseSchema = z.object({
  jobId: z.string(),
  cancelled: z.boolean(),
});
export type JobCancelResponse = z.infer<typeof JobCancelResponseSchema>;
