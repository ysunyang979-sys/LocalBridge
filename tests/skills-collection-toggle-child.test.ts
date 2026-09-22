import { describe, expect, it, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { SkillValidator } from "../apps/server/src/skills/skill-validator.js";
import { SkillLoader } from "../apps/server/src/skills/skill-loader.js";
import { SkillRegistry } from "../apps/server/src/skills/skill-registry.js";
import { MCP_TOOL_SCOPE } from "../apps/server/src/mcp/scope-policy.js";

describe("skills-collection-toggle-child: Granular Child Skill Toggle", () => {
  let tmpRoot: string;
  let userDir: string;
  let registry: SkillRegistry;
  const activeTools = new Set(Object.keys(MCP_TOOL_SCOPE));

  beforeEach(() => {
    tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "nexus-toggle-child-test-"));
    userDir = path.join(tmpRoot, "user-skills");
    fs.mkdirSync(userDir, { recursive: true });

    // Child 1
    const child1 = path.join(userDir, "user.cand-1");
    fs.mkdirSync(child1, { recursive: true });
    fs.writeFileSync(path.join(child1, "SKILL.md"), "# Cand 1");
    fs.writeFileSync(
      path.join(child1, "raw-skill.json"),
      JSON.stringify({
        id: "user.cand-1",
        name: "Candidate 1",
        type: "raw",
        enabled: true,
        collectionId: "collection.group",
        collectionName: "Group",
      })
    );

    // Child 2
    const child2 = path.join(userDir, "user.cand-2");
    fs.mkdirSync(child2, { recursive: true });
    fs.writeFileSync(path.join(child2, "SKILL.md"), "# Cand 2");
    fs.writeFileSync(
      path.join(child2, "raw-skill.json"),
      JSON.stringify({
        id: "user.cand-2",
        name: "Candidate 2",
        type: "raw",
        enabled: true,
        collectionId: "collection.group",
        collectionName: "Group",
      })
    );

    const validator = new SkillValidator(activeTools);
    const loader = new SkillLoader(validator, { userDir });
    registry = new SkillRegistry(loader);
  });

  afterEach(() => {
    try {
      fs.rmSync(tmpRoot, { recursive: true, force: true });
    } catch {}
  });

  it("toggles child 1 to disabled while keeping child 2 enabled", () => {
    const s1Before = registry.getSkill("user.cand-1");
    const s2Before = registry.getSkill("user.cand-2");
    expect(s1Before?.enabled).toBe(true);
    expect(s2Before?.enabled).toBe(true);

    const success = registry.toggleSkill("user.cand-1", false);
    expect(success).toBe(true);

    const s1After = registry.getSkill("user.cand-1");
    const s2After = registry.getSkill("user.cand-2");
    expect(s1After?.enabled).toBe(false);
    expect(s2After?.enabled).toBe(true);

    // Verify raw-skill.json on disk
    const raw1 = JSON.parse(
      fs.readFileSync(path.join(userDir, "user.cand-1", "raw-skill.json"), "utf-8")
    );
    expect(raw1.enabled).toBe(false);

    const raw2 = JSON.parse(
      fs.readFileSync(path.join(userDir, "user.cand-2", "raw-skill.json"), "utf-8")
    );
    expect(raw2.enabled).toBe(true);
  });
});
