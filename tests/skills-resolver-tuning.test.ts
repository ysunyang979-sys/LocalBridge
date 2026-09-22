import { describe, it, expect, beforeEach } from "vitest";
import { SkillResolver } from "../apps/server/src/skills/skill-resolver.js";
import { SkillRegistry } from "../apps/server/src/skills/skill-registry.js";
import { SkillLoader } from "../apps/server/src/skills/skill-loader.js";
import { SkillValidator } from "../apps/server/src/skills/skill-validator.js";
import { MCP_TOOL_SCOPE } from "../apps/server/src/mcp/scope-policy.js";

describe("Skills Resolver Trigger Quality Tuning Suite", () => {
  let resolver: SkillResolver;
  let registry: SkillRegistry;

  beforeEach(() => {
    const validator = new SkillValidator(new Set(Object.keys(MCP_TOOL_SCOPE)));
    const loader = new SkillLoader(validator);
    registry = new SkillRegistry(loader);
    registry.reload();
    resolver = new SkillResolver(registry);
  });

  describe("Real User Queries: Code Debugging", () => {
    it("matches '检查 Myweb/app.js 是否存在代码问题。' to nexus.code-debug directly", () => {
      const result = resolver.resolve("检查 Myweb/app.js 是否存在代码问题。");
      expect(result.matchedSkill).not.toBeNull();
      expect(result.matchedSkill?.id).toBe("nexus.code-debug");
      expect(result.confidence).toBeGreaterThanOrEqual(0.75);
      expect(result.reason).toContain("debugging");
    });

    it("matches '看看这个 js 文件有没有 bug' to nexus.code-debug", () => {
      const result = resolver.resolve("看看这个 js 文件有没有 bug");
      expect(result.matchedSkill).not.toBeNull();
      expect(result.matchedSkill?.id).toBe("nexus.code-debug");
      expect(result.confidence).toBeGreaterThanOrEqual(0.75);
    });

    it("matches '为什么这个函数不正常' to nexus.code-debug", () => {
      const result = resolver.resolve("为什么这个函数不正常");
      expect(result.matchedSkill).not.toBeNull();
      expect(result.matchedSkill?.id).toBe("nexus.code-debug");
      expect(result.confidence).toBeGreaterThanOrEqual(0.75);
    });

    it("matches '帮我看看为什么代码不工作' to nexus.code-debug", () => {
      const result = resolver.resolve("帮我看看为什么代码不工作");
      expect(result.matchedSkill).not.toBeNull();
      expect(result.matchedSkill?.id).toBe("nexus.code-debug");
      expect(result.confidence).toBeGreaterThanOrEqual(0.75);
    });

    it("matches '这段代码哪里有问题' to nexus.code-debug", () => {
      const result = resolver.resolve("这段代码哪里有问题");
      expect(result.matchedSkill).not.toBeNull();
      expect(result.matchedSkill?.id).toBe("nexus.code-debug");
      expect(result.confidence).toBeGreaterThanOrEqual(0.75);
    });

    it("matches '检查代码问题' to nexus.code-debug", () => {
      const result = resolver.resolve("检查代码问题");
      expect(result.matchedSkill).not.toBeNull();
      expect(result.matchedSkill?.id).toBe("nexus.code-debug");
      expect(result.confidence).toBeGreaterThanOrEqual(0.75);
    });

    it("matches '排查这个 JS 文件' to nexus.code-debug", () => {
      const result = resolver.resolve("排查这个 JS 文件");
      expect(result.matchedSkill).not.toBeNull();
      expect(result.matchedSkill?.id).toBe("nexus.code-debug");
      expect(result.confidence).toBeGreaterThanOrEqual(0.75);
    });

    it("matches '看一下代码是否正常' to nexus.code-debug", () => {
      const result = resolver.resolve("看一下代码是否正常");
      expect(result.matchedSkill).not.toBeNull();
      expect(result.matchedSkill?.id).toBe("nexus.code-debug");
      expect(result.confidence).toBeGreaterThanOrEqual(0.75);
    });

    it("matches '检查一下 app.js' to nexus.code-debug", () => {
      const result = resolver.resolve("检查一下 app.js");
      expect(result.matchedSkill).not.toBeNull();
      expect(result.matchedSkill?.id).toBe("nexus.code-debug");
      expect(result.confidence).toBeGreaterThanOrEqual(0.75);
    });
  });

  describe("Real User Queries: Project Inspection", () => {
    it("matches '这个项目是做什么的' to nexus.project-inspect", () => {
      const result = resolver.resolve("这个项目是做什么的");
      expect(result.matchedSkill).not.toBeNull();
      expect(result.matchedSkill?.id).toBe("nexus.project-inspect");
      expect(result.confidence).toBeGreaterThanOrEqual(0.75);
    });

    it("matches '分析一下项目结构' to nexus.project-inspect", () => {
      const result = resolver.resolve("分析一下项目结构");
      expect(result.matchedSkill).not.toBeNull();
      expect(result.matchedSkill?.id).toBe("nexus.project-inspect");
      expect(result.confidence).toBeGreaterThanOrEqual(0.75);
    });

    it("matches '项目用了什么技术' to nexus.project-inspect", () => {
      const result = resolver.resolve("项目用了什么技术");
      expect(result.matchedSkill).not.toBeNull();
      expect(result.matchedSkill?.id).toBe("nexus.project-inspect");
      expect(result.confidence).toBeGreaterThanOrEqual(0.75);
    });

    it("matches '帮我了解这个项目' to nexus.project-inspect", () => {
      const result = resolver.resolve("帮我了解这个项目");
      expect(result.matchedSkill).not.toBeNull();
      expect(result.matchedSkill?.id).toBe("nexus.project-inspect");
      expect(result.confidence).toBeGreaterThanOrEqual(0.75);
    });

    it("matches '看看这个项目有没有问题' to nexus.project-inspect instead of code-debug", () => {
      const result = resolver.resolve("看看这个项目有没有问题");
      expect(result.matchedSkill).not.toBeNull();
      // Should NOT be forced to code-debug solely due to "问题" keyword; project context dominates!
      expect(result.matchedSkill?.id).toBe("nexus.project-inspect");
      expect(result.confidence).toBeGreaterThanOrEqual(0.75);
    });
  });
});
