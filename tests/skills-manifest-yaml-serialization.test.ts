import { describe, expect, it } from "vitest";
import { serializeSkillManifest, type SkillYamlInput } from "@localbridge/protocol";
import YAML from "yaml";

describe("Skills Manifest YAML Serialization", () => {
  it("serializes a SkillYamlInput object to clean valid YAML using official serializer", () => {
    const input: SkillYamlInput = {
      id: "user.test-serializer",
      version: "1.0.0",
      name: { "zh-CN": "测试序列化", "en-US": "Test Serializer" },
      description: { "zh-CN": "测试规范的 YAML 序列化", "en-US": "Test canonical YAML serialization" },
      category: "general",
      risk: "medium",
      triggers: ["test", "serializer"],
      tools: ["localbridge_file_read"],
      workflow: ["inspect", "verify"],
      enabled: true,
    };

    const yamlStr = serializeSkillManifest(input);
    expect(typeof yamlStr).toBe("string");
    expect(yamlStr).toContain("id: user.test-serializer");
    expect(yamlStr).toContain("name:");
    expect(yamlStr).toContain("zh-CN: 测试序列化");

    const parsed = YAML.parse(yamlStr);
    expect(parsed.id).toBe(input.id);
    expect(parsed.name["zh-CN"]).toBe(input.name["zh-CN"]);
    expect(parsed.tools).toEqual(input.tools);
    expect(parsed.workflow).toEqual(input.workflow);
  });
});
