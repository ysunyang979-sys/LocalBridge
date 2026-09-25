import type { SkillMatchResult, SkillMetadata, SkillMatchInfo } from "@localbridge/protocol";
import type { SkillRegistry } from "./skill-registry.js";

const CATEGORY_KEYWORDS: Record<string, string[]> = {
  debugging: [
    "build", "compile", "error", "fail", "broken", "bug", "bugs", "crash", "fix",
    "issue", "fault", "not working", "why", "debug", "locate", "diagnostic",
    "构建", "编译", "报错", "失败", "修复", "问题", "代码问题", "错误", "bug",
    "排查", "不正常", "不工作", "异常", "崩了", "排错", "调bug", "调试", "查一下",
    "为什么", "是否有错", "是否存在问题",
  ],
  testing: [
    "test", "tests", "vitest", "jest", "unit", "spec", "coverage",
    "测试", "单测", "跑测试", "运行测试", "测试用例",
  ],
  inspection: [
    "inspect", "structure", "explore", "read", "overview", "what does",
    "tech stack", "architecture", "directory", "entrypoint", "dependencies",
    "结构", "查看", "了解", "分析项目", "概览", "项目", "工程", "架构",
    "技术栈", "入口", "目录", "是做什么的", "做什么", "整个项目", "项目情况", "项目结构",
  ],
  refactoring: [
    "refactor", "rename", "restructure", "clean up code", "optimize",
    "重构", "改造", "重命名", "优化代码结构",
  ],
  review: [
    "review", "diff", "git", "status", "uncommitted", "commit", "changes",
    "审查", "变动", "提交前", "代码审查", "code review",
  ],
  runtime: [
    "runtime", "dev server", "start server", "serve", "listen", "port",
    "运行", "服务", "启动", "开发服务", "启动服务", "开发环境",
  ],
  maintenance: [
    "cleanup", "clean", "delete", "prune", "node_modules", "dist",
    "清理", "垃圾", "瘦身", "依赖清理",
  ],
};

// Recognized code file extensions
const CODE_FILE_EXTENSION_REGEX =
  /\.(js|jsx|ts|tsx|py|rs|go|java|c|cpp|h|hpp|vue|svelte|json|yaml|yml|css|html|php|rb|swift|kt|dart)\b/i;

// Code target indicators (specific file, function, snippet, or code construct)
const CODE_TARGET_KEYWORDS = [
  "文件", "代码", "函数", "方法", "类", "组件", "脚本",
  "file", "code", "function", "method", "class", "component", "script",
  "app.js", "main.ts", "index.ts", "index.js", "js 文件", "ts 文件", "py 文件",
];

// Problem & debugging action indicators
const DEBUG_ACTION_KEYWORDS = [
  "问题", "代码问题", "错误", "bug", "bugs", "检查", "排查", "不工作",
  "异常", "不正常", "是否正常", "哪里有问题", "有没有问题", "为什么", "报错",
  "崩溃", "崩了", "坏了", "修一下", "调一下", "排错", "诊断", "是否有错",
  "broken", "issue", "error", "not working", "crash", "fail", "failing", "fault",
];

// Project-level target indicators
const PROJECT_TARGET_KEYWORDS = [
  "这个项目", "整个项目", "项目", "工程", "仓库", "代码库",
  "this project", "the project", "entire project", "repository", "repo", "codebase",
];

// Project-level inspection action indicators
const PROJECT_INSPECT_ACTION_KEYWORDS = [
  "做什么", "是做什么的", "项目结构", "架构", "技术栈", "技术", "用了什么", "用什么", "依赖", "框架", "入口", "目录",
  "分析", "分析一下", "了解", "帮我了解", "结构", "概览", "梳理", "介绍一下",
  "what does", "architecture", "overview", "structure", "directory", "entrypoint", "tech stack", "dependencies",
];

export class SkillResolver {
  constructor(private readonly registry: SkillRegistry) {}

  resolve(
    query: string,
    projectId?: string,
    layaRecommendation?: string,
    collectionId?: string
  ): SkillMatchResult {
    const trimmed = query.trim();
    if (!trimmed) {
      return {
        matched: false,
        matchedSkill: null,
        skill: null,
        confidence: 0,
        reason: "Empty query provided",
        primarySkill: undefined,
        relatedSkills: [],
      };
    }

    const lowerQuery = trimmed.toLowerCase();

    // 1. Explicit Skill Name / ID Matching (Highest Priority: 1.0)
    // First, check all skills in registry for explicit mention to provide clear error if disabled
    const allSkills = this.registry.listSkills({ projectId, collectionId });
    for (const skill of allSkills) {
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
        `使用 ${skill.name["zh-CN"]?.toLowerCase()}`,
        `使用 ${skill.name["en-US"]?.toLowerCase()}`,
      ];

      const isExplicit = explicitPatterns.some((p) => lowerQuery.includes(p));
      if (isExplicit) {
        if (!skill.enabled) {
          return {
            matched: false,
            matchedSkill: null,
            skill: null,
            confidence: 0,
            reason: `Explicitly requested skill '${skill.id}' is currently disabled`,
            primarySkill: undefined,
            relatedSkills: [],
          };
        }
        if (skill.validationStatus === "invalid" || skill.validationStatus === "conflict") {
          return {
            matched: false,
            matchedSkill: null,
            skill: null,
            confidence: 0,
            reason: `Explicitly requested skill '${skill.id}' has validation errors or conflicts`,
            primarySkill: undefined,
            relatedSkills: [],
          };
        }

        const skillNameStr = typeof skill.name === "string" ? skill.name : skill.name["zh-CN"] || skill.name["en-US"] || skill.id;
        const primarySkill: SkillMatchInfo = {
          skillId: skill.id,
          name: skillNameStr,
          confidence: 1.0,
          reason: `Explicitly specified skill '${skill.id}'`,
          collectionId: skill.collectionId,
        };

        return {
          matched: true,
          matchedSkill: skill,
          skill,
          confidence: 1.0,
          reason: `Explicitly specified skill '${skill.id}'`,
          primarySkill,
          relatedSkills: [],
          allMatches: [primarySkill],
        };
      }
    }

    // Only enabled and valid skills are eligible for automatic matching
    const candidatePool = allSkills.filter(
      (s) => s.enabled && s.validationStatus !== "invalid" && s.validationStatus !== "conflict"
    );

    // 2. High-Level Intent & Context Analysis
    const hasCodeFileExtension = CODE_FILE_EXTENSION_REGEX.test(lowerQuery);
    const matchedCodeTarget =
      CODE_TARGET_KEYWORDS.find((w) => lowerQuery.includes(w)) ||
      (hasCodeFileExtension ? "file extension" : null);

    const hasSpecificFileTarget = Boolean(
      hasCodeFileExtension ||
      lowerQuery.includes("app.js") ||
      lowerQuery.includes("这个文件") ||
      lowerQuery.includes("这段代码") ||
      lowerQuery.includes("这个函数") ||
      lowerQuery.includes("js 文件") ||
      lowerQuery.includes("ts 文件")
    );
    const matchedDebugAction = DEBUG_ACTION_KEYWORDS.find((w) => lowerQuery.includes(w));
    const matchedProjectTarget = PROJECT_TARGET_KEYWORDS.find((w) => lowerQuery.includes(w));
    const matchedInspectAction = PROJECT_INSPECT_ACTION_KEYWORDS.find((w) => lowerQuery.includes(w));

    // Tokenize query words for semantic keyword matching
    const queryTokens = lowerQuery
      .split(/[\s,._\-\/\\:;!?()\[\]{}'"]+/)
      .map((t) => t.trim())
      .filter((t) => t.length >= 2);

    // 3. Score Candidate Skills
    interface ScoredCandidate {
      skill: SkillMetadata;
      score: number;
      reason: string;
      matchedTriggers?: string[];
      matchedIntent?: string;
    }
    const scoredList: ScoredCandidate[] = [];

    for (const skill of candidatePool) {
      let score = 0;
      const matchedTriggers: string[] = [];
      let matchedIntent: string | undefined = undefined;

      // A. Trigger keywords matching (Phrase Level)
      for (const trigger of skill.triggers || []) {
        const lowerTrigger = trigger.toLowerCase();
        if (lowerQuery.includes(lowerTrigger)) {
          matchedTriggers.push(trigger);
        }
      }

      if (matchedTriggers.length > 0) {
        score += 0.75 + Math.min(0.20, (matchedTriggers.length - 1) * 0.10);
      }

      // B. Domain-specific Intent Heuristics (Disambiguating File Debug vs Project Inspection)
      if (skill.id === "nexus.code-debug") {
        if ((hasSpecificFileTarget || matchedCodeTarget) && matchedDebugAction) {
          if (matchedProjectTarget && !hasSpecificFileTarget) {
            score += 0.20;
          } else {
            score += 0.78;
            matchedIntent = `file/code-level debugging: ${matchedCodeTarget || "file"} + ${matchedDebugAction}`;
          }
        } else if (matchedDebugAction && !matchedProjectTarget) {
          score += 0.75;
          matchedIntent = `general code debugging: ${matchedDebugAction}`;
        }
      } else if (skill.id === "nexus.project-inspect") {
        if (matchedProjectTarget && matchedInspectAction) {
          score += 0.82;
          matchedIntent = `project architecture & inspection: ${matchedProjectTarget} + ${matchedInspectAction}`;
        } else if (matchedProjectTarget && matchedDebugAction && !hasSpecificFileTarget) {
          score += 0.78;
          matchedIntent = `project-level health check: ${matchedProjectTarget} + ${matchedDebugAction}`;
        } else if (matchedProjectTarget && (lowerQuery.includes("看") || lowerQuery.includes("分析") || lowerQuery.includes("了解"))) {
          score += 0.76;
          matchedIntent = `project overview inspection: ${matchedProjectTarget}`;
        }
      } else if (skill.id === "nexus.run-tests" && (lowerQuery.includes("test") || lowerQuery.includes("测试"))) {
        score += 0.75;
        matchedIntent = "test execution intent";
      } else if (skill.id === "nexus.fix-build" && (lowerQuery.includes("build") || lowerQuery.includes("构建") || lowerQuery.includes("编译") || lowerQuery.includes("compile"))) {
        score += 0.75;
        matchedIntent = "build repair intent";
      } else if (skill.id === "nexus.git-review" && (lowerQuery.includes("git") || lowerQuery.includes("diff") || lowerQuery.includes("提交") || lowerQuery.includes("审查"))) {
        score += 0.75;
        matchedIntent = "git review intent";
      }

      // C. Category matching
      const catKeywords = CATEGORY_KEYWORDS[skill.category] || [];
      const catMatches = catKeywords.filter((k) => lowerQuery.includes(k));
      if (catMatches.length > 0) {
        score += 0.15;
      }

      // D. Description / Name matching
      const zhName = (typeof skill.name === "string" ? skill.name : skill.name?.["zh-CN"] || "").toLowerCase();
      const enName = (typeof skill.name === "string" ? skill.name : skill.name?.["en-US"] || "").toLowerCase();
      if ((zhName && lowerQuery.includes(zhName)) || (enName && lowerQuery.includes(enName))) {
        score += 0.25;
      }

      // E. Raw & Collection Skill Keyword / Token Matching
      const skillTokens = Array.from(new Set([
        ...skill.id.replace(/^user\./, "").split(/[-_.]+/),
        ...(skill.triggers || []).flatMap((t) => t.toLowerCase().split(/[-_\s.]+/)),
        ...(skill.keywords || []).flatMap((k) => k.toLowerCase().split(/[-_\s.]+/)),
      ])).map((t) => t.trim().toLowerCase()).filter((t) => t.length >= 2);

      const matchedSkillTokens: string[] = [];
      for (const token of skillTokens) {
        if (
          lowerQuery.includes(token) ||
          queryTokens.includes(token) ||
          (token.length >= 4 && queryTokens.some((qt) => qt.includes(token) || token.includes(qt)))
        ) {
          matchedSkillTokens.push(token);
        }
      }

      if (matchedSkillTokens.length > 0) {
        const tokenBonus = Math.min(0.92, 0.55 + matchedSkillTokens.length * 0.12);
        if (tokenBonus > score) {
          score = tokenBonus;
        } else {
          score += Math.min(0.20, matchedSkillTokens.length * 0.08);
        }
        if (!matchedIntent) {
          matchedIntent = `matched intent keywords: [${matchedSkillTokens.join(", ")}]`;
        }
      }

      // F. Summary text matching
      const summaryText = (
        skill.summary ||
        (typeof skill.description === "string"
          ? skill.description
          : skill.description?.["zh-CN"] || skill.description?.["en-US"] || "")
      ).toLowerCase();

      if (summaryText) {
        const summaryHits = queryTokens.filter((qt) => qt.length >= 3 && summaryText.includes(qt));
        if (summaryHits.length > 0) {
          score += Math.min(0.20, summaryHits.length * 0.06);
        }
      }

      // G. Laya Recommendation Bonus
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

      if (finalConfidence >= 0.40) {
        const reasonParts: string[] = [];
        if (matchedIntent) {
          reasonParts.push(matchedIntent);
        }
        if (matchedTriggers.length > 0) {
          reasonParts.push(`matched triggers: [${matchedTriggers.join(", ")}]`);
        }
        if (matchedSkillTokens.length > 0 && !matchedIntent) {
          reasonParts.push(`keywords: [${matchedSkillTokens.join(", ")}]`);
        }
        if (catMatches.length > 0) {
          reasonParts.push(`category: ${skill.category}`);
        }
        if (isLayaRecommended) {
          reasonParts.push(`recommended by Laya`);
        }
        const reason = reasonParts.length > 0 ? reasonParts.join(", ") : `matched skill description`;

        scoredList.push({
          skill,
          score: finalConfidence,
          reason,
          matchedTriggers: matchedTriggers.length > 0 ? matchedTriggers : undefined,
          matchedIntent,
        });
      }
    }

    // Sort descending by confidence score
    scoredList.sort((a, b) => b.score - a.score);

    const top = scoredList[0];
    if (top) {
      const related = scoredList.slice(1);

      const topNameStr = typeof top.skill.name === "string" ? top.skill.name : top.skill.name?.["zh-CN"] || top.skill.name?.["en-US"] || top.skill.id;
      const primarySkill: SkillMatchInfo = {
        skillId: top.skill.id,
        name: topNameStr,
        confidence: Math.round(top.score * 100) / 100,
        reason: top.reason,
        collectionId: top.skill.collectionId,
      };

      const relatedSkills: SkillMatchInfo[] = related.map((r) => {
        const rNameStr = typeof r.skill.name === "string" ? r.skill.name : r.skill.name?.["zh-CN"] || r.skill.name?.["en-US"] || r.skill.id;
        return {
          skillId: r.skill.id,
          name: rNameStr,
          confidence: Math.round(r.score * 100) / 100,
          reason: r.reason,
          collectionId: r.skill.collectionId,
        };
      });

      return {
        matched: true,
        matchedSkill: top.skill,
        skill: top.skill,
        confidence: primarySkill.confidence,
        reason: primarySkill.reason,
        matchedTriggers: top.matchedTriggers,
        matchedIntent: top.matchedIntent,
        primarySkill,
        relatedSkills,
        allMatches: [primarySkill, ...relatedSkills],
      };
    }

    return {
      matched: false,
      matchedSkill: null,
      skill: null,
      confidence: 0,
      reason: "No matching skill found for query",
      primarySkill: undefined,
      relatedSkills: [],
    };
  }
}

