import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { SkillValidator } from "../apps/server/src/skills/skill-validator.js";
import { SkillLoader } from "../apps/server/src/skills/skill-loader.js";
import { MCP_TOOL_SCOPE } from "../apps/server/src/mcp/scope-policy.js";

describe("Skill Loader & Fault Isolation", () => {
  const activeTools = new Set(Object.keys(MCP_TOOL_SCOPE));
  const validator = new SkillValidator(activeTools);

  it("loads skills from Built-in directory cleanly", () => {
    const loader = new SkillLoader(validator);
    const builtinDir = loader.getBuiltinDir();
    expect(fs.existsSync(builtinDir)).toBe(true);

    const skills = loader.loadFromDirectory(builtinDir, "builtin");
    expect(skills.length).toBeGreaterThanOrEqual(8);

    const inspectSkill = skills.find((s) => s.id === "nexus.project-inspect");
    expect(inspectSkill).toBeDefined();
    expect(inspectSkill?.source).toBe("builtin");
    expect(inspectSkill?.validationStatus).toBe("valid");
    expect(inspectSkill?.instructions).toContain("Project Architecture & Context Inspection");
  });

  it("handles non-existent user directories gracefully without throwing", () => {
    const nonExistentDir = path.join(os.tmpdir(), "non-existent-skills-dir-" + Date.now());
    const loader = new SkillLoader(validator, { userDir: nonExistentDir });

    const skills = loader.loadFromDirectory(nonExistentDir, "user");
    expect(skills).toEqual([]);
  });

  it("isolates malformed skills without failing other valid skills", () => {
    const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "skill-loader-isolation-"));
    try {
      const goodSkillDir = path.join(tmpRoot, "good-skill");
      fs.mkdirSync(goodSkillDir, { recursive: true });
      fs.writeFileSync(
        path.join(goodSkillDir, "skill.yaml"),
        `id: user.good-skill
version: 1.0.0
name:
  zh-CN: 好技能
  en-US: Good Skill
description:
  zh-CN: 描述
  en-US: Description
category: general
risk: low
triggers: ["good"]
tools: ["localbridge_project_list"]
workflow: ["step1"]
enabled: true
`,
        "utf-8"
      );
      fs.writeFileSync(path.join(goodSkillDir, "SKILL.md"), "# Good Skill", "utf-8");

      const corruptedSkillDir = path.join(tmpRoot, "corrupted-skill");
      fs.mkdirSync(corruptedSkillDir, { recursive: true });
      fs.writeFileSync(
        path.join(corruptedSkillDir, "skill.yaml"),
        `id: corrupted!!!---\ninvalid yaml: : : `,
        "utf-8"
      );
      fs.writeFileSync(path.join(corruptedSkillDir, "SKILL.md"), "# Broken", "utf-8");

      const loader = new SkillLoader(validator, { userDir: tmpRoot });
      const loaded = loader.loadFromDirectory(tmpRoot, "user");

      expect(loaded).toHaveLength(2);
      const good = loaded.find((s) => s.id === "user.good-skill");
      expect(good).toBeDefined();
      expect(good?.validationStatus).toBe("valid");

      const broken = loaded.find((s) => s.id === "corrupted-skill" || s.id === "corrupted");
      expect(broken).toBeDefined();
      expect(broken?.validationStatus).toBe("invalid");
      expect(broken?.validationErrors?.length).toBeGreaterThan(0);
    } finally {
      fs.rmSync(tmpRoot, { recursive: true, force: true });
    }
  });
});
