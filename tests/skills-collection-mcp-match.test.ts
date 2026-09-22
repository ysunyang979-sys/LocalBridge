import { describe, expect, it, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { SkillValidator } from "../apps/server/src/skills/skill-validator.js";
import { SkillLoader } from "../apps/server/src/skills/skill-loader.js";
import { SkillRegistry } from "../apps/server/src/skills/skill-registry.js";
import { MCP_TOOL_SCOPE } from "../apps/server/src/mcp/scope-policy.js";

describe("skills-collection-mcp-match: Collection-scoped Skill Matching", () => {
  let tmpRoot: string;
  let userDir: string;
  let loader: SkillLoader;
  let registry: SkillRegistry;
  const activeTools = new Set(Object.keys(MCP_TOOL_SCOPE));

  beforeEach(() => {
    tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "nexus-coll-match-test-"));
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

  it("matches appropriate child skill when scoped to a collectionId", () => {
    const collId = "collection.reverse-skill-main";
    const collName = "reverse-skill-main";

    // Skill 1: Android Hooking
    const skillDir1 = path.join(userDir, "user.competition-android-hooking");
    fs.mkdirSync(skillDir1, { recursive: true });
    fs.writeFileSync(path.join(skillDir1, "SKILL.md"), "# Android Hooking\nFrida hooking and Java method interception.");
    fs.writeFileSync(
      path.join(skillDir1, "raw-skill.json"),
      JSON.stringify({
        id: "user.competition-android-hooking",
        name: "competition-android-hooking",
        type: "raw",
        collectionId: collId,
        collectionName: collName,
        enabled: true,
        summary: "Frida hooking and Java method interception.",
        keywords: ["android", "hooking", "frida", "apk"],
        primaryDocument: "SKILL.md",
      })
    );

    // Skill 2: SSRF Metadata Pivot
    const skillDir2 = path.join(userDir, "user.competition-ssrf-metadata-pivot");
    fs.mkdirSync(skillDir2, { recursive: true });
    fs.writeFileSync(path.join(skillDir2, "SKILL.md"), "# SSRF Metadata Pivot\nCloud metadata extraction via SSRF.");
    fs.writeFileSync(
      path.join(skillDir2, "raw-skill.json"),
      JSON.stringify({
        id: "user.competition-ssrf-metadata-pivot",
        name: "competition-ssrf-metadata-pivot",
        type: "raw",
        collectionId: collId,
        collectionName: collName,
        enabled: true,
        summary: "Cloud metadata extraction via SSRF.",
        keywords: ["ssrf", "metadata", "cloud"],
        primaryDocument: "SKILL.md",
      })
    );

    registry.reload();

    const match = registry.matchSkills("检查 Android App 的 Hook 与逆向逻辑", undefined, undefined, collId);
    expect(match.matched).toBe(true);
    expect(match.primarySkill).toBeDefined();
    expect(match.primarySkill?.skillId).toBe("user.competition-android-hooking");
    expect(match.primarySkill?.collectionId).toBe(collId);
    expect(match.primarySkill?.confidence).toBeGreaterThanOrEqual(0.70);
    expect(match.primarySkill?.reason).toBeDefined();
    expect(match.primarySkill?.reason.length).toBeGreaterThan(5);
  });
});
