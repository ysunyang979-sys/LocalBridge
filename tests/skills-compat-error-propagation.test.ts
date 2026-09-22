import { describe, expect, it, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { SkillValidator } from "../apps/server/src/skills/skill-validator.js";
import { SkillLoader } from "../apps/server/src/skills/skill-loader.js";
import { SkillRegistry } from "../apps/server/src/skills/skill-registry.js";
import { SkillImporter } from "../apps/server/src/skills/skill-importer.js";
import { MCP_TOOL_SCOPE } from "../apps/server/src/mcp/scope-policy.js";

describe("skills-compat-error-propagation: Structured Error Propagation", () => {
  let tmpRoot: string;
  let userDir: string;
  let importer: SkillImporter;
  let registry: SkillRegistry;
  const activeTools = new Set(Object.keys(MCP_TOOL_SCOPE));

  beforeEach(() => {
    tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "nexus-err-prop-test-"));
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

  it("returns structured error with resolve_subpath stage when candidate subPath is missing", async () => {
    const srcFolder = path.join(tmpRoot, "folder");
    fs.mkdirSync(srcFolder, { recursive: true });

    const result = await importer.importFolder({
      sourcePath: srcFolder,
      target: "user",
      subPath: "nonexistent/candidate/path",
    });

    expect(result.success).toBe(false);
    expect(result.code).toBe("CANDIDATE_PATH_NOT_FOUND");
    expect(result.stage).toBe("resolve_subpath");
    expect(result.error).toContain("nonexistent/candidate/path");
  });

  it("returns structured error with conflict_check stage when reserved nexus.* namespace is attempted", async () => {
    const srcFolder = path.join(tmpRoot, "folder");
    fs.mkdirSync(srcFolder, { recursive: true });
    fs.writeFileSync(path.join(srcFolder, "SKILL.md"), "# Doc");

    const reservedYaml = `id: nexus.forbidden-override
version: "1.0.0"
name:
  zh-CN: 官方内置
  en-US: Builtin
description:
  zh-CN: 试图覆盖官方内置
  en-US: Override attempt
category: general
risk: low
triggers:
  - test
tools:
  - localbridge_file_read
workflow:
  - step
enabled: true
`;

    const result = await importer.importFolder({
      sourcePath: srcFolder,
      target: "user",
      customYaml: reservedYaml,
    });

    expect(result.success).toBe(false);
    expect(result.code).toBe("SKILL_IMPORT_VALIDATION_FAILED");
    expect(result.stage).toBe("staging_validation");
    expect(result.error).toContain("nexus.*");
  });

  it("returns structured error with conflict_check stage when skill already exists and overwrite is false", async () => {
    const srcFolder = path.join(tmpRoot, "folder");
    fs.mkdirSync(srcFolder, { recursive: true });
    fs.writeFileSync(path.join(srcFolder, "SKILL.md"), "# Doc");

    const validYaml = `id: user.conflict-test-skill
version: "1.0.0"
name:
  zh-CN: 冲突测试
  en-US: Conflict Test
description:
  zh-CN: 首次安装
  en-US: First install
category: general
risk: low
triggers:
  - conflict-test
tools:
  - localbridge_file_read
workflow:
  - step
enabled: true
`;

    const first = await importer.importFolder({
      sourcePath: srcFolder,
      target: "user",
      customYaml: validYaml,
    });
    expect(first.success).toBe(true);

    // Second import without overwrite
    const second = await importer.importFolder({
      sourcePath: srcFolder,
      target: "user",
      overwrite: false,
      customYaml: validYaml,
    });

    expect(second.success).toBe(false);
    expect(second.code).toBe("SKILL_ALREADY_EXISTS");
    expect(second.stage).toBe("conflict_check");
    expect(second.error).toContain("已存在");
  });
});
