import fs from "node:fs";
import path from "node:path";

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
  managementTokenPath?: string;
  explicitMcpToken?: string;
}

export class NexusClient {
  private readonly coreUrl: string;
  private readonly managementTokenPath: string;
  private mcpToken: string | null = null;
  private projectsCache: NexusProject[] = [];
  private lastProjectsFetch = 0;

  constructor(options: NexusClientOptions = {}) {
    this.coreUrl = options.coreUrl || process.env.NEXUS_CORE_URL || "http://127.0.0.1:18080";
    this.managementTokenPath =
      options.managementTokenPath ||
      process.env.NEXUS_MANAGEMENT_TOKEN_PATH ||
      "C:\\Users\\22365\\AppData\\Local\\LocalBridge\\data\\management-token.key";
    this.mcpToken = options.explicitMcpToken || process.env.NEXUS_MCP_TOKEN || null;
  }

  /**
   * Reads the management token from disk.
   */
  private getManagementToken(): string | null {
    if (process.env.NEXUS_MANAGEMENT_TOKEN && process.env.NEXUS_MANAGEMENT_TOKEN.trim().length > 0) {
      return process.env.NEXUS_MANAGEMENT_TOKEN.trim();
    }
    try {
      if (fs.existsSync(this.managementTokenPath)) {
        return fs.readFileSync(this.managementTokenPath, "utf-8").trim();
      }
    } catch (err: any) {
      console.warn(`[NexusClient] Unable to read management token from ${this.managementTokenPath}:`, err.message);
    }
    return null;
  }

  /**
   * Ensures a valid MCP Bearer Token is available for downstream Nexus requests.
   */
  public async ensureMcpToken(): Promise<string> {
    if (this.mcpToken) {
      return this.mcpToken;
    }

    const mgmtToken = this.getManagementToken();
    if (!mgmtToken) {
      throw new Error(
        `No Nexus MCP token provided and management key file not found at ${this.managementTokenPath}. ` +
          `Please ensure Nexus LocalBridge is running.`
      );
    }

    console.log("[NexusClient] Acquiring dedicated MCP bridge token from Nexus Management API...");
    try {
      const res = await fetch(`${this.coreUrl}/api/tokens`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${mgmtToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: "nexus-mcp-bridge",
          type: "mcp",
          scopes: ["read", "write", "execute"],
        }),
      });

      if (!res.ok) {
        const text = await res.text();
        throw new Error(`Nexus token creation failed (${res.status}): ${text}`);
      }

      const data = (await res.json()) as any;
      if (!data.token) {
        throw new Error("Invalid token response from Nexus Management API");
      }

      this.mcpToken = data.token;
      console.log(`[NexusClient] Successfully obtained MCP bridge token: ${data.id}`);
      return this.mcpToken!;
    } catch (err: any) {
      throw new Error(`Failed to authenticate with Nexus LocalBridge at ${this.coreUrl}: ${err.message}`);
    }
  }

  /**
   * Checks downstream Nexus connectivity.
   */
  public async checkHealth(): Promise<{ ok: boolean; status?: number; error?: string }> {
    try {
      const res = await fetch(`${this.coreUrl}/health`, { method: "GET" });
      if (res.ok) {
        return { ok: true, status: res.status };
      }
      return { ok: false, status: res.status, error: `Nexus returned HTTP ${res.status}` };
    } catch (err: any) {
      return { ok: false, error: err.message };
    }
  }

  /**
   * Fetches the registered projects from Nexus and attempts to resolve their root paths from projects.json.
   */
  public async getProjects(forceRefresh = false): Promise<NexusProject[]> {
    const now = Date.now();
    if (!forceRefresh && this.projectsCache.length > 0 && now - this.lastProjectsFetch < 30000) {
      return this.projectsCache;
    }

    // Try reading root paths from runner's projects.json if accessible
    const rootPathsMap = new Map<string, string>();
    try {
      const projectsJsonPath = "C:\\Users\\22365\\AppData\\Local\\LocalBridge\\runner\\projects.json";
      if (fs.existsSync(projectsJsonPath)) {
        const parsed = JSON.parse(fs.readFileSync(projectsJsonPath, "utf-8"));
        if (Array.isArray(parsed.projects)) {
          for (const p of parsed.projects) {
            if (p.id && (p.canonicalRoot || p.root)) {
              rootPathsMap.set(p.id, p.canonicalRoot || p.root);
            }
          }
        }
      }
    } catch {}

    const mgmtToken = this.getManagementToken();
    if (mgmtToken) {
      try {
        const res = await fetch(`${this.coreUrl}/api/projects`, {
          headers: { Authorization: `Bearer ${mgmtToken}` },
        });
        if (res.ok) {
          const data = (await res.json()) as any;
          if (Array.isArray(data.projects)) {
            this.projectsCache = data.projects.map((p: any) => ({
              id: p.id,
              name: p.name,
              runnerId: p.runnerId,
              rootPath: rootPathsMap.get(p.id) || p.rootPath,
              enabled: Boolean(p.enabled),
              accessMode: p.accessMode,
              executionMode: p.executionMode,
            }));
            this.lastProjectsFetch = now;
            return this.projectsCache;
          }
        }
      } catch {}
    }

    // Fallback: call localbridge_project_list tool via MCP
    const toolRes = await this.callNexusTool("localbridge_project_list", {});
    const textContent = toolRes.content?.find((c: any) => c.type === "text")?.text;
    if (textContent) {
      try {
        const parsed = JSON.parse(textContent);
        if (Array.isArray(parsed.projects)) {
          this.projectsCache = parsed.projects.map((p: any) => ({
            id: p.id,
            name: p.name,
            runnerId: p.runnerId,
            rootPath: rootPathsMap.get(p.id) || p.rootPath,
            enabled: Boolean(p.enabled),
            accessMode: p.accessMode,
            executionMode: p.executionMode,
          }));
          this.lastProjectsFetch = now;
          return this.projectsCache;
        }
      } catch {}
    }

    return this.projectsCache;
  }

  /**
   * Resolves a projectId or projectName into a concrete NexusProject object.
   */
  public async resolveProject(projectIdOrName: string): Promise<NexusProject> {
    if (!projectIdOrName || typeof projectIdOrName !== "string") {
      throw new Error("projectId is required");
    }

    const projects = await this.getProjects();
    const query = projectIdOrName.trim().toLowerCase();

    // 1. Match exact ID
    let found = projects.find((p) => p.id.toLowerCase() === query);

    // 2. Match exact Name
    if (!found) {
      found = projects.find((p) => p.name.toLowerCase() === query);
    }

    // 3. Match prefix or partial if unique
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
        `Project "${projectIdOrName}" not found in Nexus LocalBridge. Available projects: ${available || "none"}`
      );
    }

    return found;
  }

  /**
   * Dispatches a tool execution to the downstream Nexus LocalBridge native /mcp endpoint.
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

    // Auto-refresh token on 401 unauthorized
    if (res.status === 401) {
      console.warn("[NexusClient] Token rejected by Nexus. Refreshing token...");
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
