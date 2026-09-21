import { describe, expect, it } from "vitest";
import { SkillValidator } from "../apps/server/src/skills/skill-validator.js";
import { SkillLoader } from "../apps/server/src/skills/skill-loader.js";
import { MCP_TOOL_SCOPE } from "../apps/server/src/mcp/scope-policy.js";

describe("Official Built-in Skills Compliance (All 8 Skills)", () => {
  const activeTools = new Set(Object.keys(MCP_TOOL_SCOPE));
  const validator = new SkillValidator(activeTools);
  const loader = new SkillLoader(validator);

  const EXPECTED_BUILTIN_IDS = [
    "nexus.project-inspect",
    "nexus.fix-build",
    "nexus.run-tests",
    "nexus.code-debug",
    "nexus.safe-refactor",
    "nexus.git-review",
    "nexus.start-dev-runtime",
    "nexus.project-cleanup",
  ];

  it("loads exactly 8 built-in skills from resources/skills", () => {
    const builtinDir = loader.getBuiltinDir();
    const skills = loader.loadFromDirectory(builtinDir, "builtin");
    expect(skills.length).toBe(8);

    const loadedIds = skills.map((s) => s.id).sort();
    expect(loadedIds).toEqual([...EXPECTED_BUILTIN_IDS].sort());
  });

  for (const skillId of EXPECTED_BUILTIN_IDS) {
    it(`validates that '${skillId}' passes 100% schema and security checks`, () => {
      const builtinDir = loader.getBuiltinDir();
      const skills = loader.loadFromDirectory(builtinDir, "builtin");
      const skill = skills.find((s) => s.id === skillId);

      expect(skill, `Skill ${skillId} must be found`).toBeDefined();
      expect(skill!.validationStatus).toBe("valid");
      expect(skill!.validationErrors || []).toEqual([]);
      expect(skill!.securityWarning).toBeUndefined();
      expect(skill!.enabled).toBe(true);
      expect(skill!.source).toBe("builtin");

      // Verify i18n
      expect(skill!.name["zh-CN"].length).toBeGreaterThan(0);
      expect(skill!.name["en-US"].length).toBeGreaterThan(0);
      expect(skill!.description["zh-CN"].length).toBeGreaterThan(0);
      expect(skill!.description["en-US"].length).toBeGreaterThan(0);

      // Verify triggers, tools, workflow
      expect(skill!.triggers.length).toBeGreaterThanOrEqual(1);
      expect(skill!.tools.length).toBeGreaterThanOrEqual(1);
      expect(skill!.workflow.length).toBeGreaterThanOrEqual(1);

      // Verify instructions file
      expect(skill!.instructions.length).toBeGreaterThan(50);
      expect(skill!.instructions).toContain("## Purpose");
      expect(skill!.instructions).toContain("## Workflow");

      // Verify all declared tools strictly belong to MCP_TOOL_SCOPE
      for (const tool of skill!.tools) {
        expect(activeTools.has(tool), `Tool '${tool}' in ${skillId} must exist in MCP_TOOL_SCOPE`).toBe(true);
      }
    });
  }
});
