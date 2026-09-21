import { isTauri, invoke } from "@tauri-apps/api/core";
import type {
  ServerStatus,
  McpStatus,
  Project,
  Approval,
  Job,
  JobLogsResult,
  Token,
  RunnerInfo,
  AuditEvent,
  DesktopHealthStatus,
  ProjectTrustPolicy,
  ApprovalRoutingMode,
  LspServerStatus,
  WorkflowSession,
  WorkflowCheckpoint,
  WorkflowSessionEvent,
  WorkflowHandoffPacket,
  PersistentRuntime,
  RuntimeLogChunk,
  DecisionContext,
  DecisionAdvice,
  DecisionProviderConfig,
  IntelligenceStatusDto,
  ModelStatusDto,
  ModelDownloadOptions,
  ModelValidationResult,
  ModelImportOptions,
} from "../types.js";

const DEFAULT_SERVER_URL = "http://127.0.0.1:18080";

class ApiBridge {
  private baseUrl = DEFAULT_SERVER_URL;

  getBaseUrl(): string {
    return this.baseUrl;
  }

  setBaseUrl(url: string): void {
    this.baseUrl = url.replace(/\/+$/, "");
    if (isTauri()) {
      invoke("desktop_set_server_url", { url: this.baseUrl }).catch(() => {});
    }
  }

  private async fetchJson<T>(
    endpoint: string,
    options?: RequestInit
  ): Promise<T> {
    const url = `${this.baseUrl}${endpoint}`;
    const res = await fetch(url, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...(options?.headers || {}),
      },
    });

    if (!res.ok) {
      let errBody: any;
      try {
        errBody = await res.json();
      } catch {
        errBody = { message: res.statusText };
      }
      throw new Error(
        errBody.message || errBody.error || `HTTP ${res.status}: ${res.statusText}`
      );
    }

    return (await res.json()) as T;
  }

  // Supervisor / Desktop Health
  async getDesktopHealth(): Promise<DesktopHealthStatus | null> {
    if (isTauri()) {
      try {
        return await invoke<DesktopHealthStatus>("check_desktop_health");
      } catch {
        return null;
      }
    }
    return null;
  }

  // System & MCP Status
  async getStatus(): Promise<ServerStatus> {
    if (isTauri()) {
      return invoke<ServerStatus>("desktop_get_status");
    }
    return this.fetchJson<ServerStatus>("/api/status");
  }

  async getMcpStatus(): Promise<McpStatus> {
    if (isTauri()) {
      return invoke<McpStatus>("desktop_get_mcp_status");
    }
    return this.fetchJson<McpStatus>("/api/mcp/status");
  }

  // Global Pause & Emergency Stop
  async getPauseState(): Promise<{ paused: boolean }> {
    if (isTauri()) {
      return invoke<{ paused: boolean }>("desktop_get_pause_state");
    }
    return this.fetchJson<{ paused: boolean }>("/api/pause");
  }

  async setPauseState(paused: boolean): Promise<{ paused: boolean }> {
    if (isTauri()) {
      return invoke<{ paused: boolean }>("desktop_set_pause_state", { paused });
    }
    return this.fetchJson<{ paused: boolean }>("/api/pause", {
      method: "POST",
      body: JSON.stringify({ paused }),
    });
  }

  async emergencyStop(reason?: string): Promise<{
    emergencyStopped: boolean;
    paused: boolean;
    cancelledJobsCount: number;
    jobIds: string[];
  }> {
    if (isTauri()) {
      return invoke<{
        emergencyStopped: boolean;
        paused: boolean;
        cancelledJobsCount: number;
        jobIds: string[];
      }>("desktop_emergency_stop", { reason: reason || null });
    }
    return this.fetchJson<{
      emergencyStopped: boolean;
      paused: boolean;
      cancelledJobsCount: number;
      jobIds: string[];
    }>("/api/emergency-stop", {
      method: "POST",
      body: JSON.stringify({ reason: reason || "Emergency stop initiated from Desktop" }),
    });
  }

  // Runners
  async listRunners(): Promise<{ runners: RunnerInfo[] }> {
    let raw: any;
    if (isTauri()) {
      raw = await invoke<any>("desktop_list_runners");
    } else {
      raw = await this.fetchJson<any>("/api/runners");
    }

    if (Array.isArray(raw)) {
      return { runners: raw };
    }
    if (raw && Array.isArray(raw.runners)) {
      return { runners: raw.runners };
    }
    return { runners: [] };
  }

  // Projects
  async listProjects(): Promise<{ projects: Project[] }> {
    if (isTauri()) {
      return invoke<{ projects: Project[] }>("desktop_list_projects");
    }
    return this.fetchJson<{ projects: Project[] }>("/api/projects");
  }

  async authorizeProject(params: {
    path: string;
    name?: string;
    accessMode?: "read-only" | "read-write";
  }): Promise<Project> {
    if (isTauri()) {
      return invoke<Project>("desktop_authorize_project", {
        path: params.path,
        name: params.name ?? null,
        accessMode: params.accessMode ?? null,
      });
    }
    return this.fetchJson<Project>("/api/management/projects/authorize", {
      method: "POST",
      body: JSON.stringify(params),
    });
  }

  async setProjectAccess(
    projectId: string,
    accessMode: "read-only" | "read-write"
  ): Promise<Project> {
    if (isTauri()) {
      return invoke<Project>("desktop_set_project_access", {
        projectId,
        accessMode,
      });
    }
    return this.fetchJson<Project>(`/api/management/projects/${projectId}/access`, {
      method: "POST",
      body: JSON.stringify({ accessMode }),
    });
  }

  async setProjectExecution(
    projectId: string,
    executionMode: "disabled" | "safe-only" | "project-code"
  ): Promise<Project> {
    if (isTauri()) {
      return invoke<Project>("desktop_set_project_execution", {
        projectId,
        executionMode,
      });
    }
    return this.fetchJson<Project>(
      `/api/management/projects/${projectId}/execution`,
      {
        method: "POST",
        body: JSON.stringify({ executionMode }),
      }
    );
  }

  async removeProject(projectId: string): Promise<{ id: string; removed: boolean }> {
    if (isTauri()) {
      return invoke<{ id: string; removed: boolean }>("desktop_remove_project", {
        projectId,
      });
    }
    return this.fetchJson<{ id: string; removed: boolean }>(
      `/api/management/projects/${projectId}`,
      {
        method: "DELETE",
      }
    );
  }

  async enableProject(projectId: string): Promise<Project> {
    if (isTauri()) {
      return invoke<Project>("desktop_enable_project", { projectId });
    }
    return this.fetchJson<Project>(
      `/api/management/projects/${projectId}/enable`,
      {
        method: "POST",
      }
    );
  }

  async disableProject(projectId: string): Promise<Project> {
    if (isTauri()) {
      return invoke<Project>("desktop_disable_project", { projectId });
    }
    return this.fetchJson<Project>(
      `/api/management/projects/${projectId}/disable`,
      {
        method: "POST",
      }
    );
  }

  // Approvals
  async listApprovals(params?: {
    projectId?: string;
    status?: string;
  }): Promise<{ approvals: Approval[] }> {
    if (isTauri()) {
      return invoke<{ approvals: Approval[] }>("desktop_list_approvals", {
        projectId: params?.projectId ?? null,
        status: params?.status ?? null,
      });
    }
    const query = new URLSearchParams();
    if (params?.projectId) query.set("projectId", params.projectId);
    if (params?.status) query.set("status", params.status);
    const qs = query.toString() ? `?${query.toString()}` : "";
    return this.fetchJson<{ approvals: Approval[] }>(`/api/approvals${qs}`);
  }

  async resolveApproval(
    approvalId: string,
    action: "approve" | "deny",
    resolvedBy?: string
  ): Promise<Approval> {
    if (isTauri()) {
      return invoke<Approval>("desktop_resolve_approval", {
        approvalId,
        action,
        resolvedBy: resolvedBy ?? null,
      });
    }
    return this.fetchJson<Approval>(`/api/approvals/${approvalId}/resolve`, {
      method: "POST",
      body: JSON.stringify({
        action,
        resolvedBy: resolvedBy || "desktop-user",
        decisionSource: "desktop",
      }),
    });
  }

  async bulkResolveApprovals(
    approvalIds: string[],
    action: "approve" | "deny",
    resolvedBy?: string
  ): Promise<{
    resolvedCount: number;
    failedCount: number;
    results: Array<{ approvalId: string; success: boolean; error?: string }>;
  }> {
    if (isTauri()) {
      return invoke<{
        resolvedCount: number;
        failedCount: number;
        results: Array<{ approvalId: string; success: boolean; error?: string }>;
      }>("desktop_bulk_resolve_approvals", {
        approvalIds,
        action,
        resolvedBy: resolvedBy ?? null,
      });
    }
    return this.fetchJson<{
      resolvedCount: number;
      failedCount: number;
      results: Array<{ approvalId: string; success: boolean; error?: string }>;
    }>("/api/management/approvals/bulk-resolve", {
      method: "POST",
      body: JSON.stringify({ approvalIds, action, resolvedBy }),
    });
  }

  // Trust & Approval Policy
  async getProjectTrustPolicy(
    projectId: string
  ): Promise<{ projectId: string; trustPolicy: ProjectTrustPolicy }> {
    if (isTauri()) {
      return invoke<{ projectId: string; trustPolicy: ProjectTrustPolicy }>(
        "desktop_get_project_trust_policy",
        { projectId }
      );
    }
    return this.fetchJson<{ projectId: string; trustPolicy: ProjectTrustPolicy }>(
      `/api/management/projects/${projectId}/trust-policy`
    );
  }

  async setProjectTrustPolicy(
    projectId: string,
    trustPolicy: ProjectTrustPolicy
  ): Promise<{ projectId: string; trustPolicy: ProjectTrustPolicy }> {
    if (isTauri()) {
      return invoke<{ projectId: string; trustPolicy: ProjectTrustPolicy }>(
        "desktop_set_project_trust_policy",
        { projectId, trustPolicy }
      );
    }
    return this.fetchJson<{ projectId: string; trustPolicy: ProjectTrustPolicy }>(
      `/api/management/projects/${projectId}/trust-policy`,
      {
        method: "POST",
        body: JSON.stringify({ trustPolicy }),
      }
    );
  }

  async grantProjectSessionTrust(
    projectId: string
  ): Promise<{ projectId: string; isSessionTrusted: boolean }> {
    if (isTauri()) {
      return invoke<{ projectId: string; isSessionTrusted: boolean }>(
        "desktop_grant_session_trust",
        { projectId }
      );
    }
    return this.fetchJson<{ projectId: string; isSessionTrusted: boolean }>(
      `/api/management/projects/${projectId}/session-trust`,
      {
        method: "POST",
        body: JSON.stringify({ action: "grant" }),
      }
    );
  }

  async revokeProjectSessionTrust(
    projectId: string
  ): Promise<{ projectId: string; isSessionTrusted: boolean }> {
    if (isTauri()) {
      return invoke<{ projectId: string; isSessionTrusted: boolean }>(
        "desktop_revoke_session_trust",
        { projectId }
      );
    }
    return this.fetchJson<{ projectId: string; isSessionTrusted: boolean }>(
      `/api/management/projects/${projectId}/session-trust`,
      {
        method: "DELETE",
      }
    );
  }

  async resetTrustPoliciesToDefaults(): Promise<{ reset: boolean }> {
    if (isTauri()) {
      return invoke<{ reset: boolean }>("desktop_reset_trust_defaults");
    }
    return this.fetchJson<{ reset: boolean }>(
      "/api/management/trust/reset-defaults",
      {
        method: "POST",
      }
    );
  }

  async clearAllSessionTrust(): Promise<{ cleared: boolean }> {
    if (isTauri()) {
      return invoke<{ cleared: boolean }>("desktop_clear_session_trusts");
    }
    return this.fetchJson<{ cleared: boolean }>(
      "/api/management/trust/clear-sessions",
      {
        method: "POST",
      }
    );
  }

  async getOperatorDisplayName(): Promise<{ displayName: string }> {
    if (isTauri()) {
      return invoke<{ displayName: string }>("desktop_get_operator_name");
    }
    return this.fetchJson<{ displayName: string }>(
      "/api/management/settings/operator"
    );
  }

  async setOperatorDisplayName(
    displayName: string
  ): Promise<{ displayName: string }> {
    if (isTauri()) {
      return invoke<{ displayName: string }>("desktop_set_operator_name", {
        displayName,
      });
    }
    return this.fetchJson<{ displayName: string }>(
      "/api/management/settings/operator",
      {
        method: "POST",
        body: JSON.stringify({ displayName }),
      }
    );
  }

  async getApprovalRoutingMode(): Promise<{ mode: ApprovalRoutingMode }> {
    if (isTauri()) {
      return invoke<{ mode: ApprovalRoutingMode }>("desktop_get_approval_routing_mode");
    }
    return this.fetchJson<{ mode: ApprovalRoutingMode }>(
      "/api/management/settings/approval-routing"
    );
  }

  async setApprovalRoutingMode(
    mode: ApprovalRoutingMode
  ): Promise<{ mode: ApprovalRoutingMode }> {
    if (isTauri()) {
      return invoke<{ mode: ApprovalRoutingMode }>("desktop_set_approval_routing_mode", {
        mode,
      });
    }
    return this.fetchJson<{ mode: ApprovalRoutingMode }>(
      "/api/management/settings/approval-routing",
      {
        method: "POST",
        body: JSON.stringify({ mode }),
      }
    );
  }


  // Jobs
  async listJobs(params?: {
    projectId?: string;
    limit?: number;
  }): Promise<{ jobs: Job[] }> {
    if (isTauri()) {
      return invoke<{ jobs: Job[] }>("desktop_list_jobs", {
        projectId: params?.projectId ?? null,
        limit: params?.limit ?? null,
      });
    }
    const query = new URLSearchParams();
    if (params?.projectId) query.set("projectId", params.projectId);
    if (params?.limit) query.set("limit", String(params.limit));
    const qs = query.toString() ? `?${query.toString()}` : "";
    return this.fetchJson<{ jobs: Job[] }>(`/api/jobs${qs}`);
  }

  async cancelJob(jobId: string): Promise<{ jobId: string; state: string }> {
    if (isTauri()) {
      return invoke<{ jobId: string; state: string }>("desktop_cancel_job", {
        jobId,
      });
    }
    return this.fetchJson<{ jobId: string; state: string }>(
      `/api/jobs/${jobId}/cancel`,
      {
        method: "POST",
      }
    );
  }

  async getJobStatus(jobId: string): Promise<Job> {
    if (isTauri()) {
      return invoke<Job>("desktop_get_job_status", { jobId });
    }
    return this.fetchJson<Job>(`/api/jobs/${jobId}/status`);
  }

  async getJobLogs(
    jobId: string,
    cursor?: string | null,
    limit?: number
  ): Promise<JobLogsResult> {
    if (isTauri()) {
      return invoke<JobLogsResult>("desktop_get_job_logs", {
        jobId,
        cursor: cursor ?? null,
        limit: limit ?? null,
      });
    }
    const query = new URLSearchParams();
    if (cursor) query.set("cursor", cursor);
    if (limit) query.set("limit", String(limit));
    const qs = query.toString() ? `?${query.toString()}` : "";
    return this.fetchJson<JobLogsResult>(`/api/jobs/${jobId}/logs${qs}`);
  }

  // Code Intelligence / LSP
  async getLspStatus(projectId?: string): Promise<{ servers: LspServerStatus[] }> {
    const query = projectId ? `?projectId=${encodeURIComponent(projectId)}` : "";
    if (isTauri()) {
      return invoke<{ servers: LspServerStatus[] }>("desktop_get_lsp_status", { projectId: projectId || null });
    }
    return this.fetchJson<{ servers: LspServerStatus[] }>(`/api/management/lsp/status${query}`);
  }

  async restartLspServer(projectId: string): Promise<{ restarted: boolean; status: LspServerStatus }> {
    if (isTauri()) {
      return invoke<{ restarted: boolean; status: LspServerStatus }>("desktop_restart_lsp", { projectId });
    }
    return this.fetchJson<{ restarted: boolean; status: LspServerStatus }>("/api/management/lsp/restart", {
      method: "POST",
      body: JSON.stringify({ projectId }),
    });
  }

  async stopLspServer(projectId: string): Promise<{ stopped: boolean }> {
    if (isTauri()) {
      return invoke<{ stopped: boolean }>("desktop_stop_lsp", { projectId });
    }
    return this.fetchJson<{ stopped: boolean }>("/api/management/lsp/stop", {
      method: "POST",
      body: JSON.stringify({ projectId }),
    });
  }

  // Tokens
  async listTokens(): Promise<{ tokens: Token[] }> {
    if (isTauri()) {
      return invoke<{ tokens: Token[] }>("desktop_list_tokens");
    }
    return this.fetchJson<{ tokens: Token[] }>("/api/tokens");
  }

  async createToken(params: {
    name: string;
    type: "runner" | "mcp";
    scopes?: string[];
    expiresAt?: number | null;
  }): Promise<{ id: string; name: string; type: string; token: string }> {
    if (isTauri()) {
      return invoke<{ id: string; name: string; type: string; token: string }>(
        "desktop_create_token",
        {
          name: params.name,
          tokenType: params.type,
          scopes: params.scopes ?? null,
          expiresAt: params.expiresAt ?? null,
        }
      );
    }
    return this.fetchJson<{ id: string; name: string; type: string; token: string }>(
      "/api/tokens",
      {
        method: "POST",
        body: JSON.stringify(params),
      }
    );
  }

  async revokeToken(tokenId: string): Promise<{ success: boolean; id: string }> {
    if (isTauri()) {
      return invoke<{ success: boolean; id: string }>("desktop_revoke_token", {
        tokenId,
      });
    }
    return this.fetchJson<{ success: boolean; id: string }>(
      `/api/tokens/${tokenId}`,
      {
        method: "DELETE",
      }
    );
  }

  // Audit
  async listAudit(limit = 100): Promise<{ events: AuditEvent[] }> {
    if (isTauri()) {
      return invoke<{ events: AuditEvent[] }>("desktop_list_audit", { limit });
    }
    return this.fetchJson<{ events: AuditEvent[] }>(`/api/audit?limit=${limit}`);
  }

  // Native Folder Picker (Tauri plugin dialog)
  async selectDirectory(): Promise<string | null> {
    if (isTauri()) {
      try {
        const { open } = await import("@tauri-apps/plugin-dialog");
        const selected = await open({
          directory: true,
          multiple: false,
          title: "Select Project Directory to Authorize",
        });
        if (typeof selected === "string") return selected;
        return null;
      } catch (err) {
        console.warn("Tauri dialog error:", err);
      }
    }
    return null;
  }

  async selectModelDirectory(): Promise<string | null> {
    if (isTauri()) {
      try {
        const { open } = await import("@tauri-apps/plugin-dialog");
        const selected = await open({
          directory: true,
          multiple: false,
          title: "Select Laya Model Directory",
        });
        if (typeof selected === "string") return selected;
        return null;
      } catch (err) {
        console.warn("Tauri dialog error:", err);
      }
    }
    return null;
  }

  // Secure MCP Tunnel
  async getTunnelStatus(): Promise<TunnelStatusDto> {
    if (isTauri()) {
      return invoke<TunnelStatusDto>("desktop_tunnel_get_status");
    }
    return {
      configured: false,
      status: "NotConfigured",
      has_api_key: false,
      has_mcp_token: false,
      auto_reconnect: true,
      health_port: 8080,
      reconnect_attempts: 0,
      network_mode: "system",
      control_plane_connected: false,
      local_mcp_connected: true,
    };
  }

  /**
   * Typed Secure MCP Tunnel API wrapper
   */
  readonly tunnel: DesktopTunnelApi = {
    getStatus: () => this.getTunnelStatus(),
    saveConfig: (input: TunnelSaveConfigInput) => this.saveTunnelConfig(input),
    autoCreateToken: (scopes?: string[]) => this.autoCreateTunnelToken(scopes),
    start: () => this.startTunnel(),
    stop: () => this.stopTunnel(),
    clearConfig: () => this.clearTunnelConfig(),
    testConnection: () => this.testTunnelConnection(),
  };

  async saveTunnelConfig(params: TunnelSaveConfigInput): Promise<TunnelStatusDto> {
    if (isTauri()) {
      return invoke<TunnelStatusDto>("desktop_tunnel_save_config", {
        tunnelId: params.tunnelId,
        runtimeApiKey: params.runtimeApiKey ?? null,
        mcpToken: params.mcpToken ?? null,
        autoReconnect: params.autoReconnect ?? null,
        healthPort: params.healthPort ?? null,
        networkMode: params.networkMode ?? null,
        customProxyUrl: params.customProxyUrl ?? null,
        connectNow: params.connectNow ?? null,
      });
    }
    throw new Error("Tunnel configuration requires desktop app");
  }

  async autoCreateTunnelToken(scopes?: string[]): Promise<{ success: boolean; message: string }> {
    if (isTauri()) {
      return invoke<{ success: boolean; message: string }>("desktop_tunnel_auto_create_token", {
        scopes: scopes ?? null,
      });
    }
    throw new Error("Auto creating tunnel token requires desktop app");
  }

  async startTunnel(): Promise<TunnelStatusDto> {
    if (isTauri()) {
      return invoke<TunnelStatusDto>("desktop_tunnel_start");
    }
    throw new Error("Tunnel control requires desktop app");
  }

  async stopTunnel(): Promise<TunnelStatusDto> {
    if (isTauri()) {
      return invoke<TunnelStatusDto>("desktop_tunnel_stop");
    }
    throw new Error("Tunnel control requires desktop app");
  }

  async clearTunnelConfig(): Promise<TunnelStatusDto> {
    if (isTauri()) {
      return invoke<TunnelStatusDto>("desktop_tunnel_clear_config");
    }
    throw new Error("Tunnel control requires desktop app");
  }

  async testTunnelConnection(params?: TunnelTestConnectionParams): Promise<TunnelTestConnectionResult> {
    if (isTauri()) {
      return invoke<TunnelTestConnectionResult>("desktop_tunnel_test_connection", {
        networkMode: params?.networkMode ?? null,
        customProxyUrl: params?.customProxyUrl ?? null,
      });
    }
    return {
      success: false,
      stage: "local_mcp",
      mcpServerOnline: false,
      mcpServerUrl: "http://127.0.0.1:18080/mcp",
      hasMcpToken: false,
      message: "Tunnel control requires desktop app",
    };
  }

  // Workflow Sessions
  async listSessions(params?: {
    projectId?: string;
    state?: string;
    limit?: number;
    offset?: number;
  }): Promise<{ sessions: WorkflowSession[]; total: number }> {
    if (isTauri()) {
      return invoke<{ sessions: WorkflowSession[]; total: number }>("desktop_list_sessions", {
        projectId: params?.projectId,
        sessionState: params?.state,
        limit: params?.limit,
        offset: params?.offset,
      });
    }
    const qs = new URLSearchParams();
    if (params?.projectId) qs.set("projectId", params.projectId);
    if (params?.state) qs.set("state", params.state);
    if (params?.limit) qs.set("limit", String(params.limit));
    if (params?.offset) qs.set("offset", String(params.offset));
    const query = qs.toString();
    return this.fetchJson<{ sessions: WorkflowSession[]; total: number }>(
      `/api/management/sessions${query ? `?${query}` : ""}`
    );
  }

  async getSession(sessionId: string): Promise<{ session: WorkflowSession }> {
    if (isTauri()) {
      return invoke<{ session: WorkflowSession }>("desktop_get_session", { sessionId });
    }
    return this.fetchJson<{ session: WorkflowSession }>(`/api/management/sessions/${sessionId}`);
  }

  async getSessionEvents(
    sessionId: string,
    cursor?: string,
    limit?: number
  ): Promise<{ events: WorkflowSessionEvent[]; nextCursor?: string; hasMore: boolean }> {
    if (isTauri()) {
      return invoke<{ events: WorkflowSessionEvent[]; nextCursor?: string; hasMore: boolean }>(
        "desktop_get_session_events",
        { sessionId, cursor, limit }
      );
    }
    const qs = new URLSearchParams();
    if (cursor) qs.set("cursor", cursor);
    if (limit) qs.set("limit", String(limit));
    const query = qs.toString();
    return this.fetchJson<{ events: WorkflowSessionEvent[]; nextCursor?: string; hasMore: boolean }>(
      `/api/management/sessions/${sessionId}/events${query ? `?${query}` : ""}`
    );
  }

  async getSessionHandoff(sessionId: string): Promise<{ handoff: WorkflowHandoffPacket }> {
    if (isTauri()) {
      return invoke<{ handoff: WorkflowHandoffPacket }>("desktop_get_session_handoff", { sessionId });
    }
    return this.fetchJson<{ handoff: WorkflowHandoffPacket }>(`/api/management/sessions/${sessionId}/handoff`);
  }

  async startSession(
    projectId: string,
    title?: string,
    goals?: string[]
  ): Promise<{ session: WorkflowSession }> {
    if (isTauri()) {
      return invoke<{ session: WorkflowSession }>("desktop_start_session", {
        projectId,
        title,
        goals,
      });
    }
    return this.fetchJson<{ session: WorkflowSession }>("/api/management/sessions/start", {
      method: "POST",
      body: JSON.stringify({ projectId, title, goals }),
    });
  }

  async checkpointSession(
    sessionId: string,
    summary: string,
    nextSteps?: string[],
    blockers?: string[]
  ): Promise<{ checkpoint: WorkflowCheckpoint }> {
    if (isTauri()) {
      return invoke<{ checkpoint: WorkflowCheckpoint }>("desktop_checkpoint_session", {
        sessionId,
        summary,
        nextSteps,
        blockers,
      });
    }
    return this.fetchJson<{ checkpoint: WorkflowCheckpoint }>(
      `/api/management/sessions/${sessionId}/checkpoint`,
      {
        method: "POST",
        body: JSON.stringify({ summary, nextSteps, blockers }),
      }
    );
  }

  async finishSession(
    sessionId: string,
    reason?: string,
    notes?: string
  ): Promise<{ session: WorkflowSession }> {
    if (isTauri()) {
      return invoke<{ session: WorkflowSession }>("desktop_finish_session", {
        sessionId,
        reason,
        notes,
      });
    }
    return this.fetchJson<{ session: WorkflowSession }>(
      `/api/management/sessions/${sessionId}/finish`,
      {
        method: "POST",
        body: JSON.stringify({ reason, notes }),
      }
    );
  }

  async removeWorktree(worktreeId: string): Promise<{ worktreeId: string; removed: boolean }> {
    return this.fetchJson<{ worktreeId: string; removed: boolean }>(
      `/api/management/worktrees/${worktreeId}/remove`,
      {
        method: "POST",
      }
    );
  }

  async getWorktreeDiff(worktreeId: string): Promise<{ worktreeId: string; diff: string }> {
    return this.fetchJson<{ worktreeId: string; diff: string }>(
      `/api/management/worktrees/${worktreeId}/diff`
    );
  }

  async listRuntimes(params?: {
    projectId?: string;
    sessionId?: string;
    worktreeId?: string;
    state?: string;
  }): Promise<{ runtimes: PersistentRuntime[]; total: number }> {
    const query = new URLSearchParams();
    if (params?.projectId) query.set("projectId", params.projectId);
    if (params?.sessionId) query.set("sessionId", params.sessionId);
    if (params?.worktreeId) query.set("worktreeId", params.worktreeId);
    if (params?.state) query.set("state", params.state);
    const qs = query.toString();
    return this.fetchJson<{ runtimes: PersistentRuntime[]; total: number }>(
      `/api/management/runtimes${qs ? `?${qs}` : ""}`
    );
  }

  async startRuntime(payload: any): Promise<any> {
    return this.fetchJson<any>("/api/management/runtimes/start", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  }

  async getRuntimeStatus(runtimeId: string): Promise<PersistentRuntime> {
    return this.fetchJson<PersistentRuntime>(`/api/management/runtimes/${runtimeId}`);
  }

  async getRuntimeLogs(
    runtimeId: string,
    options?: { generation?: number; afterSequence?: number; limit?: number }
  ): Promise<{
    runtimeId: string;
    generation: number;
    entries: RuntimeLogChunk[];
    nextSequence: number;
    hasMore: boolean;
    outputTruncated: boolean;
  }> {
    const query = new URLSearchParams();
    if (options?.generation) query.set("generation", String(options.generation));
    if (options?.afterSequence) query.set("afterSequence", String(options.afterSequence));
    if (options?.limit) query.set("limit", String(options.limit));
    const qs = query.toString();
    return this.fetchJson<{
      runtimeId: string;
      generation: number;
      entries: RuntimeLogChunk[];
      nextSequence: number;
      hasMore: boolean;
      outputTruncated: boolean;
    }>(`/api/management/runtimes/${runtimeId}/logs${qs ? `?${qs}` : ""}`);
  }

  async restartRuntime(runtimeId: string, approvalId?: string): Promise<any> {
    return this.fetchJson<any>(`/api/management/runtimes/${runtimeId}/restart`, {
      method: "POST",
      body: JSON.stringify({ approvalId }),
    });
  }

  async stopRuntime(runtimeId: string, gracePeriodMs?: number): Promise<any> {
    return this.fetchJson<any>(`/api/management/runtimes/${runtimeId}/stop`, {
      method: "POST",
      body: JSON.stringify({ gracePeriodMs }),
    });
  }

  // Intelligence & DecisionProvider
  async getIntelligenceStatus(): Promise<IntelligenceStatusDto> {
    if (isTauri()) {
      return invoke<IntelligenceStatusDto>("desktop_get_intelligence_status");
    }
    return this.fetchJson<IntelligenceStatusDto>("/api/management/intelligence/status");
  }

  async updateIntelligenceConfig(
    config: Partial<DecisionProviderConfig>
  ): Promise<IntelligenceStatusDto> {
    if (isTauri()) {
      return invoke<IntelligenceStatusDto>("desktop_update_intelligence_config", {
        provider: config.provider,
        modelPath: config.modelPath,
        pythonPath: config.pythonPath,
        workerTimeoutMs: config.workerTimeoutMs,
      });
    }
    return this.fetchJson<IntelligenceStatusDto>("/api/management/intelligence/config", {
      method: "POST",
      body: JSON.stringify(config),
    });
  }

  async evaluateDecision(context: DecisionContext): Promise<DecisionAdvice> {
    if (isTauri()) {
      return invoke<DecisionAdvice>("desktop_evaluate_intelligence", { context });
    }
    return this.fetchJson<DecisionAdvice>("/api/management/intelligence/evaluate", {
      method: "POST",
      body: JSON.stringify(context),
    });
  }

  async getModelStatus(): Promise<ModelStatusDto> {
    if (isTauri()) {
      return invoke<ModelStatusDto>("desktop_get_model_status");
    }
    return this.fetchJson<ModelStatusDto>("/api/management/intelligence/model/status");
  }

  async startModelDownload(options?: ModelDownloadOptions): Promise<ModelStatusDto> {
    if (isTauri()) {
      return invoke<ModelStatusDto>("desktop_start_model_download", {
        proxyMode: options?.proxyMode,
        customProxyUrl: options?.customProxyUrl,
      });
    }
    return this.fetchJson<ModelStatusDto>("/api/management/intelligence/model/download", {
      method: "POST",
      body: options ? JSON.stringify(options) : undefined,
    });
  }

  async cancelModelDownload(): Promise<ModelStatusDto> {
    if (isTauri()) {
      return invoke<ModelStatusDto>("desktop_cancel_model_download");
    }
    return this.fetchJson<ModelStatusDto>("/api/management/intelligence/model/cancel", {
      method: "POST",
    });
  }

  async downloadAndEnableModel(options?: ModelDownloadOptions): Promise<IntelligenceStatusDto> {
    if (isTauri()) {
      return invoke<IntelligenceStatusDto>("desktop_download_and_enable_model", {
        proxyMode: options?.proxyMode,
        customProxyUrl: options?.customProxyUrl,
      });
    }
    return this.fetchJson<IntelligenceStatusDto>("/api/management/intelligence/model/download-and-enable", {
      method: "POST",
      body: options ? JSON.stringify(options) : undefined,
    });
  }

  async validateModelPath(modelPath: string): Promise<ModelValidationResult> {
    if (isTauri()) {
      return invoke<ModelValidationResult>("desktop_validate_model_path", { modelPath });
    }
    return this.fetchJson<ModelValidationResult>("/api/management/intelligence/model/validate", {
      method: "POST",
      body: JSON.stringify({ modelPath }),
    });
  }

  async setModelPath(modelPath: string): Promise<ModelStatusDto> {
    if (isTauri()) {
      return invoke<ModelStatusDto>("desktop_set_model_path", { modelPath });
    }
    return this.fetchJson<ModelStatusDto>("/api/management/intelligence/model/set-path", {
      method: "POST",
      body: JSON.stringify({ modelPath }),
    });
  }

  async importExistingModel(options: ModelImportOptions): Promise<ModelStatusDto> {
    if (isTauri()) {
      return invoke<ModelStatusDto>("desktop_import_model", {
        sourceDir: options.sourceDir,
        copyToManaged: options.copyToManaged,
      });
    }
    return this.fetchJson<ModelStatusDto>("/api/management/intelligence/model/import", {
      method: "POST",
      body: JSON.stringify(options),
    });
  }
}

export type TunnelNetworkMode = "direct" | "system" | "custom";

export interface TunnelSaveConfigInput {
  tunnelId: string;
  runtimeApiKey?: string;
  mcpToken?: string;
  autoReconnect?: boolean;
  healthPort?: number;
  networkMode?: TunnelNetworkMode;
  customProxyUrl?: string;
  connectNow?: boolean;
}

export interface TunnelTestConnectionParams {
  networkMode?: TunnelNetworkMode;
  customProxyUrl?: string;
}

export interface TunnelTestConnectionResult {
  success: boolean;
  stage: "local_mcp" | "proxy_connect" | "control_plane_tls" | "tunnel_metrics";
  mcpServerOnline: boolean;
  mcpServerUrl: string;
  hasMcpToken: boolean;
  proxyReachable?: boolean;
  controlPlaneTlsOk?: boolean;
  controlPlaneConnected?: boolean;
  lastSuccessfulPollAt?: number;
  pollErrors?: number;
  activeProxyUrl?: string;
  resolvedProxyUrl?: string | null;
  message: string;
  errorCode?: string;
}

export interface DesktopTunnelApi {
  getStatus(): Promise<TunnelStatusDto>;
  saveConfig(input: TunnelSaveConfigInput): Promise<TunnelStatusDto>;
  autoCreateToken(scopes?: string[]): Promise<{ success: boolean; message: string }>;
  start(): Promise<TunnelStatusDto>;
  stop(): Promise<TunnelStatusDto>;
  clearConfig(): Promise<TunnelStatusDto>;
  testConnection(params?: TunnelTestConnectionParams): Promise<TunnelTestConnectionResult>;
}

export interface TunnelStatusDto {
  configured: boolean;
  status:
    | "NotConfigured"
    | "Stopped"
    | "Starting"
    | "Connecting"
    | "Connected"
    | "Reconnecting"
    | "AuthenticationError"
    | "LocalMcpUnavailable"
    | "HealthPortConflict"
    | "RuntimeMissing"
    | "Error"
    | "NeedsAttention"
    | string;
  tunnel_id?: string | null;
  has_api_key: boolean;
  has_mcp_token: boolean;
  auto_reconnect: boolean;
  health_port: number;
  network_mode: TunnelNetworkMode;
  custom_proxy_url?: string | null;
  active_proxy_url?: string | null;
  resolved_proxy_url?: string | null;
  proxy_status?: "Reachable" | "Unreachable" | "Unsupported" | "NotConfigured" | null;
  control_plane_status?: "Connected" | "ConnectionFailed" | "Polling" | "Idle" | null;
  control_plane_connected?: boolean;
  local_mcp_status?: "Connected" | "Failed" | null;
  local_mcp_connected?: boolean;
  last_successful_poll_at?: number | null;
  poll_last_successful_timestamp?: number | null;
  poll_errors?: number;
  error_message?: string | null;
  reconnect_attempts: number;
}

export const bridge = new ApiBridge();
