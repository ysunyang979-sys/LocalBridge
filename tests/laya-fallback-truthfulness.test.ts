import { describe, expect, it } from "vitest";
import { LayaDecisionProvider } from "../packages/security/src/intelligence/provider.js";
import type { DecisionContext } from "@localbridge/protocol";

describe("Laya Fallback Truthfulness Suite", () => {
  it("truthfully reports fallbackUsed: true and inferenceExecuted: false when worker/model is unavailable", async () => {
    const laya = new LayaDecisionProvider({
      provider: "laya",
      modelPath: "non_existent_model_dir_12345",
      workerTimeoutMs: 300,
    });

    try {
      const context: DecisionContext = {
        operation: "command.run",
        command: "rm -rf /",
        source: "chatgpt",
      };

      const advice = await laya.getAdvice(context);
      // In offline / fallback mode:
      expect(advice.fallbackUsed).toBe(true);
      expect(advice.inferenceExecuted).toBe(false);
      expect(advice.advisoryOnly).toBe(true);
      expect(advice.reasoningTags.some((t) => t.startsWith("fallback:"))).toBe(true);

      // Verify the recent inference recorded also matches truthful values
      const recent = laya.getRecentInference();
      expect(recent?.fallbackUsed).toBe(true);
      expect(recent?.inferenceExecuted).toBe(false);
    } finally {
      await laya.shutdown();
    }
  });
});
