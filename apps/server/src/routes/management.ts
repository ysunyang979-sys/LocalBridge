import crypto from "node:crypto";
import type { FastifyPluginAsync, FastifyRequest, FastifyReply } from "fastify";
import {
  LocalBridgeError,
  LocalBridgeErrorCode,
  RunnerRpcMethods,
  type ProjectAccessMode,
  type ProjectExecutionMode,
  type ApprovalRisk,
} from "@localbridge/protocol";
import type { TokenService } from "../db/token-service.js";
import type { RunnerRegistry } from "../runner/registry.js";
import type { RunnerRpcService } from "../runner/rpc-service.js";
import type { ServerProjectService } from "../runner/project-service.js";
import type { McpContext } from "../mcp/context.js";

export interface ManagementRoutesOptions {
  tokenService: TokenService;
  runnerRegistry: RunnerRegistry;
  rpcService: RunnerRpcService;
  projectService: ServerProjectService;
  mcpContext: McpContext;
  managementSecret?: string;
  requireManagementAuth?: boolean;
}

function checkLoopbackAndSecurity(
  request: FastifyRequest,
  reply: FastifyReply,
  opts: ManagementRoutesOptions
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
    const hostWithoutPort = host.split(":")[0]?.toLowerCase();
    const isAllowedHost =
      hostWithoutPort === "127.0.0.1" ||
      hostWithoutPort === "localhost" ||
      hostWithoutPort === "[::1]" ||
      hostWithoutPort === "::1";
    if (!isAllowedHost) {
      reply.status(403).send({
        error: "Forbidden: Host header validation failed",
        code: "HOST_NOT_ALLOWED",
      });
      return false;
    }
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
  const { tokenService, runnerRegistry, rpcService, projectService, mcpContext } = opts;

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
      return reply.status(200).send({ success: true, id });
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

    const computedHash =
      payloadHash ||
      crypto
        .createHash("sha256")
        .update(typeof payload === "string" ? payload : JSON.stringify(payload))
        .digest("hex");

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
    Body: { action: "approve" | "deny"; resolvedBy?: string; runnerId?: string };
  }>("/approvals/:id/resolve", async (request, reply) => {
    const { id } = request.params;
    const { action, resolvedBy, runnerId } = request.body || {};

    if (!action || (action !== "approve" && action !== "deny")) {
      return reply.status(400).send({
        code: LocalBridgeErrorCode.INVALID_REQUEST,
        message: "Field 'action' must be 'approve' or 'deny'",
      });
    }

    const targetRunnerId = getActiveRunnerId(runnerId);
    const resolved = await rpcService.request(
      targetRunnerId,
      RunnerRpcMethods.ApprovalResolve,
      {
        approvalId: id,
        action,
        resolvedBy: resolvedBy || "desktop-user",
      }
    );

    return reply.status(200).send(resolved);
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
    const runners = runnerRegistry.list();
    if (runners.length === 0) {
      return reply.status(200).send({ jobs: [] });
    }

    const targetRunnerId = runnerId || runners[0]!.id;
    try {
      const res = await rpcService.request(targetRunnerId, RunnerRpcMethods.JobList, {
        projectId,
        limit: limit ? Number(limit) : 50,
      });
      return reply.status(200).send({ jobs: res.jobs });
    } catch {
      return reply.status(200).send({ jobs: [] });
    }
  });

  fastify.post<{ Params: { id: string }; Querystring: { runnerId?: string } }>(
    "/jobs/:id/cancel",
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

      const res = await rpcService.request(targetRunnerId, RunnerRpcMethods.JobCancel, {
        jobId: id,
      });

      return reply.status(200).send(res);
    }
  );

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
};
