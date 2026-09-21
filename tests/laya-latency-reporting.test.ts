import { describe, it, expect } from "vitest";
import { formatLatency } from "../apps/desktop/src/i18n/intelligence-map.js";
import { DisabledDecisionProvider } from "../packages/security/src/intelligence/provider.js";

describe("Laya Latency Reporting & Formatting Suite", () => {
  it("formats zero latency as placeholder dash without fake zero ms", () => {
    expect(formatLatency(0, true)).toBe("—");
    expect(formatLatency(0, false)).toBe("—");
  });

  it("formats undefined or null latency as placeholder dash", () => {
    expect(formatLatency(undefined, true)).toBe("—");
    expect(formatLatency(null, true)).toBe("—");
  });

  it("formats fallback or non-real inference latency as placeholder dash regardless of value", () => {
    // If isRealInference is false (e.g. fallback or simulated), never display fake latency
    expect(formatLatency(12, false)).toBe("—");
    expect(formatLatency(100, false)).toBe("—");
  });

  it("formats genuine positive inference latency as formatted ms", () => {
    expect(formatLatency(8, true)).toBe("8 ms");
    expect(formatLatency(142, true)).toBe("142 ms");
  });

  it("reports null warmInferenceMs on DisabledDecisionProvider telemetry", () => {
    const disabledProvider = new DisabledDecisionProvider();
    const status = disabledProvider.getStatus();

    expect(status.warmInferenceMs).toBeNull();
  });
});
