import { describe, expect, it, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { SkillValidator } from "../apps/server/src/skills/skill-validator.js";
import { SkillLoader } from "../apps/server/src/skills/skill-loader.js";
import { SkillRegistry } from "../apps/server/src/skills/skill-registry.js";
import { MCP_TOOL_SCOPE } from "../apps/server/src/mcp/scope-policy.js";

describe("skills-collection-mcp-list: Collection-aware Skill Listing", () => {
  let tmpRoot: string;
  let userDir: string;
  let loader: SkillLoader;
  let registry: SkillRegistry;
  const activeTools = new Set(Object.keys(MCP_TOOL_SCOPE));

  beforeEach(() => {
    tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "nexus-coll-list-test-"));
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

  it("lists all enabled child skills belonging to a specific collection with summary metadata", () => {
    const collId = "collection.reverse-skill-main";
    const collName = "reverse-skill-main";

    // Skill 1 in collection
    const skillDir1 = path.join(userDir, "user.competition-agent-cloud");
    fs.mkdirSync(skillDir1, { recursive: true });
    fs.writeFileSync(path.join(skillDir1, "SKILL.md"), "# Agent Cloud\nAnalyze prompt injection and cloud boundaries.");
    fs.writeFileSync(
      path.join(skillDir1, "raw-skill.json"),
      JSON.stringify({
        id: "user.competition-agent-cloud",
        name: "competition-agent-cloud",
        type: "raw",
        collectionId: collId,
        collectionName: collName,
        enabled: true,
        summary: "Analyze prompt injection and cloud boundaries.",
        keywords: ["agent", "cloud", "prompt-injection"],
        primaryDocument: "SKILL.md",
      })
    );

    // Skill 2 in collection
    const skillDir2 = path.join(userDir, "user.competition-android-hooking");
    fs.mkdirSync(skillDir2, { recursive: true });
    fs.writeFileSync(path.join(skillDir2, "SKILL.md"), "# Android Hooking\nFrida tracing and request signing.");
    fs.writeFileSync(
      path.join(skillDir2, "raw-skill.json"),
      JSON.stringify({
        id: "user.competition-android-hooking",
        name: "competition-android-hooking",
        type: "raw",
        collectionId: collId,
        collectionName: collName,
        enabled: true,
        summary: "Frida tracing and request signing.",
        keywords: ["android", "hooking", "frida"],
        primaryDocument: "SKILL.md",
      })
    );

    // Skill 3 in another collection
    const skillDir3 = path.join(userDir, "user.other-skill");
    fs.mkdirSync(skillDir3, { recursive: true });
    fs.writeFileSync(path.join(skillDir3, "SKILL.md"), "# Other Skill");
    fs.writeFileSync(
      path.join(skillDir3, "raw-skill.json"),
      JSON.stringify({
        id: "user.other-skill",
        name: "other-skill",
        type: "raw",
        collectionId: "collection.other-collection",
        collectionName: "other-collection",
        enabled: true,
      })
    );

    registry.reload();

    const collSkills = registry.listSkills({ collectionId: collId, enabledOnly: true });
    expect(collSkills.length).toBe(2);
    expect(collSkills.map((s) => s.id)).toEqual([
      "user.competition-agent-cloud",
      "user.competition-android-hooking",
    ]);

    const collections = registry.listCollections();
    expect(collections.length).toBe(2);
    const revColl = registry.getCollection(collId);
    expect(revColl).toBeDefined();
    expect(revColl?.id).toBe(collId);
    expect(revColl?.name).toBe(collName);
    expect(revColl?.skillsCount).toBe(2);
    expect(revColl?.enabledSkillsCount).toBe(2);
  });
});
