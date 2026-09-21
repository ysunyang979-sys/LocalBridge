import { describe, expect, it } from "vitest";
import { SkillValidator } from "../apps/server/src/skills/skill-validator.js";
import { SkillLoader } from "../apps/server/src/skills/skill-loader.js";
import { SkillRegistry } from "../apps/server/src/skills/skill-registry.js";
import { SkillResolver } from "../apps/server/src/skills/skill-resolver.js";
import { MCP_TOOL_SCOPE } from "../apps/server/src/mcp/scope-policy.js";

describe("Skill Resolver & Intent Matching", () => {
  const activeTools = new Set(Object.keys(MCP_TOOL_SCOPE));
  const validator = new SkillValidator(activeTools);
  const loader = new SkillLoader(validator);
  const registry = new SkillRegistry(loader);
  const resolver = new SkillResolver(registry);

  it("resolves explicit skill invocations with high confidence", () => {
    const res = resolver.resolve("请使用 nexus.fix-build 处理编译错误");
    expect(res.matchedSkill).toBeDefined();
    expect(res.matchedSkill?.id).toBe("nexus.fix-build");
    expect(res.confidence).toBeGreaterThanOrEqual(0.9);
    expect(res.reason).toContain("Explicit");
  });

  it("matches Chinese trigger keywords accurately", () => {
    const res1 = resolver.resolve("帮我看下这个项目是做什么的，分析下架构");
    expect(res1.matchedSkill?.id).toBe("nexus.project-inspect");
    expect(res1.confidence).toBeGreaterThanOrEqual(0.5);

    const res2 = resolver.resolve("跑一下测试，看一下单测能不能通过");
    expect(res2.matchedSkill?.id).toBe("nexus.run-tests");
    expect(res2.confidence).toBeGreaterThanOrEqual(0.5);

    const res3 = resolver.resolve("帮我启动本地开发服务，运行起来");
    expect(res3.matchedSkill?.id).toBe("nexus.start-dev-runtime");
    expect(res3.confidence).toBeGreaterThanOrEqual(0.5);

    const res4 = resolver.resolve("清理项目里的 dist 产物和缓存");
    expect(res4.matchedSkill?.id).toBe("nexus.project-cleanup");
    expect(res4.confidence).toBeGreaterThanOrEqual(0.5);
  });

  it("matches English trigger keywords accurately", () => {
    const res1 = resolver.resolve("Can you inspect project structure and entrypoints?");
    expect(res1.matchedSkill?.id).toBe("nexus.project-inspect");
    expect(res1.confidence).toBeGreaterThanOrEqual(0.5);

    const res2 = resolver.resolve("Please run tests and check if everything passes");
    expect(res2.matchedSkill?.id).toBe("nexus.run-tests");
    expect(res2.confidence).toBeGreaterThanOrEqual(0.5);

    const res3 = resolver.resolve("Start dev server for this repository");
    expect(res3.matchedSkill?.id).toBe("nexus.start-dev-runtime");
    expect(res3.confidence).toBeGreaterThanOrEqual(0.5);
  });

  it("returns null when no skill matches completely unrelated query", () => {
    const res = resolver.resolve("今天天气怎么样，明天适合穿什么衣服？");
    expect(res.matchedSkill).toBeNull();
    expect(res.confidence).toBe(0);
    expect(res.reason).toContain("No matching skill found");
  });
});
