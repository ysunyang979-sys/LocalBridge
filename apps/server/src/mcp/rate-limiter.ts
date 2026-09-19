import {
  MCP_MAX_CONCURRENT_REQUESTS,
  MCP_MAX_REQUESTS_PER_MINUTE,
} from "./types.js";

export interface RateLimitResult {
  allowed: boolean;
  reason?: "CONCURRENCY_EXCEEDED" | "RATE_LIMIT_EXCEEDED";
}

export class McpRateLimiter {
  private readonly requestTimestamps = new Map<string, number[]>();
  private readonly activeConcurrent = new Map<string, number>();

  constructor(
    private readonly maxPerMinute: number = MCP_MAX_REQUESTS_PER_MINUTE,
    private readonly maxConcurrent: number = MCP_MAX_CONCURRENT_REQUESTS
  ) {}

  /**
   * Acquire a rate-limiting slot. If permitted, increments active concurrency
   * and records request timestamp.
   */
  acquire(principalId: string): RateLimitResult {
    const now = Date.now();

    // 1. Check concurrency
    const currentConcurrent = this.activeConcurrent.get(principalId) ?? 0;
    if (currentConcurrent >= this.maxConcurrent) {
      return { allowed: false, reason: "CONCURRENCY_EXCEEDED" };
    }

    // 2. Check sliding window rate
    let timestamps = this.requestTimestamps.get(principalId);
    if (!timestamps) {
      timestamps = [];
      this.requestTimestamps.set(principalId, timestamps);
    }

    // Evict timestamps older than 60 seconds
    const windowStart = now - 60000;
    while (
      timestamps.length > 0 &&
      timestamps[0] !== undefined &&
      timestamps[0] < windowStart
    ) {
      timestamps.shift();
    }

    if (timestamps.length >= this.maxPerMinute) {
      return { allowed: false, reason: "RATE_LIMIT_EXCEEDED" };
    }

    // Update state
    timestamps.push(now);
    this.activeConcurrent.set(principalId, currentConcurrent + 1);

    return { allowed: true };
  }

  /**
   * Release active concurrency slot once the request completes.
   */
  release(principalId: string): void {
    const current = this.activeConcurrent.get(principalId) ?? 0;
    if (current <= 1) {
      this.activeConcurrent.delete(principalId);
    } else {
      this.activeConcurrent.set(principalId, current - 1);
    }
  }

  /**
   * Clear all tracking state (e.g. between tests).
   */
  clear(): void {
    this.requestTimestamps.clear();
    this.activeConcurrent.clear();
  }
}
