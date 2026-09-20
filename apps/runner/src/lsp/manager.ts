import fs from "node:fs";
import path from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";
import {
  LocalBridgeError,
  LocalBridgeErrorCode,
  type CallHierarchyCallItem,
  type CallHierarchyResult,
  type CodeImpactResult,
  type DefinitionItem,
  type DefinitionResult,
  type DiagnosticsResult,
  type DocumentSymbolItem,
  type DocumentSymbolsResult,
  type HoverResult,
  type LspServerStatus,
  type ReferenceItem,
  type ReferencesResult,
  type SymbolKindString,
  type WorkspaceSymbolItem,
  type WorkspaceSymbolsResult,
} from "@localbridge/protocol";
import { resolveProjectPath } from "@localbridge/security";
import type { Logger } from "@localbridge/shared";
import type { ProjectRegistry } from "../projects/index.js";
import { buildSafeProcessEnv } from "../process/environment.js";
import type { WorkspaceResolver } from "../worktree/resolver.js";
import { LspClient } from "./client.js";
import {
  detectLanguageFromPath,
  resolveTypeScriptLanguageServer,
  isTypeScriptProject,
} from "./detection.js";

const MAX_SYMBOLS_LIMIT = 200;
const MAX_REFERENCES_LIMIT = 500;
const MAX_DIAGNOSTICS_LIMIT = 500;
const MAX_CALL_DEPTH = 3;
const RESTART_WINDOW_MS = 300000; // 5 minutes
const MAX_RESTARTS = 3;

interface ManagedServer {
  client: LspClient;
  projectId: string;
  language: string;
  serverKind: string;
  worktreeId?: string;
  startedAt: number;
  restartHistory: number[];
  lastError?: string;
}

export class LspManager {
  private servers = new Map<string, ManagedServer>();
  private fileMtimes = new Map<string, number>();
  private workspaceResolver?: WorkspaceResolver;

  constructor(
    private readonly projectRegistry: ProjectRegistry,
    private readonly runnerStateDir: string,
    private readonly logger?: Logger
  ) {}

  setWorkspaceResolver(resolver: WorkspaceResolver): void {
    this.workspaceResolver = resolver;
  }

  private getServerKey(projectId: string, serverKind: string, worktreeId?: string): string {
    return `${projectId}:${worktreeId ?? "root"}:${serverKind}`;
  }

  private mapSymbolKind(kindNumber: number): SymbolKindString {
    const kinds: SymbolKindString[] = [
      "unknown",
      "file",
      "module",
      "namespace",
      "package",
      "class",
      "method",
      "property",
      "field",
      "constructor",
      "enum",
      "interface",
      "function",
      "variable",
      "constant",
      "string",
      "number",
      "boolean",
      "array",
      "object",
      "key",
      "null",
      "enumMember",
      "struct",
      "event",
      "operator",
      "typeParameter",
    ];
    return kinds[kindNumber] ?? "unknown";
  }

  private isPathInsideProject(projectRoot: string, filePath: string): boolean {
    const relative = path.relative(projectRoot, filePath);
    return !relative.startsWith("..") && !path.isAbsolute(relative);
  }

  private resolveValidatedPath(
    projectId: string,
    relativePath: string,
    sessionId?: string
  ): {
    projectRoot: string;
    resolvedPath: string;
    canonicalRelative: string;
    worktreeId?: string;
  } {
    const project = this.projectRegistry.get(projectId);
    if (!project) {
      throw new LocalBridgeError(
        LocalBridgeErrorCode.PROJECT_NOT_FOUND,
        `Project '${projectId}' not found`
      );
    }
    if (!project.enabled) {
      throw new LocalBridgeError(
        LocalBridgeErrorCode.PROJECT_DISABLED,
        `Project '${projectId}' is disabled`
      );
    }

    const resolvedWs = this.workspaceResolver?.resolve(projectId, sessionId);
    const effectiveRoot = resolvedWs?.workspaceRoot ?? project.canonicalRoot;
    const worktreeId = resolvedWs?.workspaceMode === "managed-worktree" ? resolvedWs.worktreeId : undefined;

    const resolved = resolveProjectPath(effectiveRoot, relativePath, {
      mustExist: false,
    });
    return {
      projectRoot: effectiveRoot,
      resolvedPath: resolved.canonicalPath || resolved.absolutePath,
      canonicalRelative: resolved.relativePath,
      worktreeId,
    };
  }

  async getOrStartClient(
    projectId: string,
    filePath?: string,
    sessionId?: string
  ): Promise<{ client: LspClient; projectRoot: string }> {
    const project = this.projectRegistry.get(projectId);
    if (!project) {
      throw new LocalBridgeError(
        LocalBridgeErrorCode.PROJECT_NOT_FOUND,
        `Project '${projectId}' not found`
      );
    }
    if (!project.enabled) {
      throw new LocalBridgeError(
        LocalBridgeErrorCode.PROJECT_DISABLED,
        `Project '${projectId}' is disabled`
      );
    }

    const resolvedWs = this.workspaceResolver?.resolve(projectId, sessionId);
    const effectiveRoot = resolvedWs?.workspaceRoot ?? project.canonicalRoot;
    const worktreeId = resolvedWs?.workspaceMode === "managed-worktree" ? resolvedWs.worktreeId : undefined;

    // Determine language from file or project
    let lang = filePath ? detectLanguageFromPath(filePath) : null;
    if (!lang && isTypeScriptProject(effectiveRoot)) {
      lang = "typescript";
    }
    if (!lang) {
      lang = "typescript";
    }

    const serverKind = "typescript";
    const key = this.getServerKey(projectId, serverKind, worktreeId);
    const existing = this.servers.get(key);

    const now = Date.now();

    if (existing) {
      if (existing.client.isRunning && existing.client.initialized) {
        return { client: existing.client, projectRoot: effectiveRoot };
      }

      // Check restart limits
      existing.restartHistory = existing.restartHistory.filter(
        (t) => now - t < RESTART_WINDOW_MS
      );
      if (existing.restartHistory.length >= MAX_RESTARTS) {
        throw new LocalBridgeError(
          LocalBridgeErrorCode.LSP_RESTART_LIMIT,
          `Language server crashed repeatedly (${MAX_RESTARTS} times in 5 minutes). Restart limit exceeded.`
        );
      }

      // Clean up previous dead client
      try {
        await existing.client.stop();
      } catch {}
      this.servers.delete(key);
    }

    // Resolve language server
    const resolution = resolveTypeScriptLanguageServer(effectiveRoot);
    if (!resolution) {
      throw new LocalBridgeError(
        LocalBridgeErrorCode.LSP_NOT_AVAILABLE,
        "TypeScript language server is not available in project or bundled runner runtime"
      );
    }

    const safeEnv = buildSafeProcessEnv(this.runnerStateDir);
    const client = new LspClient({
      executable: resolution.executable,
      args: resolution.args,
      projectRoot: effectiveRoot,
      runnerStateDir: this.runnerStateDir,
      safeEnv,
      logger: this.logger,
      tsserverPath: resolution.tsserverPath,
    });

    const restartHistory = existing ? [...existing.restartHistory, now] : [now];

    const managed: ManagedServer = {
      client,
      projectId,
      language: lang,
      serverKind,
      worktreeId,
      startedAt: now,
      restartHistory,
    };

    client.on("crashed", (reason) => {
      managed.lastError = reason;
    });

    this.servers.set(key, managed);

    try {
      await client.start();
      return { client, projectRoot: effectiveRoot };
    } catch (err) {
      this.servers.delete(key);
      throw err;
    }
  }

  /**
   * Ensure document is opened and synchronized with current disk state
   */
  private async ensureDocumentSynced(
    client: LspClient,
    projectRoot: string,
    canonicalRelative: string
  ): Promise<void> {
    const fullPath = path.resolve(projectRoot, canonicalRelative);
    if (!fs.existsSync(fullPath)) {
      throw new LocalBridgeError(
        LocalBridgeErrorCode.FILE_NOT_FOUND,
        `File '${canonicalRelative}' not found on disk`
      );
    }

    const stat = fs.statSync(fullPath);
    const lastMtime = this.fileMtimes.get(fullPath);

    if (lastMtime === undefined || stat.mtimeMs > lastMtime) {
      const content = fs.readFileSync(fullPath, "utf-8");
      client.changeDocument(canonicalRelative, content);
      this.fileMtimes.set(fullPath, stat.mtimeMs);
    }
  }

  /**
   * Called when file is created, written, patched or deleted by Nexus
   */
  async onFileModified(
    projectId: string,
    relativePath: string,
    content?: string,
    sessionId?: string
  ): Promise<void> {
    const resolvedWs = this.workspaceResolver?.resolve(projectId, sessionId);
    const worktreeId = resolvedWs?.workspaceMode === "managed-worktree" ? resolvedWs.worktreeId : undefined;
    const key = this.getServerKey(projectId, "typescript", worktreeId);
    const managed = this.servers.get(key);
    if (!managed || !managed.client.isRunning) return;

    try {
      const { canonicalRelative, resolvedPath } = this.resolveValidatedPath(
        projectId,
        relativePath,
        sessionId
      );

      const fileContent =
        content !== undefined
          ? content
          : fs.existsSync(resolvedPath)
          ? fs.readFileSync(resolvedPath, "utf-8")
          : "";

      managed.client.changeDocument(canonicalRelative, fileContent);
      managed.client.saveDocument(canonicalRelative, fileContent);

      if (fs.existsSync(resolvedPath)) {
        this.fileMtimes.set(resolvedPath, fs.statSync(resolvedPath).mtimeMs);
      }
    } catch {
      // Ignore if outside project or unresolvable
    }
  }

  // ==========================================
  // 1. document_symbols
  // ==========================================
  async getDocumentSymbols(
    projectId: string,
    relativePath: string,
    sessionId?: string
  ): Promise<DocumentSymbolsResult> {
    const { projectRoot, canonicalRelative, resolvedPath } = this.resolveValidatedPath(
      projectId,
      relativePath,
      sessionId
    );
    const { client } = await this.getOrStartClient(projectId, resolvedPath, sessionId);
    await this.ensureDocumentSynced(client, projectRoot, canonicalRelative);

    const uri = pathToFileURL(resolvedPath).href;
    const rawSymbols = await client.request<any[]>(
      "textDocument/documentSymbol",
      {
        textDocument: { uri },
      },
      10000
    );

    const formatSymbol = (s: any): DocumentSymbolItem => {
      const kind = this.mapSymbolKind(s.kind);
      const range = s.range ?? s.location?.range ?? {
        start: { line: 0, character: 0 },
        end: { line: 0, character: 0 },
      };
      const selectionRange = s.selectionRange ?? range;

      return {
        name: s.name,
        kind,
        range,
        selectionRange,
        containerName: s.containerName,
        children: Array.isArray(s.children) ? s.children.map(formatSymbol) : undefined,
      };
    };

    const symbols: DocumentSymbolItem[] = [];
    let truncated = false;

    if (Array.isArray(rawSymbols)) {
      for (const s of rawSymbols) {
        if (symbols.length >= MAX_SYMBOLS_LIMIT) {
          truncated = true;
          break;
        }
        symbols.push(formatSymbol(s));
      }
    }

    return { symbols, truncated };
  }

  // ==========================================
  // 2. workspace_symbols
  // ==========================================
  async getWorkspaceSymbols(
    projectId: string,
    query: string,
    limit = 50,
    sessionId?: string
  ): Promise<WorkspaceSymbolsResult> {
    const project = this.projectRegistry.get(projectId);
    if (!project || !project.enabled) {
      throw new LocalBridgeError(
        project ? LocalBridgeErrorCode.PROJECT_DISABLED : LocalBridgeErrorCode.PROJECT_NOT_FOUND,
        `Project '${projectId}' invalid`
      );
    }

    const { client, projectRoot } = await this.getOrStartClient(projectId, undefined, sessionId);
    const effectiveLimit = Math.min(Math.max(1, limit), MAX_SYMBOLS_LIMIT);

    const rawSymbols = await client.request<any[]>(
      "workspace/symbol",
      {
        query,
      },
      15000
    );

    const symbols: WorkspaceSymbolItem[] = [];
    let truncated = false;

    if (Array.isArray(rawSymbols)) {
      for (const s of rawSymbols) {
        if (!s.location?.uri) continue;
        try {
          const filePath = fileURLToPath(s.location.uri);
          if (!this.isPathInsideProject(projectRoot, filePath)) {
            // Discard out-of-boundary symbol
            continue;
          }
          const relPath = path.relative(projectRoot, filePath).replace(/\\/g, "/");

          if (symbols.length >= effectiveLimit) {
            truncated = true;
            break;
          }

          symbols.push({
            name: s.name,
            kind: this.mapSymbolKind(s.kind),
            path: relPath,
            range: s.location.range,
            containerName: s.containerName,
          });
        } catch {
          // Ignore invalid uri
        }
      }
    }

    return { symbols, truncated };
  }

  // ==========================================
  // 3. definition
  // ==========================================
  async getDefinition(
    projectId: string,
    relativePath: string,
    line: number,
    character: number,
    sessionId?: string
  ): Promise<DefinitionResult> {
    if (line < 0 || character < 0) {
      throw new LocalBridgeError(
        LocalBridgeErrorCode.LSP_INVALID_POSITION,
        "Position line and character must be non-negative 0-based integers"
      );
    }

    const { projectRoot, canonicalRelative, resolvedPath } = this.resolveValidatedPath(
      projectId,
      relativePath,
      sessionId
    );
    const { client } = await this.getOrStartClient(projectId, resolvedPath, sessionId);
    await this.ensureDocumentSynced(client, projectRoot, canonicalRelative);

    const uri = pathToFileURL(resolvedPath).href;
    const raw = await client.request<any>(
      "textDocument/definition",
      {
        textDocument: { uri },
        position: { line, character },
      },
      10000
    );

    const defs: any[] = Array.isArray(raw) ? raw : raw ? [raw] : [];
    const definitions: DefinitionItem[] = [];

    for (const d of defs) {
      const targetUri = d.uri ?? d.targetUri;
      if (!targetUri) continue;

      try {
        const targetPath = fileURLToPath(targetUri);
        if (!this.isPathInsideProject(projectRoot, targetPath)) {
          // Path is outside authorized project boundary
          throw new LocalBridgeError(
            LocalBridgeErrorCode.LSP_PATH_OUTSIDE_PROJECT,
            `Definition target '${targetPath}' is outside the authorized project boundary`
          );
        }

        const targetRel = path.relative(projectRoot, targetPath).replace(/\\/g, "/");
        const range = d.range ?? d.targetSelectionRange ?? d.targetRange;

        let preview: string | undefined;
        try {
          if (fs.existsSync(targetPath)) {
            const lines = fs.readFileSync(targetPath, "utf-8").split("\n");
            if (range?.start?.line !== undefined && range.start.line < lines.length) {
              preview = lines[range.start.line]?.trim();
            }
          }
        } catch {}

        definitions.push({
          path: targetRel,
          range,
          preview,
        });
      } catch (err) {
        if (err instanceof LocalBridgeError) throw err;
      }
    }

    return { definitions };
  }

  // ==========================================
  // 4. references
  // ==========================================
  async getReferences(
    projectId: string,
    relativePath: string,
    line: number,
    character: number,
    includeDeclaration = false,
    limit = 100,
    sessionId?: string
  ): Promise<ReferencesResult> {
    if (line < 0 || character < 0) {
      throw new LocalBridgeError(
        LocalBridgeErrorCode.LSP_INVALID_POSITION,
        "Position line and character must be non-negative 0-based integers"
      );
    }

    const { projectRoot, canonicalRelative, resolvedPath } = this.resolveValidatedPath(
      projectId,
      relativePath,
      sessionId
    );
    const { client } = await this.getOrStartClient(projectId, resolvedPath, sessionId);
    await this.ensureDocumentSynced(client, projectRoot, canonicalRelative);

    const uri = pathToFileURL(resolvedPath).href;
    const effectiveLimit = Math.min(Math.max(1, limit), MAX_REFERENCES_LIMIT);

    const raw = await client.request<any[]>(
      "textDocument/references",
      {
        textDocument: { uri },
        position: { line, character },
        context: { includeDeclaration },
      },
      15000
    );

    const references: ReferenceItem[] = [];
    let truncated = false;
    let totalCount = 0;

    if (Array.isArray(raw)) {
      totalCount = raw.length;
      for (const r of raw) {
        if (!r.uri) continue;
        try {
          const filePath = fileURLToPath(r.uri);
          if (!this.isPathInsideProject(projectRoot, filePath)) {
            // Drop out-of-boundary references
            continue;
          }
          const relPath = path.relative(projectRoot, filePath).replace(/\\/g, "/");

          if (references.length >= effectiveLimit) {
            truncated = true;
            break;
          }

          references.push({
            path: relPath,
            range: r.range,
          });
        } catch {}
      }
    }

    return { references, totalCount, truncated };
  }

  // ==========================================
  // 5. hover
  // ==========================================
  async getHover(
    projectId: string,
    relativePath: string,
    line: number,
    character: number,
    sessionId?: string
  ): Promise<HoverResult> {
    if (line < 0 || character < 0) {
      throw new LocalBridgeError(
        LocalBridgeErrorCode.LSP_INVALID_POSITION,
        "Position line and character must be non-negative 0-based integers"
      );
    }

    const { projectRoot, canonicalRelative, resolvedPath } = this.resolveValidatedPath(
      projectId,
      relativePath,
      sessionId
    );
    const { client } = await this.getOrStartClient(projectId, resolvedPath, sessionId);
    await this.ensureDocumentSynced(client, projectRoot, canonicalRelative);

    const uri = pathToFileURL(resolvedPath).href;
    const raw = await client.request<any>(
      "textDocument/hover",
      {
        textDocument: { uri },
        position: { line, character },
      },
      10000
    );

    if (!raw || !raw.contents) {
      return {};
    }

    let documentation: string | undefined;
    let signature: string | undefined;

    const contents = raw.contents;
    if (typeof contents === "string") {
      documentation = contents;
    } else if (Array.isArray(contents)) {
      const parts = contents.map((c) => (typeof c === "string" ? c : c.value ?? ""));
      signature = parts[0];
      documentation = parts.slice(1).join("\n\n");
    } else if (contents.value) {
      documentation = contents.value;
    }

    // Bound documentation size (max 2000 chars)
    if (documentation && documentation.length > 2000) {
      documentation = documentation.slice(0, 2000) + "... [truncated]";
    }

    return {
      signature,
      documentation,
      range: raw.range,
    };
  }

  // ==========================================
  // 6. diagnostics
  // ==========================================
  async getDiagnostics(
    projectId: string,
    relativePath?: string,
    limit = 100,
    sessionId?: string
  ): Promise<DiagnosticsResult> {
    const project = this.projectRegistry.get(projectId);
    if (!project || !project.enabled) {
      throw new LocalBridgeError(
        project ? LocalBridgeErrorCode.PROJECT_DISABLED : LocalBridgeErrorCode.PROJECT_NOT_FOUND,
        `Project '${projectId}' invalid`
      );
    }

    const { client, projectRoot } = await this.getOrStartClient(projectId, relativePath, sessionId);
    const effectiveLimit = Math.min(Math.max(1, limit), MAX_DIAGNOSTICS_LIMIT);

    if (relativePath) {
      const { canonicalRelative } = this.resolveValidatedPath(projectId, relativePath, sessionId);
      await this.ensureDocumentSynced(client, projectRoot, canonicalRelative);

      // Poll for diagnostics to arrive from language server
      let items = client.getDiagnosticsForFile(canonicalRelative);
      if (items.length === 0) {
        const start = Date.now();
        while (Date.now() - start < 2000) {
          await new Promise((r) => setTimeout(r, 100));
          items = client.getDiagnosticsForFile(canonicalRelative);
          if (items.length > 0) break;
        }
      }

      const truncated = items.length > effectiveLimit;
      return {
        diagnostics: items.slice(0, effectiveLimit),
        totalCount: items.length,
        truncated,
      };
    }

    const all = client.getAllDiagnostics();
    const truncated = all.length > effectiveLimit;
    return {
      diagnostics: all.slice(0, effectiveLimit),
      totalCount: all.length,
      truncated,
    };
  }

  // ==========================================
  // 7. call_hierarchy
  // ==========================================
  async getCallHierarchy(
    projectId: string,
    relativePath: string,
    line: number,
    character: number,
    direction: "incoming" | "outgoing",
    depth = 1,
    sessionId?: string
  ): Promise<CallHierarchyResult> {
    if (line < 0 || character < 0) {
      throw new LocalBridgeError(
        LocalBridgeErrorCode.LSP_INVALID_POSITION,
        "Position line and character must be non-negative 0-based integers"
      );
    }

    const effectiveDepth = Math.min(Math.max(1, depth), MAX_CALL_DEPTH);
    const { projectRoot, canonicalRelative, resolvedPath } = this.resolveValidatedPath(
      projectId,
      relativePath,
      sessionId
    );
    const { client } = await this.getOrStartClient(projectId, resolvedPath, sessionId);
    await this.ensureDocumentSynced(client, projectRoot, canonicalRelative);

    const uri = pathToFileURL(resolvedPath).href;

    // Prepare call hierarchy item
    const items = await client.request<any[]>(
      "textDocument/prepareCallHierarchy",
      {
        textDocument: { uri },
        position: { line, character },
      },
      10000
    );

    if (!Array.isArray(items) || items.length === 0) {
      return {
        symbol: "",
        path: canonicalRelative,
        range: { start: { line, character }, end: { line, character } },
        direction,
        calls: [],
      };
    }

    const rootItem = items[0]!;
    const targetSymbol = rootItem.name;

    const fetchCalls = async (
      item: any,
      currentDepth: number
    ): Promise<CallHierarchyCallItem[]> => {
      if (currentDepth > effectiveDepth) return [];

      const method =
        direction === "incoming"
          ? "callHierarchy/incomingCalls"
          : "callHierarchy/outgoingCalls";

      try {
        const rawCalls = await client.request<any[]>(method, { item }, 10000);
        if (!Array.isArray(rawCalls)) return [];

        const results: CallHierarchyCallItem[] = [];
        for (const c of rawCalls) {
          const callTarget = direction === "incoming" ? c.from : c.to;
          if (!callTarget?.uri) continue;

          try {
            const targetFilePath = fileURLToPath(callTarget.uri);
            if (!this.isPathInsideProject(projectRoot, targetFilePath)) continue;
            const targetRel = path.relative(projectRoot, targetFilePath).replace(/\\/g, "/");

            let subCalls: CallHierarchyCallItem[] | undefined;
            if (currentDepth < effectiveDepth) {
              subCalls = await fetchCalls(callTarget, currentDepth + 1);
            }

            results.push({
              symbol: callTarget.name,
              path: targetRel,
              range: callTarget.range,
              fromRanges: c.fromRanges,
              calls: subCalls,
            });
          } catch {}
        }
        return results;
      } catch {
        return [];
      }
    };

    const calls = await fetchCalls(rootItem, 1);

    return {
      symbol: targetSymbol,
      path: canonicalRelative,
      range: rootItem.range ?? {
        start: { line, character },
        end: { line, character },
      },
      direction,
      calls,
    };
  }

  // ==========================================
  // 8. code_impact
  // ==========================================
  async getCodeImpact(
    projectId: string,
    relativePath: string,
    line: number,
    character: number,
    sessionId?: string
  ): Promise<CodeImpactResult> {
    this.resolveValidatedPath(projectId, relativePath, sessionId);

    // 1. Definition
    let defItem: DefinitionItem | undefined;
    let targetSymbol = "";
    try {
      const defRes = await this.getDefinition(projectId, relativePath, line, character, sessionId);
      if (defRes.definitions.length > 0) {
        defItem = defRes.definitions[0];
      }
    } catch {}

    // 2. Hover for symbol name
    try {
      const hover = await this.getHover(projectId, relativePath, line, character, sessionId);
      if (hover.symbol) {
        targetSymbol = hover.symbol;
      } else if (hover.signature) {
        targetSymbol = (hover.signature.split("(")[0] ?? "").replace(/^(export\s+)?(function\s+|class\s+|const\s+|let\s+)/, "").trim();
      }
    } catch {}

    if (!targetSymbol && defItem?.preview) {
      targetSymbol = (defItem.preview.split("(")[0] ?? "").replace(/^(export\s+)?(function\s+|class\s+|const\s+|let\s+)/, "").trim();
    }
    if (!targetSymbol) {
      targetSymbol = "symbol";
    }

    // 3. References
    let references: ReferenceItem[] = [];
    try {
      const refRes = await this.getReferences(
        projectId,
        relativePath,
        line,
        character,
        false,
        500,
        sessionId
      );
      references = refRes.references;
    } catch {}

    // 4. Call Hierarchy (incoming & outgoing)
    let callers = 0;
    let callees = 0;
    const affectedFilesSet = new Set<string>();

    for (const ref of references) {
      affectedFilesSet.add(ref.path);
    }

    try {
      const incoming = await this.getCallHierarchy(
        projectId,
        relativePath,
        line,
        character,
        "incoming",
        1,
        sessionId
      );
      callers = incoming.calls.length;
      for (const c of incoming.calls) {
        affectedFilesSet.add(c.path);
      }
    } catch {}

    try {
      const outgoing = await this.getCallHierarchy(
        projectId,
        relativePath,
        line,
        character,
        "outgoing",
        1,
        sessionId
      );
      callees = outgoing.calls.length;
    } catch {}

    const affectedFiles = Array.from(affectedFilesSet).sort();

    return {
      targetSymbol,
      definition: defItem,
      referenceCount: references.length,
      directCallers: callers,
      directCallees: callees,
      affectedFiles,
      impactSummary: {
        totalReferences: references.length,
        totalCallers: callers,
        totalCallees: callees,
        affectedFilesCount: affectedFiles.length,
      },
    };
  }

  // ==========================================
  // Management & Status
  // ==========================================
  getStatus(projectId?: string): LspServerStatus[] {
    const list: LspServerStatus[] = [];

    for (const managed of this.servers.values()) {
      if (projectId && managed.projectId !== projectId) continue;

      let status: "ready" | "starting" | "unavailable" | "error" | "stopped" = "stopped";
      if (managed.client.isRunning) {
        status = managed.client.initialized ? "ready" : "starting";
      } else if (managed.client.hasCrashed || managed.lastError) {
        status = "error";
      }

      list.push({
        projectId: managed.projectId,
        language: managed.language,
        serverKind: managed.serverKind,
        status,
        pid: managed.client.pid,
        startedAt: managed.startedAt,
        restartCount: managed.restartHistory.length - 1,
        lastError: managed.lastError,
      });
    }

    return list;
  }

  async restartServer(projectId: string, sessionId?: string): Promise<LspServerStatus> {
    const resolvedWs = this.workspaceResolver?.resolve(projectId, sessionId);
    const worktreeId = resolvedWs?.workspaceMode === "managed-worktree" ? resolvedWs.worktreeId : undefined;
    const key = this.getServerKey(projectId, "typescript", worktreeId);
    const existing = this.servers.get(key);
    const prevHistory = existing ? existing.restartHistory : [];
    if (existing) {
      await existing.client.stop();
      this.servers.delete(key);
    }

    await this.getOrStartClient(projectId, undefined, sessionId);
    const managed = this.servers.get(key);
    if (managed) {
      managed.restartHistory = [...prevHistory, Date.now()];
    }

    const statuses = this.getStatus(projectId);
    return (
      statuses.find((s) => s.projectId === projectId) ?? {
        projectId,
        language: "typescript",
        serverKind: "typescript",
        status: "ready",
        restartCount: prevHistory.length,
      }
    );
  }

  async stopWorktreeServers(projectId: string, worktreeId: string): Promise<void> {
    for (const [key, server] of this.servers.entries()) {
      if (key.startsWith(`${projectId}:${worktreeId}:`)) {
        try {
          await server.client.stop();
        } catch (err) {
          this.logger?.warn({ key, error: (err as any)?.message }, "Failed to stop worktree LSP server");
        }
        this.servers.delete(key);
      }
    }
  }

  async stopProject(projectId: string): Promise<boolean> {
    let stopped = false;
    for (const [key, managed] of this.servers.entries()) {
      if (managed.projectId === projectId) {
        await managed.client.stop();
        this.servers.delete(key);
        stopped = true;
      }
    }
    return stopped;
  }

  async stopAll(): Promise<void> {
    for (const managed of this.servers.values()) {
      try {
        await managed.client.stop();
      } catch {}
    }
    this.servers.clear();
    this.fileMtimes.clear();
  }
}
