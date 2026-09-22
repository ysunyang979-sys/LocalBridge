import { describe, expect, it, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { SkillValidator } from "../apps/server/src/skills/skill-validator.js";
import { SkillLoader } from "../apps/server/src/skills/skill-loader.js";
import { SkillRegistry } from "../apps/server/src/skills/skill-registry.js";
import { MCP_TOOL_SCOPE } from "../apps/server/src/mcp/scope-policy.js";
import { registerSkillTools } from "../apps/server/src/mcp/tools/skills.js";

describe("skills-collection-chatgpt-orchestration: End-to-End ChatGPT Orchestration Workflow", () => {
  let tmpRoot: string;
  let userDir: string;
  let loader: SkillLoader;
  let registry: SkillRegistry;
  let tools: Map<string, Function>;
  const activeTools = new Set(Object.keys(MCP_TOOL_SCOPE));

  beforeEach(() => {
    tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "nexus-orchestration-test-"));
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

  it("completes full orchestration cycle: list -> match -> get primary doc -> get reference doc", async () => {
    const collId = "collection.reverse-skill-main";
    const collName = "reverse-skill-main";

    // Setup: Create 3 sub-skills in reverse-skill-main
    // Skill 1: Android Hooking
    const skillDir1 = path.join(userDir, "user.competition-android-hooking");
    fs.mkdirSync(path.join(skillDir1, "references"), { recursive: true });
    fs.writeFileSync(
      path.join(skillDir1, "SKILL.md"),
      "# Android Hooking\n\nUse Frida scripts to hook SSL Pinning and crypto signatures."
    );
    fs.writeFileSync(
      path.join(skillDir1, "references", "ssl-bypass.js"),
      "Java.perform(() => { console.log('Bypassing TrustManager...'); });"
    );
    fs.writeFileSync(
      path.join(skillDir1, "raw-skill.json"),
      JSON.stringify({
        id: "user.competition-android-hooking",
        name: "competition-android-hooking",
        type: "raw",
        collectionId: collId,
        collectionName: collName,
        enabled: true,
        summary: "Android Frida hooking, SSL Pinning bypass and crypto signature recovery.",
        keywords: ["android", "hooking", "frida", "ssl", "pinning", "signature", "apk"],
        primaryDocument: "SKILL.md",
      })
    );

    // Skill 2: SSRF Metadata Pivot (Enabled)
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
        summary: "Cloud instance metadata pivoting through SSRF.",
        keywords: ["ssrf", "cloud", "metadata", "aws", "gcp"],
        primaryDocument: "SKILL.md",
      })
    );

    // Skill 3: AD Certificate Abuse (Disabled by user in desktop UI)
    const skillDir3 = path.join(userDir, "user.competition-ad-certificate-abuse");
    fs.mkdirSync(skillDir3, { recursive: true });
    fs.writeFileSync(path.join(skillDir3, "SKILL.md"), "# AD CS Abuse\nActive Directory Certificate Services.");
    fs.writeFileSync(
      path.join(skillDir3, "raw-skill.json"),
      JSON.stringify({
        id: "user.competition-ad-certificate-abuse",
        name: "competition-ad-certificate-abuse",
        type: "raw",
        collectionId: collId,
        collectionName: collName,
        enabled: false,
        summary: "AD CS ESC1-ESC8 certificate abuse.",
        keywords: ["ad", "kerberos", "certificate", "esc1", "activedirectory"],
        primaryDocument: "SKILL.md",
      })
    );

    registry.reload();

    const listTool = tools.get("localbridge_skill_list");
    const matchTool = tools.get("localbridge_skill_match");
    const getTool = tools.get("localbridge_skill_get");

    // Step 1: ChatGPT lists available skills in the collection
    const listRes = await listTool!({
      collectionId: collId,
      enabledOnly: true,
    });
    const listParsed = JSON.parse(listRes.content[0].text);
    expect(listParsed.collection).toBeDefined();
    expect(listParsed.collection.totalSkills).toBe(3);
    expect(listParsed.collection.enabledSkills).toBe(2);
    expect(listParsed.skills).toHaveLength(2);
    const listedIds = listParsed.skills.map((s: any) => s.id);
    expect(listedIds).toContain("user.competition-android-hooking");
    expect(listedIds).toContain("user.competition-ssrf-metadata-pivot");
    expect(listedIds).not.toContain("user.competition-ad-certificate-abuse");

    // Step 2: User gives task to ChatGPT: "分析 Android 应用的通信加密并绕过 SSL Pinning"
    // ChatGPT invokes localbridge_skill_match within collection
    const matchRes = await matchTool!({
      query: "分析 Android 应用的通信加密并绕过 SSL Pinning",
      collectionId: collId,
    });
    const matchParsed = JSON.parse(matchRes.content[0].text);
    expect(matchParsed.matched).toBe(true);
    expect(matchParsed.primarySkill.skillId).toBe("user.competition-android-hooking");
    expect(matchParsed.primarySkill.confidence).toBeGreaterThanOrEqual(0.7);
    expect(matchParsed.primarySkill.reason).toBeTruthy();

    // Step 3: ChatGPT reads primaryDocument (SKILL.md)
    const getDocRes = await getTool!({
      skillId: matchParsed.primarySkill.skillId,
    });
    const getDocParsed = JSON.parse(getDocRes.content[0].text);
    expect(getDocParsed.skillId).toBe("user.competition-android-hooking");
    expect(getDocParsed.documentPath).toBe("SKILL.md");
    expect(getDocParsed.content).toContain("# Android Hooking");
    expect(getDocParsed.content).toContain("SSL Pinning");

    // Step 4: ChatGPT reads referenced file
    const getRefRes = await getTool!({
      skillId: matchParsed.primarySkill.skillId,
      documentPath: "references/ssl-bypass.js",
    });
    const getRefParsed = JSON.parse(getRefRes.content[0].text);
    expect(getRefParsed.documentPath).toBe("references/ssl-bypass.js");
    expect(getRefParsed.content).toContain("Java.perform");
    expect(getRefParsed.content).toContain("Bypassing TrustManager");

    // Step 5: Verify disabled skill cannot be matched even if query matches it
    const disabledMatchRes = await matchTool!({
      query: "Active Directory Certificate Services ESC1 abuse",
      collectionId: collId,
    });
    const disabledParsed = JSON.parse(disabledMatchRes.content[0].text);
    expect(disabledParsed.matched).toBe(false);
  });
});
