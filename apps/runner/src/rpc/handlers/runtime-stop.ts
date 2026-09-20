import type { RuntimeStopParams, RuntimeStopResult } from "@localbridge/protocol";
import type { PersistentRuntimeManager } from "../../runtime/index.js";

export function createRuntimeStopHandler(runtimeManager: PersistentRuntimeManager) {
  return async (params: RuntimeStopParams): Promise<RuntimeStopResult> => {
    return runtimeManager.stop(params);
  };
}
