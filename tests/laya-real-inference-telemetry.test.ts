import { describe, expect, it } from "vitest";
import { LayaDecisionProvider, DisabledDecisionProvider } from "../packages/security/src/intelligence/provider.js";
import type { DecisionContext } from "@localbridge/protocol";

describe("Laya Real Inference & Telemetry Suite", () => {
  it("DisabledDecisionProvider returns null for recent inference", async () => {
    const disabled = new DisabledDecisionProvider();
    expect(disabled.getRecentInference()).toBeNull();

    const status = disabled.getStatus();
    expect(status.lastInferenceAt).toBeNull();
    expect(status.lastInferenceLatencyMs).toBeNull();
    expect(status.recentInference).toBeNull();

    const advice = await disabled.getAdvice({ operation: "test" });
    expect(advice.inferenceExecuted).toBe(false);
    expect(advice.providerUsed).toBe("disabled");
  });

  it("LayaDecisionProvider updates telemetry upon receiving advice", async () => {
    const laya = new LayaDecisionProvider({
      provider: "laya",
      modelPath: "non_existent_test_path",
      workerTimeoutMs: 500,
    });

    try {
      const context: DecisionContext = {
        operation: "file_write",
        target: "package.json",
        source: "chatgpt",
      };

      const advice = await laya.getAdvice(context);
      expect(advice).toBeDefined();

      const recent = laya.getRecentInference();
      expect(recent).not.toBeNull();
      expect(recent?.operation).toBe("file_write");
      expect(recent?.target).toBe("package.json");
      expect(recent?.source).toBe("chatgpt");
      expect(recent?.timestamp).toBeDefined();

      const status = laya.getStatus();
      expect(status.lastInferenceAt).toBe(recent?.timestamp);
      expect(status.recentInference).toEqual(recent);
    } finally {
      await laya.shutdown();
    }
  });
});
