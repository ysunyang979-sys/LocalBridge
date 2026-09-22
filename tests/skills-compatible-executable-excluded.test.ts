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

describe("Skills Compatible: Executables Excluded on Install", () => {
  let tmpRoot: string;
  let userDir: string;
  let importer: SkillImporter;
  const activeTools = new Set(Object.keys(MCP_TOOL_SCOPE));

  beforeEach(() => {
    tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "nexus-compat-exec-excluded-"));
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

  it("strictly filters out .bat, .sh, .jar, .exe, .py, .js files during unpack to destination", async () => {
    const zip = createZip([
      {
        path: "skill.yaml",
        data: `id: user.safe-docs
version: 1.0.0
name: { zh-CN: 安全文档, en-US: Safe Docs }
description: { zh-CN: 描述, en-US: Description }
category: general
risk: low
triggers: ["docs"]
tools: ["localbridge_file_read"]
workflow: ["read"]
`,
      },
      { path: "SKILL.md", data: "# Documentation" },
      { path: "docs/reference.txt", data: "Safe Reference Text" },
      { path: "build.bat", data: "REM dangerous" },
      { path: "test.sh", data: "#!/bin/sh" },
      { path: "lib/agent.jar", data: "JAR BINARY" },
      { path: "runner.py", data: "print('python')" },
      { path: "cli.exe", data: "EXE BINARY" },
    ]);

    const result = await importer.importZip({
      zipBufferOrPath: zip,
      target: "user",
    });

    expect(result.success).toBe(true);

    const installDir = path.join(userDir, "user.safe-docs");
    expect(fs.existsSync(path.join(installDir, "SKILL.md"))).toBe(true);
    expect(fs.existsSync(path.join(installDir, "docs", "reference.txt"))).toBe(true);

    // Verify none of the executables are copied
    expect(fs.existsSync(path.join(installDir, "build.bat"))).toBe(false);
    expect(fs.existsSync(path.join(installDir, "test.sh"))).toBe(false);
    expect(fs.existsSync(path.join(installDir, "lib", "agent.jar"))).toBe(false);
    expect(fs.existsSync(path.join(installDir, "runner.py"))).toBe(false);
    expect(fs.existsSync(path.join(installDir, "cli.exe"))).toBe(false);
  });
});
