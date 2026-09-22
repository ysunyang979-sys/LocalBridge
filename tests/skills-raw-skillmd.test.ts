import { describe, expect, it, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { SkillValidator } from "../apps/server/src/skills/skill-validator.js";
import { SkillLoader } from "../apps/server/src/skills/skill-loader.js";
import { SkillRegistry } from "../apps/server/src/skills/skill-registry.js";
import { SkillImporter } from "../apps/server/src/skills/skill-importer.js";
import { MCP_TOOL_SCOPE } from "../apps/server/src/mcp/scope-policy.js";

describe("skills-raw-skillmd: SKILL.md Priority as Primary Document", () => {
  let tmpRoot: string;
  let userDir: string;
  let importer: SkillImporter;
  let registry: SkillRegistry;
  const activeTools = new Set(Object.keys(MCP_TOOL_SCOPE));

  beforeEach(() => {
    tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "nexus-raw-skillmd-"));
    userDir = path.join(tmpRoot, "user-skills");
    fs.mkdirSync(userDir, { recursive: true });

    const validator = new SkillValidator(activeTools);
    const loader = new SkillLoader(validator, { userDir });
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

  it("prioritizes SKILL.md over README.md for primary document and name resolution", async () => {
    const srcFolder = path.join(tmpRoot, "priority-test");
    fs.mkdirSync(srcFolder, { recursive: true });
    fs.writeFileSync(
      path.join(srcFolder, "SKILL.md"),
      "# Primary Skill Title\n\nDetailed operational instructions from SKILL.md."
    );
    fs.writeFileSync(
      path.join(srcFolder, "README.md"),
      "# Secondary Readme Title\n\nGeneral overview from README.md."
    );

    const preview = await importer.previewFolder(srcFolder, "user");
    expect(preview.primaryDocument).toBe("SKILL.md");
    expect(preview.name["zh-CN"]).toBe("Primary Skill Title");
    expect(preview.markdownContent).toContain("Detailed operational instructions from SKILL.md.");

    const result = await importer.importFolder({
      sourcePath: srcFolder,
      target: "user",
    });

    expect(result.success).toBe(true);
    const skill = registry.getSkill("user.priority-test");
    expect(skill).toBeDefined();
    expect(skill?.primaryDocument).toBe("SKILL.md");
    expect(skill?.instructions).toContain("Detailed operational instructions from SKILL.md.");
  });
});
