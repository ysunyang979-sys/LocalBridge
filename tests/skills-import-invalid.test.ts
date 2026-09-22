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

describe("Skills Import: Invalid Skills Rejection", () => {
  let tmpRoot: string;
  let userDir: string;
  let importer: SkillImporter;
  const activeTools = new Set(Object.keys(MCP_TOOL_SCOPE));

  beforeEach(() => {
    tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "nexus-skill-invalid-"));
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

  it("rejects import when skill.yaml is missing", async () => {
    const invalidDir = path.join(tmpRoot, "no-yaml");
    fs.mkdirSync(invalidDir, { recursive: true });
    fs.writeFileSync(path.join(invalidDir, "SKILL.md"), "# Skill Without YAML");

    const preview = await importer.previewFolder(invalidDir, "user");
    expect(preview.valid).toBe(false);
    expect(preview.validationStatus).toBe("invalid");
    expect(preview.validationErrors.some((e) => e.includes("skill.yaml"))).toBe(true);

    const result = await importer.importFolder({
      sourcePath: invalidDir,
      target: "user",
    });
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/skill\.yaml/i);
  });

  it("rejects import when SKILL.md is missing", async () => {
    const invalidDir = path.join(tmpRoot, "no-md");
    fs.mkdirSync(invalidDir, { recursive: true });
    fs.writeFileSync(
      path.join(invalidDir, "skill.yaml"),
      `id: custom.no-md
version: 1.0.0
name: { zh-CN: 无文档, en-US: No Doc }
description: { zh-CN: 描述, en-US: Description }
category: general
risk: low
triggers: ["test"]
tools: ["localbridge_project_list"]
workflow: ["step1"]
`
    );

    const preview = await importer.previewFolder(invalidDir, "user");
    expect(preview.valid).toBe(false);
    expect(preview.validationErrors.some((e) => e.includes("SKILL.md"))).toBe(true);

    const result = await importer.importFolder({
      sourcePath: invalidDir,
      target: "user",
    });
    expect(result.success).toBe(false);
  });

  it("rejects folder containing executable files (.exe, .ps1, .sh, .py, .js)", async () => {
    const dangerousDir = path.join(tmpRoot, "with-exec");
    fs.mkdirSync(dangerousDir, { recursive: true });
    fs.writeFileSync(
      path.join(dangerousDir, "skill.yaml"),
      `id: custom.dangerous-exec
version: 1.0.0
name: { zh-CN: 危险技能, en-US: Dangerous Skill }
description: { zh-CN: 描述, en-US: Description }
category: general
risk: high
triggers: ["exec"]
tools: ["localbridge_project_list"]
workflow: ["step1"]
`
    );
    fs.writeFileSync(path.join(dangerousDir, "SKILL.md"), "# Dangerous");
    fs.writeFileSync(path.join(dangerousDir, "payload.exe"), "MZ BINARY EXECUTABLE");
    fs.writeFileSync(path.join(dangerousDir, "script.ps1"), "Write-Host 'hack'");

    const preview = await importer.previewFolder(dangerousDir, "user");
    expect(preview.valid).toBe(false);
    expect(preview.executableFilesFound?.length).toBeGreaterThan(0);
    expect(preview.validationErrors.some((e) => e.includes("Executable files are strictly forbidden"))).toBe(true);

    const result = await importer.importFolder({
      sourcePath: dangerousDir,
      target: "user",
    });
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/Executable files/i);
  });

  it("rejects manifest declaring forbidden executable fields (script, command, entrypoint, hook, execute)", async () => {
    const manifestExecZip = createZip([
      {
        path: "skill.yaml",
        data: Buffer.from(
          `id: custom.manifest-exec
version: 1.0.0
name: { zh-CN: 命令声明技能, en-US: Command Skill }
description: { zh-CN: 描述, en-US: Description }
category: general
risk: high
triggers: ["cmd"]
tools: ["localbridge_project_list"]
workflow: ["step1"]
script: "node run.js"
command: "bash exploit.sh"
entrypoint: "./main"
`,
          "utf-8"
        ),
      },
      { path: "SKILL.md", data: Buffer.from("# Manifest Exec Test", "utf-8") },
    ]);

    const preview = await importer.previewZip(manifestExecZip, "user");
    expect(preview.valid).toBe(false);
    expect(preview.validationErrors.some((e) => e.includes("Declarative only"))).toBe(true);

    const result = await importer.importZip({
      zipBufferOrPath: manifestExecZip,
      target: "user",
    });
    expect(result.success).toBe(false);
  });
});
