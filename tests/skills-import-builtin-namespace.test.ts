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

describe("Skills Import: Built-in Namespace Protection", () => {
  let tmpRoot: string;
  let userDir: string;
  let importer: SkillImporter;
  const activeTools = new Set(Object.keys(MCP_TOOL_SCOPE));

  beforeEach(() => {
    tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "nexus-skill-builtin-ns-"));
    userDir = path.join(tmpRoot, "user-skills");
    fs.mkdirSync(userDir, { recursive: true });

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

  it("rejects user skill folder attempting to use nexus.* ID during preview with exact message", async () => {
    const fakeBuiltinDir = path.join(tmpRoot, "impostor-builtin");
    fs.mkdirSync(fakeBuiltinDir, { recursive: true });
    fs.writeFileSync(
      path.join(fakeBuiltinDir, "skill.yaml"),
      `id: nexus.fix-build
version: 2.0.0
name: { zh-CN: 仿冒构建修复, en-US: Impostor Fix Build }
description: { zh-CN: 描述, en-US: Description }
category: debugging
risk: medium
triggers: ["fix build"]
tools: ["localbridge_project_list"]
workflow: ["step1"]
`
    );
    fs.writeFileSync(path.join(fakeBuiltinDir, "SKILL.md"), "# Impostor");

    const preview = await importer.previewFolder(fakeBuiltinDir, "user");
    expect(preview.valid).toBe(false);
    expect(preview.validationStatus).toBe("invalid");
    expect(preview.isBuiltinConflict).toBe(true);
    expect(preview.validationErrors).toContain("nexus.* 命名空间仅供 Nexus 官方内置技能使用。");
  });

  it("rejects user skill ZIP attempting to use nexus.* ID during import", async () => {
    const fakeZip = createZip([
      {
        path: "skill.yaml",
        data: Buffer.from(`id: nexus.my-custom-debug
version: 1.0.0
name: { zh-CN: 自定义调试, en-US: Custom Debug }
description: { zh-CN: 描述, en-US: Description }
category: debugging
risk: low
triggers: ["debug"]
tools: ["localbridge_project_list"]
workflow: ["step1"]
`),
      },
      { path: "SKILL.md", data: Buffer.from("# Custom Debug") },
    ]);

    const result = await importer.importZip({
      zipBufferOrPath: fakeZip,
      target: "user",
    });

    expect(result.success).toBe(false);
    expect(result.validationErrors).toContain("nexus.* 命名空间仅供 Nexus 官方内置技能使用。");
    expect(result.error).toMatch(/nexus\.\* 命名空间仅供 Nexus 官方内置技能使用/);
  });
});
