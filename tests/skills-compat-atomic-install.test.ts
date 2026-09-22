import { describe, expect, it, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { SkillValidator } from "../apps/server/src/skills/skill-validator.js";
import { SkillLoader } from "../apps/server/src/skills/skill-loader.js";
import { SkillRegistry } from "../apps/server/src/skills/skill-registry.js";
import { SkillImporter } from "../apps/server/src/skills/skill-importer.js";
import { MCP_TOOL_SCOPE } from "../apps/server/src/mcp/scope-policy.js";

describe("skills-compat-atomic-install: Atomic Installation Guarantee", () => {
  let tmpRoot: string;
  let userDir: string;
  let importer: SkillImporter;
  let registry: SkillRegistry;
  const activeTools = new Set(Object.keys(MCP_TOOL_SCOPE));

  beforeEach(() => {
    tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "nexus-atomic-test-"));
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

  it("leaves no partial installation directory when validation fails", async () => {
    const srcFolder = path.join(tmpRoot, "corrupt-candidate");
    fs.mkdirSync(srcFolder, { recursive: true });
    fs.writeFileSync(path.join(srcFolder, "SKILL.md"), "# Broken Doc");

    // Invalid tool that does not exist in MCP_TOOL_SCOPE
    const badYaml = `id: user.atomic-fail-skill
version: "1.0.0"
name:
  zh-CN: 失败技能
  en-US: Fail Skill
description:
  zh-CN: 测试原子性
  en-US: Test atomicity
category: general
risk: low
triggers:
  - fail
tools:
  - nonexistent_dangerous_tool
workflow:
  - inspect
enabled: true
`;

    const result = await importer.importFolder({
      sourcePath: srcFolder,
      target: "user",
      customYaml: badYaml,
    });

    expect(result.success).toBe(false);
    expect(result.code).toBe("SKILL_IMPORT_VALIDATION_FAILED");

    // Destination directory must NOT exist
    const destination = path.join(userDir, "user.atomic-fail-skill");
    expect(fs.existsSync(destination)).toBe(false);
  });
});
