import { describe, expect, it, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { SkillValidator } from "../apps/server/src/skills/skill-validator.js";
import { SkillLoader } from "../apps/server/src/skills/skill-loader.js";
import { SkillRegistry } from "../apps/server/src/skills/skill-registry.js";
import { SkillImporter } from "../apps/server/src/skills/skill-importer.js";
import { MCP_TOOL_SCOPE } from "../apps/server/src/mcp/scope-policy.js";

describe("skills-raw-import-folder: Raw User Skill Import from Folder", () => {
  let tmpRoot: string;
  let userDir: string;
  let importer: SkillImporter;
  let registry: SkillRegistry;
  const activeTools = new Set(Object.keys(MCP_TOOL_SCOPE));

  beforeEach(() => {
    tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "nexus-raw-folder-test-"));
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

  it("previews and imports a raw user skill folder without skill.yaml", async () => {
    const srcFolder = path.join(tmpRoot, "android-reverse");
    fs.mkdirSync(srcFolder, { recursive: true });
    fs.writeFileSync(
      path.join(srcFolder, "SKILL.md"),
      "# Android Reverse Engineering\n\nGuide for analyzing APKs using Jadx and Frida."
    );
    fs.mkdirSync(path.join(srcFolder, "references"), { recursive: true });
    fs.writeFileSync(
      path.join(srcFolder, "references", "hooks.md"),
      "# Frida Hooks\n\nSample hook scripts."
    );

    const preview = await importer.previewFolder(srcFolder, "user");
    expect(preview.valid).toBe(true);
    expect(preview.skillType).toBe("raw");
    expect(preview.id).toBe("user.android-reverse");
    expect(preview.primaryDocument).toBe("SKILL.md");
    expect(preview.manifestFound).toBe(false);
    expect(preview.skillDocFound).toBe(true);
    expect(preview.name["zh-CN"]).toBe("Android Reverse Engineering");

    const result = await importer.importFolder({
      sourcePath: srcFolder,
      target: "user",
    });

    expect(result.success).toBe(true);
    expect(result.skill).toBeDefined();
    expect(result.skill?.id).toBe("user.android-reverse");
    expect(result.skill?.type).toBe("raw");

    // Check on-disk persistence
    const installedDir = path.join(userDir, "user.android-reverse");
    expect(fs.existsSync(installedDir)).toBe(true);
    expect(fs.existsSync(path.join(installedDir, "raw-skill.json"))).toBe(true);
    expect(fs.existsSync(path.join(installedDir, "SKILL.md"))).toBe(true);

    const rawMeta = JSON.parse(fs.readFileSync(path.join(installedDir, "raw-skill.json"), "utf-8"));
    expect(rawMeta.type).toBe("raw");
    expect(rawMeta.id).toBe("user.android-reverse");
    expect(rawMeta.primaryDocument).toBe("SKILL.md");

    // Check registry reload
    const fromReg = registry.getSkill("user.android-reverse");
    expect(fromReg).toBeDefined();
    expect(fromReg?.type).toBe("raw");
    expect(fromReg?.instructions).toContain("Android Reverse Engineering");
  });
});
