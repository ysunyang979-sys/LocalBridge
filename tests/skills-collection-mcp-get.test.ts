import { describe, expect, it, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { SkillValidator } from "../apps/server/src/skills/skill-validator.js";
import { SkillLoader } from "../apps/server/src/skills/skill-loader.js";
import { SkillRegistry } from "../apps/server/src/skills/skill-registry.js";
import { MCP_TOOL_SCOPE } from "../apps/server/src/mcp/scope-policy.js";

describe("skills-collection-mcp-get: Retrieval of Collection Sub-Skill", () => {
  let tmpRoot: string;
  let userDir: string;
  let loader: SkillLoader;
  let registry: SkillRegistry;
  const activeTools = new Set(Object.keys(MCP_TOOL_SCOPE));

  beforeEach(() => {
    tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "nexus-coll-get-test-"));
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

  it("retrieves complete metadata, primaryDocument content and collection tags for a sub-skill", () => {
    const collId = "collection.reverse-skill-main";
    const collName = "reverse-skill-main";
    const skillDir = path.join(userDir, "user.competition-agent-cloud");
    fs.mkdirSync(skillDir, { recursive: true });
    const markdownContent = "# Agent Cloud Security\n\nDetailed walkthrough for prompt injection auditing.";
    fs.writeFileSync(path.join(skillDir, "SKILL.md"), markdownContent);

    fs.mkdirSync(path.join(skillDir, "references"), { recursive: true });
    fs.writeFileSync(path.join(skillDir, "references", "cloud.md"), "# Cloud Reference");

    fs.writeFileSync(
      path.join(skillDir, "raw-skill.json"),
      JSON.stringify({
        id: "user.competition-agent-cloud",
        name: "competition-agent-cloud",
        type: "raw",
        collectionId: collId,
        collectionName: collName,
        enabled: true,
        summary: "Detailed walkthrough for prompt injection auditing.",
        primaryDocument: "SKILL.md",
        availableDocuments: ["SKILL.md", "references/cloud.md"],
      })
    );

    registry.reload();

    const skill = registry.getSkill("user.competition-agent-cloud");
    expect(skill).toBeDefined();
    expect(skill?.id).toBe("user.competition-agent-cloud");
    expect(skill?.type).toBe("raw");
    expect(skill?.collectionId).toBe(collId);
    expect(skill?.collectionName).toBe(collName);
    expect(skill?.enabled).toBe(true);
    expect(skill?.primaryDocument).toBe("SKILL.md");
    expect(skill?.instructions).toBe(markdownContent);
    expect(skill?.availableDocuments).toContain("references/cloud.md");
  });
});
