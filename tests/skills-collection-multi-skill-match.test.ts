import { describe, expect, it, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { SkillValidator } from "../apps/server/src/skills/skill-validator.js";
import { SkillLoader } from "../apps/server/src/skills/skill-loader.js";
import { SkillRegistry } from "../apps/server/src/skills/skill-registry.js";
import { MCP_TOOL_SCOPE } from "../apps/server/src/mcp/scope-policy.js";
import { registerSkillTools } from "../apps/server/src/mcp/tools/skills.js";

describe("skills-collection-multi-skill-match: Multi-Skill Matching for Complex Tasks", () => {
  let tmpRoot: string;
  let userDir: string;
  let loader: SkillLoader;
  let registry: SkillRegistry;
  let tools: Map<string, Function>;
  const activeTools = new Set(Object.keys(MCP_TOOL_SCOPE));

  beforeEach(() => {
    tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "nexus-multi-match-test-"));
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

  it("returns primarySkill and relatedSkills when query involves multiple skills in a collection", async () => {
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
        keywords: ["android", "hooking", "frida", "apk", "mobile"],
        primaryDocument: "SKILL.md",
      })
    );

    // Skill 2: Network / PCAP Protocol
    const skillDir2 = path.join(userDir, "user.competition-pcap-protocol");
    fs.mkdirSync(skillDir2, { recursive: true });
    fs.writeFileSync(path.join(skillDir2, "SKILL.md"), "# PCAP Protocol\nPacket capture analysis and network replay.");
    fs.writeFileSync(
      path.join(skillDir2, "raw-skill.json"),
      JSON.stringify({
        id: "user.competition-pcap-protocol",
        name: "competition-pcap-protocol",
        type: "raw",
        collectionId: collId,
        collectionName: collName,
        enabled: true,
        summary: "Packet capture analysis and network replay.",
        keywords: ["network", "pcap", "traffic", "protocol", "packet", "抓包", "网络", "流量"],
        primaryDocument: "SKILL.md",
      })
    );

    // Skill 3: Steganography (irrelevant)
    const skillDir3 = path.join(userDir, "user.competition-stego-media");
    fs.mkdirSync(skillDir3, { recursive: true });
    fs.writeFileSync(path.join(skillDir3, "SKILL.md"), "# Stego Media\nImage and audio steganography.");
    fs.writeFileSync(
      path.join(skillDir3, "raw-skill.json"),
      JSON.stringify({
        id: "user.competition-stego-media",
        name: "competition-stego-media",
        type: "raw",
        collectionId: collId,
        collectionName: collName,
        enabled: true,
        summary: "Image and audio steganography.",
        keywords: ["stego", "image", "audio"],
        primaryDocument: "SKILL.md",
      })
    );

    registry.reload();

    const matchTool = tools.get("localbridge_skill_match");
    const res = await matchTool!({
      query: "需要结合 Android Hooking 与抓包网络流量分析完成移动端审计",
      collectionId: collId,
    });

    const parsed = JSON.parse(res.content[0].text);
    expect(parsed.matched).toBe(true);
    expect(parsed.primarySkill).toBeDefined();
    expect(parsed.relatedSkills).toBeDefined();
    expect(parsed.relatedSkills.length).toBeGreaterThan(0);

    const allMatchedIds = [parsed.primarySkill.skillId, ...parsed.relatedSkills.map((s: any) => s.skillId)];
    expect(allMatchedIds).toContain("user.competition-android-hooking");
    expect(allMatchedIds).toContain("user.competition-pcap-protocol");

    // Stego skill should NOT be included
    expect(allMatchedIds).not.toContain("user.competition-stego-media");
  });
});
