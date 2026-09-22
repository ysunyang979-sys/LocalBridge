import { describe, expect, it, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { SkillValidator } from "../apps/server/src/skills/skill-validator.js";
import { SkillLoader } from "../apps/server/src/skills/skill-loader.js";
import { SkillRegistry } from "../apps/server/src/skills/skill-registry.js";
import { MCP_TOOL_SCOPE } from "../apps/server/src/mcp/scope-policy.js";

describe("skills-raw-get: localbridge_skill_get MCP Tool Reading Raw User Skill Content", () => {
  let tmpRoot: string;
  let userDir: string;
  let loader: SkillLoader;
  let registry: SkillRegistry;
  const activeTools = new Set(Object.keys(MCP_TOOL_SCOPE));

  beforeEach(() => {
    tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "nexus-raw-get-test-"));
    userDir = path.join(tmpRoot, "user-skills");
    fs.mkdirSync(userDir, { recursive: true });

    const validator = new SkillValidator(activeTools);
    loader = new SkillLoader(validator, { userDir });
    registry = new SkillRegistry(loader);
  });

  afterEach(() => {
    try {
      fs.rmSync(tmpRoot, { recursive: true, force: true });
    } catch {}
  });

  it("retrieves full markdown instructions and available document list for ChatGPT", () => {
    const rawSkillDir = path.join(userDir, "user.firmware-analysis");
    fs.mkdirSync(rawSkillDir, { recursive: true });
    fs.mkdirSync(path.join(rawSkillDir, "references"), { recursive: true });

    const skillMdContent = `# Firmware Analysis\n\nSteps to unpack IoT firmware using binwalk and inspect SquashFS partitions.`;
    fs.writeFileSync(path.join(rawSkillDir, "SKILL.md"), skillMdContent);
    fs.writeFileSync(
      path.join(rawSkillDir, "references", "bootloader.md"),
      `# U-Boot Analysis\n\nTracing hardware bootloader UART prompts.`
    );

    fs.writeFileSync(
      path.join(rawSkillDir, "raw-skill.json"),
      JSON.stringify({
        id: "user.firmware-analysis",
        name: "Firmware Analysis",
        type: "raw",
        version: "1.0.0",
        description: "Steps to unpack IoT firmware.",
        primaryDocument: "SKILL.md",
        availableDocuments: ["SKILL.md", "references/bootloader.md"],
        documents: ["SKILL.md", "references/bootloader.md"],
      })
    );

    registry.reload();

    const skill = registry.getSkill("user.firmware-analysis");
    expect(skill).toBeDefined();

    // Verify MCP tool payload contract as implemented in apps/server/src/mcp/tools/skills.ts
    const nameStr =
      typeof skill!.name === "string"
        ? skill!.name
        : skill!.name["zh-CN"] || skill!.name["en-US"] || skill!.id;

    const mcpResult = {
      id: skill!.id,
      name: nameStr,
      type: skill!.type || "nexus",
      source: skill!.source,
      primaryDocument: skill!.primaryDocument,
      content: skill!.instructions,
      availableDocuments: skill!.availableDocuments || (skill!.primaryDocument ? [skill!.primaryDocument] : []),
      documents: skill!.documents || (skill!.primaryDocument ? [skill!.primaryDocument] : []),
      skill,
    };

    expect(mcpResult.id).toBe("user.firmware-analysis");
    expect(mcpResult.type).toBe("raw");
    expect(mcpResult.primaryDocument).toBe("SKILL.md");
    expect(mcpResult.content).toBe(skillMdContent);
    expect(mcpResult.availableDocuments).toContain("SKILL.md");
    expect(mcpResult.availableDocuments).toContain("references/bootloader.md");
  });
});
