import type { RuntimeLogsParams, RuntimeLogsResult } from "@localbridge/protocol";
import type { PersistentRuntimeManager } from "../../runtime/index.js";

export function createRuntimeLogsHandler(runtimeManager: PersistentRuntimeManager) {
  return async (params: RuntimeLogsParams): Promise<RuntimeLogsResult> => {
    return runtimeManager.logs(params);
  };
}
