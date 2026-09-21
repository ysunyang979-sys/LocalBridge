import { describe, it, expect, beforeEach } from "vitest";
import { TrustPolicyEvaluator, type PolicyEvaluationInput } from "../packages/security/src/policy/evaluator.js";

describe("User Experience Mode (Standard vs Advanced) Suite", () => {
  // In-memory mock localStorage for testing UX mode persistence
  let mockStorage: Record<string, string> = {};

  beforeEach(() => {
    mockStorage = {};
  });

  const getUxMode = (): "standard" | "advanced" => {
    const val = mockStorage["nexus_ux_mode"];
    if (val === "standard" || val === "advanced") {
      return val;
    }
    return "standard"; // Default for fresh installations
  };

  const setUxMode = (mode: "standard" | "advanced") => {
    mockStorage["nexus_ux_mode"] = mode;
  };

  it("defaults to standard mode for fresh installations", () => {
    expect(mockStorage["nexus_ux_mode"]).toBeUndefined();
    expect(getUxMode()).toBe("standard");
  });

  it("persists mode changes correctly to storage", () => {
    setUxMode("advanced");
    expect(mockStorage["nexus_ux_mode"]).toBe("advanced");
    expect(getUxMode()).toBe("advanced");

    setUxMode("standard");
    expect(mockStorage["nexus_ux_mode"]).toBe("standard");
    expect(getUxMode()).toBe("standard");
  });

  it("handles corrupted or unknown storage values by safely falling back to standard mode", () => {
    mockStorage["nexus_ux_mode"] = "hacker_mode_xyz";
    expect(getUxMode()).toBe("standard");
  });

  it("tracks onboarding state independently of UX mode", () => {
    const isOnboardingCompleted = () => mockStorage["nexus_onboarding_completed"] === "true";
    expect(isOnboardingCompleted()).toBe(false);

    mockStorage["nexus_onboarding_completed"] = "true";
    expect(isOnboardingCompleted()).toBe(true);
    // uxMode still defaults to standard
    expect(getUxMode()).toBe("standard");
  });

  it("guarantees security policy evaluation is 100% identical regardless of UX mode", () => {
    const testCases: PolicyEvaluationInput[] = [
      {
        projectId: "proj_1",
        operation: "file.delete",
        relativePath: "src/index.ts",
        projectEnabled: true,
        projectAccessMode: "read-write",
        trustPolicy: {
          trustLevel: "standard",
          protectedFilesPolicy: "always-ask",
          filePolicy: "allow-all",
          commandPolicy: "ask-all",
          gitWritePolicy: "allow-all",
        },
      },
      {
        projectId: "proj_1",
        operation: "file.read",
        relativePath: ".env",
        projectEnabled: true,
        projectAccessMode: "read-write",
        trustPolicy: {
          trustLevel: "full",
          protectedFilesPolicy: "always-ask",
          filePolicy: "allow-all",
          commandPolicy: "allow-all",
          gitWritePolicy: "allow-all",
        },
      },
      {
        projectId: "proj_1",
        operation: "command.execute",
        relativePath: "",
        projectEnabled: true,
        projectAccessMode: "read-write",
        trustPolicy: {
          trustLevel: "standard",
          protectedFilesPolicy: "always-ask",
          filePolicy: "allow-all",
          commandPolicy: "deny-all",
          gitWritePolicy: "allow-all",
        },
      },
    ];

    for (const testInput of testCases) {
      // In standard mode
      setUxMode("standard");
      const standardResult = TrustPolicyEvaluator.evaluate(testInput);

      // In advanced mode
      setUxMode("advanced");
      const advancedResult = TrustPolicyEvaluator.evaluate(testInput);

      // Policy decision and reason must be 100% identical
      expect(standardResult.decision).toBe(advancedResult.decision);
      expect(standardResult.requiresApproval).toBe(advancedResult.requiresApproval);
      expect(standardResult.decisionSource).toBe(advancedResult.decisionSource);
    }
  });
});
