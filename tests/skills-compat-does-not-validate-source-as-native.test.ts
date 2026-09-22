import { describe, expect, it, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { SkillValidator } from "../apps/server/src/skills/skill-validator.js";
import { SkillLoader } from "../apps/server/src/skills/skill-loader.js";
import { SkillRegistry } from "../apps/server/src/skills/skill-registry.js";
import { SkillImporter } from "../apps/server/src/skills/skill-importer.js";
import { MCP_TOOL_SCOPE } from "../apps/server/src/mcp/scope-policy.js";

describe("skills-compat-does-not-validate-source-as-native: Avoid Upfront Source Native Validation", () => {
  let tmpRoot: string;
  let userDir: string;
  let importer: SkillImporter;
  let registry: SkillRegistry;
  const activeTools = new Set(Object.keys(MCP_TOOL_SCOPE));

  beforeEach(() => {
    tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "nexus-upfront-val-test-"));
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

  it("does not reject raw folder missing skill.yaml upfront; returns needs_setup on preview and succeeds on import with customYaml", async () => {
    const rawFolder = path.join(tmpRoot, "raw-doc-only");
    fs.mkdirSync(rawFolder, { recursive: true });
    fs.writeFileSync(path.join(rawFolder, "README.md"), "# Document Only Project\n\nUseful reference docs.");

    const preview = await importer.previewFolder(rawFolder, "user");
    expect(preview.validationStatus).toBe("needs_setup");
    expect(preview.manifestFound).toBe(false);
    expect(preview.skillDocFound).toBe(true);

    const customYaml = `id: user.doc-only-converted
version: "1.0.0"
name:
  zh-CN: 文档转技能
  en-US: Doc Only Converted
description:
  zh-CN: 成功转换
  en-US: Successfully converted
category: general
risk: low
triggers:
  - doc-only
tools:
  - localbridge_file_read
workflow:
  - read_docs
enabled: true
`;

    const result = await importer.importFolder({
      sourcePath: rawFolder,
      target: "user",
      customYaml,
    });

    expect(result.success).toBe(true);
    expect(result.skill?.id).toBe("user.doc-only-converted");
  });
});
