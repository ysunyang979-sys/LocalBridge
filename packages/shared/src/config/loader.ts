import fs from "node:fs";
import path from "node:path";
import { AppConfigSchema, type AppConfig } from "./schema.js";

export interface LoadConfigOptions {
  configPath?: string;
  env?: Record<string, string | undefined>;
  cliArgs?: string[];
}

export function parseCliArgs(argv: string[]): Record<string, unknown> {
  const result: Record<string, unknown> = {};

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (!arg) continue;

    if (arg === "--host" || arg === "-h") {
      const val = argv[++i];
      if (val) result.serverHost = val;
    } else if (arg.startsWith("--host=")) {
      result.serverHost = arg.split("=")[1];
    } else if (arg === "--port" || arg === "-p") {
      const val = argv[++i];
      if (val) result.serverPort = Number.parseInt(val, 10);
    } else if (arg.startsWith("--port=")) {
      result.serverPort = Number.parseInt(arg.split("=")[1] ?? "", 10);
    } else if (arg === "--db-path") {
      const val = argv[++i];
      if (val) result.serverDbPath = val;
    } else if (arg.startsWith("--db-path=")) {
      result.serverDbPath = arg.split("=")[1];
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

export function loadConfig(options: LoadConfigOptions = {}): AppConfig {
  const cli = parseCliArgs(options.cliArgs ?? process.argv.slice(2));
  const env = options.env ?? process.env;

  // 1. Determine config file path
  const configFilePath =
    (cli.configPath as string) ||
    options.configPath ||
    env.LOCALBRIDGE_CONFIG ||
    path.resolve(process.cwd(), "config.json");

  // 2. Base default configuration
  let loadedFileConfig: Record<string, unknown> = {};

  // 3. Load from config file if present
  if (fs.existsSync(configFilePath)) {
    try {
      const content = fs.readFileSync(configFilePath, "utf-8");
      loadedFileConfig = JSON.parse(content) as Record<string, unknown>;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      throw new Error(
        `Failed to parse configuration file at "${configFilePath}": ${msg}`
      );
    }
  } else if (cli.configPath || env.LOCALBRIDGE_CONFIG) {
    throw new Error(
      `Explicit configuration file not found at "${configFilePath}"`
    );
  }

  // Ensure sections exist
  const serverSection: Record<string, unknown> = {
    ...((loadedFileConfig.server as Record<string, unknown> | undefined) || {}),
  };
  const runnerSection: Record<string, unknown> = {
    ...((loadedFileConfig.runner as Record<string, unknown> | undefined) || {}),
  };
  const securitySection: Record<string, unknown> = {
    ...((loadedFileConfig.security as Record<string, unknown> | undefined) || {}),
  };
  const loggingSection: Record<string, unknown> = {
    ...((loadedFileConfig.logging as Record<string, unknown> | undefined) || {}),
  };

  const rawConfig: Record<string, unknown> = {
    ...loadedFileConfig,
    server: serverSection,
    runner: runnerSection,
    security: securitySection,
    logging: loggingSection,
  };

  // 4. Override with Environment Variables
  if (env.LOCALBRIDGE_SERVER_HOST) {
    serverSection.host = env.LOCALBRIDGE_SERVER_HOST;
  }
  if (env.LOCALBRIDGE_SERVER_PORT) {
    const port = Number.parseInt(env.LOCALBRIDGE_SERVER_PORT, 10);
    if (!Number.isNaN(port)) serverSection.port = port;
  }
  if (env.LOCALBRIDGE_SERVER_DB_PATH) {
    serverSection.dbPath = env.LOCALBRIDGE_SERVER_DB_PATH;
  }
  if (env.LOCALBRIDGE_RUNNER_NAME) {
    runnerSection.name = env.LOCALBRIDGE_RUNNER_NAME;
  }
  if (env.LOCALBRIDGE_RUNNER_SERVER_URL) {
    runnerSection.serverUrl = env.LOCALBRIDGE_RUNNER_SERVER_URL;
  }
  if (env.LOCALBRIDGE_RUNNER_ID) {
    runnerSection.runnerId = env.LOCALBRIDGE_RUNNER_ID;
  }
  if (env.LOCALBRIDGE_RUNNER_TOKEN) {
    runnerSection.runnerToken = env.LOCALBRIDGE_RUNNER_TOKEN;
  }
  if (env.LOCALBRIDGE_SECURITY_MAX_FILE_SIZE) {
    const size = Number.parseInt(env.LOCALBRIDGE_SECURITY_MAX_FILE_SIZE, 10);
    if (!Number.isNaN(size)) securitySection.maxFileSize = size;
  }
  if (env.LOCALBRIDGE_SECURITY_COMMAND_TIMEOUT) {
    const timeout = Number.parseInt(env.LOCALBRIDGE_SECURITY_COMMAND_TIMEOUT, 10);
    if (!Number.isNaN(timeout)) securitySection.commandTimeout = timeout;
  }
  if (env.LOCALBRIDGE_LOG_LEVEL) {
    loggingSection.level = env.LOCALBRIDGE_LOG_LEVEL;
  }
  if (env.LOCALBRIDGE_LOG_PRETTY) {
    loggingSection.pretty =
      env.LOCALBRIDGE_LOG_PRETTY === "true" || env.LOCALBRIDGE_LOG_PRETTY === "1";
  }

  // 5. Override with CLI Arguments
  if (cli.serverHost) serverSection.host = cli.serverHost;
  if (cli.serverPort) serverSection.port = cli.serverPort;
  if (cli.serverDbPath) serverSection.dbPath = cli.serverDbPath;
  if (cli.logLevel) loggingSection.level = cli.logLevel;
  if (cli.logPretty !== undefined) loggingSection.pretty = cli.logPretty;

  // 6. Validate against Zod schema
  const parsed = AppConfigSchema.safeParse(rawConfig);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `  - ${i.path.join(".")}: ${i.message}`)
      .join("\n");
    throw new Error(
      `Invalid LocalBridge configuration:\n${issues}\nPlease check config.json or environment variables.`
    );
  }

  return parsed.data;
}
