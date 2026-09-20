import type { RuntimeStatusParams, RuntimeStatusResult } from "@localbridge/protocol";
import type { PersistentRuntimeManager } from "../../runtime/index.js";

export function createRuntimeStatusHandler(runtimeManager: PersistentRuntimeManager) {
  return async (params: RuntimeStatusParams): Promise<RuntimeStatusResult> => {
    return runtimeManager.status(params);
  };
}
