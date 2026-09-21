import { describe, it, expect } from "vitest";
import {
  DisabledDecisionProvider,
  LayaDecisionProvider,
} from "../packages/security/src/intelligence/provider.js";
import type { DecisionAdvice, DecisionContext } from "@localbridge/protocol";

function evaluateBenchmarkPass(advice: DecisionAdvice): boolean {
  return (
    advice.providerUsed === "laya" &&
    advice.workerReady === true &&
    advice.modelLoaded === true &&
    advice.inferenceExecuted === true &&
    advice.fallbackUsed === false
  );
}

describe("Laya Benchmark Fallback Detection Suite", () => {
  it("never marks disabled provider advice as benchmark pass", async () => {
    const disabledProvider = new DisabledDecisionProvider();
    const context: DecisionContext = {
      operation: "command.execute",
      command: "ls -la",
    };

    const advice = await disabledProvider.getAdvice(context);

    expect(advice.providerUsed).toBe("disabled");
    expect(advice.inferenceExecuted).toBe(false);
    expect(advice.workerReady).toBe(false);
    expect(advice.modelLoaded).toBe(false);
    expect(advice.reasoningTags).toContain("intelligence_disabled");

    const isPass = evaluateBenchmarkPass(advice);
    expect(isPass).toBe(false);
  });

  it("never marks worker failure fallback response as benchmark pass", async () => {
    const failingProvider = new LayaDecisionProvider({
      provider: "laya",
      modelPath: "non_existent_dir",
      pythonPath: "non_existent_python_binary",
      workerTimeoutMs: 1000,
    });

    const context: DecisionContext = {
      operation: "command.execute",
      command: "rm -rf /",
    };

    const advice = await failingProvider.getAdvice(context);

    // Fallback was used
    expect(advice.fallbackUsed).toBe(true);
    expect(advice.inferenceExecuted).toBe(false);
    expect(advice.reasoningTags.some((t) => t.startsWith("fallback:"))).toBe(true);

    const isPass = evaluateBenchmarkPass(advice);
    expect(isPass).toBe(false);

    await failingProvider.shutdown();
  });

  it("enforces strict conjunction of all 5 conditions for benchmark pass", () => {
    const baseAdvice: DecisionAdvice = {
      provider: "laya",
      providerUsed: "laya",
      fallbackUsed: false,
      workerReady: true,
      modelLoaded: true,
      inferenceExecuted: true,
      risk: { label: "low", confidence: 0.9 },
      approval: { recommended: true, confidence: 0.9 },
      category: "read",
      routing: {},
      reasoningTags: ["domain:read"],
      latencyMs: 12,
      model: "laya-multilingual",
      advisoryOnly: true,
    };

    // All conditions true -> pass
    expect(evaluateBenchmarkPass(baseAdvice)).toBe(true);

    // Any condition false -> fail
    expect(evaluateBenchmarkPass({ ...baseAdvice, fallbackUsed: true })).toBe(false);
    expect(evaluateBenchmarkPass({ ...baseAdvice, providerUsed: "disabled" })).toBe(false);
    expect(evaluateBenchmarkPass({ ...baseAdvice, workerReady: false })).toBe(false);
    expect(evaluateBenchmarkPass({ ...baseAdvice, modelLoaded: false })).toBe(false);
    expect(evaluateBenchmarkPass({ ...baseAdvice, inferenceExecuted: false })).toBe(false);
  });
});
