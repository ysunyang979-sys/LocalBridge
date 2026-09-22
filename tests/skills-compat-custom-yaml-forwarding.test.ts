import { describe, expect, it, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { SkillValidator } from "../apps/server/src/skills/skill-validator.js";
import { SkillLoader } from "../apps/server/src/skills/skill-loader.js";
import { SkillRegistry } from "../apps/server/src/skills/skill-registry.js";
import { SkillImporter } from "../apps/server/src/skills/skill-importer.js";
import { MCP_TOOL_SCOPE } from "../apps/server/src/mcp/scope-policy.js";

describe("skills-compat-custom-yaml-forwarding: Custom YAML Forwarding", () => {
  let tmpRoot: string;
  let userDir: string;
  let importer: SkillImporter;
  let registry: SkillRegistry;
  const activeTools = new Set(Object.keys(MCP_TOOL_SCOPE));

  beforeEach(() => {
    tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "nexus-yaml-fwd-test-"));
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

  it("forwards customYaml into staging and commits it as skill.yaml with custom metadata", async () => {
    const srcFolder = path.join(tmpRoot, "raw-skill-folder");
    fs.mkdirSync(srcFolder, { recursive: true });
    fs.writeFileSync(path.join(srcFolder, "SKILL.md"), "# Custom Title\n\nCustom Instructions\n");

    const customYaml = `id: user.forwarded-yaml-test
version: "2.1.0"
name:
  zh-CN: 自定义转发测试
  en-US: Forwarded YAML Test
description:
  zh-CN: 验证 customYaml 无损传递
  en-US: Verify customYaml lossless forwarding
category: debugging
risk: low
triggers:
  - forward-trigger
tools:
  - localbridge_file_read
workflow:
  - step_one
  - step_two
enabled: true
`;

    const result = await importer.importFolder({
      sourcePath: srcFolder,
      target: "user",
      customYaml,
    });

    expect(result.success).toBe(true);
    expect(result.skill?.id).toBe("user.forwarded-yaml-test");
    expect(result.skill?.version).toBe("2.1.0");

    const installedYamlPath = path.join(userDir, "user.forwarded-yaml-test", "skill.yaml");
    expect(fs.existsSync(installedYamlPath)).toBe(true);
    const installedYamlContent = fs.readFileSync(installedYamlPath, "utf-8");
    expect(installedYamlContent).toContain("user.forwarded-yaml-test");
    expect(installedYamlContent).toContain("自定义转发测试");
  });
});
