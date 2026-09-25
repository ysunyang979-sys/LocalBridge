import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
  LayaDecisionProvider,
  resolveDefaultModelPath,
  resolveDefaultPythonPath,
} from "../packages/security/src/intelligence/provider.js";
import { validateModelDir } from "../packages/security/src/intelligence/downloader.js";
import type { DecisionContext } from "@localbridge/protocol";

const canRunRealLaya = validateModelDir(resolveDefaultModelPath()).valid;

describe.skipIf(!canRunRealLaya)("Laya Real Provider Benchmark Test Suite", () => {
  let provider: LayaDecisionProvider | null = null;

  beforeAll(async () => {
    provider = new LayaDecisionProvider({
      provider: "laya",
      modelPath: resolveDefaultModelPath(),
      pythonPath: resolveDefaultPythonPath(),
      startupTimeoutMs: 60000,
      inferenceTimeoutMs: 10000,
    });

    await provider.ensureReady(60000);
  }, 65000);

  afterAll(async () => {
    if (provider) {
      await provider.shutdown();
      provider = null;
    }
  });

  it("successfully starts worker, loads model, and reports running telemetry", () => {
    expect(provider).not.toBeNull();
    const status = provider!.getStatus();
    expect(status.provider).toBe("laya");
    expect(status.workerStatus).toBe("running");
    expect(status.modelLoaded).toBe(true);
    expect(status.inferenceReady).toBe(true);
    expect(status.providerClass).toBe("LayaDecisionProvider");
  });

  it("executes real inference on dangerous command with correct telemetry fields and evaluates isPass", async () => {
    const context: DecisionContext = {
      operation: "command.execute",
      command: "rm -rf /",
      locale: "zh",
    };

    const advice = await provider!.getAdvice(context);

    // 1. Strict real telemetry fields
    expect(advice.providerUsed).toBe("laya");
    expect(advice.fallbackUsed).toBe(false);
    expect(advice.workerReady).toBe(true);
    expect(advice.modelLoaded).toBe(true);
    expect(advice.inferenceExecuted).toBe(true);

    // 2. Real latency is measured and > 0 ms
    expect(advice.latencyMs).toBeGreaterThan(0);

    // 3. Risk and recommendation
    expect(advice.risk).toBeDefined();
    expect(["critical", "high", "medium"]).toContain(advice.risk.label);
    expect(advice.advisoryOnly).toBe(true);

    // 4. Benchmark evaluation criteria must strictly pass
    const isPass =
      advice.providerUsed === "laya" &&
      advice.workerReady === true &&
      advice.modelLoaded === true &&
      advice.inferenceExecuted === true &&
      advice.fallbackUsed === false;
    expect(isPass).toBe(true);
  }, 15000);

  it("executes real inference on safe file read operation", async () => {
    const context: DecisionContext = {
      operation: "file.read",
      path: "package.json",
      locale: "en",
    };

    const advice = await provider!.getAdvice(context);

    expect(advice.providerUsed).toBe("laya");
    expect(advice.fallbackUsed).toBe(false);
    expect(advice.workerReady).toBe(true);
    expect(advice.modelLoaded).toBe(true);
    expect(advice.inferenceExecuted).toBe(true);
    expect(advice.latencyMs).toBeGreaterThan(0);

    const isPass =
      advice.providerUsed === "laya" &&
      advice.workerReady === true &&
      advice.modelLoaded === true &&
      advice.inferenceExecuted === true &&
      advice.fallbackUsed === false;
    expect(isPass).toBe(true);
  }, 15000);
});
