import { describe, expect, it, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { SkillValidator } from "../apps/server/src/skills/skill-validator.js";
import { SkillLoader } from "../apps/server/src/skills/skill-loader.js";
import { SkillRegistry } from "../apps/server/src/skills/skill-registry.js";
import { MCP_TOOL_SCOPE } from "../apps/server/src/mcp/scope-policy.js";
import { registerSkillTools } from "../apps/server/src/mcp/tools/skills.js";

describe("skills-collection-disabled-no-match: Disabled Skills Never Auto-Matched", () => {
  let tmpRoot: string;
  let userDir: string;
  let loader: SkillLoader;
  let registry: SkillRegistry;
  let tools: Map<string, Function>;
  const activeTools = new Set(Object.keys(MCP_TOOL_SCOPE));

  beforeEach(() => {
    tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "nexus-disabled-no-match-test-"));
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

  it("never automatically matches a disabled skill via localbridge_skill_match", async () => {
    const collId = "collection.reverse-skill-main";
    const collName = "reverse-skill-main";

    // competition-android-hooking is DISABLED
    const skillDir = path.join(userDir, "user.competition-android-hooking");
    fs.mkdirSync(skillDir, { recursive: true });
    fs.writeFileSync(path.join(skillDir, "SKILL.md"), "# Android Hooking\nFrida hooking and Java method interception.");
    fs.writeFileSync(
      path.join(skillDir, "raw-skill.json"),
      JSON.stringify({
        id: "user.competition-android-hooking",
        name: "competition-android-hooking",
        type: "raw",
        collectionId: collId,
        collectionName: collName,
        enabled: false, // DISABLED
        summary: "Frida hooking and Java method interception.",
        keywords: ["android", "hooking", "frida", "apk"],
        primaryDocument: "SKILL.md",
      })
    );

    registry.reload();

    const matchTool = tools.get("localbridge_skill_match");
    expect(matchTool).toBeDefined();

    // Query for Android hooking
    const res = await matchTool!({
      query: "帮我排查 Android App 的 Hook 与逆向逻辑",
      collectionId: collId,
    });

    const parsed = JSON.parse(res.content[0].text);
    // Must NOT match disabled skill
    expect(parsed.matched).toBe(false);
    expect(parsed.primarySkill).toBeUndefined();
    expect(parsed.matchedSkill).toBeNull();
  });

  it("allows explicit reading of a disabled skill via localbridge_skill_get with enabled: false", async () => {
    const collId = "collection.reverse-skill-main";
    const skillDir = path.join(userDir, "user.competition-android-hooking");
    fs.mkdirSync(skillDir, { recursive: true });
    const content = "# Android Hooking\nExplicit document instructions.";
    fs.writeFileSync(path.join(skillDir, "SKILL.md"), content);
    fs.writeFileSync(
      path.join(skillDir, "raw-skill.json"),
      JSON.stringify({
        id: "user.competition-android-hooking",
        name: "competition-android-hooking",
        type: "raw",
        collectionId: collId,
        enabled: false,
        summary: "Disabled android skill.",
        primaryDocument: "SKILL.md",
      })
    );

    registry.reload();

    const getTool = tools.get("localbridge_skill_get");
    const res = await getTool!({
      skillId: "user.competition-android-hooking",
    });

    expect(res.isError).toBeFalsy();
    const parsed = JSON.parse(res.content[0].text);
    expect(parsed.id).toBe("user.competition-android-hooking");
    expect(parsed.enabled).toBe(false);
    expect(parsed.content).toBe(content);
  });
});
