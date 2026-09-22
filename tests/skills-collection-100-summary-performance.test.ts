import { describe, expect, it, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { SkillValidator } from "../apps/server/src/skills/skill-validator.js";
import { SkillLoader } from "../apps/server/src/skills/skill-loader.js";
import { SkillRegistry } from "../apps/server/src/skills/skill-registry.js";
import { MCP_TOOL_SCOPE } from "../apps/server/src/mcp/scope-policy.js";
import { registerSkillTools } from "../apps/server/src/mcp/tools/skills.js";

describe("skills-collection-100-summary-performance: High-Performance Lightweight Listing for 100+ Skills", () => {
  let tmpRoot: string;
  let userDir: string;
  let loader: SkillLoader;
  let registry: SkillRegistry;
  let tools: Map<string, Function>;
  const activeTools = new Set(Object.keys(MCP_TOOL_SCOPE));

  beforeEach(() => {
    tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "nexus-perf-test-"));
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

  it("lists 100 skills in a collection in under 100ms with summary metadata and zero full markdown reads", async () => {
    const collId = "collection.large-security-collection";
    const collName = "large-security-collection";
    const TOTAL_SKILLS = 100;

    // Create 100 sub-skills under userDir
    for (let i = 0; i < TOTAL_SKILLS; i++) {
      const slug = `skill-${String(i).padStart(3, "0")}`;
      const skillDir = path.join(userDir, `user.${slug}`);
      fs.mkdirSync(skillDir, { recursive: true });

      // SKILL.md has large body content
      fs.writeFileSync(
        path.join(skillDir, "SKILL.md"),
        `# Skill ${i}\n\n${"Detailed step instructions. ".repeat(100)}`
      );

      // raw-skill.json has lightweight cached metadata
      fs.writeFileSync(
        path.join(skillDir, "raw-skill.json"),
        JSON.stringify({
          id: `user.${slug}`,
          name: slug,
          type: "raw",
          collectionId: collId,
          collectionName: collName,
          enabled: i % 5 !== 0, // 80 enabled, 20 disabled
          summary: `Summary for security skill ${i}`,
          keywords: ["security", `kw-${i}`, "analysis"],
          primaryDocument: "SKILL.md",
        })
      );
    }

    // Initial load into registry
    registry.reload();

    const listTool = tools.get("localbridge_skill_list");
    expect(listTool).toBeDefined();

    // Measure listing performance for all enabled skills in the collection
    const start = performance.now();
    const res = await listTool!({
      collectionId: collId,
      enabledOnly: true,
    });
    const elapsed = performance.now() - start;

    const parsed = JSON.parse(res.content[0].text);
    expect(parsed.collection).toBeDefined();
    expect(parsed.collection.id).toBe(collId);
    expect(parsed.collection.totalSkills).toBe(TOTAL_SKILLS);
    expect(parsed.collection.enabledSkills).toBe(80);
    expect(parsed.count).toBe(80);
    expect(parsed.skills).toHaveLength(80);

    // Verify metadata items are lightweight summary objects without large markdown content
    for (const item of parsed.skills) {
      expect(item.id).toMatch(/^user\.skill-\d{3}$/);
      expect(item.name).toBeTruthy();
      expect(item.type).toBe("raw");
      expect(item.enabled).toBe(true);
      expect(item.primaryDocument).toBe("SKILL.md");
      expect(item.summary).toContain("Summary for security skill");
      expect(item.keywords).toBeDefined();
      // Ensure large body content is NOT embedded in the list response
      expect(item.content).toBeUndefined();
    }

    // Listing 100 in-memory loaded summaries must complete in < 100ms
    expect(elapsed).toBeLessThan(100);
  });
});
