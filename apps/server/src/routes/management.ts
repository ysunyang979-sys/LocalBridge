import type { FastifyPluginAsync, FastifyRequest, FastifyReply } from "fastify";
import {
  LocalBridgeError,
  LocalBridgeErrorCode,
  RunnerRpcMethods,
  type ProjectAccessMode,
  type ProjectExecutionMode,
  type ApprovalRisk,
  type ProjectTrustPolicy,
} from "@localbridge/protocol";
import type { TokenService } from "../db/token-service.js";
import type { RunnerRegistry } from "../runner/registry.js";
import type { RunnerRpcService } from "../runner/rpc-service.js";
import type { ServerProjectService } from "../runner/project-service.js";
import type { McpContext } from "../mcp/context.js";
import { canonicalPayloadHash } from "@localbridge/shared";
import type Database from "better-sqlite3";
import type { JobRow } from "../db/schema.js";

export interface ManagementRoutesOptions {
  tokenService: TokenService;
  runnerRegistry: RunnerRegistry;
  rpcService: RunnerRpcService;
  projectService: ServerProjectService;
  mcpContext: McpContext;
  db?: Database.Database;
  managementSecret?: string;
  requireManagementAuth?: boolean;
}

export type ManagementSecurityOptions = Pick<
  ManagementRoutesOptions,
  "tokenService" | "managementSecret" | "requireManagementAuth"
>;

export function checkLoopbackAndSecurity(
  request: FastifyRequest,
  reply: FastifyReply,
  opts: ManagementSecurityOptions
): boolean {
  // 1. Loopback IP Check
  const clientIp = request.ip;
  const isLoopback =
    clientIp === "127.0.0.1" ||
    clientIp === "::1" ||
    clientIp === "::ffff:127.0.0.1" ||
    clientIp === "localhost";

  if (!isLoopback) {
    reply.status(403).send({
      error: "Forbidden: Management API is only accessible via loopback",
      code: "LOOPBACK_ONLY",
    });
    return false;
  }

  // 2. Host Header Validation (DNS rebinding protection)
  const host = request.headers.host;
  if (host) {
    let hostWithoutPort: string;
    try {
      hostWithoutPort = new URL(`http://${host}`).hostname.toLowerCase();
    } catch {
      hostWithoutPort = "";
    }
    const isAllowedHost =
      hostWithoutPort === "127.0.0.1" ||
      hostWithoutPort === "localhost" ||
      hostWithoutPort === "[::1]" || hostWithoutPort === "::1";
    if (!isAllowedHost) {
      reply.status(403).send({
        error: "Forbidden: Host header validation failed",
        code: "HOST_NOT_ALLOWED",
      });
      return false;
    }
  } else {
    reply.status(403).send({ error: "Forbidden: Host header is required", code: "HOST_NOT_ALLOWED" });
    return false;
  }

  // 3. Browser-Origin / CSRF Attack Defense
  const origin = request.headers.origin;
  if (origin) {
    const allowedOrigins = [
      "tauri://localhost",
      "http://tauri.localhost",
      "https://tauri.localhost",
    ];
    const isTauriOrigin = allowedOrigins.includes(origin);
    const isLocalUrlOrigin =
      origin.startsWith("http://127.0.0.1:") ||
      origin.startsWith("http://localhost:") ||
      origin === "http://127.0.0.1" ||
      origin === "http://localhost";
    if (!isTauriOrigin && !isLocalUrlOrigin) {
      reply.status(403).send({
        error: "Forbidden: Browser cross-origin management access is rejected",
        code: "BROWSER_CROSS_ORIGIN_FORBIDDEN",
      });
      return false;
    }
  }

  const secFetchSite = request.headers["sec-fetch-site"];
  if (secFetchSite === "cross-site") {
    reply.status(403).send({
      error: "Forbidden: Cross-site browser requests are blocked",
      code: "BROWSER_CROSS_ORIGIN_FORBIDDEN",
    });
    return false;
  }

  // 4. Token Domain Isolation & Local Management Authentication
  const authHeader =
    request.headers.authorization ||
    (request.headers["x-management-token"] as string | undefined);

  if (authHeader) {
    const tokenStr = authHeader.startsWith("Bearer ")
      ? authHeader.slice(7).trim()
      : authHeader.trim();

    // Cross-token domain rejection: lb_ (MCP) and lbr_ (Runner) can NEVER access management
    if (tokenStr.startsWith("lb_") || tokenStr.startsWith("lbr_")) {
      reply.status(401).send({
        error: "Unauthorized: MCP and Runner tokens cannot access management APIs",
        code: "INVALID_TOKEN_TYPE",
      });
      return false;
    }

    if (opts.managementSecret) {
      const validation = opts.tokenService.validateManagementToken(
        tokenStr,
        opts.managementSecret
      );
      if (!validation.valid) {
        reply.status(401).send({
          error: `Unauthorized: ${validation.reason ?? "Invalid management token"}`,
          code: validation.reason ?? "UNAUTHORIZED",
        });
        return false;
      }
    }
  } else if (opts.requireManagementAuth && opts.managementSecret) {
    reply.status(401).send({
      error: "Unauthorized: Missing management secret token",
      code: "MISSING_TOKEN",
    });
    return false;
  }

  return true;
}

export const managementRoutes: FastifyPluginAsync<ManagementRoutesOptions> = async (
  fastify,
  opts
) => {
  const { tokenService, runnerRegistry, rpcService, projectService, mcpContext, db } = opts;

  // Middleware: Enforce loopback check and security for all routes in this plugin
  fastify.addHook("onRequest", async (request, reply) => {
    if (!checkLoopbackAndSecurity(request, reply, opts)) {
      return reply;
    }
  });

  // Helper to resolve an active runner or pick the primary connected runner
  function getActiveRunnerId(preferredRunnerId?: string): string {
    if (preferredRunnerId) {
      const runner = runnerRegistry.get(preferredRunnerId);
      if (runner) return runner.runnerId;
    }
    const runners = runnerRegistry.list();
    if (runners.length === 0 || !runners[0]) {
      throw new LocalBridgeError(
        LocalBridgeErrorCode.RUNNER_OFFLINE,
        "No local runner is connected to process management request"
      );
    }
    return runners[0].id;
  }

  // ==========================================
  // 1. Tokens Management (/tokens)
  // ==========================================
  fastify.get("/tokens", async (_request, reply) => {
    const tokens = tokenService.listTokens();
    return reply.status(200).send({ tokens });
  });

  fastify.post<{
    Body: {
      name: string;
      type: "runner" | "mcp";
      scopes?: string[];
      expiresAt?: number | null;
    };
  }>("/tokens", async (request, reply) => {
    const { name, type, scopes, expiresAt } = request.body || {};
    if (!name || !type || (type !== "runner" && type !== "mcp")) {
      return reply.status(400).send({
        code: LocalBridgeErrorCode.INVALID_REQUEST,
        message: "Fields 'name' and 'type' ('runner' | 'mcp') are required",
      });
    }

    const created = tokenService.createToken({
      name,
      type,
      scopes: scopes ?? [],
      expiresAt: expiresAt ?? null,
    });

    return reply.status(201).send(created);
  });

  fastify.delete<{ Params: { id: string } }>(
    "/tokens/:id",
    async (request, reply) => {
      const { id } = request.params;
      const revoked = tokenService.revokeToken(id);
      if (!revoked) {
        return reply.status(404).send({
          code: "TOKEN_NOT_FOUND",
          message: `Token "${id}" not found or already revoked`,
        });
      }
      const closedRunnerConnections = runnerRegistry.closeByTokenId(id);
      return reply.status(200).send({ success: true, id, closedRunnerConnections });
    }
  );

  // ==========================================
  // 2. Global Pause & Controls (/pause, /emergency-stop)
  // ==========================================
  fastify.get("/pause", async (_request, reply) => {
    return reply.status(200).send({ paused: mcpContext.isPaused() });
  });

  fastify.post<{ Body: { paused: boolean } }>("/pause", async (request, reply) => {
    const paused = Boolean(request.body?.paused);
    mcpContext.setPaused(paused);
    return reply.status(200).send({ paused: mcpContext.isPaused() });
  });

  fastify.post<{ Body?: { reason?: string } }>(
    "/emergency-stop",
    async (request, reply) => {
      const reason = request.body?.reason || "Emergency stop initiated by local user";
      // 1. Immediately pause AI / MCP access
      mcpContext.setPaused(true);

      // 2. Cancel all running jobs across all connected runners
      const runners = runnerRegistry.list();
      let totalCancelled = 0;
      const allCancelledJobIds: string[] = [];

      for (const runner of runners) {
        try {
          const res = await rpcService.request(
            runner.id,
            RunnerRpcMethods.JobCancelAll,
            { reason }
          );
          totalCancelled += res.cancelledCount;
          allCancelledJobIds.push(...res.jobIds);
        } catch (err) {
          fastify.log.warn(
            { runnerId: runner.id, err },
            "Failed to send JobCancelAll to runner during emergency stop"
          );
        }
      }

      return reply.status(200).send({
        emergencyStopped: true,
        paused: true,
        runnersNotified: runners.length,
        cancelledJobsCount: totalCancelled,
        jobIds: allCancelledJobIds,
        timestamp: Date.now(),
      });
    }
  );

  fastify.post<{ Body?: { reason?: string } }>("/shutdown", async (request, reply) => {
    mcpContext.setPaused(true);
    const reason = request.body?.reason || "Desktop shutdown";
    for (const runner of runnerRegistry.list()) {
      try {
        await rpcService.request(runner.id, RunnerRpcMethods.JobCancelAll, { reason });
        await rpcService.request(runner.id, RunnerRpcMethods.SystemShutdown, { reason });
      } catch (err) {
        fastify.log.warn({ runnerId: runner.id, err }, "Graceful Runner shutdown failed");
      }
    }
    setTimeout(() => { void fastify.close(); }, 100);
    return reply.status(200).send({ shuttingDown: true });
  });

  // ==========================================
  // 3. Project Management (/management/projects/*)
  // ==========================================
  fastify.post<{
    Body: {
      path: string;
      name?: string;
      accessMode?: ProjectAccessMode;
      executionMode?: ProjectExecutionMode;
      allowedCommands?: string[];
      runnerId?: string;
    };
  }>("/management/projects/authorize", async (request, reply) => {
    const { path, name, accessMode, runnerId } = request.body || {};

    if (!path) {
      return reply.status(400).send({
        code: LocalBridgeErrorCode.INVALID_REQUEST,
        message: "Field 'path' is required for project authorization",
      });
    }

    const targetRunnerId = getActiveRunnerId(runnerId);
    const result = await rpcService.request(
      targetRunnerId,
      RunnerRpcMethods.ProjectAuthorize,
      {
        path,
        name,
        accessMode: accessMode || "read-only",
      }
    );

    projectService.syncRunnerProjects(targetRunnerId, [
      {
        id: result.id,
        name: result.name,
        enabled: result.enabled,
        accessMode: result.accessMode,
        executionMode: result.executionMode,
      },
    ]);

    return reply.status(201).send(result);
  });

  fastify.post<{
    Params: { id: string };
    Body: { accessMode: ProjectAccessMode; runnerId?: string };
  }>("/management/projects/:id/access", async (request, reply) => {
    const { id } = request.params;
    const { accessMode, runnerId } = request.body || {};

    if (!accessMode) {
      return reply.status(400).send({
        code: LocalBridgeErrorCode.INVALID_REQUEST,
        message: "Field 'accessMode' is required",
      });
    }

    const project = projectService.getProject(id);
    const targetRunnerId = runnerId || project?.runnerId || getActiveRunnerId();

    const result = await rpcService.request(
      targetRunnerId,
      RunnerRpcMethods.ProjectSetAccess,
      {
        projectId: id,
        accessMode,
      }
    );

    projectService.updateProjectAccess(id, accessMode);
    if ((result as any)?.executionMode) {
      projectService.updateProjectExecution(id, (result as any).executionMode);
    }
    return reply.status(200).send(result);
  });

  fastify.post<{
    Params: { id: string };
    Body: {
      executionMode: ProjectExecutionMode;
      allowedCommands?: string[];
      runnerId?: string;
    };
  }>("/management/projects/:id/execution", async (request, reply) => {
    const { id } = request.params;
    const { executionMode, runnerId } = request.body || {};

    if (!executionMode) {
      return reply.status(400).send({
        code: LocalBridgeErrorCode.INVALID_REQUEST,
        message: "Field 'executionMode' is required",
      });
    }

    const project = projectService.getProject(id);
    const targetRunnerId = runnerId || project?.runnerId || getActiveRunnerId();

    const result = await rpcService.request(
      targetRunnerId,
      RunnerRpcMethods.ProjectSetExecution,
      {
        projectId: id,
        executionMode,
      }
    );

    projectService.updateProjectExecution(id, executionMode);
    return reply.status(200).send(result);
  });

  fastify.delete<{ Params: { id: string }; Querystring: { runnerId?: string } }>(
    "/management/projects/:id",
    async (request, reply) => {
      const { id } = request.params;
      const project = projectService.getProject(id);
      const targetRunnerId =
        request.query.runnerId || project?.runnerId || getActiveRunnerId();

      const result = await rpcService.request(
        targetRunnerId,
        RunnerRpcMethods.ProjectRemove,
        { projectId: id }
      );

      projectService.removeProject(id);
      return reply.status(200).send(result);
    }
  );

  fastify.post<{ Params: { id: string }; Querystring: { runnerId?: string } }>(
    "/management/projects/:id/enable",
    async (request, reply) => {
      const { id } = request.params;
      const project = projectService.getProject(id);
      const targetRunnerId =
        request.query.runnerId || project?.runnerId || getActiveRunnerId();

      const result = await rpcService.request(
        targetRunnerId,
        RunnerRpcMethods.ProjectEnable,
        { projectId: id }
      );

      projectService.updateProjectEnabled(id, true);
      return reply.status(200).send(result);
    }
  );

  fastify.post<{ Params: { id: string }; Querystring: { runnerId?: string } }>(
    "/management/projects/:id/disable",
    async (request, reply) => {
      const { id } = request.params;
      const project = projectService.getProject(id);
      const targetRunnerId =
        request.query.runnerId || project?.runnerId || getActiveRunnerId();

      const result = await rpcService.request(
        targetRunnerId,
        RunnerRpcMethods.ProjectDisable,
        { projectId: id }
      );

      projectService.updateProjectEnabled(id, false);
      return reply.status(200).send(result);
    }
  );

  fastify.get<{ Params: { id: string }; Querystring: { runnerId?: string } }>(
    "/management/projects/:id/trust-policy",
    async (request, reply) => {
      const { id } = request.params;
      const project = projectService.getProject(id);
      if (!project) {
        return reply.status(404).send({
          code: LocalBridgeErrorCode.PROJECT_NOT_FOUND,
          message: `Project "${id}" not found`,
        });
      }

      const targetRunnerId =
        request.query.runnerId || project.runnerId || getActiveRunnerId();

      let isSessionActive = false;
      try {
        const sessionRes = await rpcService.request(
          targetRunnerId,
          RunnerRpcMethods.ProjectSessionTrust,
          { projectId: id, action: "status" }
        );
        isSessionActive = !!sessionRes?.active;
      } catch {
        // runner might be offline
      }

      const dbPolicy = projectService.getTrustPolicy(id);
      const basePolicy = dbPolicy ?? {
        trustLevel: "standard" as const,
        filePolicy: "ask" as const,
        commandPolicy: "ask" as const,
        protectedFilesPolicy: "always-ask" as const,
        policyVersion: 1,
        canonicalRoot: "",
        updatedAt: Date.now(),
      };

      if (isSessionActive) {
        return reply.status(200).send({
          projectId: id,
          trustPolicy: {
            ...basePolicy,
            trustLevel: "session-trusted",
            filePolicy: "allow",
          },
        });
      }

      return reply.status(200).send({ projectId: id, trustPolicy: basePolicy });
    }
  );

  fastify.post<{
    Params: { id: string };
    Body: {
      trustPolicy: ProjectTrustPolicy;
      runnerId?: string;
    };
  }>("/management/projects/:id/trust-policy", async (request, reply) => {
    const { id } = request.params;
    const { trustPolicy, runnerId } = request.body || {};
    if (!trustPolicy) {
      return reply.status(400).send({
        code: LocalBridgeErrorCode.INVALID_REQUEST,
        message: "Field 'trustPolicy' is required",
      });
    }

    const project = projectService.getProject(id);
    const targetRunnerId = runnerId || project?.runnerId || getActiveRunnerId();

    const normalizedFilePolicy =
      trustPolicy.filePolicy === "allow" ||
      trustPolicy.filePolicy === "ask" ||
      trustPolicy.filePolicy === "deny"
        ? trustPolicy.filePolicy
        : trustPolicy.trustLevel === "full-project-trust" ||
            trustPolicy.trustLevel === "session-trusted"
          ? "allow"
          : "ask";

    const result = await rpcService.request(
      targetRunnerId,
      RunnerRpcMethods.ProjectSetTrustPolicy,
      {
        projectId: id,
        trustLevel: trustPolicy.trustLevel,
        filePolicy: normalizedFilePolicy,
        commandPolicy: trustPolicy.commandPolicy ?? "ask",
        protectedFilesPolicy: trustPolicy.protectedFilesPolicy ?? "always-ask",
        customRules: trustPolicy.customRules,
      }
    );

    // Only persist non-session-trusted policies to SQLite
    if (result.policy.trustLevel !== "session-trusted") {
      projectService.setTrustPolicy(id, result.policy);
    } else {
      const currentDbPolicy = projectService.getTrustPolicy(id);
      if (currentDbPolicy && currentDbPolicy.trustLevel !== "standard") {
        projectService.setTrustPolicy(id, {
          ...currentDbPolicy,
          trustLevel: "standard",
          filePolicy: "ask",
        });
      }
    }
    return reply.status(200).send({ projectId: id, trustPolicy: result.policy });
  });

  fastify.post<{
    Params: { id: string };
    Body?: { action?: "grant" | "revoke"; runnerId?: string };
  }>("/management/projects/:id/session-trust", async (request, reply) => {
    const { id } = request.params;
    const action = request.body?.action || "grant";
    const project = projectService.getProject(id);
    const targetRunnerId =
      request.body?.runnerId || project?.runnerId || getActiveRunnerId();

    const result = await rpcService.request(
      targetRunnerId,
      RunnerRpcMethods.ProjectSessionTrust,
      {
        projectId: id,
        action,
      }
    );

    return reply.status(200).send(result);
  });

  fastify.delete<{ Params: { id: string }; Querystring: { runnerId?: string } }>(
    "/management/projects/:id/session-trust",
    async (request, reply) => {
      const { id } = request.params;
      const project = projectService.getProject(id);
      const targetRunnerId =
        request.query.runnerId || project?.runnerId || getActiveRunnerId();

      const result = await rpcService.request(
        targetRunnerId,
        RunnerRpcMethods.ProjectSessionTrust,
        {
          projectId: id,
          action: "revoke",
        }
      );

      return reply.status(200).send(result);
    }
  );


  // ==========================================
  // 4. Approvals Management (/approvals)
  // ==========================================
  fastify.get<{
    Querystring: {
      projectId?: string;
      status?: "pending" | "approved" | "denied" | "expired";
      runnerId?: string;
    };
  }>("/approvals", async (request, reply) => {
    const { projectId, status, runnerId } = request.query;
    const targetRunnerId = getActiveRunnerId(runnerId);

    const approvals = await rpcService.request(
      targetRunnerId,
      RunnerRpcMethods.ApprovalList,
      { projectId, status }
    );

    return reply.status(200).send({ approvals });
  });

  fastify.post<{
    Body: {
      projectId: string;
      operation: string;
      payload?: Record<string, unknown>;
      payloadHash?: string;
      risk?: ApprovalRisk;
      summary: string;
      ttlSeconds?: number;
      runnerId?: string;
    };
  }>("/approvals", async (request, reply) => {
    const { projectId, operation, payload, payloadHash, risk, summary, ttlSeconds, runnerId } =
      request.body || {};

    if (!projectId || !operation || (!payload && !payloadHash) || !summary) {
      return reply.status(400).send({
        code: LocalBridgeErrorCode.INVALID_REQUEST,
        message: "Fields 'projectId', 'operation', ('payload' or 'payloadHash'), and 'summary' are required",
      });
    }

    const computedHash = payloadHash || canonicalPayloadHash(payload);

    const project = projectService.getProject(projectId);
    const targetRunnerId = runnerId || project?.runnerId || getActiveRunnerId();

    const approval = await rpcService.request(
      targetRunnerId,
      RunnerRpcMethods.ApprovalCreate,
      {
        projectId,
        operation,
        risk: risk || "CAUTION",
        summary,
        payloadHash: computedHash,
        timeoutMs: ttlSeconds ? ttlSeconds * 1000 : 300000,
      }
    );

    return reply.status(201).send(approval);
  });

  fastify.get<{ Params: { id: string }; Querystring: { runnerId?: string } }>(
    "/approvals/:id",
    async (request, reply) => {
      const { id } = request.params;
      const targetRunnerId = getActiveRunnerId(request.query.runnerId);

      const approval = await rpcService.request(
        targetRunnerId,
        RunnerRpcMethods.ApprovalGet,
        { approvalId: id }
      );

      return reply.status(200).send(approval);
    }
  );

  fastify.post<{
    Params: { id: string };
    Body: {
      action: "approve" | "deny";
      resolvedBy?: string;
      runnerId?: string;
      decisionSource?: string;
    };
  }>("/approvals/:id/resolve", async (request, reply) => {
    const { id } = request.params;
    const { action, resolvedBy, runnerId, decisionSource } = request.body || {};

    if (!action || (action !== "approve" && action !== "deny")) {
      return reply.status(400).send({
        code: LocalBridgeErrorCode.INVALID_REQUEST,
        message: "Field 'action' must be 'approve' or 'deny'",
      });
    }

    const targetRunnerId = getActiveRunnerId(runnerId);
    const opDisplayName = projectService.getOperatorDisplayName();
    const resolved = await rpcService.request(
      targetRunnerId,
      RunnerRpcMethods.ApprovalResolve,
      {
        approvalId: id,
        action,
        resolvedBy: resolvedBy || opDisplayName || "desktop-user",
        decisionSource: decisionSource || "desktop",
      }
    );

    return reply.status(200).send(resolved);
  });

  fastify.post<{
    Body: {
      approvalIds: string[];
      action: "approve" | "deny";
      resolvedBy?: string;
      runnerId?: string;
    };
  }>("/management/approvals/bulk-resolve", async (request, reply) => {
    const { approvalIds, action, resolvedBy, runnerId } = request.body || {};
    if (
      !Array.isArray(approvalIds) ||
      approvalIds.length === 0 ||
      !action ||
      (action !== "approve" && action !== "deny")
    ) {
      return reply.status(400).send({
        code: LocalBridgeErrorCode.INVALID_REQUEST,
        message:
          "Fields 'approvalIds' (non-empty array) and 'action' ('approve' | 'deny') are required",
      });
    }

    const targetRunnerId = getActiveRunnerId(runnerId);
    const opDisplayName = projectService.getOperatorDisplayName();
    const actor = resolvedBy || opDisplayName || "desktop-user";

    const result = await rpcService.request(
      targetRunnerId,
      RunnerRpcMethods.ApprovalBulkResolve,
      {
        approvalIds,
        action,
        resolvedBy: actor,
      }
    );

    return reply.status(200).send(result);
  });

  // ==========================================
  // 5. Jobs Management (/jobs)
  // ==========================================
  fastify.get<{
    Querystring: {
      projectId?: string;
      runnerId?: string;
      limit?: number;
    };
  }>("/jobs", async (request, reply) => {
    const { projectId, runnerId, limit } = request.query;
    const maxLimit = limit ? Number(limit) : 50;
    const runners = runnerRegistry.list();
    const liveJobsMap = new Map<string, any>();

    if (runners.length > 0) {
      const targetRunners = runnerId
        ? runners.filter((r) => r.id === runnerId)
        : runners;

      for (const r of targetRunners) {
        try {
          const res = await rpcService.request(r.id, RunnerRpcMethods.JobList, {
            projectId,
            limit: maxLimit,
          });
          for (const j of res.jobs) {
            liveJobsMap.set(j.jobId, j);
          }
        } catch {
          // ignore
        }
      }
    }

    // Merge with persisted jobs from SQLite if available
    if (db) {
      try {
        let query = "SELECT * FROM jobs";
        const params: any[] = [];
        const conditions: string[] = [];

        if (projectId) {
          conditions.push("project_id = ?");
          params.push(projectId);
        }
        if (runnerId) {
          conditions.push("runner_id = ?");
          params.push(runnerId);
        }
        if (conditions.length > 0) {
          query += " WHERE " + conditions.join(" AND ");
        }
        query += " ORDER BY created_at DESC LIMIT ?";
        params.push(maxLimit);

        const rows = db.prepare(query).all(...params) as JobRow[];
        for (const row of rows) {
          if (!liveJobsMap.has(row.id)) {
            liveJobsMap.set(row.id, {
              jobId: row.id,
              projectId: row.project_id,
              state: row.state,
              commandKind: row.command_kind,
              risk: row.risk,
              createdAt: row.created_at,
              startedAt: row.started_at,
              finishedAt: row.finished_at,
              exitCode: row.exit_code,
              outputTruncated: Boolean(row.output_truncated),
              error: row.error_message || undefined,
            });
          }
        }
      } catch {
        // ignore db query error
      }
    }

    const allJobs = Array.from(liveJobsMap.values()).sort(
      (a, b) => b.createdAt - a.createdAt
    );
    return reply.status(200).send({ jobs: allJobs.slice(0, maxLimit) });
  });

  fastify.get<{ Params: { id: string }; Querystring: { runnerId?: string } }>(
    "/jobs/:id/status",
    async (request, reply) => {
      const { id } = request.params;
      let targetRunnerId = request.query.runnerId;

      if (!targetRunnerId) {
        try {
          targetRunnerId = mcpContext.resolveJobRunner(id);
        } catch {
          targetRunnerId = getActiveRunnerId();
        }
      }

      const res = await rpcService.request(targetRunnerId, RunnerRpcMethods.JobStatus, {
        jobId: id,
      });

      return reply.status(200).send(res);
    }
  );

  fastify.get<{
    Params: { id: string };
    Querystring: { runnerId?: string; cursor?: string; limit?: number };
  }>("/jobs/:id/logs", async (request, reply) => {
    const { id } = request.params;
    const { cursor, limit } = request.query;
    let targetRunnerId = request.query.runnerId;

    if (!targetRunnerId) {
      try {
        targetRunnerId = mcpContext.resolveJobRunner(id);
      } catch {
        targetRunnerId = getActiveRunnerId();
      }
    }

    const res = await rpcService.request(targetRunnerId, RunnerRpcMethods.JobLogs, {
      jobId: id,
      cursor: cursor || undefined,
      limit: limit ? Number(limit) : 100,
    });

    return reply.status(200).send(res);
  });

  fastify.post<{
    Params: { id: string };
    Querystring: { runnerId?: string };
    Body?: { projectId?: string };
  }>("/jobs/:id/cancel", async (request, reply) => {
    const { id } = request.params;
    const projectId = request.body?.projectId;
    let targetRunnerId = request.query.runnerId;

    if (!targetRunnerId) {
      try {
        targetRunnerId = mcpContext.resolveJobRunner(id);
      } catch {
        targetRunnerId = getActiveRunnerId();
      }
    }

    const res = await rpcService.request(targetRunnerId, RunnerRpcMethods.JobCancel, {
      jobId: id,
      projectId,
    });

    return reply.status(200).send(res);
  });

  // ==========================================
  // 6. Audit Events (/audit)
  // ==========================================
  fastify.get<{ Querystring: { limit?: number } }>(
    "/audit",
    async (request, reply) => {
      const limit = request.query.limit ? Number(request.query.limit) : 100;
      const events = mcpContext.getAuditEvents(limit);
      return reply.status(200).send({ events });
    }
  );

  // ==========================================
  // 7. Trust & System Settings
  // ==========================================
  fastify.post("/management/trust/reset-defaults", async (_request, reply) => {
    projectService.resetAllTrustPolicies();
    const runners = runnerRegistry.list();
    for (const runner of runners) {
      try {
        const projects = await rpcService.request(
          runner.id,
          RunnerRpcMethods.ProjectList,
          {}
        );
        for (const p of projects) {
          await rpcService.request(
            runner.id,
            RunnerRpcMethods.ProjectSetTrustPolicy,
            {
              projectId: p.id,
              trustLevel: "standard",
              filePolicy: "ask",
              commandPolicy: "ask",
              protectedFilesPolicy: "always-ask",
            }
          );
        }
      } catch (err) {
        fastify.log.warn(
          { runnerId: runner.id, err },
          "Failed to reset trust policy for runner projects"
        );
      }
    }
    return reply.status(200).send({ reset: true });
  });

  fastify.post("/management/trust/clear-sessions", async (_request, reply) => {
    const runners = runnerRegistry.list();
    for (const runner of runners) {
      try {
        const projects = await rpcService.request(
          runner.id,
          RunnerRpcMethods.ProjectList,
          {}
        );
        for (const p of projects) {
          await rpcService.request(
            runner.id,
            RunnerRpcMethods.ProjectSessionTrust,
            {
              projectId: p.id,
              action: "revoke",
            }
          );
        }
      } catch (err) {
        fastify.log.warn(
          { runnerId: runner.id, err },
          "Failed to clear session trust for runner projects"
        );
      }
    }
    return reply.status(200).send({ cleared: true });
  });

  fastify.get("/management/settings/operator", async (_request, reply) => {
    const displayName = projectService.getOperatorDisplayName();
    return reply.status(200).send({ displayName });
  });

  fastify.post<{ Body: { displayName: string } }>(
    "/management/settings/operator",
    async (request, reply) => {
      const { displayName } = request.body || {};
      if (!displayName || typeof displayName !== "string") {
        return reply.status(400).send({
          code: LocalBridgeErrorCode.INVALID_REQUEST,
          message: "Field 'displayName' is required",
        });
      }
      projectService.setOperatorDisplayName(displayName);
      return reply
        .status(200)
        .send({ displayName: projectService.getOperatorDisplayName() });
    }
  );

  fastify.get("/management/settings/approval-routing", async (_request, reply) => {
    const mode = projectService.getApprovalRoutingMode();
    return reply.status(200).send({ mode });
  });

  fastify.post<{ Body: { mode: "chat" | "hybrid" | "desktop" } }>(
    "/management/settings/approval-routing",
    async (request, reply) => {
      const { mode } = request.body || {};
      if (mode !== "chat" && mode !== "hybrid" && mode !== "desktop") {
        return reply.status(400).send({
          code: LocalBridgeErrorCode.INVALID_REQUEST,
          message: "Field 'mode' must be 'chat', 'hybrid', or 'desktop'",
        });
      }
      projectService.setApprovalRoutingMode(mode);
      return reply
        .status(200)
        .send({ mode: projectService.getApprovalRoutingMode() });
    }
  );
};
