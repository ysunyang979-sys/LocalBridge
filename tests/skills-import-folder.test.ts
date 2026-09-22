import { describe, expect, it, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { SkillValidator } from "../apps/server/src/skills/skill-validator.js";
import { SkillLoader } from "../apps/server/src/skills/skill-loader.js";
import { SkillRegistry } from "../apps/server/src/skills/skill-registry.js";
import { SkillImporter } from "../apps/server/src/skills/skill-importer.js";
import { MCP_TOOL_SCOPE } from "../apps/server/src/mcp/scope-policy.js";

describe("Skills Import: Folder Source", () => {
  let tmpRoot: string;
  let userDir: string;
  let projectDir: string;
  let sampleFolder: string;
  let importer: SkillImporter;
  let registry: SkillRegistry;
  let loader: SkillLoader;
  const activeTools = new Set(Object.keys(MCP_TOOL_SCOPE));

  beforeEach(() => {
    tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "nexus-skill-import-folder-"));
    userDir = path.join(tmpRoot, "user-skills");
    projectDir = path.join(tmpRoot, "sample-project");
    sampleFolder = path.join(tmpRoot, "src-folder-skill");

    fs.mkdirSync(userDir, { recursive: true });
    fs.mkdirSync(projectDir, { recursive: true });
    fs.mkdirSync(sampleFolder, { recursive: true });

    // Create valid test skill folder
    fs.writeFileSync(
      path.join(sampleFolder, "skill.yaml"),
      `id: custom.perf-diagnostics
version: 1.0.0
name:
  zh-CN: 前端性能诊断
  en-US: Frontend Performance Diagnostics
description:
  zh-CN: 诊断前端页面加载性能与资源瓶颈
  en-US: Diagnose frontend page load and asset bottlenecks
category: debugging
risk: low
triggers:
  - 前端卡顿
  - 性能分析
  - perf check
tools:
  - localbridge_project_list
  - localbridge_code_diagnostics
workflow:
  - analyze_bundle
  - check_network_waterfall
enabled: true
`,
      "utf-8"
    );

    fs.writeFileSync(
      path.join(sampleFolder, "SKILL.md"),
      `# 前端性能诊断规范
详细说明如何使用 Nexus 进行性能诊断...
`,
      "utf-8"
    );

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

  it("previews a valid folder source correctly before importing", async () => {
    const preview = await importer.previewFolder(sampleFolder, "user");

    expect(preview.valid).toBe(true);
    expect(preview.validationStatus).toBe("valid");
    expect(preview.id).toBe("custom.perf-diagnostics");
    expect(preview.version).toBe("1.0.0");
    expect(preview.name["zh-CN"]).toBe("前端性能诊断");
    expect(preview.toolsCount).toBe(2);
    expect(preview.workflowStepsCount).toBe(2);
    expect(preview.hasConflict).toBe(false);
    expect(preview.validationErrors).toHaveLength(0);
  });

  it("imports a folder into user skills directory and hot-reloads registry", async () => {
    const result = await importer.importFolder({
      sourcePath: sampleFolder,
      target: "user",
    });

    expect(result.success).toBe(true);
    expect(result.skill?.id).toBe("custom.perf-diagnostics");
    expect(result.skill?.source).toBe("user");

    // Check files on disk
    const targetFolder = path.join(userDir, "custom.perf-diagnostics");
    expect(fs.existsSync(path.join(targetFolder, "skill.yaml"))).toBe(true);
    expect(fs.existsSync(path.join(targetFolder, "SKILL.md"))).toBe(true);

    // Check registry availability
    const skill = registry.getSkill("custom.perf-diagnostics");
    expect(skill).toBeDefined();
    expect(skill?.id).toBe("custom.perf-diagnostics");
    expect(skill?.source).toBe("user");
    expect(skill?.enabled).toBe(true);
  });

  it("imports a folder into project skills directory and scopes to project", async () => {
    const result = await importer.importFolder({
      sourcePath: sampleFolder,
      target: "project",
      projectId: "proj-1",
      projectRoot: projectDir,
    });

    expect(result.success).toBe(true);
    expect(result.skill?.source).toBe("project");
    expect(result.skill?.id).toBe("custom.perf-diagnostics");

    // Check files in project .nexus/skills
    const projectSkillDir = path.join(projectDir, ".nexus", "skills", "custom.perf-diagnostics");
    expect(fs.existsSync(path.join(projectSkillDir, "skill.yaml"))).toBe(true);
    expect(fs.existsSync(path.join(projectSkillDir, "SKILL.md"))).toBe(true);

    // Check registry with project scope
    const skill = registry.getSkill("custom.perf-diagnostics", "proj-1");
    expect(skill).toBeDefined();
    expect(skill?.source).toBe("project");
    expect(skill?.projectId).toBe("proj-1");

    // Inaccessible from another project
    const otherSkill = registry.getSkill("custom.perf-diagnostics", "other-proj");
    expect(otherSkill).toBeNull();
  });
});
