import { describe, expect, it } from "vitest";
import { SkillResolver } from "../apps/server/src/skills/skill-resolver.js";
import { SkillRegistry } from "../apps/server/src/skills/skill-registry.js";
import { SkillLoader } from "../apps/server/src/skills/skill-loader.js";
import { SkillValidator } from "../apps/server/src/skills/skill-validator.js";
import { MCP_TOOL_SCOPE } from "../apps/server/src/mcp/scope-policy.js";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const skillsDir = path.resolve(__dirname, "../resources/skills");

describe("Laya Skill Recommendation Integration Suite", () => {
  it("incorporates Laya recommendation bonus for valid matching skills", () => {
    const validator = new SkillValidator(new Set(Object.keys(MCP_TOOL_SCOPE)));
    const loader = new SkillLoader(validator);
    const registry = new SkillRegistry(loader);

    const resolver = new SkillResolver(registry);

    // 1. Without Laya recommendation
    const baseMatch = resolver.resolve("review git status");
    expect(baseMatch.matchedSkill).toBeDefined();

    // 2. With Laya recommendation for git-review
    const layaMatch = resolver.resolve("review git status", undefined, "nexus.git-review");
    expect(layaMatch.matchedSkill?.id).toBe("nexus.git-review");
    expect(layaMatch.confidence).toBeGreaterThanOrEqual(baseMatch.confidence);
    expect(layaMatch.reason).toContain("recommended by Laya");
  });

  it("ignores Laya recommendation if the suggested skill does not exist or is disabled", () => {
    const validator = new SkillValidator(new Set(Object.keys(MCP_TOOL_SCOPE)));
    const loader = new SkillLoader(validator);
    const registry = new SkillRegistry(loader);

    const resolver = new SkillResolver(registry);

    // Suggest non-existent skill
    const match = resolver.resolve("inspect project", undefined, "nexus.fake-nonexistent-skill");
    expect(match.matchedSkill?.id).toBe("nexus.project-inspect");
    expect(match.reason).not.toContain("recommended by Laya");
  });
});
