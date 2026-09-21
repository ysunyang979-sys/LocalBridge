import { describe, it, expect } from "vitest";
import {
  DisabledDecisionProvider,
  LayaDecisionProvider,
} from "../packages/security/src/intelligence/provider.js";
import type { IntelligenceStatusDto } from "@localbridge/protocol";

describe("Laya Provider Status & Telemetry Schema Suite", () => {
  it("verifies DisabledDecisionProvider conforms to all IntelligenceStatusDto fields", () => {
    const provider = new DisabledDecisionProvider();
    const status: IntelligenceStatusDto = provider.getStatus();

    expect(status.provider).toBe("disabled");
    expect(status.status).toBe("disabled");
    expect(status.providerClass).toBe("DisabledDecisionProvider");
    expect(status.workerStatus).toBe("stopped");
    expect(status.modelLoaded).toBe(false);
    expect(status.inferenceReady).toBe(false);
    expect(typeof status.developerOverride).toBe("boolean");
    expect(status.warmInferenceMs).toBeNull();
    expect(typeof status.startupTimeoutMs).toBe("number");
    expect(typeof status.inferenceTimeoutMs).toBe("number");
    expect(["managed", "developer-override", "system"]).toContain(status.runtimeType);
  });

  it("verifies LayaDecisionProvider initializes with complete telemetry metadata", () => {
    const provider = new LayaDecisionProvider({
      provider: "disabled", // created in disabled mode
      startupTimeoutMs: 25000,
      inferenceTimeoutMs: 4000,
      developerOverride: true,
    });

    const status: IntelligenceStatusDto = provider.getStatus();

    expect(status.providerClass).toBe("LayaDecisionProvider");
    expect(status.startupTimeoutMs).toBe(25000);
    expect(status.inferenceTimeoutMs).toBe(4000);
    expect(status.developerOverride).toBe(true);
    expect(["running", "stopped", "starting", "error"]).toContain(status.workerStatus);
    expect(typeof status.modelLoaded).toBe("boolean");
    expect(typeof status.inferenceReady).toBe("boolean");
  });
});
