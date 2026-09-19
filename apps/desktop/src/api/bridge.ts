import type {
  ServerStatus,
  McpStatus,
  Project,
  Approval,
  Job,
  Token,
  RunnerInfo,
  AuditEvent,
} from "../types.js";

const DEFAULT_SERVER_URL = "http://127.0.0.1:18080";

function isTauri(): boolean {
  return (
    typeof window !== "undefined" &&
    ("__TAURI_INTERNALS__" in window || "__TAURI__" in window)
  );
}

class ApiBridge {
  private baseUrl = DEFAULT_SERVER_URL;

  getBaseUrl(): string {
    return this.baseUrl;
  }

  setBaseUrl(url: string): void {
    this.baseUrl = url.replace(/\/+$/, "");
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

  // System & MCP Status
  async getStatus(): Promise<ServerStatus> {
    return this.fetchJson<ServerStatus>("/api/status");
  }

  async getMcpStatus(): Promise<McpStatus> {
    return this.fetchJson<McpStatus>("/api/mcp/status");
  }

  // Global Pause & Emergency Stop
  async getPauseState(): Promise<{ paused: boolean }> {
    return this.fetchJson<{ paused: boolean }>("/api/pause");
  }

  async setPauseState(paused: boolean): Promise<{ paused: boolean }> {
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
    return this.fetchJson<{ runners: RunnerInfo[] }>("/api/runners");
  }

  // Projects
  async listProjects(): Promise<{ projects: Project[] }> {
    return this.fetchJson<{ projects: Project[] }>("/api/projects");
  }

  async authorizeProject(params: {
    path: string;
    name?: string;
    accessMode?: "read-only" | "read-write";
  }): Promise<Project> {
    return this.fetchJson<Project>("/api/management/projects/authorize", {
      method: "POST",
      body: JSON.stringify(params),
    });
  }

  async setProjectAccess(
    projectId: string,
    accessMode: "read-only" | "read-write"
  ): Promise<Project> {
    return this.fetchJson<Project>(`/api/management/projects/${projectId}/access`, {
      method: "POST",
      body: JSON.stringify({ accessMode }),
    });
  }

  async setProjectExecution(
    projectId: string,
    executionMode: "disabled" | "safe-only" | "project-code"
  ): Promise<Project> {
    return this.fetchJson<Project>(
      `/api/management/projects/${projectId}/execution`,
      {
        method: "POST",
        body: JSON.stringify({ executionMode }),
      }
    );
  }

  async removeProject(projectId: string): Promise<{ id: string; removed: boolean }> {
    return this.fetchJson<{ id: string; removed: boolean }>(
      `/api/management/projects/${projectId}`,
      {
        method: "DELETE",
      }
    );
  }

  async enableProject(projectId: string): Promise<Project> {
    return this.fetchJson<Project>(
      `/api/management/projects/${projectId}/enable`,
      {
        method: "POST",
      }
    );
  }

  async disableProject(projectId: string): Promise<Project> {
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
    return this.fetchJson<Approval>(`/api/approvals/${approvalId}/resolve`, {
      method: "POST",
      body: JSON.stringify({ action, resolvedBy: resolvedBy || "desktop-user" }),
    });
  }

  // Jobs
  async listJobs(params?: {
    projectId?: string;
    limit?: number;
  }): Promise<{ jobs: Job[] }> {
    const query = new URLSearchParams();
    if (params?.projectId) query.set("projectId", params.projectId);
    if (params?.limit) query.set("limit", String(params.limit));
    const qs = query.toString() ? `?${query.toString()}` : "";
    return this.fetchJson<{ jobs: Job[] }>(`/api/jobs${qs}`);
  }

  async cancelJob(jobId: string): Promise<{ jobId: string; state: string }> {
    return this.fetchJson<{ jobId: string; state: string }>(
      `/api/jobs/${jobId}/cancel`,
      {
        method: "POST",
      }
    );
  }

  // Tokens
  async listTokens(): Promise<{ tokens: Token[] }> {
    return this.fetchJson<{ tokens: Token[] }>("/api/tokens");
  }

  async createToken(params: {
    name: string;
    type: "runner" | "mcp";
    scopes?: string[];
    expiresAt?: number | null;
  }): Promise<{ id: string; name: string; type: string; token: string }> {
    return this.fetchJson<{ id: string; name: string; type: string; token: string }>(
      "/api/tokens",
      {
        method: "POST",
        body: JSON.stringify(params),
      }
    );
  }

  async revokeToken(tokenId: string): Promise<{ success: boolean; id: string }> {
    return this.fetchJson<{ success: boolean; id: string }>(
      `/api/tokens/${tokenId}`,
      {
        method: "DELETE",
      }
    );
  }

  // Audit
  async listAudit(limit = 100): Promise<{ events: AuditEvent[] }> {
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
}

export const bridge = new ApiBridge();
