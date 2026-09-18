import { z } from "zod";
import { RunnerCapabilitiesSchema, RunnerSystemInfoSchema } from "../models/runner.js";

export const RunnerHelloRequestSchema = z.object({
  protocolVersion: z.string().min(1),
  runnerId: z.string().min(1),
  runnerVersion: z.string().min(1),
  name: z.string().min(1),
  system: RunnerSystemInfoSchema,
  capabilities: RunnerCapabilitiesSchema,
});
export type RunnerHelloRequestParams = z.infer<typeof RunnerHelloRequestSchema>;

export const FileReadRequestSchema = z.object({
  projectId: z.string().min(1),
  path: z.string().min(1),
  encoding: z.enum(["utf-8", "utf8", "base64"]).default("utf-8"),
  maxBytes: z.number().int().positive().default(2097152), // 2MB default
});
export type FileReadRequestParams = z.infer<typeof FileReadRequestSchema>;

export const FileCreateRequestSchema = z.object({
  projectId: z.string().min(1),
  path: z.string().min(1),
  content: z.string(),
  overwrite: z.boolean().default(false),
});
export type FileCreateRequestParams = z.infer<typeof FileCreateRequestSchema>;

export const FileWriteRequestSchema = z.object({
  projectId: z.string().min(1),
  path: z.string().min(1),
  content: z.string(),
});
export type FileWriteRequestParams = z.infer<typeof FileWriteRequestSchema>;

export const FilePatchRequestSchema = z.object({
  projectId: z.string().min(1),
  path: z.string().min(1),
  search: z.string(),
  replace: z.string(),
});
export type FilePatchRequestParams = z.infer<typeof FilePatchRequestSchema>;

export const FileDeleteRequestSchema = z.object({
  projectId: z.string().min(1),
  path: z.string().min(1),
});
export type FileDeleteRequestParams = z.infer<typeof FileDeleteRequestSchema>;

export const DirectoryListRequestSchema = z.object({
  projectId: z.string().min(1),
  path: z.string().default(""),
  recursive: z.boolean().default(false),
  maxDepth: z.number().int().positive().default(3),
});
export type DirectoryListRequestParams = z.infer<typeof DirectoryListRequestSchema>;

export const FileSearchRequestSchema = z.object({
  projectId: z.string().min(1),
  pattern: z.string().min(1),
  maxResults: z.number().int().positive().default(100),
});
export type FileSearchRequestParams = z.infer<typeof FileSearchRequestSchema>;

export const TextSearchRequestSchema = z.object({
  projectId: z.string().min(1),
  query: z.string().min(1),
  caseSensitive: z.boolean().default(false),
  maxResults: z.number().int().positive().default(100),
});
export type TextSearchRequestParams = z.infer<typeof TextSearchRequestSchema>;

export const ShellRunRequestSchema = z.object({
  projectId: z.string().min(1),
  command: z.string().min(1),
  cwd: z.string().optional(),
  timeout: z.number().int().min(1).max(300).default(60),
});
export type ShellRunRequestParams = z.infer<typeof ShellRunRequestSchema>;

export const GitStatusRequestSchema = z.object({
  projectId: z.string().min(1),
});
export type GitStatusRequestParams = z.infer<typeof GitStatusRequestSchema>;

export const GitDiffRequestSchema = z.object({
  projectId: z.string().min(1),
  cached: z.boolean().default(false),
  path: z.string().optional(),
});
export type GitDiffRequestParams = z.infer<typeof GitDiffRequestSchema>;

export const GitLogRequestSchema = z.object({
  projectId: z.string().min(1),
  maxCount: z.number().int().positive().default(20),
});
export type GitLogRequestParams = z.infer<typeof GitLogRequestSchema>;

export const JobStartRequestSchema = z.object({
  projectId: z.string().min(1),
  command: z.string().min(1),
  cwd: z.string().optional(),
  timeout: z.number().int().min(1).max(3600).default(600),
});
export type JobStartRequestParams = z.infer<typeof JobStartRequestSchema>;

export const JobStatusRequestSchema = z.object({
  jobId: z.string().min(1),
});
export type JobStatusRequestParams = z.infer<typeof JobStatusRequestSchema>;

export const JobLogsRequestSchema = z.object({
  jobId: z.string().min(1),
  tail: z.number().int().positive().default(500),
});
export type JobLogsRequestParams = z.infer<typeof JobLogsRequestSchema>;

export const JobCancelRequestSchema = z.object({
  jobId: z.string().min(1),
});
export type JobCancelRequestParams = z.infer<typeof JobCancelRequestSchema>;
