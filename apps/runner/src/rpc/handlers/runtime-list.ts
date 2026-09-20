import type { RuntimeListParams, RuntimeListResult } from "@localbridge/protocol";
import type { PersistentRuntimeManager } from "../../runtime/index.js";

export function createRuntimeListHandler(runtimeManager: PersistentRuntimeManager) {
  return async (params: RuntimeListParams): Promise<RuntimeListResult> => {
    return runtimeManager.list(params);
  };
}
