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

describe("Skills Compatible: Conversion Round Trip", () => {
  let tmpRoot: string;
  let userDir: string;
  let importer: SkillImporter;
  let registry: SkillRegistry;
  const activeTools = new Set(Object.keys(MCP_TOOL_SCOPE));

  beforeEach(() => {
    tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "nexus-compat-conversion-"));
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

  it("converts an unmanifested GitHub archive into a full declarative Nexus Skill", async () => {
    const zip = createZip([
      { path: "awesome-reverse-main/SKILL.md", data: "# Awesome Reverse\nSecurity analysis and disassembly guide." },
      { path: "awesome-reverse-main/run.sh", data: "#!/bin/sh" },
    ]);

    const preview = await importer.previewZip(zip, "user");
    expect(["warning", "valid", "needs_setup"]).toContain(preview.validationStatus);

    const customYaml = `id: user.awesome-reverse
version: 1.0.0
name:
  zh-CN: 逆向分析指南
  en-US: Awesome Reverse
description:
  zh-CN: 逆向分析与反编译指导
  en-US: Security analysis and disassembly guide
category: inspection
risk: medium
triggers:
  - 逆向分析
  - 反编译
tools:
  - localbridge_file_read
  - localbridge_code_diagnostics
workflow:
  - inspect_binary
  - generate_report
enabled: true
`;

    const result = await importer.importZip({
      zipBufferOrPath: zip,
      target: "user",
      customYaml,
    });

    expect(result.success).toBe(true);
    const skill = registry.getSkill("user.awesome-reverse");
    expect(skill).toBeDefined();
    expect(skill?.category).toBe("inspection");
    expect(skill?.tools.length).toBe(2);

    const installDir = path.join(userDir, "user.awesome-reverse");
    expect(fs.existsSync(path.join(installDir, "run.sh"))).toBe(false);
  });
});
