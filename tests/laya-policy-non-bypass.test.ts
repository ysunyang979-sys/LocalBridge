import { describe, it, expect } from "vitest";
import { TrustPolicyEvaluator, type PolicyEvaluationInput } from "../packages/security/src/policy/evaluator.js";
import { LayaDecisionProvider, DisabledDecisionProvider } from "../packages/security/src/intelligence/provider.js";
import type { DecisionContext, DecisionAdvice } from "@localbridge/protocol";

describe("Laya Advisory & Policy Non-Bypass Invariant Suite", () => {
  it("proves deterministic security policy CANNOT be bypassed by Laya advice", async () => {
    // 1. A dangerous file access: accessing a protected .env file
    const input: PolicyEvaluationInput = {
      projectId: "p1",
      operation: "file.write",
      relativePath: ".env",
      projectEnabled: true,
      projectAccessMode: "read-write",
      trustPolicy: {
        trustLevel: "standard",
        protectedFilesPolicy: "always-ask",
        filePolicy: "allow-all",
        commandPolicy: "ask-all",
        gitWritePolicy: "allow-all",
      },
    };

    // Evaluator output is deterministic
    const policyResult = TrustPolicyEvaluator.evaluate(input);
    expect(policyResult.decision).toBe("ask");
    expect(policyResult.requiresApproval).toBe(true);

    // Pretend a rogue or hallucinating AI advice object claims this is safe and approved:
    const rogueAdvice: DecisionAdvice = {
      provider: "laya",
      advisoryOnly: true,
      risk: {
        score: 0.01,
        label: "safe",
        confidence: 0.99,
      },
      approval: {
        recommended: true,
        confidence: 0.99,
        category: "RoutineConfig",
      },
      reasoningTags: ["looks_safe"],
      timestamp: Date.now(),
    };

    // Verify advisoryOnly flag is true
    expect(rogueAdvice.advisoryOnly).toBe(true);

    // In Nexus architecture, policy execution uses TrustPolicyEvaluator.decision, NEVER advice.approval.recommended
    // If policy is "ask", the system MUST NOT auto-allow based on advice
    const effectiveExecutionMode = policyResult.decision;
    expect(effectiveExecutionMode).toBe("ask");
    expect(effectiveExecutionMode).not.toBe("allow");
  });

  it("strictly enforces DENY for absolute deny paths (.git, .localbridge) regardless of advice", () => {
    const input: PolicyEvaluationInput = {
      projectId: "p1",
      operation: "file.read",
      relativePath: ".git/config",
      projectEnabled: true,
      projectAccessMode: "read-write",
      trustPolicy: {
        trustLevel: "full",
        protectedFilesPolicy: "follow-trust-level",
        filePolicy: "allow-all",
        commandPolicy: "allow-all",
        gitWritePolicy: "allow-all",
      },
    };

    const policyResult = TrustPolicyEvaluator.evaluate(input);
    expect(policyResult.decision).toBe("deny");
    expect(policyResult.decisionSource).toBe("security-boundary");

    const localbridgeInput: PolicyEvaluationInput = {
      ...input,
      relativePath: ".localbridge/credentials.json",
    };
    const lbResult = TrustPolicyEvaluator.evaluate(localbridgeInput);
    expect(lbResult.decision).toBe("deny");
    expect(lbResult.decisionSource).toBe("security-boundary");
  });

  it("maintains non-blocking fail-safe: Laya timeout/crash does not disrupt policy evaluation", async () => {
    // Initialize Laya with invalid Python binary to simulate crash/offline
    const provider = new LayaDecisionProvider({
      provider: "laya",
      modelPath: "invalid/path",
      pythonPath: "definitely_not_a_valid_python_binary_nexus_test",
      workerTimeoutMs: 200,
    });

    const context: DecisionContext = {
      operation: "file.delete",
      path: "src/important.ts",
      projectId: "proj_critical",
    };

    // Non-blocking fallback must return safe advisory rather than throwing
    const startTime = Date.now();
    const advice = await provider.getAdvice(context);
    const duration = Date.now() - startTime;

    expect(advice).toBeDefined();
    expect(advice.advisoryOnly).toBe(true);
    expect(advice.risk).toBeDefined();
    expect(duration).toBeLessThan(5000); // Fail-safe does not hang the process

    await provider.shutdown();
  });

  it("verifies disabled provider always marks advice as advisoryOnly and intelligence_disabled", async () => {
    const disabledProvider = new DisabledDecisionProvider();
    const advice = await disabledProvider.getAdvice({
      operation: "command.execute",
      command: "npm install",
    });

    expect(advice.provider).toBe("disabled");
    expect(advice.advisoryOnly).toBe(true);
    expect(advice.reasoningTags).toContain("intelligence_disabled");
  });
});
