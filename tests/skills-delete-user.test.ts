import { describe, expect, it, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { SkillValidator } from "../apps/server/src/skills/skill-validator.js";
import { SkillLoader } from "../apps/server/src/skills/skill-loader.js";
import { SkillRegistry } from "../apps/server/src/skills/skill-registry.js";
import { SkillImporter } from "../apps/server/src/skills/skill-importer.js";
import { MCP_TOOL_SCOPE } from "../apps/server/src/mcp/scope-policy.js";

describe("Skills Deletion: User Skill", () => {
  let tmpRoot: string;
  let userDir: string;
  let importer: SkillImporter;
  let registry: SkillRegistry;
  const activeTools = new Set(Object.keys(MCP_TOOL_SCOPE));

  beforeEach(() => {
    tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "nexus-skill-del-user-"));
    userDir = path.join(tmpRoot, "user-skills");
    fs.mkdirSync(userDir, { recursive: true });

    // Seed a user skill
    const skillPath = path.join(userDir, "user.temp-tool");
    fs.mkdirSync(skillPath, { recursive: true });
    fs.writeFileSync(
      path.join(skillPath, "skill.yaml"),
      `id: user.temp-tool
version: 1.0.0
name: { zh-CN: 临时工具, en-US: Temporary Tool }
description: { zh-CN: 测试删除, en-US: Test deletion }
category: general
risk: low
triggers: ["temp"]
tools: ["localbridge_project_list"]
workflow: ["step1"]
`
    );
    fs.writeFileSync(path.join(skillPath, "SKILL.md"), "# Temporary Tool");

    const validator = new SkillValidator(activeTools);
    const loader = new SkillLoader(validator, { userDir });
    registry = new SkillRegistry(loader);
    importer = new SkillImporter({
      validator,
      loader,
      registry,
      validMcpTools: activeTools,
    });
  });

  afterEach(() => {
    try {
      fs.rmSync(tmpRoot, { recursive: true, force: true });
    } catch {}
  });

  it("deletes a user skill directory from disk and updates registry", async () => {
    // 1. Verify it exists initially
    expect(registry.getSkill("user.temp-tool")).toBeDefined();
    const diskPath = path.join(userDir, "user.temp-tool");
    expect(fs.existsSync(diskPath)).toBe(true);

    // 2. Perform deletion
    const result = await importer.deleteSkill({
      skillId: "user.temp-tool",
      target: "user",
    });

    expect(result.success).toBe(true);
    expect(result.skillId).toBe("user.temp-tool");

    // 3. Verify files removed from disk
    expect(fs.existsSync(diskPath)).toBe(false);

    // 4. Verify registry no longer returns the skill
    expect(registry.getSkill("user.temp-tool")).toBeNull();
    const allSkills = registry.listSkills();
    expect(allSkills.some((s) => s.id === "user.temp-tool")).toBe(false);
  });

  it("returns error gracefully when deleting a non-existent skill", async () => {
    const result = await importer.deleteSkill({
      skillId: "user.does-not-exist",
      target: "user",
    });

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/not found|不存在/i);
  });
});
