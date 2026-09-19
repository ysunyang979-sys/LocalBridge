import Fastify, {
  type FastifyError,
  type FastifyReply,
  type FastifyRequest,
} from "fastify";
import cors from "@fastify/cors";
import websocket from "@fastify/websocket";
import { createLogger, generateManagementToken, type AppConfig } from "@localbridge/shared";
import {
  LocalBridgeError,
  LocalBridgeErrorCode,
  RemoteRpcError,
} from "@localbridge/protocol";
import { initDatabase, type DatabaseConnection } from "./db/index.js";
import { TokenService } from "./db/token-service.js";
import { RunnerRegistry } from "./runner/registry.js";
import { RunnerRpcService } from "./runner/rpc-service.js";
import { ServerProjectService } from "./runner/project-service.js";
import { healthRoutes } from "./routes/health.js";
import { statusRoutes } from "./routes/status.js";
import { runnerWsRoute } from "./routes/runner-ws.js";
import { runnersRoutes } from "./routes/runners.js";
import { projectsRoutes } from "./routes/projects.js";
import { managementRoutes } from "./routes/management.js";
import { mcpRoutes, McpContext, McpRateLimiter } from "./mcp/index.js";

export interface BuildAppOptions {
  config: AppConfig;
  db?: DatabaseConnection;
  tokenService?: TokenService;
  runnerRegistry?: RunnerRegistry;
  rpcService?: RunnerRpcService;
  projectService?: ServerProjectService;
  mcpContext?: McpContext;
  rateLimiter?: McpRateLimiter;
  migrationsDir?: string;
  enableLogging?: boolean;
  managementSecret?: string;
  requireManagementAuth?: boolean;
}

export type AppInstance = ReturnType<typeof Fastify>;

export interface BuiltAppResult {
  app: AppInstance;
  db: DatabaseConnection;
  tokenService: TokenService;
  runnerRegistry: RunnerRegistry;
  rpcService: RunnerRpcService;
  projectService: ServerProjectService;
  mcpContext: McpContext;
  rateLimiter: McpRateLimiter;
  managementSecret: string;
}

export async function buildApp(
  options: BuildAppOptions
): Promise<BuiltAppResult> {
  const { config, migrationsDir, enableLogging = true } = options;

  const logger = createLogger({
    level: enableLogging ? config.logging.level : "silent",
    pretty: config.logging.pretty,
  });

  const app = Fastify({
    loggerInstance: logger,
    disableRequestLogging: !enableLogging,
  });

  // CORS
  await app.register(cors, {
    origin: config.server.corsOrigin,
  });

  // WebSocket support with transport-level maxPayload = 1 MiB (1048576 bytes)
  await app.register(websocket, {
    options: {
      maxPayload: 1048576,
    },
  });

  // SQLite database
  const db =
    options.db ?? initDatabase(config.server.dbPath, migrationsDir);

  // Services
  const tokenService = options.tokenService ?? new TokenService(db.db);
  const runnerRegistry =
    options.runnerRegistry ?? new RunnerRegistry(logger);
  const rpcService =
    options.rpcService ?? new RunnerRpcService(runnerRegistry);
  const projectService =
    options.projectService ?? new ServerProjectService(db.db, runnerRegistry);
  const mcpContext =
    options.mcpContext ??
    new McpContext({
      projectService,
      runnerRegistry,
      rpcService,
      logger,
    });
  const rateLimiter = options.rateLimiter ?? new McpRateLimiter();

  // Global error handler
  app.setErrorHandler(
    (error: FastifyError | Error, _request: FastifyRequest, reply: FastifyReply) => {
      if (error instanceof LocalBridgeError) {
        let status = 400;
        if (error.code === LocalBridgeErrorCode.RUNNER_OFFLINE) status = 404;
        else if (error.code === LocalBridgeErrorCode.RPC_TIMEOUT) status = 504;
        else if (error.code === LocalBridgeErrorCode.RUNNER_BUSY) status = 503;
        else if (error.code === LocalBridgeErrorCode.RUNNER_DISCONNECTED) status = 502;
        return reply.status(status).send(error.toJSON());
      }

      if (error instanceof RemoteRpcError) {
        return reply.status(502).send({
          code: LocalBridgeErrorCode.RPC_REMOTE_ERROR,
          message: error.message,
          details: { remoteCode: error.code, data: error.data },
        });
      }

      const fastifyErr = error as FastifyError;
      if (fastifyErr.validation) {
        return reply.status(400).send({
          code: LocalBridgeErrorCode.INVALID_REQUEST,
          message: fastifyErr.message,
          details: { validation: fastifyErr.validation },
        });
      }

      if (fastifyErr.statusCode) {
        return reply.status(fastifyErr.statusCode).send({
          code: fastifyErr.code ?? LocalBridgeErrorCode.INVALID_REQUEST,
          message: fastifyErr.message,
        });
      }

      app.log.error(error);
      return reply.status(500).send({
        code: LocalBridgeErrorCode.INTERNAL_ERROR,
        message: "An internal server error occurred",
      });
    }
  );

  const managementSecret =
    options.managementSecret ?? generateManagementToken();
  const requireManagementAuth = options.requireManagementAuth ?? false;

  // Register REST API routes
  await app.register(healthRoutes);
  await app.register(statusRoutes, {
    prefix: "/api",
    version: "1.0.1",
    getRunnersConnected: () => runnerRegistry.count(),
    isMcpActive: () => !mcpContext.isPaused(),
    tokenService,
    managementSecret,
    requireManagementAuth,
  });
  await app.register(runnersRoutes, {
    prefix: "/api",
    runnerRegistry,
    rpcService,
    tokenService,
    managementSecret,
    requireManagementAuth,
  });
  await app.register(projectsRoutes, {
    prefix: "/api",
    projectService,
    tokenService,
    managementSecret,
    requireManagementAuth,
  });
  await app.register(managementRoutes, {
    prefix: "/api",
    tokenService,
    runnerRegistry,
    rpcService,
    projectService,
    mcpContext,
    managementSecret,
    requireManagementAuth,
  });

  // Register WebSocket route for runner connections
  await app.register(runnerWsRoute, {
    tokenService,
    runnerRegistry,
    projectService,
    db: db.db,
    serverVersion: "1.0.1",
    heartbeatIntervalMs: 15000,
  });

  // Register MCP 2026-07-28 Server Routes
  await app.register(mcpRoutes, {
    tokenService,
    mcpContext,
    rateLimiter,
    managementSecret,
    requireManagementAuth,
    allowedHosts: [
      "localhost",
      "127.0.0.1",
      "[::1]",
      "::1",
      config.server.host,
    ],
  });

  // On close hook
  app.addHook("onClose", async () => {
    runnerRegistry.closeAll();
    db.close();
  });

  return {
    app,
    db,
    tokenService,
    runnerRegistry,
    rpcService,
    projectService,
    mcpContext,
    rateLimiter,
    managementSecret,
  };
}
