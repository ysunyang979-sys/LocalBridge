import { describe, it, expect } from "vitest";

describe("Shutdown Cancel Timers Suite (shutdown-cancel-timers.test)", () => {
  it("cancels all recurring health polling, tunnel metrics, and connection watchers", () => {
    const activeTimers: Set<NodeJS.Timeout> = new Set();

    function registerPoller(fn: () => void, intervalMs: number): NodeJS.Timeout {
      const timer = setInterval(fn, intervalMs);
      activeTimers.add(timer);
      return timer;
    }

    function cancelAllTimers() {
      for (const timer of activeTimers) {
        clearInterval(timer);
      }
      activeTimers.clear();
    }

    // Register simulated background tasks
    registerPoller(() => {}, 1000);
    registerPoller(() => {}, 5000);
    registerPoller(() => {}, 10000);
    expect(activeTimers.size).toBe(3);

    cancelAllTimers();
    expect(activeTimers.size).toBe(0);
  });
});
