import { describe, expect, it, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { SkillValidator } from "../apps/server/src/skills/skill-validator.js";
import { SkillLoader } from "../apps/server/src/skills/skill-loader.js";
import { SkillRegistry } from "../apps/server/src/skills/skill-registry.js";
import { SkillImporter } from "../apps/server/src/skills/skill-importer.js";
import { MCP_TOOL_SCOPE } from "../apps/server/src/mcp/scope-policy.js";

describe("skills-raw-readme: README.md as Primary Document Fallback", () => {
  let tmpRoot: string;
  let userDir: string;
  let importer: SkillImporter;
  let registry: SkillRegistry;
  const activeTools = new Set(Object.keys(MCP_TOOL_SCOPE));

  beforeEach(() => {
    tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "nexus-raw-readme-"));
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

  it("uses README.md when SKILL.md is not present", async () => {
    const srcFolder = path.join(tmpRoot, "github-repo-readme-only");
    fs.mkdirSync(srcFolder, { recursive: true });
    fs.writeFileSync(
      path.join(srcFolder, "README.md"),
      "# Awesome Security Toolkit\n\nA curated list of awesome security and pentest tools."
    );

    const preview = await importer.previewFolder(srcFolder, "user");
    expect(preview.valid).toBe(true);
    expect(preview.skillType).toBe("raw");
    expect(preview.primaryDocument).toBe("README.md");
    expect(preview.name["zh-CN"]).toBe("Awesome Security Toolkit");

    const result = await importer.importFolder({
      sourcePath: srcFolder,
      target: "user",
    });

    expect(result.success).toBe(true);
    const skill = registry.getSkill("user.github-repo-readme-only");
    expect(skill).toBeDefined();
    expect(skill?.primaryDocument).toBe("README.md");
    expect(skill?.instructions).toContain("A curated list of awesome security and pentest tools.");
  });
});
