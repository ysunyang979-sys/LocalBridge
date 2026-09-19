import { isTauri, invoke } from "@tauri-apps/api/core";
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
      body: JSON.stringify({ action, resolvedBy: resolvedBy || "desktop-user" }),
    });
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
}

export const bridge = new ApiBridge();
