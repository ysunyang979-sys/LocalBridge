import type { EnvironmentDetectParams, EnvironmentDetectResult } from "@localbridge/protocol";
import type { ExecutableRegistry } from "../../process/executable-registry.js";

export function createEnvironmentDetectHandler(executableRegistry: ExecutableRegistry) {
  return async (params: EnvironmentDetectParams): Promise<EnvironmentDetectResult> => {
    return executableRegistry.detectEnvironment(params.tools);
  };
}
