import { describe, expect, it, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { SkillValidator } from "../apps/server/src/skills/skill-validator.js";
import { SkillLoader } from "../apps/server/src/skills/skill-loader.js";
import { SkillRegistry } from "../apps/server/src/skills/skill-registry.js";
import { MCP_TOOL_SCOPE } from "../apps/server/src/mcp/scope-policy.js";
import { registerSkillTools } from "../apps/server/src/mcp/tools/skills.js";

describe("skills-collection-enabled-filter: Enabled Filtering for Collection Skills", () => {
  let tmpRoot: string;
  let userDir: string;
  let loader: SkillLoader;
  let registry: SkillRegistry;
  let tools: Map<string, Function>;
  const activeTools = new Set(Object.keys(MCP_TOOL_SCOPE));

  beforeEach(() => {
    tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "nexus-enabled-filter-test-"));
    userDir = path.join(tmpRoot, "user-skills");
    fs.mkdirSync(userDir, { recursive: true });

    const validator = new SkillValidator(activeTools);
    loader = new SkillLoader(validator, { userDir });
    registry = new SkillRegistry(loader);

    tools = new Map();
    const mockServer: any = {
      registerTool: (name: string, _schema: any, handler: Function) => {
        tools.set(name, handler);
      },
    };
    const mockContext: any = {
      skillRegistry: registry,
      logAudit: () => {},
      getIntelligenceStatus: () => ({ status: "disabled" }),
    };
    registerSkillTools(mockServer, mockContext);
  });

  afterEach(() => {
    try {
      fs.rmSync(tmpRoot, { recursive: true, force: true });
    } catch {}
  });

  it("accurately filters enabled vs disabled skills in collection and updates collection statistics", async () => {
    const collId = "collection.reverse-skill-main";
    const collName = "reverse-skill-main";

    // Create 3 skills in collection: 2 enabled, 1 disabled
    for (let i = 1; i <= 3; i++) {
      const skillId = `user.skill-${i}`;
      const skillDir = path.join(userDir, skillId);
      fs.mkdirSync(skillDir, { recursive: true });
      fs.writeFileSync(path.join(skillDir, "SKILL.md"), `# Skill ${i}`);
      fs.writeFileSync(
        path.join(skillDir, "raw-skill.json"),
        JSON.stringify({
          id: skillId,
          name: `skill-${i}`,
          type: "raw",
          collectionId: collId,
          collectionName: collName,
          enabled: i !== 3, // skill-3 is disabled initially
          summary: `Summary of skill ${i}`,
        })
      );
    }

    registry.reload();

    // Verify listCollections statistics
    const coll = registry.getCollection(collId);
    expect(coll).toBeDefined();
    expect(coll?.skillsCount).toBe(3);
    expect(coll?.enabledSkillsCount).toBe(2);

    // Call localbridge_skill_list with enabledOnly = true (default)
    const listTool = tools.get("localbridge_skill_list");
    const resEnabledOnly = await listTool!({ collectionId: collId, enabledOnly: true });
    const parsedEnabledOnly = JSON.parse(resEnabledOnly.content[0].text);
    expect(parsedEnabledOnly.count).toBe(2);
    expect(parsedEnabledOnly.skills.map((s: any) => s.id)).toEqual([
      "user.skill-1",
      "user.skill-2",
    ]);

    // Call localbridge_skill_list with enabledOnly = false
    const resAll = await listTool!({ collectionId: collId, enabledOnly: false });
    const parsedAll = JSON.parse(resAll.content[0].text);
    expect(parsedAll.count).toBe(3);

    // Toggle skill-2 to disabled via registry
    const toggled = registry.toggleSkill("user.skill-2", false);
    expect(toggled).toBe(true);

    const updatedColl = registry.getCollection(collId);
    expect(updatedColl?.enabledSkillsCount).toBe(1);

    const resAfterToggle = await listTool!({ collectionId: collId, enabledOnly: true });
    const parsedAfterToggle = JSON.parse(resAfterToggle.content[0].text);
    expect(parsedAfterToggle.count).toBe(1);
    expect(parsedAfterToggle.skills[0].id).toBe("user.skill-1");
  });
});
