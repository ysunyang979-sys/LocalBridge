import fs from "node:fs";
import path from "node:path";
import type { ZodIssue } from "zod";
import { RunnerDaemonConfigSchema, type RunnerDaemonConfig } from "./schema.js";

export interface LoadRunnerConfigOptions {
  configPath?: string;
  env?: Record<string, string | undefined>;
  cliArgs?: string[];
}

export function parseRunnerCliArgs(argv: string[]): Record<string, unknown> {
  const result: Record<string, unknown> = {};

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (!arg) continue;

    if (arg === "--server-url" || arg === "-s") {
      const val = argv[++i];
      if (val) result.serverUrl = val;
    } else if (arg.startsWith("--server-url=")) {
      result.serverUrl = arg.split("=")[1];
    } else if (arg === "--token" || arg === "-t") {
      const val = argv[++i];
      if (val) result.token = val;
    } else if (arg.startsWith("--token=")) {
      result.token = arg.split("=")[1];
    } else if (arg === "--name" || arg === "-n") {
      const val = argv[++i];
      if (val) result.runnerName = val;
    } else if (arg.startsWith("--name=")) {
      result.runnerName = arg.split("=")[1];
    } else if (arg === "--config" || arg === "-c") {
      const val = argv[++i];
      if (val) result.configPath = val;
    } else if (arg.startsWith("--config=")) {
      result.configPath = arg.split("=")[1];
    } else if (arg === "--log-level") {
      const val = argv[++i];
      if (val) result.logLevel = val;
    } else if (arg === "--pretty") {
      result.logPretty = true;
    }
  }

  return result;
}

export function loadRunnerConfig(options: LoadRunnerConfigOptions = {}): RunnerDaemonConfig {
  const cli = parseRunnerCliArgs(options.cliArgs ?? process.argv.slice(2));
  const env = options.env ?? process.env;

  const configFilePath =
    (cli.configPath as string) ||
    env.LOCALBRIDGE_RUNNER_CONFIG ||
    path.resolve(process.cwd(), "config.json");

  let loadedFileConfig: Record<string, unknown> = {};

  if (fs.existsSync(configFilePath)) {
    try {
      const content = fs.readFileSync(configFilePath, "utf-8");
      const parsed = JSON.parse(content) as Record<string, unknown>;
      // Support either { runner: { serverUrl, token, ... } } or flat { serverUrl, token, ... }
      if (parsed.runner && typeof parsed.runner === "object") {
        loadedFileConfig = parsed.runner as Record<string, unknown>;
      } else {
        loadedFileConfig = parsed;
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      throw new Error(`Failed to parse runner config file at "${configFilePath}": ${msg}`);
    }
  } else if (cli.configPath || env.LOCALBRIDGE_RUNNER_CONFIG) {
    throw new Error(`Explicit runner configuration file not found at "${configFilePath}"`);
  }

  const rawConfig: Record<string, unknown> = {
    ...loadedFileConfig,
    logging: {
      ...((loadedFileConfig.logging as Record<string, unknown> | undefined) || {}),
    },
    reconnect: {
      ...((loadedFileConfig.reconnect as Record<string, unknown> | undefined) || {}),
    },
  };

  const loggingSection = rawConfig.logging as Record<string, unknown>;

  // Override with Environment Variables
  if (env.LOCALBRIDGE_SERVER_URL) rawConfig.serverUrl = env.LOCALBRIDGE_SERVER_URL;
  if (env.LOCALBRIDGE_RUNNER_TOKEN) rawConfig.token = env.LOCALBRIDGE_RUNNER_TOKEN;
  if (env.LOCALBRIDGE_RUNNER_NAME) rawConfig.runnerName = env.LOCALBRIDGE_RUNNER_NAME;
  if (env.LOCALBRIDGE_RUNNER_ID) rawConfig.runnerId = env.LOCALBRIDGE_RUNNER_ID;
  if (env.LOCALBRIDGE_LOG_LEVEL) loggingSection.level = env.LOCALBRIDGE_LOG_LEVEL;
  if (env.LOCALBRIDGE_LOG_PRETTY) {
    loggingSection.pretty =
      env.LOCALBRIDGE_LOG_PRETTY === "true" || env.LOCALBRIDGE_LOG_PRETTY === "1";
  }

  // Override with CLI Arguments
  if (cli.serverUrl) rawConfig.serverUrl = cli.serverUrl;
  if (cli.token) rawConfig.token = cli.token;
  if (cli.runnerName) rawConfig.runnerName = cli.runnerName;
  if (cli.logLevel) loggingSection.level = cli.logLevel;
  if (cli.logPretty !== undefined) loggingSection.pretty = cli.logPretty;

  const parsed = RunnerDaemonConfigSchema.safeParse(rawConfig);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i: ZodIssue) => `  - ${i.path.join(".")}: ${i.message}`)
      .join("\n");
    throw new Error(
      `Invalid LocalBridge Runner configuration:\n${issues}\nPlease check configuration or provide LOCALBRIDGE_RUNNER_TOKEN.`
    );
  }

  return parsed.data;
}
