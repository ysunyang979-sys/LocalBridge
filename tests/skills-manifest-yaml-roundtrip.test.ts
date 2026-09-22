import { describe, expect, it } from "vitest";
import { validateSkillManifestRoundTrip, type SkillYamlInput } from "@localbridge/protocol";

describe("Skills Manifest YAML Roundtrip", () => {
  it("passes round-trip validation for valid manifest input", () => {
    const input: SkillYamlInput = {
      id: "user.roundtrip-skill",
      version: "1.0.0",
      name: { "zh-CN": "往返校验技能", "en-US": "Roundtrip Skill" },
      description: { "zh-CN": "验证 Object -> YAML -> Parse -> Schema 流程", "en-US": "Verify roundtrip flow" },
      category: "debugging",
      risk: "low",
      triggers: ["roundtrip", "validation"],
      tools: ["localbridge_file_read"],
      workflow: ["validate"],
      enabled: true,
    };

    const result = validateSkillManifestRoundTrip(input);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
    expect(result.data?.id).toBe(input.id);
    expect(result.yaml).toContain("id: user.roundtrip-skill");
  });

  it("fails round-trip validation and returns structured errors for invalid schema input", () => {
    const badInput = {
      id: "INVALID_ID_WITH_UPPERCASE",
      version: "1.0.0",
      name: { "zh-CN": "无效技能", "en-US": "Invalid Skill" },
      description: { "zh-CN": "", "en-US": "" },
      category: "invalid_category",
      risk: "extreme",
      triggers: [],
      tools: [],
      workflow: [],
      enabled: true,
    };

    const result = validateSkillManifestRoundTrip(badInput);
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors.some((e) => e.includes("id"))).toBe(true);
  });
});
