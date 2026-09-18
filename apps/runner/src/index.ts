#!/usr/bin/env node
import { loadRunnerConfig } from "./config/loader.js";
import { LocalBridgeRunner } from "./runner.js";

async function main() {
  const config = loadRunnerConfig();
  const runner = new LocalBridgeRunner(config);

  const shutdown = async (signal: string) => {
    console.log(`\nReceived ${signal}, shutting down LocalBridge Runner gracefully...`);
    await runner.stop();
    process.exit(0);
  };

  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));

  try {
    await runner.start();
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("Fatal Runner startup error:", msg);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
