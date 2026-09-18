import os from "node:os";
import {
  PROTOCOL_VERSION,
  type SystemInfoResult,
  type RunnerCapabilities,
  type RunnerTools,
} from "@localbridge/protocol";

export interface SystemInfoHandlerContext {
  runnerId: string;
  version: string;
  capabilities: RunnerCapabilities;
  tools: RunnerTools;
}

export function createSystemInfoHandler(context: SystemInfoHandlerContext) {
  return async (): Promise<SystemInfoResult> => {
    return {
      runnerId: context.runnerId,
      runnerVersion: context.version,
      protocolVersion: PROTOCOL_VERSION,
      platform: process.platform,
      arch: process.arch,
      hostname: os.hostname(),
      nodeVersion: process.version,
      capabilities: context.capabilities,
      tools: context.tools,
    };
  };
}
