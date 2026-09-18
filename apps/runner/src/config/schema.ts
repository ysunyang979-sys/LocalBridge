import { z } from "zod";

export const RunnerDaemonConfigSchema = z.object({
  serverUrl: z.string().default("ws://127.0.0.1:18080/runner/ws"),
  token: z.string().min(1, "Runner token is required to authenticate with LocalBridge Server"),
  runnerName: z.string().default("LocalBridge-Runner"),
  runnerId: z.string().optional(),
  statePath: z.string().optional(),
  projectsPath: z.string().optional(),
  heartbeatIntervalMs: z.number().int().positive().default(15000),
  reconnect: z
    .object({
      enabled: z.boolean().default(true),
      initialDelayMs: z.number().int().positive().default(1000),
      maxDelayMs: z.number().int().positive().default(30000),
      factor: z.number().positive().default(2),
      jitter: z.boolean().default(true),
    })
    .default({}),
  logging: z
    .object({
      level: z
        .enum(["trace", "debug", "info", "warn", "error", "fatal", "silent"])
        .default("info"),
      pretty: z.boolean().default(false),
    })
    .default({}),
});

export type RunnerDaemonConfig = z.infer<typeof RunnerDaemonConfigSchema>;
