import { describe, expect, it } from "vitest";
import { validateSkillManifestRoundTrip, type SkillYamlInput } from "@localbridge/protocol";
import YAML from "yaml";

describe("Skills Manifest Colon Handling", () => {
  it("safely handles strings containing colons without mapping key corruption", () => {
    const input: SkillYamlInput = {
      id: "user.colon-handling-test",
      version: "1.0.0",
      name: {
        "zh-CN": "Audit: Security Analysis",
        "en-US": "Audit: Security Analysis",
      },
      description: {
        "zh-CN": "Step 1: Check CA; Step 2: Extract certs; Host: 127.0.0.1",
        "en-US": "Step 1: Check CA; Step 2: Extract certs; Host: 127.0.0.1",
      },
      category: "inspection",
      risk: "high",
      triggers: ["ad:cert:abuse", "key:value"],
      tools: ["localbridge_file_read"],
      workflow: ["action: inspect template", "status: verify"],
      enabled: true,
    };

    const result = validateSkillManifestRoundTrip(input);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);

    const parsed = YAML.parse(result.yaml);
    expect(parsed.name["zh-CN"]).toBe("Audit: Security Analysis");
    expect(parsed.description["zh-CN"]).toBe("Step 1: Check CA; Step 2: Extract certs; Host: 127.0.0.1");
    expect(parsed.triggers[0]).toBe("ad:cert:abuse");
    expect(parsed.workflow[0]).toBe("action: inspect template");
  });
});
