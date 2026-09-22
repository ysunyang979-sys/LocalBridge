import { describe, expect, it, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { SkillValidator } from "../apps/server/src/skills/skill-validator.js";
import { SkillLoader } from "../apps/server/src/skills/skill-loader.js";
import { SkillRegistry } from "../apps/server/src/skills/skill-registry.js";
import { SkillImporter } from "../apps/server/src/skills/skill-importer.js";
import { MCP_TOOL_SCOPE } from "../apps/server/src/mcp/scope-policy.js";

describe("Skills Import: Conflict Detection & Non-Destructive Overwrite", () => {
  let tmpRoot: string;
  let userDir: string;
  let importer: SkillImporter;
  let registry: SkillRegistry;
  let loader: SkillLoader;
  const activeTools = new Set(Object.keys(MCP_TOOL_SCOPE));

  beforeEach(() => {
    tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "nexus-skill-conflict-"));
    userDir = path.join(tmpRoot, "user-skills");
    fs.mkdirSync(userDir, { recursive: true });

    // Seed existing version 1.0.0 of my.custom-audit in user skills
    const existingDir = path.join(userDir, "my.custom-audit");
    fs.mkdirSync(existingDir, { recursive: true });
    fs.writeFileSync(
      path.join(existingDir, "skill.yaml"),
      `id: my.custom-audit
version: 1.0.0
name: { zh-CN: 自定义代码审查, en-US: Custom Audit }
description: { zh-CN: 初始版本, en-US: Initial version }
category: review
risk: low
triggers: ["audit"]
tools: ["localbridge_project_list"]
workflow: ["step1"]
`
    );
    fs.writeFileSync(path.join(existingDir, "SKILL.md"), "# Initial Audit v1.0.0");

    const validator = new SkillValidator(activeTools);
    loader = new SkillLoader(validator, { userDir });
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

  it("detects conflict in preview with existing version comparison", async () => {
    const newVersionDir = path.join(tmpRoot, "incoming-v1.1.0");
    fs.mkdirSync(newVersionDir, { recursive: true });
    fs.writeFileSync(
      path.join(newVersionDir, "skill.yaml"),
      `id: my.custom-audit
version: 1.1.0
name: { zh-CN: 自定义代码审查升级版, en-US: Custom Audit Upgraded }
description: { zh-CN: 升级版本, en-US: Upgraded version }
category: review
risk: low
triggers: ["audit", "fast audit"]
tools: ["localbridge_project_list"]
workflow: ["step1", "step2"]
`
    );
    fs.writeFileSync(path.join(newVersionDir, "SKILL.md"), "# Audit v1.1.0");

    const preview = await importer.previewFolder(newVersionDir, "user");

    expect(preview.valid).toBe(true);
    expect(preview.hasConflict).toBe(true);
    expect(preview.existingVersion).toBe("1.0.0");
    expect(preview.version).toBe("1.1.0");
    expect(preview.isBuiltinConflict).toBe(false);
  });

  it("fails import without overwrite flag when conflict exists", async () => {
    const newVersionDir = path.join(tmpRoot, "incoming-v1.1.0");
    fs.mkdirSync(newVersionDir, { recursive: true });
    fs.writeFileSync(
      path.join(newVersionDir, "skill.yaml"),
      `id: my.custom-audit
version: 1.1.0
name: { zh-CN: 自定义代码审查升级版, en-US: Custom Audit Upgraded }
description: { zh-CN: 升级版本, en-US: Upgraded version }
category: review
risk: low
triggers: ["audit"]
tools: ["localbridge_project_list"]
workflow: ["step1"]
`
    );
    fs.writeFileSync(path.join(newVersionDir, "SKILL.md"), "# Audit v1.1.0");

    const result = await importer.importFolder({
      sourcePath: newVersionDir,
      target: "user",
      overwrite: false,
    });

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/already exists|已存在/i);

    // Verify disk still has v1.0.0
    const originalSkill = registry.getSkill("my.custom-audit");
    expect(originalSkill?.version).toBe("1.0.0");
  });

  it("successfully updates skill when overwrite flag is explicitly enabled", async () => {
    const newVersionDir = path.join(tmpRoot, "incoming-v1.1.0");
    fs.mkdirSync(newVersionDir, { recursive: true });
    fs.writeFileSync(
      path.join(newVersionDir, "skill.yaml"),
      `id: my.custom-audit
version: 1.1.0
name: { zh-CN: 自定义代码审查升级版, en-US: Custom Audit Upgraded }
description: { zh-CN: 升级版本, en-US: Upgraded version }
category: review
risk: low
triggers: ["audit", "fast audit"]
tools: ["localbridge_project_list"]
workflow: ["step1", "step2"]
`
    );
    fs.writeFileSync(path.join(newVersionDir, "SKILL.md"), "# Audit v1.1.0 New Instructions");

    const result = await importer.importFolder({
      sourcePath: newVersionDir,
      target: "user",
      overwrite: true,
    });

    expect(result.success).toBe(true);

    // Verify disk and registry are now 1.1.0
    const updatedSkill = registry.getSkill("my.custom-audit");
    expect(updatedSkill?.version).toBe("1.1.0");
    expect(updatedSkill?.instructions).toContain("Audit v1.1.0 New Instructions");
  });

  it("never allows replacing a built-in skill even with overwrite: true", async () => {
    const impostorDir = path.join(tmpRoot, "fake-inspect");
    fs.mkdirSync(impostorDir, { recursive: true });
    fs.writeFileSync(
      path.join(impostorDir, "skill.yaml"),
      `id: nexus.project-inspect
version: 9.9.9
name: { zh-CN: 篡改内置技能, en-US: Hijacked Built-in }
description: { zh-CN: 篡改, en-US: Hijack }
category: inspection
risk: high
triggers: ["inspect"]
tools: ["localbridge_project_list"]
workflow: ["step1"]
`
    );
    fs.writeFileSync(path.join(impostorDir, "SKILL.md"), "# Hijacked");

    const result = await importer.importFolder({
      sourcePath: impostorDir,
      target: "user",
      overwrite: true,
    });

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/nexus\.\*|内置技能/);

    const builtinSkill = registry.getSkill("nexus.project-inspect");
    expect(builtinSkill?.source).toBe("builtin");
    expect(builtinSkill?.version).not.toBe("9.9.9");
  });
});
