import { describe, expect, it } from "vitest";
import { SkillYamlSchema, SkillIdSchema } from "@localbridge/protocol";

describe("Skill Schema & ID Safety", () => {
  it("accepts valid skill IDs", () => {
    expect(SkillIdSchema.safeParse("nexus.fix-build").success).toBe(true);
    expect(SkillIdSchema.safeParse("nexus.project-inspect").success).toBe(true);
    expect(SkillIdSchema.safeParse("my_custom_skill_1").success).toBe(true);
    expect(SkillIdSchema.safeParse("run-tests-v2").success).toBe(true);
  });

  it("rejects path traversal, slashes, and shell characters in skill IDs", () => {
    expect(SkillIdSchema.safeParse("../malicious").success).toBe(false);
    expect(SkillIdSchema.safeParse("foo/bar").success).toBe(false);
    expect(SkillIdSchema.safeParse("foo\\bar").success).toBe(false);
    expect(SkillIdSchema.safeParse("evil;rm").success).toBe(false);
    expect(SkillIdSchema.safeParse("evil|cat").success).toBe(false);
    expect(SkillIdSchema.safeParse("$(whoami)").success).toBe(false);
    expect(SkillIdSchema.safeParse("a").success).toBe(false); // min 3 chars
    expect(SkillIdSchema.safeParse("A".repeat(65)).success).toBe(false); // max 64 chars
  });

  it("validates a compliant skill.yaml object", () => {
    const validSkill = {
      id: "nexus.fix-build",
      version: "1.0.0",
      name: {
        "zh-CN": "编译与构建错误修复",
        "en-US": "Build & Compilation Failure Fixer",
      },
      description: {
        "zh-CN": "自动定位构建失败原因",
        "en-US": "Diagnose build failures",
      },
      category: "debugging",
      risk: "medium",
      triggers: ["fix build", "编译失败"],
      tools: ["localbridge_build_start", "localbridge_code_diagnostics"],
      workflow: ["run_build", "inspect_errors", "patch_code"],
      enabled: true,
    };

    const parsed = SkillYamlSchema.safeParse(validSkill);
    expect(parsed.success).toBe(true);
  });

  it("rejects skill.yaml missing required i18n names or triggers", () => {
    const missingTriggers = {
      id: "nexus.broken",
      version: 1,
      name: { "zh-CN": "测试", "en-US": "Test" },
      description: { "zh-CN": "描述", "en-US": "Desc" },
      category: "testing",
      risk: "low",
      triggers: [], // empty triggers
      tools: ["localbridge_project_list"],
      workflow: ["step1"],
    };
    expect(SkillYamlSchema.safeParse(missingTriggers).success).toBe(false);

    const missingEnName = {
      id: "nexus.broken",
      version: 1,
      name: { "zh-CN": "测试" }, // missing en-US
      description: { "zh-CN": "描述", "en-US": "Desc" },
      category: "testing",
      risk: "low",
      triggers: ["test"],
      tools: ["localbridge_project_list"],
      workflow: ["step1"],
    };
    expect(SkillYamlSchema.safeParse(missingEnName).success).toBe(false);
  });
});
