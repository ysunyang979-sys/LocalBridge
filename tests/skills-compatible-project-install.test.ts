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

describe("Skills Compatible: Project-Scoped Install", () => {
  let tmpRoot: string;
  let userDir: string;
  let projectDir: string;
  let importer: SkillImporter;
  let registry: SkillRegistry;
  const activeTools = new Set(Object.keys(MCP_TOOL_SCOPE));

  beforeEach(() => {
    tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "nexus-compat-project-install-"));
    userDir = path.join(tmpRoot, "user-skills");
    projectDir = path.join(tmpRoot, "test-project");
    fs.mkdirSync(userDir, { recursive: true });
    fs.mkdirSync(projectDir, { recursive: true });

    const validator = new SkillValidator(activeTools);
    const loader = new SkillLoader(validator, {
      userDir,
      projectDirs: [{ projectId: "proj-alpha", rootPath: projectDir }],
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

  it("installs compatible skill into <projectRoot>/.nexus/skills/<id>", async () => {
    const zip = createZip([
      { path: "proj-repo/SKILL.md", data: "# Project Test Tool" },
    ]);

    const customYaml = `id: proj.test-tool
version: 1.0.0
name: { zh-CN: 项目工具, en-US: Project Tool }
description: { zh-CN: 描述, en-US: Description }
category: testing
risk: low
triggers: ["test"]
tools: ["localbridge_project_list"]
workflow: ["inspect"]
enabled: true
`;

    const result = await importer.importZip({
      zipBufferOrPath: zip,
      target: "project",
      projectId: "proj-alpha",
      projectRoot: projectDir,
      customYaml,
    });

    expect(result.success).toBe(true);
    expect(result.skill?.source).toBe("project");

    const projectSkillDir = path.join(projectDir, ".nexus", "skills", "proj.test-tool");
    expect(fs.existsSync(path.join(projectSkillDir, "skill.yaml"))).toBe(true);
    expect(fs.existsSync(path.join(projectSkillDir, "SKILL.md"))).toBe(true);

    const skill = registry.getSkill("proj.test-tool", "proj-alpha");
    expect(skill).toBeDefined();
    expect(skill?.source).toBe("project");
  });
});
