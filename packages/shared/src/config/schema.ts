import { z } from "zod";

export const ServerConfigSchema = z.object({
  host: z.string().default("127.0.0.1"),
  port: z.number().int().min(0).max(65535).default(18080),
  dbPath: z.string().default("localbridge.db"),
  corsOrigin: z.union([z.string(), z.boolean()]).default(true),
});
export type ServerConfig = z.infer<typeof ServerConfigSchema>;

export const RunnerConfigSchema = z.object({
  name: z.string().default("Local-Runner"),
  serverUrl: z.string().default("ws://127.0.0.1:18080/runner"),
  runnerId: z.string().optional(),
  runnerToken: z.string().optional(),
});
export type RunnerConfig = z.infer<typeof RunnerConfigSchema>;

export const SecurityConfigSchema = z.object({
  maxFileSize: z.number().int().positive().default(2097152), // 2MB
  commandTimeout: z.number().int().min(1).max(300).default(60), // 60s
  allowSensitiveFiles: z.boolean().default(false),
});
export type SecurityConfig = z.infer<typeof SecurityConfigSchema>;

export const LoggingConfigSchema = z.object({
  level: z
    .enum(["trace", "debug", "info", "warn", "error", "fatal", "silent"])
    .default("info"),
  pretty: z.boolean().default(false),
});
export type LoggingConfig = z.infer<typeof LoggingConfigSchema>;

export const ProjectConfigSchema = z.object({
  id: z.string().optional(),
  name: z.string().min(1),
  path: z.string().min(1),
  enabled: z.boolean().default(true),
});
export type ProjectConfig = z.infer<typeof ProjectConfigSchema>;

export const AppConfigSchema = z.object({
  server: ServerConfigSchema.default({}),
  runner: RunnerConfigSchema.default({}),
  security: SecurityConfigSchema.default({}),
  logging: LoggingConfigSchema.default({}),
  projects: z.array(ProjectConfigSchema).default([]),
});
export type AppConfig = z.infer<typeof AppConfigSchema>;
