import { loadConfig } from "@localbridge/shared";
import { buildApp } from "./app.js";

async function main() {
  const config = loadConfig();
  const { app, db, tokenService } = await buildApp({ config });

  // Handle bootstrap runner token if passed by Desktop Supervisor
  const bootstrapRunnerToken = process.env.LOCALBRIDGE_BOOTSTRAP_RUNNER_TOKEN;
  if (bootstrapRunnerToken && bootstrapRunnerToken.startsWith("lbr_")) {
    const tokenId = tokenService.ensureRunnerToken(bootstrapRunnerToken, "Desktop Embedded Runner");
    app.log.info({ tokenId }, "Ensured Desktop Embedded Runner token in database");
  }

  // Graceful shutdown handling
  const shutdown = async (signal: string) => {
    app.log.info({ signal }, "Received shutdown signal, closing server gracefully...");
    try {
      await app.close();
      app.log.info("Server and database closed successfully.");
      process.exit(0);
    } catch (err) {
      app.log.error(err, "Error during graceful shutdown");
      process.exit(1);
    }
  };

  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));

  try {
    const address = await app.listen({
      host: config.server.host,
      port: config.server.port,
    });
    app.log.info(
      {
        address,
        schemaVersion: db.migrationResult.currentVersion,
        migrationsApplied: db.migrationResult.appliedCount,
      },
      `LocalBridge Server is running at ${address}`
    );
  } catch (err) {
    app.log.error(err, "Failed to start LocalBridge Server");
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("Fatal startup error:", err);
  process.exit(1);
});
