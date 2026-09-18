import pino from "pino";

export interface LoggerOptions {
  level?: string;
  pretty?: boolean;
}

const REDACTED_PATHS = [
  "token",
  "*.token",
  "tokenHash",
  "*.tokenHash",
  "authorization",
  "*.authorization",
  "headers.authorization",
  "runnerToken",
  "*.runnerToken",
  "password",
  "*.password",
  "secret",
  "*.secret",
];

export function createLogger(options: LoggerOptions = {}) {
  const level = options.level ?? process.env.LOCALBRIDGE_LOG_LEVEL ?? "info";
  const isPretty =
    options.pretty ??
    (process.env.LOCALBRIDGE_LOG_PRETTY === "true" ||
      process.env.NODE_ENV === "development");

  if (isPretty) {
    return pino({
      level,
      redact: {
        paths: REDACTED_PATHS,
        censor: "[REDACTED]",
      },
      transport: {
        target: "pino-pretty",
        options: {
          colorize: true,
          translateTime: "HH:MM:ss.l",
          ignore: "pid,hostname",
        },
      },
    });
  }

  return pino({
    level,
    redact: {
      paths: REDACTED_PATHS,
      censor: "[REDACTED]",
    },
    timestamp: pino.stdTimeFunctions.isoTime,
  });
}

export type Logger = ReturnType<typeof createLogger>;

export const defaultLogger = createLogger();
