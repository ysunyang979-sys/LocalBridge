import { describe, expect, it } from "vitest";
import { validateSkillManifestRoundTrip, type SkillYamlInput } from "@localbridge/protocol";
import YAML from "yaml";

describe("Skills Manifest HTML Input Handling", () => {
  it("safely handles HTML tags and attributes such as <p align=\"center\"> without syntax crashes", () => {
    const input: SkillYamlInput = {
      id: "user.html-input-test",
      version: "1.0.0",
      name: {
        "zh-CN": "Test <p align=\"center\"> Skill",
        "en-US": "Test <p align=\"center\"> Skill",
      },
      description: {
        "zh-CN": '<p align="center"><img src="logo.png" alt="logo" /></p>\n<a href="https://example.com">Documentation</a>',
        "en-US": '<p align="center"><img src="logo.png" alt="logo" /></p>\n<a href="https://example.com">Documentation</a>',
      },
      category: "general",
      risk: "medium",
      triggers: ["html-tag", "<tag>"],
      tools: ["localbridge_file_read"],
      workflow: ['inspect <p> tags', 'fix <div class="alert">'],
      enabled: true,
    };

    const result = validateSkillManifestRoundTrip(input);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);

    const parsed = YAML.parse(result.yaml);
    expect(parsed.name["zh-CN"]).toBe('Test <p align="center"> Skill');
    expect(parsed.description["zh-CN"]).toContain('<p align="center">');
    expect(parsed.description["zh-CN"]).toContain('alt="logo"');
    expect(parsed.workflow[0]).toBe("inspect <p> tags");
  });
});
