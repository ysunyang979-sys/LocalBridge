import { describe, expect, it } from "vitest";
import { validateSkillManifestRoundTrip, type SkillYamlInput } from "@localbridge/protocol";
import YAML from "yaml";

describe("Skills Manifest Double Quotes Handling", () => {
  it("safely serializes and parses strings containing double quotes without syntax errors", () => {
    const input: SkillYamlInput = {
      id: "user.double-quotes-test",
      version: "1.0.0",
      name: {
        "zh-CN": 'Test "Double Quote" Skill',
        "en-US": 'Test "Double Quote" Skill',
      },
      description: {
        "zh-CN": 'Description with "quotes" and "nested" attributes',
        "en-US": 'Description with "quotes" and "nested" attributes',
      },
      category: "general",
      risk: "medium",
      triggers: ['why: "broken"', 'has "quotes"'],
      tools: ["localbridge_file_read"],
      workflow: ['inspect "target"', 'fix "issue"'],
      enabled: true,
    };

    const result = validateSkillManifestRoundTrip(input);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);

    const parsed = YAML.parse(result.yaml);
    expect(parsed.name["zh-CN"]).toBe('Test "Double Quote" Skill');
    expect(parsed.description["zh-CN"]).toBe('Description with "quotes" and "nested" attributes');
    expect(parsed.triggers[0]).toBe('why: "broken"');
    expect(parsed.workflow[0]).toBe('inspect "target"');
  });
});
