export type WorkflowSessionState = "active" | "completed" | "abandoned";
export type WorkflowSessionOutcome = "completed" | "abandoned";
export type WorkflowSessionCreatedBy = "chat" | "desktop" | "system";

export type WorkflowEventType =
  | "SESSION_STARTED"
  | "SESSION_CHECKPOINT"
  | "SESSION_COMPLETED"
  | "SESSION_ABANDONED"
  | "FILE_CREATED"
  | "FILE_UPDATED"
  | "FILE_PATCHED"
  | "FILE_DELETED"
  | "COMMAND_STARTED"
  | "COMMAND_FINISHED"
  | "JOB_STARTED"
  | "JOB_SUCCEEDED"
  | "JOB_FAILED"
  | "JOB_CANCELLED"
  | "JOB_TIMED_OUT"
  | "JOB_INTERRUPTED"
  | "GIT_STAGE"
  | "GIT_UNSTAGE"
  | "GIT_BRANCH_CREATED"
  | "GIT_BRANCH_SWITCHED"
  | "GIT_COMMIT"
  | "APPROVAL_CREATED"
  | "APPROVAL_APPROVED"
  | "APPROVAL_DENIED"
  | "APPROVAL_CONSUMED"
  | "APPROVAL_EXPIRED"
  | "CODE_DEFINITION"
  | "CODE_REFERENCES"
  | "CODE_DIAGNOSTICS"
  | "CODE_CALL_HIERARCHY"
  | "CODE_IMPACT"
  | "SECURITY_EMERGENCY_STOP"
  | "RUNNER_DISCONNECTED";

export interface WorkflowSession {
  id: string;
  projectId: string;
  title?: string;
  goal: string;
  goals?: string[];
  state: WorkflowSessionState;
  createdAt: number;
  updatedAt: number;
  lastActivityAt: number;
  finishedAt?: number | null;
  createdBy: string;
  finishedBy?: string | null;
  finishReason?: string | null;
  finalNote?: string | null;
  checkpointCount?: number;
  eventCount: number;
  eventsTruncated: boolean;
  latestCheckpointAt?: number | null;
}

export interface WorkflowSessionSummary {
  id?: string;
  sessionId: string;
  projectId: string;
  title?: string;
  goal: string;
  goals?: string[];
  state: WorkflowSessionState;
  checkpointCount?: number;
  eventCount?: number;
  createdAt: number;
  lastActivityAt: number;
  finishedAt?: number | null;
}

export interface WorkflowSessionEvent {
  id: string;
  sessionId: string;
  projectId: string;
  eventType: string;
  operation?: string;
  source: string;
  refType?: string;
  refId?: string;
  target?: string;
  status?: string;
  summary?: Record<string, unknown>;
  createdAt: number;
}

export interface WorkflowCheckpoint {
  id: string;
  sessionId: string;
  checkpointNumber?: number;
  summary: string;
  nextSteps?: string[];
  blockers?: string[];
  createdAt: number;
  createdBy?: string;
}

export interface WorkflowSessionFile {
  sessionId: string;
  relativePath: string;
  firstTouchedAt: number;
  lastTouchedAt: number;
  readCount: number;
  writeCount: number;
  patchCount: number;
  deleteCount: number;
}

export interface WorkflowHandoffPacket {
  version: string;
  session: {
    id: string;
    sessionId: string;
    projectId?: string;
    title?: string;
    goal: string;
    goals?: string[];
    state: WorkflowSessionState;
    createdAt: number;
    lastActivityAt: number;
  };
  project: {
    projectId: string;
    projectName: string;
    enabled: boolean;
    projectUnavailable?: boolean;
  };
  git: {
    isRepository: boolean;
    branch?: string;
    detached?: boolean;
    dirty?: boolean;
    stagedCount?: number;
    unstagedCount?: number;
    untrackedCount?: number;
  };
  workspace?: {
    mode: "direct" | "managed-worktree" | "worktree" | "primary";
    worktreeId?: string;
    worktreePath?: string;
    worktreeRoot?: string;
    branchName?: string;
    baseRef?: string;
    baseBranch?: string;
    baseCommit?: string;
    headCommit?: string;
    isClean?: boolean;
    dirty?: boolean;
  };
  currentStatus: {
    git: {
      isRepository: boolean;
      branch?: string;
      detached?: boolean;
      dirty?: boolean;
      stagedCount?: number;
      unstagedCount?: number;
      untrackedCount?: number;
    };
    jobs: {
      running: number;
      pendingApprovals: number;
    };
  };
  files: {
    touchedFiles: string[];
    recentlyModifiedFiles: string[];
    truncated?: boolean;
  };
  touchedFiles: string[];
  jobs: {
    running: number;
    succeeded: number;
    failed: number;
    cancelled: number;
    timedOut: number;
    recentJobs: Array<{
      jobId: string;
      commandKind: string;
      state: string;
      exitCode?: number | null;
      createdAt: number;
      finishedAt?: number | null;
    }>;
    truncated?: boolean;
  };
  approvals: {
    pendingCount: number;
    recentDecisionSummary: string[];
  };
  checkpoint: {
    latestSummary?: string;
    nextSteps?: string[];
    blockers?: string[];
    createdAt?: number;
  };
  recentCheckpoints: Array<{
    id: string;
    checkpointNumber?: number;
    summary: string;
    nextSteps?: string[];
    blockers?: string[];
    createdAt: number;
  }>;
  recentEvents: Array<Record<string, unknown>>;
  recentErrors: {
    recentFailedJobs: string[];
    recentSecurityOrLspErrors: string[];
  };
  warnings: string[];
  continuationPrompt: string;
}

export interface SessionMetadata {
  source?: string;
  clientLabel?: string;
}

// 1. localbridge_session_start
export interface SessionStartParams {
  projectId: string;
  goal?: string;
  goals?: string[];
  title?: string;
  metadata?: SessionMetadata;
}

export interface SessionStartResult {
  sessionId: string;
  projectId: string;
  goal: string;
  goals?: string[];
  title?: string;
  state: "active";
  createdAt: number;
  checkpointCount?: number;
  eventCount?: number;
  session?: WorkflowSession;
}

// 2. localbridge_session_list
export interface SessionListParams {
  projectId: string;
  state?: WorkflowSessionState;
  limit?: number;
  offset?: number;
  cursor?: string;
}

export interface SessionListResult {
  sessions: WorkflowSessionSummary[];
  total?: number;
  nextCursor?: string;
  hasMore: boolean;
}

// 3. localbridge_session_status
export interface SessionStatusParams {
  sessionId?: string;
  projectId?: string;
}

export interface SessionStatusResult {
  sessionId?: string;
  projectId?: string;
  state?: WorkflowSessionState;
  goal?: string;
  goals?: string[];
  title?: string;
  createdAt?: number;
  lastActivityAt?: number;
  eventCount?: number;
  touchedFilesCount?: number;
  jobsCount?: number;
  approvalsCount?: number;
  checkpointCount?: number;
  latestCheckpoint?: {
    summary: string;
    nextSteps?: string[];
    blockers?: string[];
    createdAt: number;
  } | null;
  activeJobs?: Array<{
    jobId: string;
    commandKind: string;
    state: string;
    createdAt: number;
  }>;
  workspace?: {
    mode: "direct" | "managed-worktree" | "worktree" | "primary";
    worktreeId?: string;
    worktreePath?: string;
    worktreeRoot?: string;
    branchName?: string;
    baseRef?: string;
    baseBranch?: string;
    baseCommit?: string;
    headCommit?: string;
    isClean?: boolean;
    dirty?: boolean;
    projectRoot?: string;
  };
  activeSession?: any;
  session?: any;
}

// 4. localbridge_session_events
export interface SessionEventsParams {
  sessionId: string;
  cursor?: string;
  limit?: number;
  offset?: number;
}

export interface SessionEventsResult {
  events: WorkflowSessionEvent[];
  nextCursor?: string;
  hasMore: boolean;
  eventsTruncated: boolean;
}

// 5. localbridge_session_checkpoint
export interface SessionCheckpointParams {
  sessionId: string;
  summary: string;
  nextSteps?: string[];
  blockers?: string[];
  metadata?: SessionMetadata;
}

export interface SessionCheckpointResult {
  checkpointId: string;
  sessionId: string;
  createdAt: number;
  checkpoint?: WorkflowCheckpoint;
}

// 6. localbridge_session_handoff
export interface SessionHandoffParams {
  sessionId: string;
}

export type SessionHandoffResult = WorkflowHandoffPacket & {
  handoff?: WorkflowHandoffPacket;
};

// 7. localbridge_session_finish
export interface SessionFinishParams {
  sessionId: string;
  outcome?: WorkflowSessionOutcome;
  finalNote?: string;
  reason?: string;
  notes?: string;
}

export interface SessionFinishResult {
  sessionId: string;
  projectId: string;
  state: "completed" | "abandoned";
  finishedAt: number;
  finishReason: string;
  finalNote?: string;
  session?: any;
}
