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

  it("allows direct import as raw skill when skill.yaml is missing but SKILL.md exists", async () => {
    const noYamlDir = path.join(tmpRoot, "no-yaml");
    fs.mkdirSync(noYamlDir, { recursive: true });
    fs.writeFileSync(path.join(noYamlDir, "SKILL.md"), "# Skill Without YAML");

    const preview = await importer.previewFolder(noYamlDir, "user");
    expect(preview.valid).toBe(true);
    expect(preview.skillType).toBe("raw");
    expect(preview.manifestFound).toBe(false);
    expect(preview.skillDocFound).toBe(true);

    const result = await importer.importFolder({
      sourcePath: noYamlDir,
      target: "user",
    });
    expect(result.success).toBe(true);
    expect(result.skill?.type).toBe("raw");
  });

  it("rejects import when both skill.yaml and documentation are missing", async () => {
    const emptyDir = path.join(tmpRoot, "empty-invalid");
    fs.mkdirSync(emptyDir, { recursive: true });

    const preview = await importer.previewFolder(emptyDir, "user");
    expect(preview.valid).toBe(false);
    expect(preview.validationStatus).toBe("invalid");
    expect(preview.validationErrors.some((e) => e.includes("no documentation"))).toBe(true);

    const result = await importer.importFolder({
      sourcePath: emptyDir,
      target: "user",
    });
    expect(result.success).toBe(false);
  });

  it("rejects import when SKILL.md is missing in native skill", async () => {
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

  it("warns about executable files and excludes them from install directory", async () => {
    const dangerousDir = path.join(tmpRoot, "with-exec");
    fs.mkdirSync(dangerousDir, { recursive: true });
    fs.writeFileSync(
      path.join(dangerousDir, "skill.yaml"),
      `id: custom.sanitized-exec
version: 1.0.0
name: { zh-CN: 净化技能, en-US: Sanitized Skill }
description: { zh-CN: 描述, en-US: Description }
category: general
risk: high
triggers: ["exec"]
tools: ["localbridge_project_list"]
workflow: ["step1"]
`
    );
    fs.writeFileSync(path.join(dangerousDir, "SKILL.md"), "# Sanitized");
    fs.writeFileSync(path.join(dangerousDir, "payload.exe"), "MZ BINARY EXECUTABLE");
    fs.writeFileSync(path.join(dangerousDir, "script.ps1"), "Write-Host 'hack'");

    const preview = await importer.previewFolder(dangerousDir, "user");
    expect(preview.valid).toBe(true);
    expect(preview.validationStatus).toBe("warning");
    expect(preview.executableFilesFound?.length).toBe(2);
    expect(preview.securityWarning).toMatch(/可执行资源|executable/i);

    const result = await importer.importFolder({
      sourcePath: dangerousDir,
      target: "user",
    });
    expect(result.success).toBe(true);

    // Verify sanitization: executables must NOT be installed
    const targetDir = path.join(userDir, "custom.sanitized-exec");
    expect(fs.existsSync(path.join(targetDir, "payload.exe"))).toBe(false);
    expect(fs.existsSync(path.join(targetDir, "script.ps1"))).toBe(false);
    expect(fs.existsSync(path.join(targetDir, "skill.yaml"))).toBe(true);
    expect(fs.existsSync(path.join(targetDir, "SKILL.md"))).toBe(true);
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
