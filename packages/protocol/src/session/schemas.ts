import { z } from "zod";

export const WorkflowSessionStateSchema = z.enum(["active", "completed", "abandoned"]);
export const WorkflowSessionOutcomeSchema = z.enum(["completed", "abandoned"]);

export const SessionMetadataSchema = z
  .object({
    source: z.string().max(100, "source must be at most 100 characters").optional(),
    clientLabel: z.string().max(100, "clientLabel must be at most 100 characters").optional(),
  })
  .strict();

// 1. localbridge_session_start
export const SessionStartParamsSchema = z
  .object({
    projectId: z.string().min(1, "projectId is required"),
    goal: z.string().max(1000, "goal must be at most 1000 characters").optional(),
    goals: z.array(z.string().max(500)).max(20).optional(),
    title: z.string().max(200, "title must be at most 200 characters").optional(),
    metadata: SessionMetadataSchema.optional(),
  })
  .strict();

export const SessionStartResultSchema = z
  .object({
    sessionId: z.string(),
    projectId: z.string(),
    goal: z.string(),
    goals: z.array(z.string()).optional(),
    title: z.string().optional(),
    state: z.literal("active"),
    createdAt: z.number(),
    checkpointCount: z.number().optional(),
    eventCount: z.number().optional(),
    session: z.record(z.unknown()).optional(),
  })
  .passthrough();

// 2. localbridge_session_list
export const SessionListParamsSchema = z
  .object({
    projectId: z.string().min(1, "projectId is required"),
    state: WorkflowSessionStateSchema.optional(),
    limit: z.number().int().positive().max(100).default(20).optional(),
    offset: z.number().int().nonnegative().optional(),
    cursor: z.string().optional(),
  })
  .strict();

export const WorkflowSessionSummarySchema = z
  .object({
    id: z.string().optional(),
    sessionId: z.string(),
    projectId: z.string(),
    title: z.string().optional(),
    goal: z.string(),
    goals: z.array(z.string()).optional(),
    state: WorkflowSessionStateSchema,
    checkpointCount: z.number().optional(),
    eventCount: z.number().optional(),
    createdAt: z.number(),
    lastActivityAt: z.number(),
    finishedAt: z.number().nullable().optional(),
  })
  .passthrough();

export const SessionListResultSchema = z
  .object({
    sessions: z.array(WorkflowSessionSummarySchema),
    total: z.number().optional(),
    nextCursor: z.string().optional(),
    hasMore: z.boolean(),
  })
  .passthrough();

// 3. localbridge_session_status
export const SessionStatusParamsSchema = z
  .object({
    sessionId: z.string().optional(),
    projectId: z.string().optional(),
  })
  .strict();

export const SessionStatusResultSchema = z
  .object({
    sessionId: z.string().optional(),
    projectId: z.string().optional(),
    state: WorkflowSessionStateSchema.optional(),
    goal: z.string().optional(),
    goals: z.array(z.string()).optional(),
    title: z.string().optional(),
    createdAt: z.number().optional(),
    lastActivityAt: z.number().optional(),
    eventCount: z.number().optional(),
    touchedFilesCount: z.number().optional(),
    jobsCount: z.number().optional(),
    approvalsCount: z.number().optional(),
    checkpointCount: z.number().optional(),
    latestCheckpoint: z
      .object({
        summary: z.string(),
        nextSteps: z.array(z.string()).optional(),
        blockers: z.array(z.string()).optional(),
        createdAt: z.number(),
      })
      .nullable()
      .optional(),
    activeJobs: z
      .array(
        z.object({
          jobId: z.string(),
          commandKind: z.string(),
          state: z.string(),
          createdAt: z.number(),
        })
      )
      .optional(),
    activeSession: z.record(z.unknown()).nullable().optional(),
    session: z.record(z.unknown()).nullable().optional(),
  })
  .passthrough();

// 4. localbridge_session_events
export const SessionEventsParamsSchema = z
  .object({
    sessionId: z.string().min(1, "sessionId is required"),
    cursor: z.string().optional(),
    limit: z.number().int().positive().max(200).default(50).optional(),
    offset: z.number().int().nonnegative().optional(),
  })
  .strict();

export const WorkflowSessionEventSchema = z
  .object({
    id: z.string(),
    sessionId: z.string(),
    projectId: z.string(),
    eventType: z.string(),
    operation: z.string().optional(),
    source: z.string(),
    refType: z.string().optional(),
    refId: z.string().optional(),
    target: z.string().optional(),
    status: z.string().optional(),
    summary: z.record(z.unknown()).optional(),
    createdAt: z.number(),
  })
  .passthrough();

export const SessionEventsResultSchema = z
  .object({
    events: z.array(WorkflowSessionEventSchema),
    nextCursor: z.string().optional(),
    hasMore: z.boolean(),
    eventsTruncated: z.boolean(),
  })
  .passthrough();

// 5. localbridge_session_checkpoint
export const SessionCheckpointParamsSchema = z
  .object({
    sessionId: z.string().min(1, "sessionId is required"),
    summary: z
      .string()
      .min(1, "summary is required")
      .max(2000, "summary must be at most 2000 characters"),
    nextSteps: z
      .array(z.string().max(300, "Each nextStep must be at most 300 characters"))
      .max(10, "nextSteps can have at most 10 items")
      .optional(),
    blockers: z
      .array(z.string().max(300, "Each blocker must be at most 300 characters"))
      .max(10, "blockers can have at most 10 items")
      .optional(),
    metadata: SessionMetadataSchema.optional(),
  })
  .strict();

export const SessionCheckpointResultSchema = z
  .object({
    checkpointId: z.string(),
    sessionId: z.string(),
    createdAt: z.number(),
    checkpoint: z.record(z.unknown()).optional(),
  })
  .passthrough();

// 6. localbridge_session_handoff
export const SessionHandoffParamsSchema = z
  .object({
    sessionId: z.string().min(1, "sessionId is required"),
  })
  .strict();

export const SessionHandoffResultSchema = z
  .object({
    version: z.string().optional(),
    session: z
      .object({
        id: z.string().optional(),
        sessionId: z.string(),
        title: z.string().optional(),
        goal: z.string(),
        goals: z.array(z.string()).optional(),
        state: WorkflowSessionStateSchema,
        createdAt: z.number(),
        lastActivityAt: z.number(),
      })
      .passthrough(),
    project: z
      .object({
        projectId: z.string(),
        projectName: z.string(),
        enabled: z.boolean(),
        projectUnavailable: z.boolean().optional(),
      })
      .passthrough(),
    git: z
      .object({
        isRepository: z.boolean(),
        branch: z.string().optional(),
        detached: z.boolean().optional(),
        dirty: z.boolean().optional(),
        stagedCount: z.number().optional(),
        unstagedCount: z.number().optional(),
        untrackedCount: z.number().optional(),
      })
      .passthrough(),
    currentStatus: z.record(z.unknown()).optional(),
    files: z
      .object({
        touchedFiles: z.array(z.string()),
        recentlyModifiedFiles: z.array(z.string()),
        truncated: z.boolean().optional(),
      })
      .passthrough(),
    touchedFiles: z.array(z.string()).optional(),
    jobs: z
      .object({
        running: z.number(),
        succeeded: z.number(),
        failed: z.number(),
        cancelled: z.number(),
        timedOut: z.number(),
        recentJobs: z.array(
          z
            .object({
              jobId: z.string(),
              commandKind: z.string(),
              state: z.string(),
              exitCode: z.number().nullable().optional(),
              createdAt: z.number(),
              finishedAt: z.number().nullable().optional(),
            })
            .passthrough()
        ),
        truncated: z.boolean().optional(),
      })
      .passthrough(),
    approvals: z
      .object({
        pendingCount: z.number(),
        recentDecisionSummary: z.array(z.string()),
      })
      .passthrough(),
    checkpoint: z
      .object({
        latestSummary: z.string().optional(),
        nextSteps: z.array(z.string()).optional(),
        blockers: z.array(z.string()).optional(),
        createdAt: z.number().optional(),
      })
      .passthrough(),
    recentCheckpoints: z.array(z.record(z.unknown())).optional(),
    recentEvents: z.array(z.record(z.unknown())).optional(),
    recentErrors: z
      .object({
        recentFailedJobs: z.array(z.string()),
        recentSecurityOrLspErrors: z.array(z.string()),
      })
      .passthrough(),
    warnings: z.array(z.string()),
    continuationPrompt: z.string().optional(),
    handoff: z.record(z.unknown()).optional(),
  })
  .passthrough();

// 7. localbridge_session_finish
export const SessionFinishParamsSchema = z
  .object({
    sessionId: z.string().min(1, "sessionId is required"),
    outcome: WorkflowSessionOutcomeSchema.optional().default("completed"),
    finalNote: z.string().max(1000, "finalNote must be at most 1000 characters").optional(),
    reason: z.string().max(1000).optional(),
    notes: z.string().max(1000).optional(),
  })
  .strict();

export const SessionFinishResultSchema = z
  .object({
    sessionId: z.string(),
    projectId: z.string(),
    state: WorkflowSessionOutcomeSchema,
    finishedAt: z.number(),
    finishReason: z.string(),
    finalNote: z.string().optional(),
    session: z.record(z.unknown()).optional(),
  })
  .passthrough();
