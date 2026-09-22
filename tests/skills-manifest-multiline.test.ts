import { describe, expect, it } from "vitest";
import { validateSkillManifestRoundTrip, type SkillYamlInput } from "@localbridge/protocol";
import YAML from "yaml";

describe("Skills Manifest Multiline Text Handling", () => {
  it("safely serializes and parses multiline descriptions without breaking syntax", () => {
    const input: SkillYamlInput = {
      id: "user.multiline-test",
      version: "1.0.0",
      name: { "zh-CN": "多行描述技能", "en-US": "Multiline Skill" },
      description: {
        "zh-CN": "第一行：概述\n第二行：详细工作流\n第三行：注意事项",
        "en-US": "Line 1: Summary\nLine 2: Details\nLine 3: Precautions",
      },
      category: "general",
      risk: "medium",
      triggers: ["multiline", "test"],
      tools: ["localbridge_file_read"],
      workflow: ["step 1", "step 2"],
      enabled: true,
    };

    const result = validateSkillManifestRoundTrip(input);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);

    const parsed = YAML.parse(result.yaml);
    expect(parsed.description["zh-CN"]).toBe("第一行：概述\n第二行：详细工作流\n第三行：注意事项");
    expect(parsed.description["en-US"]).toBe("Line 1: Summary\nLine 2: Details\nLine 3: Precautions");
  });
});
