export interface ReconnectOptions {
  enabled?: boolean;
  initialDelayMs?: number;
  maxDelayMs?: number;
  factor?: number;
  jitter?: boolean;
}

export class ReconnectController {
  private attempts = 0;
  private timer: NodeJS.Timeout | null = null;
  readonly enabled: boolean;
  readonly initialDelayMs: number;
  readonly maxDelayMs: number;
  readonly factor: number;
  readonly jitter: boolean;

  constructor(options: ReconnectOptions = {}) {
    this.enabled = options.enabled ?? true;
    this.initialDelayMs = options.initialDelayMs ?? 1000;
    this.maxDelayMs = options.maxDelayMs ?? 30000;
    this.factor = options.factor ?? 2;
    this.jitter = options.jitter ?? true;
  }

  /**
   * Calculate next backoff delay in milliseconds.
   */
  calculateDelay(attempt: number): number {
    const rawDelay = this.initialDelayMs * Math.pow(this.factor, attempt);
    const cappedDelay = Math.min(rawDelay, this.maxDelayMs);

    if (!this.jitter) {
      return Math.round(cappedDelay);
    }

    // Apply +/- 20% random jitter
    const jitterFactor = 0.8 + Math.random() * 0.4;
    return Math.round(Math.min(cappedDelay * jitterFactor, this.maxDelayMs));
  }

  /**
   * Schedule a reconnection callback.
   */
  schedule(callback: () => void): number | null {
    if (!this.enabled) return null;

    this.cancel();
    const delay = this.calculateDelay(this.attempts);
    this.attempts++;

    this.timer = setTimeout(() => {
      this.timer = null;
      callback();
    }, delay);

    return delay;
  }

  /**
   * Reset retry attempt counter after successful connection & handshake.
   */
  reset(): void {
    this.attempts = 0;
    this.cancel();
  }

  /**
   * Cancel pending reconnect timer.
   */
  cancel(): void {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }

  get currentAttempts(): number {
    return this.attempts;
  }
}
