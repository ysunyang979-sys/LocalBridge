import { z } from "zod";
import {
  WorktreeStateSchema,
  WorktreeSummarySchema,
  WorktreeCreateParamsSchema,
  WorktreeCreateResultSchema,
  WorktreeListParamsSchema,
  WorktreeListResultSchema,
  WorktreeStatusParamsSchema,
  WorktreeStatusResultSchema,
  WorktreeDiffParamsSchema,
  WorktreeDiffResultSchema,
  WorktreeRemoveParamsSchema,
  WorktreeRemoveResultSchema,
} from "./schemas.js";

export type WorktreeState = z.infer<typeof WorktreeStateSchema>;
export type WorktreeSummary = z.infer<typeof WorktreeSummarySchema>;

export type WorktreeCreateParams = z.infer<typeof WorktreeCreateParamsSchema>;
export type WorktreeCreateResult = z.infer<typeof WorktreeCreateResultSchema>;

export type WorktreeListParams = z.infer<typeof WorktreeListParamsSchema>;
export type WorktreeListResult = z.infer<typeof WorktreeListResultSchema>;

export type WorktreeStatusParams = z.infer<typeof WorktreeStatusParamsSchema>;
export type WorktreeStatusResult = z.infer<typeof WorktreeStatusResultSchema>;

export type WorktreeDiffParams = z.infer<typeof WorktreeDiffParamsSchema>;
export type WorktreeDiffResult = z.infer<typeof WorktreeDiffResultSchema>;

export type WorktreeRemoveParams = z.infer<typeof WorktreeRemoveParamsSchema>;
export type WorktreeRemoveResult = z.infer<typeof WorktreeRemoveResultSchema>;

export interface ManagedWorktreeRecord {
  id: string;
  projectId: string;
  sessionId?: string;
  repositoryRoot: string;
  worktreePath: string;
  branchName: string;
  baseRef: string;
  baseCommit: string;
  headCommit: string;
  state: WorktreeState;
  createdAt: number;
  updatedAt: number;
  removedAt?: number | null;
  createdBy: string;
}

export type WorkspaceMode = "direct" | "managed-worktree";

export interface ResolvedWorkspace {
  workspaceRoot: string;
  workspaceMode: WorkspaceMode;
  worktreeId?: string;
  branchName?: string;
}
