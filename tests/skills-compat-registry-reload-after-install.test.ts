import { describe, expect, it, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { SkillValidator } from "../apps/server/src/skills/skill-validator.js";
import { SkillLoader } from "../apps/server/src/skills/skill-loader.js";
import { SkillRegistry } from "../apps/server/src/skills/skill-registry.js";
import { SkillImporter } from "../apps/server/src/skills/skill-importer.js";
import { MCP_TOOL_SCOPE } from "../apps/server/src/mcp/scope-policy.js";

describe("skills-compat-registry-reload-after-install: Immediate Registry Reload", () => {
  let tmpRoot: string;
  let userDir: string;
  let importer: SkillImporter;
  let registry: SkillRegistry;
  const activeTools = new Set(Object.keys(MCP_TOOL_SCOPE));

  beforeEach(() => {
    tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "nexus-reload-test-"));
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

  it("immediately registers the new skill so listSkills and getSkill find it", async () => {
    const srcFolder = path.join(tmpRoot, "reload-sample");
    fs.mkdirSync(srcFolder, { recursive: true });
    fs.writeFileSync(path.join(srcFolder, "SKILL.md"), "# Instructions for reload sample");

    const customYaml = `id: user.reload-verify-skill
version: "1.0.0"
name:
  zh-CN: 重载验证技能
  en-US: Reload Verify Skill
description:
  zh-CN: 验证 registry 立即生效
  en-US: Verify registry takes effect immediately
category: review
risk: low
triggers:
  - reload-verify
tools:
  - localbridge_file_read
workflow:
  - review
enabled: true
`;

    const result = await importer.importFolder({
      sourcePath: srcFolder,
      target: "user",
      customYaml,
    });

    expect(result.success).toBe(true);

    const retrieved = registry.getSkill("user.reload-verify-skill");
    expect(retrieved).toBeDefined();
    expect(retrieved?.id).toBe("user.reload-verify-skill");
    expect(retrieved?.instructions).toContain("Instructions for reload sample");

    const allSkills = registry.listSkills();
    expect(allSkills.some((s) => s.id === "user.reload-verify-skill")).toBe(true);

    const matched = registry.matchSkills("reload-verify");
    expect(matched.matchedSkill?.id).toBe("user.reload-verify-skill");
  });
});
