import { describe, expect, it } from "vitest";
import { applyServerPollResult } from "../apps/desktop/src/polling-state.js";

describe("Desktop polling stale-state prevention", () => {
  it("shows unavailable after an online server dies while preserving last success time", () => {
    const online = applyServerPollResult(
      { serverStatus: null, lastSuccessfulRefresh: null },
      { status: "fulfilled", value: { server: "LocalBridge Server", version: "1.0.1", runners_connected: 1, mcp_active: true } },
      1000
    );
    expect(online.serverStatus).not.toBeNull();
    const offline = applyServerPollResult(online, { status: "rejected", reason: new Error("server died") }, 2000);
    expect(offline.serverStatus).toBeNull();
    expect(offline.lastSuccessfulRefresh).toBe(1000);
  });
});
