import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { SkillValidator } from "../apps/server/src/skills/skill-validator.js";
import { SkillLoader } from "../apps/server/src/skills/skill-loader.js";
import { SkillRegistry } from "../apps/server/src/skills/skill-registry.js";
import { MCP_TOOL_SCOPE } from "../apps/server/src/mcp/scope-policy.js";

describe("Skill Hot-Reloading Without Restart", () => {
  const activeTools = new Set(Object.keys(MCP_TOOL_SCOPE));
  const validator = new SkillValidator(activeTools);

  it("dynamically recognizes newly added skills when reload is called", () => {
    const tmpUserSkills = fs.mkdtempSync(path.join(os.tmpdir(), "hot-reload-test-"));

    try {
      const loader = new SkillLoader(validator, { userDir: tmpUserSkills });
      const registry = new SkillRegistry(loader);

      // Initially, no user skills
      const initialSkills = registry.listSkills({ source: "user" });
      expect(initialSkills).toHaveLength(0);

      // Add a user skill on the fly
      const newSkillDir = path.join(tmpUserSkills, "user.hot-reload-demo");
      fs.mkdirSync(newSkillDir, { recursive: true });
      fs.writeFileSync(
        path.join(newSkillDir, "skill.yaml"),
        `id: user.hot-reload-demo
version: 1.0.0
name:
  zh-CN: 热重载演示
  en-US: Hot Reload Demo
description:
  zh-CN: 演示无需重启
  en-US: Test hot reload
category: general
risk: low
triggers: ["hot reload"]
tools: ["localbridge_project_list"]
workflow: ["step1"]
enabled: true
`,
        "utf-8"
      );
      fs.writeFileSync(path.join(newSkillDir, "SKILL.md"), "# Hot Reload Demo", "utf-8");

      // Before reload, registry still has 0 user skills
      expect(registry.getSkill("user.hot-reload-demo")).toBeNull();

      // Trigger hot reload
      registry.reload();

      // Now the skill is immediately visible and accessible
      const updatedUserSkills = registry.listSkills({ source: "user" });
      expect(updatedUserSkills).toHaveLength(1);
      expect(updatedUserSkills[0].id).toBe("user.hot-reload-demo");
      expect(registry.getSkill("user.hot-reload-demo")?.name["zh-CN"]).toBe("热重载演示");
    } finally {
      fs.rmSync(tmpUserSkills, { recursive: true, force: true });
    }
  });
});
