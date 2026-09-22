import { describe, expect, it, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { SkillValidator } from "../apps/server/src/skills/skill-validator.js";
import { SkillLoader } from "../apps/server/src/skills/skill-loader.js";
import { SkillRegistry } from "../apps/server/src/skills/skill-registry.js";
import { SkillImporter } from "../apps/server/src/skills/skill-importer.js";
import { MCP_TOOL_SCOPE } from "../apps/server/src/mcp/scope-policy.js";
import { createZip } from "../apps/server/src/skills/zip-util.js";

describe("Skills Compatible: Create Manifest Wizard", () => {
  let tmpRoot: string;
  let userDir: string;
  let importer: SkillImporter;
  let registry: SkillRegistry;
  const activeTools = new Set(Object.keys(MCP_TOOL_SCOPE));

  beforeEach(() => {
    tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "nexus-compat-create-manifest-"));
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

  it("imports a compatible package when customYaml is provided by configuration wizard", async () => {
    const zip = createZip([
      { path: "unmanifested-repo/README.md", data: "# Code Reviewer\nAutomated code review workflow." },
    ]);

    const customYaml = `id: user.code-reviewer
version: 1.0.0
name:
  zh-CN: 代码审查员
  en-US: Code Reviewer
description:
  zh-CN: 自动化代码审查技能
  en-US: Automated code review skill
category: review
risk: low
triggers:
  - 审查代码
  - code review
tools:
  - localbridge_file_read
  - localbridge_code_diagnostics
workflow:
  - scan_files
  - report_issues
enabled: true
`;

    const result = await importer.importZip({
      zipBufferOrPath: zip,
      target: "user",
      customYaml,
    });

    expect(result.success).toBe(true);
    expect(result.skill?.id).toBe("user.code-reviewer");

    // Check disk content
    const installDir = path.join(userDir, "user.code-reviewer");
    expect(fs.existsSync(path.join(installDir, "skill.yaml"))).toBe(true);
    expect(fs.existsSync(path.join(installDir, "SKILL.md"))).toBe(true);

    // Check registry
    const skill = registry.getSkill("user.code-reviewer");
    expect(skill).toBeDefined();
    expect(skill?.name["zh-CN"]).toBe("代码审查员");
  });
});
