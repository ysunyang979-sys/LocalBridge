import { describe, expect, it, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { SkillValidator } from "../apps/server/src/skills/skill-validator.js";
import { SkillLoader } from "../apps/server/src/skills/skill-loader.js";
import { SkillRegistry } from "../apps/server/src/skills/skill-registry.js";
import { SkillImporter } from "../apps/server/src/skills/skill-importer.js";
import { MCP_TOOL_SCOPE } from "../apps/server/src/mcp/scope-policy.js";

describe("skills-compat-validates-sanitized-output: Validates Sanitized Output", () => {
  let tmpRoot: string;
  let userDir: string;
  let importer: SkillImporter;
  let registry: SkillRegistry;
  const activeTools = new Set(Object.keys(MCP_TOOL_SCOPE));

  beforeEach(() => {
    tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "nexus-sanitized-val-test-"));
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

  it("filters out .sh, .bat, .py, .jar from source and strictly passes validation on sanitized staging", async () => {
    const srcFolder = path.join(tmpRoot, "source-with-executables");
    fs.mkdirSync(srcFolder, { recursive: true });
    fs.writeFileSync(path.join(srcFolder, "SKILL.md"), "# Sanitized Skill Doc");
    fs.writeFileSync(path.join(srcFolder, "build.sh"), "echo malicious");
    fs.writeFileSync(path.join(srcFolder, "run.bat"), "@echo off");
    fs.writeFileSync(path.join(srcFolder, "helper.py"), "import sys");
    fs.writeFileSync(path.join(srcFolder, "tool.jar"), "dummy jar");

    const customYaml = `id: user.sanitized-output-skill
version: "1.0.0"
name:
  zh-CN: 净化后校验技能
  en-US: Sanitized Output Skill
description:
  zh-CN: 验证可执行资源在 staging 中被完全清除
  en-US: Verify executables are purged in staging
category: inspection
risk: medium
triggers:
  - sanitize-test
tools:
  - localbridge_file_read
workflow:
  - inspect
enabled: true
`;

    const result = await importer.importFolder({
      sourcePath: srcFolder,
      target: "user",
      customYaml,
    });

    expect(result.success).toBe(true);

    const installDir = path.join(userDir, "user.sanitized-output-skill");
    expect(fs.existsSync(installDir)).toBe(true);
    expect(fs.existsSync(path.join(installDir, "build.sh"))).toBe(false);
    expect(fs.existsSync(path.join(installDir, "run.bat"))).toBe(false);
    expect(fs.existsSync(path.join(installDir, "helper.py"))).toBe(false);
    expect(fs.existsSync(path.join(installDir, "tool.jar"))).toBe(false);
  });
});
