import type { SkillMatchResult, SkillMetadata } from "@localbridge/protocol";
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

    // 1. Explicit Skill Name / ID Matching (Highest Priority: 1.0)
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

    // 2. High-Level Intent & Context Analysis
    const hasCodeFileExtension = CODE_FILE_EXTENSION_REGEX.test(lowerQuery);
    const matchedCodeTarget =
      CODE_TARGET_KEYWORDS.find((w) => lowerQuery.includes(w)) ||
      (hasCodeFileExtension ? "file extension" : null);

    const hasSpecificFileTarget = Boolean(hasCodeFileExtension || lowerQuery.includes("app.js") || lowerQuery.includes("这个文件") || lowerQuery.includes("这段代码") || lowerQuery.includes("这个函数") || lowerQuery.includes("js 文件") || lowerQuery.includes("ts 文件"));
    const matchedDebugAction = DEBUG_ACTION_KEYWORDS.find((w) => lowerQuery.includes(w));
    const matchedProjectTarget = PROJECT_TARGET_KEYWORDS.find((w) => lowerQuery.includes(w));
    const matchedInspectAction = PROJECT_INSPECT_ACTION_KEYWORDS.find((w) => lowerQuery.includes(w));

    // 3. Score Candidate Skills
    let bestSkill: SkillMetadata | null = null;
    let highestScore = 0;
    let bestReason = "";
    let bestMatchedTriggers: string[] = [];
    let bestMatchedIntent: string | undefined = undefined;

    for (const skill of availableSkills) {
      if (!skill.enabled || skill.validationStatus === "invalid" || skill.validationStatus === "conflict") {
        continue;
      }

      let score = 0;
      const matchedTriggers: string[] = [];
      let matchedIntent: string | undefined = undefined;

      // A. Trigger keywords matching (Phrase Level)
      for (const trigger of skill.triggers) {
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
        // Code-debug intent: Target is code/file AND asking about problems/debugging
        if ((hasSpecificFileTarget || matchedCodeTarget) && matchedDebugAction) {
          // If query is specifically about project health without any specific code file, avoid code-debug false positive
          if (matchedProjectTarget && !hasSpecificFileTarget) {
            // "看看这个项目有没有问题" -> Whole project inspection, not single file code-debug
            score += 0.20;
          } else {
            score += 0.78;
            matchedIntent = `file/code-level debugging: ${matchedCodeTarget || "file"} + ${matchedDebugAction}`;
          }
        } else if (matchedDebugAction && !matchedProjectTarget) {
          // General debug action without project target (e.g. "有没有 bug", "为什么报错")
          score += 0.75;
          matchedIntent = `general code debugging: ${matchedDebugAction}`;
        }
      } else if (skill.id === "nexus.project-inspect") {
        // Project inspection intent: Target is the project as a whole
        if (matchedProjectTarget && matchedInspectAction) {
          score += 0.82;
          matchedIntent = `project architecture & inspection: ${matchedProjectTarget} + ${matchedInspectAction}`;
        } else if (matchedProjectTarget && matchedDebugAction && !hasSpecificFileTarget) {
          // "看看这个项目有没有问题" -> Project level health inspection
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
      const zhName = skill.name["zh-CN"]?.toLowerCase() || "";
      const enName = skill.name["en-US"]?.toLowerCase() || "";
      if (lowerQuery.includes(zhName) || (enName && lowerQuery.includes(enName))) {
        score += 0.20;
      }

      // E. Laya Recommendation Bonus
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
        bestMatchedTriggers = matchedTriggers;
        bestMatchedIntent = matchedIntent;

        const reasonParts: string[] = [];
        if (matchedIntent) {
          reasonParts.push(`matched intent: ${matchedIntent}`);
        }
        if (matchedTriggers.length > 0) {
          reasonParts.push(`matched triggers: [${matchedTriggers.join(", ")}]`);
        }
        if (catMatches.length > 0) {
          reasonParts.push(`category: ${skill.category}`);
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
        matchedTriggers: bestMatchedTriggers.length > 0 ? bestMatchedTriggers : undefined,
        matchedIntent: bestMatchedIntent,
      };
    }

    return {
      matchedSkill: null,
      confidence: 0,
      reason: "No matching skill found for query",
    };
  }
}

