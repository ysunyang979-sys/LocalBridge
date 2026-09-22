import { describe, expect, it, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { SkillValidator } from "../apps/server/src/skills/skill-validator.js";
import { SkillLoader } from "../apps/server/src/skills/skill-loader.js";
import { SkillRegistry } from "../apps/server/src/skills/skill-registry.js";
import { SkillImporter } from "../apps/server/src/skills/skill-importer.js";
import { MCP_TOOL_SCOPE } from "../apps/server/src/mcp/scope-policy.js";

describe("Skills Import: Unknown Tool Validation", () => {
  let tmpRoot: string;
  let userDir: string;
  let sampleFolder: string;
  let importer: SkillImporter;
  const activeTools = new Set(Object.keys(MCP_TOOL_SCOPE));

  beforeEach(() => {
    tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "nexus-skill-unknown-tool-"));
    userDir = path.join(tmpRoot, "user-skills");
    sampleFolder = path.join(tmpRoot, "fake-tool-skill");

    fs.mkdirSync(userDir, { recursive: true });
    fs.mkdirSync(sampleFolder, { recursive: true });

    // Manifest with an unauthorized / non-existent MCP Tool
    fs.writeFileSync(
      path.join(sampleFolder, "skill.yaml"),
      `id: custom.unknown-tool-test
version: 1.0.0
name:
  zh-CN: 未知工具测试
  en-US: Unknown Tool Test
description:
  zh-CN: 声明不存在的工具
  en-US: Declares non-existent tool
category: debugging
risk: low
triggers: ["unknown"]
tools:
  - localbridge_fake_tool
  - another_unregistered_mcp_call
workflow:
  - test_step
`,
      "utf-8"
    );

    fs.writeFileSync(path.join(sampleFolder, "SKILL.md"), "# Unknown Tool Test");

    const validator = new SkillValidator(activeTools);
    const loader = new SkillLoader(validator, { userDir });
    const registry = new SkillRegistry(loader);
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

  it("identifies unknown tools in preview with exact '未知 MCP Tool' message", async () => {
    const preview = await importer.previewFolder(sampleFolder, "user");

    expect(preview.valid).toBe(false);
    expect(preview.validationStatus).toBe("invalid");
    expect(preview.validationErrors).toContain("未知 MCP Tool: localbridge_fake_tool");
    expect(preview.validationErrors).toContain("未知 MCP Tool: another_unregistered_mcp_call");
  });

  it("rejects import with descriptive error identifying the exact unknown tool", async () => {
    const result = await importer.importFolder({
      sourcePath: sampleFolder,
      target: "user",
    });

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/未知 MCP Tool/i);
    expect(result.validationErrors).toContain("未知 MCP Tool: localbridge_fake_tool");

    // Ensure files were not copied to userDir
    const destination = path.join(userDir, "custom.unknown-tool-test");
    expect(fs.existsSync(destination)).toBe(false);
  });
});
