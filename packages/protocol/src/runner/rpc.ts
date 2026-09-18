import { z } from "zod";
import crypto from "node:crypto";
import { RunnerRpcMethods } from "./methods.js";
import { RunnerCapabilitiesSchema, RunnerToolsSchema } from "../models/runner.js";

// Constraints
export const MIN_RPC_TIMEOUT = 1000;
export const MAX_RPC_TIMEOUT = 300000;
export const DEFAULT_RPC_TIMEOUT = 10000;
export const SYSTEM_PING_TIMEOUT = 5000;
export const SYSTEM_INFO_TIMEOUT = 10000;

export const MAX_RPC_MESSAGE_SIZE = 1024 * 1024; // 1 MiB (1,048,576 bytes)
export const MAX_PENDING_REQUESTS = 64;

export interface RpcRequestOptions {
  timeoutMs?: number;
  signal?: AbortSignal;
}

/**
 * Generate a cryptographically random, unique JSON-RPC 2.0 Request ID.
 * Format: req_<UUIDv4>
 */
export function generateRequestId(): string {
  return `req_${crypto.randomUUID()}`;
}

// 1. system.ping
export const SystemPingParamsSchema = z.object({}).strict();
export type SystemPingParams = z.infer<typeof SystemPingParamsSchema>;

export const SystemPingResultSchema = z.object({
  pong: z.literal(true),
  timestamp: z.number(),
  runnerId: z.string(),
});
export type SystemPingResult = z.infer<typeof SystemPingResultSchema>;

// 2. system.info
export const SystemInfoParamsSchema = z.object({}).strict();
export type SystemInfoParams = z.infer<typeof SystemInfoParamsSchema>;

export const SystemInfoResultSchema = z.object({
  runnerId: z.string(),
  runnerVersion: z.string(),
  protocolVersion: z.string(),
  platform: z.string(),
  arch: z.string(),
  hostname: z.string(),
  nodeVersion: z.string(),
  capabilities: RunnerCapabilitiesSchema,
  tools: RunnerToolsSchema,
});
export type SystemInfoResult = z.infer<typeof SystemInfoResultSchema>;

// Typed RPC Map
export interface RunnerRpcMap {
  [RunnerRpcMethods.SystemPing]: {
    params: SystemPingParams;
    result: SystemPingResult;
  };
  [RunnerRpcMethods.SystemInfo]: {
    params: SystemInfoParams;
    result: SystemInfoResult;
  };
}

export type RunnerRpcMethodName = keyof RunnerRpcMap;

// Schema mapping for dual-ended validation
export const RunnerRpcSchemas = {
  [RunnerRpcMethods.SystemPing]: {
    params: SystemPingParamsSchema,
    result: SystemPingResultSchema,
  },
  [RunnerRpcMethods.SystemInfo]: {
    params: SystemInfoParamsSchema,
    result: SystemInfoResultSchema,
  },
} as const;
