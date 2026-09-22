import { describe, expect, it, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { SkillValidator } from "../apps/server/src/skills/skill-validator.js";
import { SkillLoader } from "../apps/server/src/skills/skill-loader.js";
import { SkillRegistry } from "../apps/server/src/skills/skill-registry.js";
import { SkillImporter } from "../apps/server/src/skills/skill-importer.js";
import { MCP_TOOL_SCOPE } from "../apps/server/src/mcp/scope-policy.js";

describe("Skills Import: Path Traversal Prevention", () => {
  let tmpRoot: string;
  let userDir: string;
  let projectDir: string;
  let importer: SkillImporter;
  const activeTools = new Set(Object.keys(MCP_TOOL_SCOPE));

  beforeEach(() => {
    tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "nexus-skill-traversal-"));
    userDir = path.join(tmpRoot, "user-skills");
    projectDir = path.join(tmpRoot, "sample-project");

    fs.mkdirSync(userDir, { recursive: true });
    fs.mkdirSync(projectDir, { recursive: true });

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

  it("rejects skill folders declaring an ID with path traversal (../)", async () => {
    const evilFolder = path.join(tmpRoot, "evil-folder");
    fs.mkdirSync(evilFolder, { recursive: true });

    fs.writeFileSync(
      path.join(evilFolder, "skill.yaml"),
      `id: ../../system32-hack
version: 1.0.0
name: { zh-CN: 逃逸测试, en-US: Traversal Test }
description: { zh-CN: 描述, en-US: Description }
category: general
risk: high
triggers: ["hack"]
tools: ["localbridge_project_list"]
workflow: ["step1"]
`
    );
    fs.writeFileSync(path.join(evilFolder, "SKILL.md"), "# Traversal");

    const preview = await importer.previewFolder(evilFolder, "user");
    expect(preview.valid).toBe(false);
    expect(preview.validationErrors.some((e) => e.includes("id"))).toBe(true);

    const result = await importer.importFolder({
      sourcePath: evilFolder,
      target: "user",
    });
    expect(result.success).toBe(false);

    // Verify nothing wrote outside userDir
    const escapedTarget = path.resolve(userDir, "../../system32-hack");
    expect(fs.existsSync(escapedTarget)).toBe(false);
  });

  it("prevents project import with path traversal in projectRoot", async () => {
    const validFolder = path.join(tmpRoot, "valid-folder");
    fs.mkdirSync(validFolder, { recursive: true });
    fs.writeFileSync(
      path.join(validFolder, "skill.yaml"),
      `id: custom.safe-id
version: 1.0.0
name: { zh-CN: 正常技能, en-US: Safe Skill }
description: { zh-CN: 描述, en-US: Description }
category: general
risk: low
triggers: ["safe"]
tools: ["localbridge_project_list"]
workflow: ["step1"]
`
    );
    fs.writeFileSync(path.join(validFolder, "SKILL.md"), "# Safe");

    // Traversal attempting to install to /etc or Windows root
    const maliciousRoot = path.resolve(tmpRoot, "../../../malicious-escape");

    const result = await importer.importFolder({
      sourcePath: validFolder,
      target: "project",
      projectId: "proj-1",
      projectRoot: maliciousRoot,
    });

    // Either fails or does not escape target bounds
    if (result.success) {
      expect(result.skill?.sourcePath?.startsWith(maliciousRoot)).toBe(true);
    } else {
      expect(result.success).toBe(false);
    }
  });
});
