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

describe("skills-raw-import-zip: Raw User Skill Import from ZIP", () => {
  let tmpRoot: string;
  let userDir: string;
  let importer: SkillImporter;
  let registry: SkillRegistry;
  const activeTools = new Set(Object.keys(MCP_TOOL_SCOPE));

  beforeEach(() => {
    tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "nexus-raw-zip-test-"));
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

  it("previews and imports a raw user skill from a ZIP archive without skill.yaml", async () => {
    const zip = createZip([
      {
        path: "pwn-tools-main/SKILL.md",
        data: "# Binary Exploitation Guide\n\nMethodologies for memory corruption and ROP chain generation.",
      },
      {
        path: "pwn-tools-main/docs/rop.md",
        data: "# ROP Gadgets\n\nFinding gadgets with ROPgadget or ropper.",
      },
      {
        path: "pwn-tools-main/helper.py",
        data: "print('malware or exploit')",
      },
    ]);

    const preview = await importer.previewZip(zip, "user");
    expect(preview.valid).toBe(true);
    expect(preview.skillType).toBe("raw");
    expect(preview.id).toBe("user.pwn-tools-main");
    expect(preview.name["zh-CN"]).toBe("Binary Exploitation Guide");
    expect(preview.primaryDocument).toBe("SKILL.md");
    expect(preview.archiveTotalExecutables).toBe(1);

    const result = await importer.importZip({
      zipBufferOrPath: zip,
      target: "user",
    });

    expect(result.success).toBe(true);
    expect(result.skill).toBeDefined();
    expect(result.skill?.id).toBe("user.pwn-tools-main");
    expect(result.skill?.type).toBe("raw");

    // Check on-disk persistence
    const installedDir = path.join(userDir, "user.pwn-tools-main");
    expect(fs.existsSync(installedDir)).toBe(true);
    expect(fs.existsSync(path.join(installedDir, "raw-skill.json"))).toBe(true);
    expect(fs.existsSync(path.join(installedDir, "SKILL.md"))).toBe(true);
    expect(fs.existsSync(path.join(installedDir, "docs", "rop.md"))).toBe(true);
    // Executable helper.py should be excluded
    expect(fs.existsSync(path.join(installedDir, "helper.py"))).toBe(false);

    // Check registry reload
    const fromReg = registry.getSkill("user.pwn-tools-main");
    expect(fromReg).toBeDefined();
    expect(fromReg?.type).toBe("raw");
    expect(fromReg?.instructions).toContain("Binary Exploitation Guide");
  });
});
