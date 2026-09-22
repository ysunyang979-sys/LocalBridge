import { describe, expect, it, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { SkillValidator } from "../apps/server/src/skills/skill-validator.js";
import { SkillLoader } from "../apps/server/src/skills/skill-loader.js";
import { SkillRegistry } from "../apps/server/src/skills/skill-registry.js";
import { SkillImporter } from "../apps/server/src/skills/skill-importer.js";
import { MCP_TOOL_SCOPE } from "../apps/server/src/mcp/scope-policy.js";

describe("skills-compat-staging-validation: Staging Validation", () => {
  let tmpRoot: string;
  let userDir: string;
  let importer: SkillImporter;
  let registry: SkillRegistry;
  const activeTools = new Set(Object.keys(MCP_TOOL_SCOPE));

  beforeEach(() => {
    tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "nexus-staging-val-test-"));
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

  it("fails with SKILL_IMPORT_VALIDATION_FAILED and staging_validation stage when YAML schema is invalid", async () => {
    const srcFolder = path.join(tmpRoot, "test-skill");
    fs.mkdirSync(srcFolder, { recursive: true });
    fs.writeFileSync(path.join(srcFolder, "SKILL.md"), "# Instructions");

    // Missing required tools field
    const invalidYaml = `id: user.invalid-schema-skill
version: "1.0.0"
name:
  zh-CN: 无效技能
  en-US: Invalid Skill
description:
  zh-CN: 缺少 tools 字段
  en-US: Missing tools field
category: general
risk: low
triggers:
  - invalid
tools: []
workflow:
  - inspect
enabled: true
`;

    const result = await importer.importFolder({
      sourcePath: srcFolder,
      target: "user",
      customYaml: invalidYaml,
    });

    expect(result.success).toBe(false);
    expect(result.code).toBe("SKILL_IMPORT_VALIDATION_FAILED");
    expect(result.stage).toBe("staging_validation");
    expect(result.validationErrors?.length).toBeGreaterThan(0);
    expect(result.error).toMatch(/At least one tool must be declared|tools/);
  });
});
