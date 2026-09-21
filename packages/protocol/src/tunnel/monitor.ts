import type { TunnelConnectionMetrics } from "./types.js";

export class TunnelConnectionMonitor {
  /**
   * Parses Prometheus format metrics exported by tunnel-client on /metrics.
   */
  public static parseMetrics(metricsText: string): {
    lastSuccessfulPollAt?: number;
    pollErrors: number;
  } {
    let lastSuccessfulPollAt: number | undefined;
    let pollErrors = 0;

    const lines = metricsText.split(/\r?\n/);
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.startsWith("#") || trimmed.length === 0) continue;

      // Check commands_poll_last_successful_timestamp_seconds
      const matchPollTime = trimmed.match(
        /^commands_poll_last_successful_timestamp_seconds(?:\s*\{[^}]*\})?\s+([0-9.]+)/
      );
      if (matchPollTime && matchPollTime[1]) {
        const val = parseFloat(matchPollTime[1]);
        if (!isNaN(val)) {
          lastSuccessfulPollAt = val;
        }
        continue;
      }

      // Check poll errors if present
      const matchPollErr = trimmed.match(
        /^commands_poll_errors_total(?:\s*\{[^}]*\})?\s+([0-9.]+)/
      );
      if (matchPollErr && matchPollErr[1]) {
        const val = parseFloat(matchPollErr[1]);
        if (!isNaN(val)) {
          pollErrors = Math.round(val);
        }
        continue;
      }
    }

    return { lastSuccessfulPollAt, pollErrors };
  }

  /**
   * Pure evaluation of health, ready, and metrics to determine connection state.
   * Notice: readyz = 200 does NOT guarantee Control Plane is connected.
   * Control Plane is connected ONLY IF lastSuccessfulPollAt > 0.
   */
  public static evaluateState(params: {
    processAlive: boolean;
    healthOk: boolean;
    readyOk: boolean;
    metricsText?: string;
  }): TunnelConnectionMetrics {
    if (!params.processAlive) {
      return {
        processAlive: false,
        health: false,
        ready: false,
        controlPlaneConnected: false,
        lastSuccessfulPollAt: undefined,
        pollErrors: 0,
      };
    }

    const { lastSuccessfulPollAt, pollErrors } = params.metricsText
      ? this.parseMetrics(params.metricsText)
      : { lastSuccessfulPollAt: undefined, pollErrors: 0 };

    const controlPlaneConnected = Boolean(
      params.readyOk &&
      lastSuccessfulPollAt !== undefined &&
      lastSuccessfulPollAt > 0
    );

    return {
      processAlive: params.processAlive,
      health: params.healthOk,
      ready: params.readyOk,
      controlPlaneConnected,
      lastSuccessfulPollAt,
      pollErrors,
    };
  }

  /**
   * Polls localhost health/metrics endpoints for an active tunnel process.
   */
  public static async poll(
    healthPort: number,
    processAlive: boolean,
    fetchFn: typeof fetch = fetch
  ): Promise<TunnelConnectionMetrics> {
    if (!processAlive) {
      return {
        processAlive: false,
        health: false,
        ready: false,
        controlPlaneConnected: false,
        lastSuccessfulPollAt: undefined,
        pollErrors: 0,
      };
    }

    let healthOk = false;
    let readyOk = false;
    let metricsText = "";

    try {
      const hRes = await fetchFn(`http://127.0.0.1:${healthPort}/healthz`, {
        signal: AbortSignal.timeout(1000),
      });
      healthOk = hRes.status === 200;
    } catch {
      healthOk = false;
    }

    try {
      const rRes = await fetchFn(`http://127.0.0.1:${healthPort}/readyz`, {
        signal: AbortSignal.timeout(1000),
      });
      readyOk = rRes.status === 200;
    } catch {
      readyOk = false;
    }

    try {
      const mRes = await fetchFn(`http://127.0.0.1:${healthPort}/metrics`, {
        signal: AbortSignal.timeout(1500),
      });
      if (mRes.status === 200) {
        metricsText = await mRes.text();
      }
    } catch {
      metricsText = "";
    }

    return this.evaluateState({
      processAlive,
      healthOk,
      readyOk,
      metricsText,
    });
  }
}
