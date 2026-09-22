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

describe("Skills Import: ZIP Source", () => {
  let tmpRoot: string;
  let userDir: string;
  let projectDir: string;
  let validZipBuffer: Buffer;
  let importer: SkillImporter;
  let registry: SkillRegistry;
  let loader: SkillLoader;
  const activeTools = new Set(Object.keys(MCP_TOOL_SCOPE));

  const validYaml = `id: custom.network-tracer
version: 1.2.0
name:
  zh-CN: 网络请求追踪
  en-US: Network Request Tracer
description:
  zh-CN: 追踪并诊断本地网络请求
  en-US: Trace and diagnose local network requests
category: debugging
risk: low
triggers:
  - 网络排错
  - 抓包排查
  - network issue
tools:
  - localbridge_project_list
  - localbridge_code_diagnostics
workflow:
  - capture_traffic
  - inspect_headers
enabled: true
`;

  const validMd = `# 网络请求追踪
用于调试本地 API 与网络连通性。
`;

  beforeEach(() => {
    tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "nexus-skill-import-zip-"));
    userDir = path.join(tmpRoot, "user-skills");
    projectDir = path.join(tmpRoot, "sample-project");

    fs.mkdirSync(userDir, { recursive: true });
    fs.mkdirSync(projectDir, { recursive: true });

    validZipBuffer = createZip([
      { path: "skill.yaml", data: Buffer.from(validYaml, "utf-8") },
      { path: "SKILL.md", data: Buffer.from(validMd, "utf-8") },
    ]);

    const validator = new SkillValidator(activeTools);
    loader = new SkillLoader(validator, {
      userDir,
      projectDirs: [{ projectId: "proj-1", rootPath: projectDir }],
    });
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

  it("previews a valid ZIP archive without extracting to disk", async () => {
    const preview = await importer.previewZip(validZipBuffer, "user");

    expect(preview.valid).toBe(true);
    expect(preview.validationStatus).toBe("valid");
    expect(preview.id).toBe("custom.network-tracer");
    expect(preview.version).toBe("1.2.0");
    expect(preview.name["zh-CN"]).toBe("网络请求追踪");
    expect(preview.toolsCount).toBe(2);
    expect(preview.workflowStepsCount).toBe(2);
    expect(preview.hasConflict).toBe(false);
  });

  it("unpacks and imports a ZIP to user skills directory", async () => {
    const result = await importer.importZip({
      zipBufferOrPath: validZipBuffer,
      target: "user",
    });

    expect(result.success).toBe(true);
    expect(result.skill?.id).toBe("custom.network-tracer");
    expect(result.skill?.source).toBe("user");

    // Files on disk
    const targetFolder = path.join(userDir, "custom.network-tracer");
    expect(fs.existsSync(path.join(targetFolder, "skill.yaml"))).toBe(true);
    expect(fs.existsSync(path.join(targetFolder, "SKILL.md"))).toBe(true);

    // Registry query
    const skill = registry.getSkill("custom.network-tracer");
    expect(skill).toBeDefined();
    expect(skill?.version).toBe("1.2.0");
  });

  it("unpacks and imports a ZIP from a file path on disk to project skills", async () => {
    const zipFilePath = path.join(tmpRoot, "custom.network-tracer.zip");
    fs.writeFileSync(zipFilePath, validZipBuffer);

    const result = await importer.importZip({
      zipBufferOrPath: zipFilePath,
      target: "project",
      projectId: "proj-1",
      projectRoot: projectDir,
    });

    expect(result.success).toBe(true);
    expect(result.skill?.source).toBe("project");

    const projectSkillDir = path.join(projectDir, ".nexus", "skills", "custom.network-tracer");
    expect(fs.existsSync(path.join(projectSkillDir, "skill.yaml"))).toBe(true);
    expect(fs.existsSync(path.join(projectSkillDir, "SKILL.md"))).toBe(true);

    const skill = registry.getSkill("custom.network-tracer", "proj-1");
    expect(skill).toBeDefined();
    expect(skill?.id).toBe("custom.network-tracer");
  });
});
