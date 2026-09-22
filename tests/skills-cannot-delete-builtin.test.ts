import { describe, expect, it, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { SkillValidator } from "../apps/server/src/skills/skill-validator.js";
import { SkillLoader } from "../apps/server/src/skills/skill-loader.js";
import { SkillRegistry } from "../apps/server/src/skills/skill-registry.js";
import { SkillImporter } from "../apps/server/src/skills/skill-importer.js";
import { MCP_TOOL_SCOPE } from "../apps/server/src/mcp/scope-policy.js";

describe("Skills Deletion: Built-in Protection", () => {
  let tmpRoot: string;
  let userDir: string;
  let importer: SkillImporter;
  let registry: SkillRegistry;
  const activeTools = new Set(Object.keys(MCP_TOOL_SCOPE));

  beforeEach(() => {
    tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "nexus-skill-del-builtin-"));
    userDir = path.join(tmpRoot, "user-skills");
    fs.mkdirSync(userDir, { recursive: true });

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

  it("strictly prevents deletion of official built-in skills with clear error", async () => {
    const builtinSkill = registry.getSkill("nexus.project-inspect");
    expect(builtinSkill).toBeDefined();
    expect(builtinSkill?.source).toBe("builtin");

    const result = await importer.deleteSkill({
      skillId: "nexus.project-inspect",
    });

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/内置技能不可删除|Built-in/i);

    // Verify built-in still exists and is enabled
    const afterAttempt = registry.getSkill("nexus.project-inspect");
    expect(afterAttempt).toBeDefined();
    expect(afterAttempt?.enabled).toBe(true);
    expect(fs.existsSync(afterAttempt!.sourcePath)).toBe(true);
  });

  it("strictly prevents deletion of nexus.code-debug", async () => {
    const result = await importer.deleteSkill({
      skillId: "nexus.code-debug",
      target: "user",
    });

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/内置技能不可删除|Built-in/i);

    const debugSkill = registry.getSkill("nexus.code-debug");
    expect(debugSkill).toBeDefined();
  });
});
