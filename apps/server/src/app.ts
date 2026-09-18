import Fastify, {
  type FastifyError,
  type FastifyReply,
  type FastifyRequest,
} from "fastify";
import cors from "@fastify/cors";
import { createLogger, type AppConfig } from "@localbridge/shared";
import { LocalBridgeError, LocalBridgeErrorCode } from "@localbridge/protocol";
import { initDatabase, type DatabaseConnection } from "./db/index.js";
import { healthRoutes } from "./routes/health.js";
import { statusRoutes } from "./routes/status.js";

export interface BuildAppOptions {
  config: AppConfig;
  db?: DatabaseConnection;
  migrationsDir?: string;
  enableLogging?: boolean;
}

export type AppInstance = ReturnType<typeof Fastify>;

export async function buildApp(
  options: BuildAppOptions
): Promise<{ app: AppInstance; db: DatabaseConnection }> {
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

  // SQLite database
  const db =
    options.db ?? initDatabase(config.server.dbPath, migrationsDir);

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
  });

  // Register API routes
  await app.register(healthRoutes, { prefix: "/api" });
  await app.register(statusRoutes, {
    prefix: "/api",
    version: "0.1.0",
    getRunnersConnected: () => 0,
    isMcpActive: () => false,
  });

  // On close hook
  app.addHook("onClose", async () => {
    db.close();
  });

  return { app, db };
}
