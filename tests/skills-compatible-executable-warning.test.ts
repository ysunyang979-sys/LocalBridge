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

describe("Skills Compatible: Executable File Warning", () => {
  let tmpRoot: string;
  let userDir: string;
  let importer: SkillImporter;
  const activeTools = new Set(Object.keys(MCP_TOOL_SCOPE));

  beforeEach(() => {
    tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "nexus-compat-exec-warning-"));
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

  it("produces warning rather than total rejection when executables are present", async () => {
    const zip = createZip([
      {
        path: "skill.yaml",
        data: `id: user.build-helper
version: 1.0.0
name: { zh-CN: 构建助手, en-US: Build Helper }
description: { zh-CN: 描述, en-US: Description }
category: general
risk: medium
triggers: ["build"]
tools: ["localbridge_project_list"]
workflow: ["inspect"]
`,
      },
      { path: "SKILL.md", data: "# Build Helper" },
      { path: "scripts/build.sh", data: "#!/bin/bash\necho build" },
      { path: "scripts/setup.bat", data: "@echo off\necho setup" },
      { path: "bin/helper.exe", data: "BINARY" },
    ]);

    const preview = await importer.previewZip(zip, "user");
    expect(preview.valid).toBe(true);
    expect(preview.validationStatus).toBe("warning");
    expect(preview.executableFilesFound?.length).toBe(3);
    expect(preview.securityWarning).toMatch(/可执行资源|executable/i);
  });
});
