import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { ReconnectController } from "../apps/runner/src/client/reconnect.js";

describe("ReconnectController", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("calculates exponential backoff without jitter predictably", () => {
    const controller = new ReconnectController({
      initialDelayMs: 1000,
      factor: 2,
      maxDelayMs: 30000,
      jitter: false,
    });

    expect(controller.calculateDelay(0)).toBe(1000);
    expect(controller.calculateDelay(1)).toBe(2000);
    expect(controller.calculateDelay(2)).toBe(4000);
    expect(controller.calculateDelay(3)).toBe(8000);
    expect(controller.calculateDelay(4)).toBe(16000);
    expect(controller.calculateDelay(5)).toBe(30000); // capped at 30s
    expect(controller.calculateDelay(10)).toBe(30000); // capped at 30s
  });

  it("applies bounded jitter within range", () => {
    const controller = new ReconnectController({
      initialDelayMs: 1000,
      factor: 2,
      maxDelayMs: 30000,
      jitter: true,
    });

    for (let i = 0; i < 20; i++) {
      const delay = controller.calculateDelay(1); // base 2000ms
      // 0.8 * 2000 = 1600, 1.2 * 2000 = 2400
      expect(delay).toBeGreaterThanOrEqual(1600);
      expect(delay).toBeLessThanOrEqual(2400);
    }
  });

  it("schedules callbacks and increments attempt counter", () => {
    const controller = new ReconnectController({
      initialDelayMs: 1000,
      jitter: false,
    });

    const callback = vi.fn();
    const delay = controller.schedule(callback);
    expect(delay).toBe(1000);
    expect(controller.currentAttempts).toBe(1);

    // Fast-forward time
    expect(callback).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1000);
    expect(callback).toHaveBeenCalledTimes(1);
  });

  it("resets attempt counter upon success", () => {
    const controller = new ReconnectController({
      initialDelayMs: 1000,
      jitter: false,
    });

    controller.schedule(() => {});
    controller.schedule(() => {});
    expect(controller.currentAttempts).toBe(2);

    controller.reset();
    expect(controller.currentAttempts).toBe(0);
  });

  it("cancels pending scheduled timer", () => {
    const controller = new ReconnectController({
      initialDelayMs: 1000,
      jitter: false,
    });

    const callback = vi.fn();
    controller.schedule(callback);
    controller.cancel();

    vi.advanceTimersByTime(2000);
    expect(callback).not.toHaveBeenCalled();
  });
});
