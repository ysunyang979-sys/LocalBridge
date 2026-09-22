import { describe, expect, it, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { SkillValidator } from "../apps/server/src/skills/skill-validator.js";
import { SkillLoader } from "../apps/server/src/skills/skill-loader.js";
import { SkillRegistry } from "../apps/server/src/skills/skill-registry.js";
import { SkillImporter } from "../apps/server/src/skills/skill-importer.js";
import { MCP_TOOL_SCOPE } from "../apps/server/src/mcp/scope-policy.js";

describe("skills-native-import-regression: Native Nexus Skill Strict Validation Unchanged", () => {
  let tmpRoot: string;
  let userDir: string;
  let importer: SkillImporter;
  let registry: SkillRegistry;
  const activeTools = new Set(Object.keys(MCP_TOOL_SCOPE));

  beforeEach(() => {
    tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "nexus-native-reg-test-"));
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

  it("strictly validates native skill.yaml and rejects invalid declared MCP tools", async () => {
    const nativeDir = path.join(tmpRoot, "native-invalid-tool");
    fs.mkdirSync(nativeDir, { recursive: true });
    fs.writeFileSync(path.join(nativeDir, "SKILL.md"), "# Native Skill\nValid documentation.");
    fs.writeFileSync(
      path.join(nativeDir, "skill.yaml"),
      `id: user.native-bad-tool
version: "1.0.0"
name:
  zh-CN: 原生技能
  en-US: Native Skill
description:
  zh-CN: 原生技能描述
  en-US: Native skill description
category: general
risk: low
triggers:
  - native
tools:
  - nonexistent_fake_tool_xyz
workflow:
  - step1
enabled: true
`
    );

    const preview = await importer.previewFolder(nativeDir, "user");
    expect(preview.manifestFound).toBe(true);
    expect(preview.valid).toBe(false);
    expect(preview.validationStatus).toBe("invalid");
    expect(preview.validationErrors.some((e) => e.includes("未知 MCP Tool: nonexistent_fake_tool_xyz"))).toBe(true);

    const result = await importer.importFolder({
      sourcePath: nativeDir,
      target: "user",
    });

    expect(result.success).toBe(false);
    expect(result.code).toBe("SKILL_IMPORT_VALIDATION_FAILED");
  });

  it("successfully imports a fully valid native Nexus skill with skill.yaml", async () => {
    const nativeDir = path.join(tmpRoot, "native-valid-skill");
    fs.mkdirSync(nativeDir, { recursive: true });
    fs.writeFileSync(path.join(nativeDir, "SKILL.md"), "# Valid Native\nDocumentation.");
    fs.writeFileSync(
      path.join(nativeDir, "skill.yaml"),
      `id: user.native-valid-skill
version: "1.0.0"
name:
  zh-CN: 有效原生技能
  en-US: Valid Native Skill
description:
  zh-CN: 有效描述
  en-US: Valid description
category: general
risk: low
triggers:
  - valid
tools:
  - localbridge_file_read
workflow:
  - read_file
enabled: true
`
    );

    const preview = await importer.previewFolder(nativeDir, "user");
    expect(preview.manifestFound).toBe(true);
    expect(preview.valid).toBe(true);
    expect(preview.skillType).toBe("nexus");

    const result = await importer.importFolder({
      sourcePath: nativeDir,
      target: "user",
    });

    expect(result.success).toBe(true);
    const skill = registry.getSkill("user.native-valid-skill");
    expect(skill).toBeDefined();
    expect(skill?.type).toBe("nexus");
    expect(skill?.tools).toEqual(["localbridge_file_read"]);
  });
});
