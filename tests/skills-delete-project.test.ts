import { describe, expect, it, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { SkillValidator } from "../apps/server/src/skills/skill-validator.js";
import { SkillLoader } from "../apps/server/src/skills/skill-loader.js";
import { SkillRegistry } from "../apps/server/src/skills/skill-registry.js";
import { SkillImporter } from "../apps/server/src/skills/skill-importer.js";
import { MCP_TOOL_SCOPE } from "../apps/server/src/mcp/scope-policy.js";

describe("Skills Deletion: Project Skill", () => {
  let tmpRoot: string;
  let projectDir: string;
  let importer: SkillImporter;
  let registry: SkillRegistry;
  const activeTools = new Set(Object.keys(MCP_TOOL_SCOPE));

  beforeEach(() => {
    tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "nexus-skill-del-proj-"));
    projectDir = path.join(tmpRoot, "my-repo");
    const projSkillDir = path.join(projectDir, ".nexus", "skills", "proj.ci-helper");
    fs.mkdirSync(projSkillDir, { recursive: true });

    fs.writeFileSync(
      path.join(projSkillDir, "skill.yaml"),
      `id: proj.ci-helper
version: 1.0.0
name: { zh-CN: CI助手, en-US: CI Helper }
description: { zh-CN: 项目专用CI, en-US: Project CI }
category: runtime
risk: low
triggers: ["ci"]
tools: ["localbridge_project_list"]
workflow: ["step1"]
`
    );
    fs.writeFileSync(path.join(projSkillDir, "SKILL.md"), "# CI Helper");

    const validator = new SkillValidator(activeTools);
    const loader = new SkillLoader(validator, {
      projectDirs: [{ projectId: "proj-repo", rootPath: projectDir }],
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

  it("deletes a project-scoped skill and removes files from .nexus/skills", async () => {
    const skillPath = path.join(projectDir, ".nexus", "skills", "proj.ci-helper");
    expect(fs.existsSync(skillPath)).toBe(true);
    expect(registry.getSkill("proj.ci-helper", "proj-repo")).toBeDefined();

    const result = await importer.deleteSkill({
      skillId: "proj.ci-helper",
      target: "project",
      projectId: "proj-repo",
      projectRoot: projectDir,
    });

    expect(result.success).toBe(true);
    expect(result.skillId).toBe("proj.ci-helper");
    expect(fs.existsSync(skillPath)).toBe(false);

    // Verify registry state
    expect(registry.getSkill("proj.ci-helper", "proj-repo")).toBeNull();
  });
});
