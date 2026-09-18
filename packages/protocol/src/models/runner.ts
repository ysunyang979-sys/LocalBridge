import { z } from "zod";

export const RunnerCapabilitiesSchema = z.object({
  filesystem: z.boolean().default(true),
  shell: z.boolean().default(true),
  git: z.boolean().default(true),
  build: z.boolean().default(true),
  test: z.boolean().default(true),
  docker: z.boolean().default(false),
});
export type RunnerCapabilities = z.infer<typeof RunnerCapabilitiesSchema>;

export const RunnerToolsSchema = z.object({
  git: z.string().optional(),
  node: z.string().optional(),
  pnpm: z.string().optional(),
  npm: z.string().optional(),
  python: z.string().optional(),
  docker: z.string().optional(),
});
export type RunnerTools = z.infer<typeof RunnerToolsSchema>;

export const RunnerSystemInfoSchema = z.object({
  platform: z.string(),
  arch: z.string(),
  hostname: z.string(),
  nodeVersion: z.string(),
  tools: RunnerToolsSchema,
});
export type RunnerSystemInfo = z.infer<typeof RunnerSystemInfoSchema>;

export const RunnerRegistrationSchema = z.object({
  runnerId: z.string(),
  deviceName: z.string(),
  platform: z.string(),
  version: z.string(),
  allowedRoots: z.array(z.string()),
  capabilities: RunnerCapabilitiesSchema,
  systemInfo: RunnerSystemInfoSchema,
});
export type RunnerRegistration = z.infer<typeof RunnerRegistrationSchema>;

export const RunnerStatus = {
  ONLINE: "online",
  OFFLINE: "offline",
  BUSY: "busy",
} as const;
export type RunnerStatus = (typeof RunnerStatus)[keyof typeof RunnerStatus];
