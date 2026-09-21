import { describe, it, expect, afterEach } from "vitest";
import {
  DisabledDecisionProvider,
  LayaDecisionProvider,
} from "../packages/security/src/intelligence/provider.js";
import type { DecisionContext } from "@localbridge/protocol";

describe("DecisionProvider Engine Lifecycle & Status Suite", () => {
  let providerInstance: LayaDecisionProvider | null = null;

  afterEach(async () => {
    if (providerInstance) {
      await providerInstance.shutdown();
      providerInstance = null;
    }
  });

  it("verifies DisabledDecisionProvider returns expected disabled status and safe fallback advice", async () => {
    const disabledProvider = new DisabledDecisionProvider();
    const status = disabledProvider.getStatus();

    expect(status.provider).toBe("disabled");
    expect(status.status).toBe("disabled");

    const context: DecisionContext = {
      operation: "git.status",
      toolName: "git",
      projectId: "proj_test",
    };

    const advice = await disabledProvider.getAdvice(context);
    expect(advice.provider).toBe("disabled");
    expect(advice.advisoryOnly).toBe(true);
    expect(advice.reasoningTags).toContain("intelligence_disabled");
    expect(advice.risk.label).toBe("medium");
  });

  it("handles LayaDecisionProvider initialization and graceful shutdown", async () => {
    providerInstance = new LayaDecisionProvider({
      provider: "disabled", // start in disabled mode
      modelPath: "non_existent_path",
      pythonPath: "python",
    });

    const status = providerInstance.getStatus();
    expect(status.provider).toBe("disabled");

    await providerInstance.shutdown();
  });

  it("gracefully falls back when worker encounters missing script or execution failure", async () => {
    providerInstance = new LayaDecisionProvider({
      provider: "laya",
      modelPath: "fake_model_dir",
      pythonPath: "non_existent_python_binary_xyz_123",
      workerTimeoutMs: 1000,
    });

    // Request advice should return safe heuristic fallback rather than rejecting
    const context: DecisionContext = {
      operation: "command.execute",
      command: "rm -rf /",
    };

    const advice = await providerInstance.getAdvice(context);
    expect(advice).toBeDefined();
    expect(advice.advisoryOnly).toBe(true);
    expect(advice.risk).toBeDefined();
    // High risk command detected by fallback heuristics
    expect(["high", "critical", "medium"]).toContain(advice.risk.label);
  });
});
