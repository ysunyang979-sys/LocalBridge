import { describe, expect, it, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { SkillValidator } from "../apps/server/src/skills/skill-validator.js";
import { SkillLoader } from "../apps/server/src/skills/skill-loader.js";
import { SkillRegistry } from "../apps/server/src/skills/skill-registry.js";
import { SkillImporter } from "../apps/server/src/skills/skill-importer.js";
import { MCP_TOOL_SCOPE } from "../apps/server/src/mcp/scope-policy.js";

describe("skills-raw-no-manifest: Import without skill.yaml Does Not Require Manifest", () => {
  let tmpRoot: string;
  let userDir: string;
  let importer: SkillImporter;
  let registry: SkillRegistry;
  const activeTools = new Set(Object.keys(MCP_TOOL_SCOPE));

  beforeEach(() => {
    tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "nexus-raw-no-manifest-"));
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

  it("does not reject folder lacking skill.yaml with MANIFEST_MISSING", async () => {
    const srcFolder = path.join(tmpRoot, "no-manifest-skill");
    fs.mkdirSync(srcFolder, { recursive: true });
    fs.writeFileSync(
      path.join(srcFolder, "SKILL.md"),
      "# No Manifest Needed\n\nDirect Markdown instructions for LLM."
    );

    // Make sure skill.yaml does NOT exist
    expect(fs.existsSync(path.join(srcFolder, "skill.yaml"))).toBe(false);

    const preview = await importer.previewFolder(srcFolder, "user");
    expect(preview.valid).toBe(true);
    expect(preview.manifestFound).toBe(false);
    expect(preview.skillType).toBe("raw");

    const result = await importer.importFolder({
      sourcePath: srcFolder,
      target: "user",
    });

    expect(result.success).toBe(true);
    expect(result.code).toBeUndefined();
    expect(result.skill?.id).toBe("user.no-manifest-skill");
    expect(result.skill?.type).toBe("raw");
  });
});
