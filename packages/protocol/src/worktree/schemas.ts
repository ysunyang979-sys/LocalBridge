import { z } from "zod";

export const WorktreeStateSchema = z.enum([
  "creating",
  "ready",
  "removing",
  "removed",
  "error",
]);

export const WorktreeSummarySchema = z
  .object({
    worktreeId: z.string(),
    id: z.string().optional(),
    projectId: z.string(),
    sessionId: z.string().optional(),
    worktreePath: z.string(),
    branchName: z.string(),
    baseRef: z.string(),
    baseCommit: z.string(),
    headCommit: z.string(),
    state: WorktreeStateSchema,
    isClean: z.boolean().optional(),
    dirty: z.boolean().optional(),
    createdAt: z.number(),
    updatedAt: z.number(),
    removedAt: z.number().nullable().optional(),
  })
  .passthrough();

// 1. localbridge_worktree_create
export const WorktreeCreateParamsSchema = z
  .object({
    projectId: z.string().min(1, "projectId is required"),
    sessionId: z.string().optional(),
    branchName: z.string().min(1, "branchName is required"),
    baseRef: z.string().optional(),
    baseBranch: z.string().optional(),
    baseCommit: z.string().optional(),
  })
  .strict();

export const WorktreeCreateResultSchema = z
  .object({
    worktreeId: z.string(),
    projectId: z.string(),
    sessionId: z.string().optional(),
    worktreePath: z.string(),
    branchName: z.string(),
    baseRef: z.string(),
    baseCommit: z.string(),
    headCommit: z.string(),
    state: WorktreeStateSchema,
    createdAt: z.number(),
  })
  .passthrough();

// 2. localbridge_worktree_list
export const WorktreeListParamsSchema = z
  .object({
    projectId: z.string().min(1, "projectId is required"),
    sessionId: z.string().optional(),
  })
  .strict();

export const WorktreeListResultSchema = z
  .object({
    worktrees: z.array(WorktreeSummarySchema),
    total: z.number(),
  })
  .passthrough();

// 3. localbridge_worktree_status
export const WorktreeStatusParamsSchema = z
  .object({
    worktreeId: z.string().optional(),
    projectId: z.string().optional(),
    sessionId: z.string().optional(),
  })
  .strict();

export const WorktreeStatusResultSchema = z
  .object({
    worktreeId: z.string(),
    projectId: z.string(),
    sessionId: z.string().optional(),
    worktreePath: z.string(),
    branchName: z.string(),
    baseRef: z.string(),
    baseCommit: z.string(),
    headCommit: z.string(),
    state: WorktreeStateSchema,
    isClean: z.boolean(),
    dirty: z.boolean(),
    stagedCount: z.number(),
    unstagedCount: z.number(),
    untrackedCount: z.number(),
    createdAt: z.number(),
    updatedAt: z.number(),
  })
  .passthrough();

// 4. localbridge_worktree_diff
export const WorktreeDiffParamsSchema = z
  .object({
    worktreeId: z.string().optional(),
    projectId: z.string().optional(),
    sessionId: z.string().optional(),
    cached: z.boolean().optional(),
  })
  .strict();

export const WorktreeDiffResultSchema = z
  .object({
    worktreeId: z.string(),
    branchName: z.string(),
    baseRef: z.string(),
    baseCommit: z.string(),
    headCommit: z.string(),
    diff: z.string(),
    truncated: z.boolean().optional(),
    stats: z
      .object({
        filesChanged: z.number(),
        insertions: z.number(),
        deletions: z.number(),
      })
      .optional(),
  })
  .passthrough();

// 5. localbridge_worktree_remove
export const WorktreeRemoveParamsSchema = z
  .object({
    worktreeId: z.string().min(1, "worktreeId is required"),
    projectId: z.string().optional(),
    sessionId: z.string().optional(),
  })
  .strict();

export const WorktreeRemoveResultSchema = z
  .object({
    worktreeId: z.string(),
    removed: z.boolean(),
    removedAt: z.number(),
  })
  .passthrough();
