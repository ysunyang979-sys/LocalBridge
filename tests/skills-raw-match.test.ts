import { describe, expect, it, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { SkillValidator } from "../apps/server/src/skills/skill-validator.js";
import { SkillLoader } from "../apps/server/src/skills/skill-loader.js";
import { SkillRegistry } from "../apps/server/src/skills/skill-registry.js";
import { SkillResolver } from "../apps/server/src/skills/skill-resolver.js";
import { MCP_TOOL_SCOPE } from "../apps/server/src/mcp/scope-policy.js";

describe("skills-raw-match: Intent Matching for Raw User Skills", () => {
  let tmpRoot: string;
  let userDir: string;
  let loader: SkillLoader;
  let registry: SkillRegistry;
  let resolver: SkillResolver;
  const activeTools = new Set(Object.keys(MCP_TOOL_SCOPE));

  beforeEach(() => {
    tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "nexus-raw-match-test-"));
    userDir = path.join(tmpRoot, "user-skills");
    fs.mkdirSync(userDir, { recursive: true });

    const validator = new SkillValidator(activeTools);
    loader = new SkillLoader(validator, { userDir });
    registry = new SkillRegistry(loader);
    resolver = new SkillResolver(registry);
  });

  afterEach(() => {
    try {
      fs.rmSync(tmpRoot, { recursive: true, force: true });
    } catch {}
  });

  it("successfully matches user intent to a raw user skill by trigger/keyword", () => {
    const rawSkillDir = path.join(userDir, "user.apk-reversing");
    fs.mkdirSync(rawSkillDir, { recursive: true });
    fs.writeFileSync(
      path.join(rawSkillDir, "SKILL.md"),
      "# Android APK Reversing\n\nReverse engineering APKs and hooking Java methods with Frida."
    );
    fs.writeFileSync(
      path.join(rawSkillDir, "raw-skill.json"),
      JSON.stringify({
        id: "user.apk-reversing",
        name: "Android APK Reversing",
        type: "raw",
        version: "1.0.0",
        description: "Reverse engineering APKs.",
        primaryDocument: "SKILL.md",
      })
    );

    registry.reload();

    const match = resolver.resolve("帮我使用 apk-reversing 分析该样本");
    expect(match.matchedSkill).toBeDefined();
    expect(match.matchedSkill?.id).toBe("user.apk-reversing");
    expect(match.confidence).toBeGreaterThan(0.5);
  });
});
