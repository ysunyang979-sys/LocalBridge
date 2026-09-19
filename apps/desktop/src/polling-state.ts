import type { ServerStatus } from "./types.js";

export interface ServerPollingState {
  serverStatus: ServerStatus | null;
  lastSuccessfulRefresh: number | null;
}

export function applyServerPollResult(
  previous: ServerPollingState,
  result: PromiseSettledResult<ServerStatus>,
  now = Date.now()
): ServerPollingState {
  if (result.status === "fulfilled") {
    return { serverStatus: result.value, lastSuccessfulRefresh: now };
  }
  return { serverStatus: null, lastSuccessfulRefresh: previous.lastSuccessfulRefresh };
}
