import { describe, expect, it, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { SkillValidator } from "../apps/server/src/skills/skill-validator.js";
import { SkillLoader } from "../apps/server/src/skills/skill-loader.js";
import { SkillRegistry } from "../apps/server/src/skills/skill-registry.js";
import { SkillImporter } from "../apps/server/src/skills/skill-importer.js";
import { MCP_TOOL_SCOPE } from "../apps/server/src/mcp/scope-policy.js";

describe("skills-raw-unknown-tool-does-not-block: Unknown Tool Mentions in Markdown Do Not Block Import", () => {
  let tmpRoot: string;
  let userDir: string;
  let importer: SkillImporter;
  let registry: SkillRegistry;
  const activeTools = new Set(Object.keys(MCP_TOOL_SCOPE));

  beforeEach(() => {
    tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "nexus-raw-unknown-tools-"));
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

  it("imports raw skill mentioning nonexistent tools without '未知 MCP Tool' rejection", async () => {
    const srcFolder = path.join(tmpRoot, "ast-grep-skill");
    fs.mkdirSync(srcFolder, { recursive: true });
    fs.writeFileSync(
      path.join(srcFolder, "SKILL.md"),
      `# AST Pattern Search Skill

To use this skill, invoke the command line:
\`localbridge_ast_grep_search\` or \`frida -U -f com.example\` or \`adb shell\`.
`
    );

    // Verify activeTools does NOT contain localbridge_ast_grep_search
    expect(activeTools.has("localbridge_ast_grep_search")).toBe(false);

    // Raw preview should NOT error on unknown tools
    const preview = await importer.previewFolder(srcFolder, "user");
    expect(preview.valid).toBe(true);
    expect(preview.validationErrors.some((e) => e.includes("未知 MCP Tool"))).toBe(false);

    // Import should succeed smoothly
    const result = await importer.importFolder({
      sourcePath: srcFolder,
      target: "user",
    });

    expect(result.success).toBe(true);
    const skill = registry.getSkill("user.ast-grep-skill");
    expect(skill).toBeDefined();
    expect(skill?.tools).toEqual([]); // Raw skills declare NO tools
    expect(skill?.instructions).toContain("localbridge_ast_grep_search");
  });
});
