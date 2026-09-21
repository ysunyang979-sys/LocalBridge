import { describe, it, expect } from "vitest";

describe("Shutdown Cancel Reconnect Suite (shutdown-cancel-reconnect.test)", () => {
  it("immediately aborts reconnect loop and clears backoff delays when shutdown is signaled", async () => {
    let isShuttingDown = false;
    let reconnectAttempts = 0;
    let abortCalled = false;

    class ReconnectController {
      private timer: NodeJS.Timeout | null = null;
      private retryDelays = [5000, 10000, 20000, 30000, 60000];

      scheduleReconnect(attempt: number) {
        if (isShuttingDown) {
          abortCalled = true;
          return;
        }
        const delay = this.retryDelays[Math.min(attempt, this.retryDelays.length - 1)];
        this.timer = setTimeout(() => {
          if (isShuttingDown) {
            abortCalled = true;
            return;
          }
          reconnectAttempts++;
        }, delay);
      }

      shutdown() {
        isShuttingDown = true;
        abortCalled = true;
        if (this.timer) {
          clearTimeout(this.timer);
          this.timer = null;
        }
      }
    }

    const controller = new ReconnectController();
    controller.scheduleReconnect(0);

    const start = Date.now();
    controller.shutdown();
    const elapsed = Date.now() - start;

    expect(isShuttingDown).toBe(true);
    expect(abortCalled).toBe(true);
    expect(reconnectAttempts).toBe(0);
    // Cancellation must be instantaneous without waiting for 5s/10s timer
    expect(elapsed).toBeLessThan(100);
  });
});
