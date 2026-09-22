import { describe, expect, it } from "vitest";
import { validateSkillManifestRoundTrip, type SkillYamlInput } from "@localbridge/protocol";
import YAML from "yaml";

describe("Skills Manifest Single Quotes Handling", () => {
  it("safely serializes and parses strings containing single quotes and apostrophes", () => {
    const input: SkillYamlInput = {
      id: "user.single-quotes-test",
      version: "1.0.0",
      name: {
        "zh-CN": "It's a 'Single Quote' Skill",
        "en-US": "It's a 'Single Quote' Skill",
      },
      description: {
        "zh-CN": "Don't fail on user's text with 'single' quotes",
        "en-US": "Don't fail on user's text with 'single' quotes",
      },
      category: "general",
      risk: "low",
      triggers: ["it's a test", "user's trigger"],
      tools: ["localbridge_file_read"],
      workflow: ["check user's config"],
      enabled: true,
    };

    const result = validateSkillManifestRoundTrip(input);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);

    const parsed = YAML.parse(result.yaml);
    expect(parsed.name["zh-CN"]).toBe("It's a 'Single Quote' Skill");
    expect(parsed.description["zh-CN"]).toBe("Don't fail on user's text with 'single' quotes");
    expect(parsed.triggers[0]).toBe("it's a test");
  });
});
