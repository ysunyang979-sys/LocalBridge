import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { SkillValidator } from "../apps/server/src/skills/skill-validator.js";
import { SkillLoader } from "../apps/server/src/skills/skill-loader.js";
import { SkillRegistry } from "../apps/server/src/skills/skill-registry.js";
import { MCP_TOOL_SCOPE } from "../apps/server/src/mcp/scope-policy.js";

describe("Project-Scoped Skills Isolation", () => {
  const activeTools = new Set(Object.keys(MCP_TOOL_SCOPE));
  const validator = new SkillValidator(activeTools);

  it("exposes project skills only to the matching projectId", () => {
    const tmpProjectRootA = fs.mkdtempSync(path.join(os.tmpdir(), "proj-a-"));
    const tmpProjectRootB = fs.mkdtempSync(path.join(os.tmpdir(), "proj-b-"));

    try {
      // Create project skill in Project A
      const skillADir = path.join(tmpProjectRootA, ".nexus", "skills", "project-a-custom");
      fs.mkdirSync(skillADir, { recursive: true });
      fs.writeFileSync(
        path.join(skillADir, "skill.yaml"),
        `id: project-a-custom
version: 1.0.0
name:
  zh-CN: 项目A专属技能
  en-US: Project A Skill
description:
  zh-CN: 专属操作
  en-US: Project A specific
category: general
risk: low
triggers: ["proj-a-task"]
tools: ["localbridge_project_list"]
workflow: ["step1"]
enabled: true
`,
        "utf-8"
      );
      fs.writeFileSync(path.join(skillADir, "SKILL.md"), "# Project A Skill", "utf-8");

      const loader = new SkillLoader(validator);
      const registry = new SkillRegistry(loader);

      // Reload with project dirs
      registry.reload([
        { projectId: "proj_a", rootPath: tmpProjectRootA },
        { projectId: "proj_b", rootPath: tmpProjectRootB },
      ]);

      // Querying for proj_a should include the custom skill
      const skillsProjA = registry.listSkills({ projectId: "proj_a" });
      expect(skillsProjA.some((s) => s.id === "project-a-custom")).toBe(true);

      // Querying for proj_b should NOT include project A's custom skill
      const skillsProjB = registry.listSkills({ projectId: "proj_b" });
      expect(skillsProjB.some((s) => s.id === "project-a-custom")).toBe(false);

      // Global query without projectId should NOT leak project-scoped skills
      const skillsGlobal = registry.listSkills({});
      expect(skillsGlobal.some((s) => s.id === "project-a-custom")).toBe(false);

      // Direct getSkill with mismatched projectId returns null
      expect(registry.getSkill("project-a-custom", "proj_b")).toBeNull();
      expect(registry.getSkill("project-a-custom", "proj_a")).toBeDefined();
    } finally {
      fs.rmSync(tmpProjectRootA, { recursive: true, force: true });
      fs.rmSync(tmpProjectRootB, { recursive: true, force: true });
    }
  });
});
