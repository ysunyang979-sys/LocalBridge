import type { ServerProjectService } from "../runner/project-service.js";
import type { TokenService } from "../db/token-service.js";

export interface NexusProject {
  id: string;
  name: string;
  runnerId?: string;
  rootPath?: string;
  enabled: boolean;
  accessMode?: string;
  executionMode?: string;
}

export interface NexusClientOptions {
  coreUrl?: string;
  projectService?: ServerProjectService;
  tokenService?: TokenService;
  managementToken?: string;
}

export class NexusClient {
  private readonly coreUrl: string;
  private readonly projectService?: ServerProjectService;
  private readonly tokenService?: TokenService;
  private readonly managementToken?: string;
  private mcpToken: string | null = null;
  private projectsCache: NexusProject[] = [];
  private lastProjectsFetch = 0;

  constructor(options: NexusClientOptions = {}) {
    this.coreUrl = options.coreUrl || "http://127.0.0.1:18080";
    this.projectService = options.projectService;
    this.tokenService = options.tokenService;
    this.managementToken =
      options.managementToken || process.env.LOCALBRIDGE_MANAGEMENT_TOKEN;
  }

  /**
   * Checks if the downstream Nexus LocalBridge core server is reachable.
   */
  public async checkHealth(): Promise<{ ok: boolean; error?: string }> {
    try {
      const res = await fetch(`${this.coreUrl}/health`, { method: "GET" });
      if (res.ok) {
        return { ok: true };
      }
      return { ok: false, error: `HTTP ${res.status}: ${res.statusText}` };
    } catch (err: any) {
      return { ok: false, error: err.message };
    }
  }

  /**
   * Ensures an active MCP Bearer Token is available for invoking downstream tools.
   */
  public async ensureMcpToken(): Promise<string> {
    if (this.mcpToken) {
      return this.mcpToken;
    }

    // Direct in-memory token generation if TokenService is provided
    if (this.tokenService) {
      try {
        const created = this.tokenService.createToken({
          name: "Integrated MCP Gateway Client",
          type: "mcp",
          scopes: ["read", "write", "execute"],
        });
        this.mcpToken = created.token;
        return this.mcpToken;
      } catch (err: any) {
        console.warn("[MCP Gateway] In-memory token generation failed, falling back to HTTP API:", err.message);
      }
    }

    // Fallback: Use management token to request a new MCP token via REST API
    const mgmt = this.managementToken || process.env.LOCALBRIDGE_MANAGEMENT_TOKEN;
    if (mgmt) {
      try {
        const res = await fetch(`${this.coreUrl}/api/tokens`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${mgmt}`,
            "Content-Type": "application/json",
            Host: "127.0.0.1:18080",
          },
          body: JSON.stringify({
            name: "Integrated MCP Gateway Fallback",
            type: "mcp",
            scopes: ["read", "write", "execute"],
          }),
        });

        if (res.ok) {
          const data = (await res.json()) as any;
          if (data.token && typeof data.token === "string") {
            this.mcpToken = data.token;
            return data.token;
          }
        }
      } catch (err: any) {
        console.warn("[MCP Gateway] Management API token acquisition failed:", err.message);
      }
    }

    // Final fallback: use management token directly if configured as master
    if (mgmt) {
      return mgmt;
    }

    throw new Error("Unable to obtain authorization token for downstream Nexus core.");
  }

  /**
   * Fetches all projects registered in Nexus LocalBridge.
   */
  public async getProjects(forceRefresh = false): Promise<NexusProject[]> {
    const now = Date.now();
    if (!forceRefresh && this.projectsCache.length > 0 && now - this.lastProjectsFetch < 10000) {
      return this.projectsCache;
    }

    // Fast path: In-process ProjectService query
    if (this.projectService) {
      try {
        const raw = this.projectService.listProjects();
        this.projectsCache = raw.map((p) => ({
          id: p.id,
          name: p.name,
          runnerId: p.runnerId,
          rootPath: (p as any).rootPath,
          enabled: p.enabled,
          accessMode: p.accessMode,
          executionMode: p.executionMode,
        }));
        this.lastProjectsFetch = now;
        return this.projectsCache;
      } catch {
        // Fall back to HTTP
      }
    }

    // HTTP path
    const headers: Record<string, string> = {
      Host: "127.0.0.1:18080",
    };
    const mgmt = this.managementToken || process.env.LOCALBRIDGE_MANAGEMENT_TOKEN;
    if (mgmt) {
      headers["Authorization"] = `Bearer ${mgmt}`;
    }

    const res = await fetch(`${this.coreUrl}/api/projects`, {
      method: "GET",
      headers,
    });

    if (!res.ok) {
      throw new Error(`Failed to fetch projects from Nexus: ${res.status} ${res.statusText}`);
    }

    const data = (await res.json()) as any;
    const list: any[] = data.projects || [];

    this.projectsCache = list.map((p) => ({
      id: p.id,
      name: p.name,
      runnerId: p.runnerId,
      rootPath: p.rootPath,
      enabled: p.enabled ?? true,
      accessMode: p.accessMode,
      executionMode: p.executionMode,
    }));

    this.lastProjectsFetch = now;
    return this.projectsCache;
  }

  /**
   * Resolves a project by ID or by friendly name.
   */
  public async resolveProject(projectIdOrName: string): Promise<NexusProject> {
    const projects = await this.getProjects();
    const query = projectIdOrName.trim().toLowerCase();

    // 1. Exact ID
    let found = projects.find((p) => p.id.toLowerCase() === query);

    // 2. Exact Name
    if (!found) {
      found = projects.find((p) => p.name.toLowerCase() === query);
    }

    // 3. Unique partial match
    if (!found) {
      const candidates = projects.filter(
        (p) => p.id.toLowerCase().includes(query) || p.name.toLowerCase().includes(query)
      );
      if (candidates.length === 1) {
        found = candidates[0];
      }
    }

    if (!found) {
      const available = projects.map((p) => `"${p.name}" (${p.id})`).join(", ");
      throw new Error(
        `Project "${projectIdOrName}" not found in Nexus. Available projects: ${available || "none"}`
      );
    }

    return found;
  }

  /**
   * Dispatches a tool execution to the downstream native Nexus MCP endpoint (18080/mcp).
   */
  public async callNexusTool(
    toolName: string,
    toolArguments: Record<string, unknown>
  ): Promise<{ content: Array<{ type: string; text: string }>; isError?: boolean }> {
    let token = await this.ensureMcpToken();

    const executeCall = async (authToken: string) => {
      return fetch(`${this.coreUrl}/mcp`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${authToken}`,
          "Content-Type": "application/json",
          Accept: "application/json, text/event-stream",
          Host: "127.0.0.1:18080",
        },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: Date.now(),
          method: "tools/call",
          params: {
            name: toolName,
            arguments: toolArguments,
          },
        }),
      });
    };

    let res = await executeCall(token);

    // Auto-refresh token on 401
    if (res.status === 401) {
      this.mcpToken = null;
      token = await this.ensureMcpToken();
      res = await executeCall(token);
    }

    if (!res.ok) {
      const errorText = await res.text();
      throw new Error(`Nexus tool execution error (${res.status}): ${errorText}`);
    }

    const data = (await res.json()) as any;

    if (data.error) {
      throw new Error(`Nexus RPC error [${data.error.code}]: ${data.error.message}`);
    }

    if (!data.result) {
      throw new Error(`Nexus returned empty result for tool "${toolName}"`);
    }

    return data.result;
  }
}
