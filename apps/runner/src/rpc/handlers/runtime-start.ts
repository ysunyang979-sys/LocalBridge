import type { RuntimeStartParams, RuntimeStartResult } from "@localbridge/protocol";
import type { PersistentRuntimeManager } from "../../runtime/index.js";

export function createRuntimeStartHandler(runtimeManager: PersistentRuntimeManager) {
  return async (params: RuntimeStartParams): Promise<RuntimeStartResult> => {
    return runtimeManager.start(params);
  };
}
