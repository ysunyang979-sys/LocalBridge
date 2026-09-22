import { describe, expect, it, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { SkillValidator } from "../apps/server/src/skills/skill-validator.js";
import { SkillLoader } from "../apps/server/src/skills/skill-loader.js";
import { SkillRegistry } from "../apps/server/src/skills/skill-registry.js";
import { MCP_TOOL_SCOPE } from "../apps/server/src/mcp/scope-policy.js";

describe("skills-raw-list: localbridge_skill_list MCP Handling for Raw Skills", () => {
  let tmpRoot: string;
  let userDir: string;
  let loader: SkillLoader;
  let registry: SkillRegistry;
  const activeTools = new Set(Object.keys(MCP_TOOL_SCOPE));

  beforeEach(() => {
    tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "nexus-raw-list-test-"));
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

  it("lists raw skills alongside native skills, respecting source filters", () => {
    const rawSkillDir = path.join(userDir, "user.web-sec");
    fs.mkdirSync(rawSkillDir, { recursive: true });
    fs.writeFileSync(path.join(rawSkillDir, "SKILL.md"), "# Web Security Guide\nXSS and CSRF testing.");
    fs.writeFileSync(
      path.join(rawSkillDir, "raw-skill.json"),
      JSON.stringify({
        id: "user.web-sec",
        name: "Web Security Guide",
        type: "raw",
        version: "1.0.0",
        description: "XSS and CSRF testing.",
        primaryDocument: "SKILL.md",
      })
    );

    registry.reload();

    const userSkills = registry.listSkills({ source: "user" });
    const match = userSkills.find((s) => s.id === "user.web-sec");
    expect(match).toBeDefined();
    expect(match?.type).toBe("raw");
    expect(match?.source).toBe("user");
    expect(match?.tools).toEqual([]);
    expect(match?.workflow).toEqual([]);
    expect(match?.primaryDocument).toBe("SKILL.md");
  });
});
