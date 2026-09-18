import Fastify, {
  type FastifyError,
  type FastifyReply,
  type FastifyRequest,
} from "fastify";
import cors from "@fastify/cors";
import websocket from "@fastify/websocket";
import { createLogger, type AppConfig } from "@localbridge/shared";
import { LocalBridgeError, LocalBridgeErrorCode } from "@localbridge/protocol";
import { initDatabase, type DatabaseConnection } from "./db/index.js";
import { TokenService } from "./db/token-service.js";
import { RunnerRegistry } from "./runner/registry.js";
import { healthRoutes } from "./routes/health.js";
import { statusRoutes } from "./routes/status.js";
import { runnerWsRoute } from "./routes/runner-ws.js";
import { runnersRoutes } from "./routes/runners.js";

export interface BuildAppOptions {
  config: AppConfig;
  db?: DatabaseConnection;
  tokenService?: TokenService;
  runnerRegistry?: RunnerRegistry;
  migrationsDir?: string;
  enableLogging?: boolean;
}

export type AppInstance = ReturnType<typeof Fastify>;

export interface BuiltAppResult {
  app: AppInstance;
  db: DatabaseConnection;
  tokenService: TokenService;
  runnerRegistry: RunnerRegistry;
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
  });

  // CORS
  await app.register(cors, {
    origin: config.server.corsOrigin,
  });

  // WebSocket support
  await app.register(websocket);

  // SQLite database
  const db =
    options.db ?? initDatabase(config.server.dbPath, migrationsDir);

  // Services
  const tokenService = options.tokenService ?? new TokenService(db.db);
  const runnerRegistry =
    options.runnerRegistry ?? new RunnerRegistry(logger);

  // Global error handler
  app.setErrorHandler(
    (error: FastifyError | Error, _request: FastifyRequest, reply: FastifyReply) => {
      if (error instanceof LocalBridgeError) {
        return reply.status(400).send(error.toJSON());
      }

      const fastifyErr = error as FastifyError;
      if (fastifyErr.validation) {
        return reply.status(400).send({
          code: LocalBridgeErrorCode.INVALID_REQUEST,
          message: fastifyErr.message,
          details: { validation: fastifyErr.validation },
        });
      }

      app.log.error(error);
      return reply.status(500).send({
        code: LocalBridgeErrorCode.INTERNAL_ERROR,
        message: "An internal server error occurred",
      });
    }
  );

  // Register REST API routes
  await app.register(healthRoutes, { prefix: "/api" });
  await app.register(statusRoutes, {
    prefix: "/api",
    version: "0.2.0",
    getRunnersConnected: () => runnerRegistry.count(),
    isMcpActive: () => false,
  });
  await app.register(runnersRoutes, {
    prefix: "/api",
    runnerRegistry,
  });

  // Register WebSocket route for runner connections
  await app.register(runnerWsRoute, {
    tokenService,
    runnerRegistry,
    db: db.db,
    serverVersion: "0.2.0",
    heartbeatIntervalMs: 15000,
  });

  // On close hook
  app.addHook("onClose", async () => {
    runnerRegistry.closeAll();
    db.close();
  });

  return { app, db, tokenService, runnerRegistry };
}
