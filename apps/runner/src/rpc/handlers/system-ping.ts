import type { SystemPingResult } from "@localbridge/protocol";

export interface SystemPingHandlerContext {
  runnerId: string;
}

export function createSystemPingHandler(context: SystemPingHandlerContext) {
  return async (): Promise<SystemPingResult> => {
    return {
      pong: true,
      timestamp: Date.now(),
      runnerId: context.runnerId,
    };
  };
}
