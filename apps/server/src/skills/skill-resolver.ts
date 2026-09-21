import type { SkillMatchResult, SkillMetadata } from "@localbridge/protocol";
import type { SkillRegistry } from "./skill-registry.js";

const CATEGORY_KEYWORDS: Record<string, string[]> = {
  debugging: ["build", "compile", "error", "fail", "broken", "bug", "crash", "fix", "构建", "编译", "报错", "失败", "修复"],
  testing: ["test", "tests", "vitest", "jest", "unit", "spec", "测试", "单测"],
  inspection: ["inspect", "structure", "explore", "read", "overview", "what does", "结构", "查看", "了解", "分析项目", "概览"],
  refactoring: ["refactor", "rename", "restructure", "clean up code", "重构", "改造"],
  review: ["review", "diff", "git", "status", "uncommitted", "审查", "变动", "提交前"],
  runtime: ["runtime", "dev server", "start server", "serve", "listen", "运行", "服务", "启动"],
  maintenance: ["cleanup", "clean", "delete", "prune", "node_modules", "dist", "清理", "垃圾", "瘦身"],
};

export class SkillResolver {
  constructor(private readonly registry: SkillRegistry) {}

  resolve(
    query: string,
    projectId?: string,
    layaRecommendation?: string
  ): SkillMatchResult {
    const trimmed = query.trim();
    if (!trimmed) {
      return {
        matchedSkill: null,
        confidence: 0,
        reason: "Empty query provided",
      };
    }

    const availableSkills = this.registry.listSkills({ projectId });
    const lowerQuery = trimmed.toLowerCase();

    // 1. Explicit Skill Name / ID Matching
    for (const skill of availableSkills) {
      const shortId = skill.id.startsWith("nexus.") ? skill.id.slice(6) : skill.id;
      const explicitPatterns = [
        skill.id.toLowerCase(),
        shortId.toLowerCase(),
        `skill:${skill.id.toLowerCase()}`,
        `skill ${skill.id.toLowerCase()}`,
        `use ${shortId.toLowerCase()} skill`,
        `使用 ${shortId.toLowerCase()} skill`,
        `使用 ${skill.id.toLowerCase()}`,
        `使用${shortId.toLowerCase()}技能`,
      ];

      const isExplicit = explicitPatterns.some((p) => lowerQuery.includes(p));
      if (isExplicit) {
        if (!skill.enabled) {
          return {
            matchedSkill: null,
            confidence: 0,
            reason: `Explicitly requested skill '${skill.id}' is currently disabled`,
          };
        }
        if (skill.validationStatus === "invalid" || skill.validationStatus === "conflict") {
          return {
            matchedSkill: null,
            confidence: 0,
            reason: `Explicitly requested skill '${skill.id}' has validation errors or conflicts`,
          };
        }

        return {
          matchedSkill: skill,
          confidence: 1.0,
          reason: `Explicitly specified skill '${skill.id}'`,
        };
      }
    }

    // 2. Score Candidate Skills
    let bestSkill: SkillMetadata | null = null;
    let highestScore = 0;
    let bestReason = "";

    for (const skill of availableSkills) {
      if (!skill.enabled || skill.validationStatus === "invalid" || skill.validationStatus === "conflict") {
        continue;
      }

      let score = 0;
      const matchedTriggers: string[] = [];

      // A. Trigger keywords matching
      for (const trigger of skill.triggers) {
        const lowerTrigger = trigger.toLowerCase();
        if (lowerQuery.includes(lowerTrigger)) {
          matchedTriggers.push(trigger);
        }
      }

      if (matchedTriggers.length > 0) {
        // Base score 0.75 + 0.10 for each additional trigger, up to 0.95
        score += 0.75 + Math.min(0.20, (matchedTriggers.length - 1) * 0.10);
      }

      // B. Category matching
      const catKeywords = CATEGORY_KEYWORDS[skill.category] || [];
      const catMatches = catKeywords.filter((k) => lowerQuery.includes(k));
      if (catMatches.length > 0) {
        score += 0.15;
      }

      // C. Description / Name matching
      const zhName = skill.name["zh-CN"]?.toLowerCase() || "";
      const enName = skill.name["en-US"]?.toLowerCase() || "";
      if (lowerQuery.includes(zhName) || (enName && lowerQuery.includes(enName))) {
        score += 0.20;
      }

      // D. Laya Recommendation Bonus
      const isLayaRecommended = Boolean(
        layaRecommendation &&
          (layaRecommendation === skill.id ||
            layaRecommendation === skill.id.replace("nexus.", "") ||
            `nexus.${layaRecommendation}` === skill.id)
      );
      if (isLayaRecommended) {
        score += 0.25;
      }

      // Normalized cap at 0.98
      const finalConfidence = Math.min(0.98, score);

      if (finalConfidence > highestScore) {
        highestScore = finalConfidence;
        bestSkill = skill;

        const reasonParts: string[] = [];
        if (matchedTriggers.length > 0) {
          reasonParts.push(`matched triggers: [${matchedTriggers.join(", ")}]`);
        }
        if (catMatches.length > 0) {
          reasonParts.push(`matched category: ${skill.category}`);
        }
        if (isLayaRecommended) {
          reasonParts.push(`recommended by Laya`);
        }
        bestReason = reasonParts.length > 0 ? reasonParts.join(", ") : `matched skill description`;
      }
    }

    if (bestSkill && highestScore >= 0.40) {
      return {
        matchedSkill: bestSkill,
        confidence: Math.round(highestScore * 100) / 100,
        reason: bestReason,
      };
    }

    return {
      matchedSkill: null,
      confidence: 0,
      reason: "No matching skill found for query",
    };
  }
}
