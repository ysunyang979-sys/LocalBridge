import type { RuntimeRestartParams, RuntimeRestartResult } from "@localbridge/protocol";
import type { PersistentRuntimeManager } from "../../runtime/index.js";

export function createRuntimeRestartHandler(runtimeManager: PersistentRuntimeManager) {
  return async (params: RuntimeRestartParams): Promise<RuntimeRestartResult> => {
    return runtimeManager.restart(params);
  };
}
