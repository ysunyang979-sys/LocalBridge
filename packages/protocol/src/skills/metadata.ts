export interface CandidateQualityResult {
  score: number;
  isValidCandidate: boolean;
  reasons: string[];
  hasSkillMd: boolean;
  hasWorkflow: boolean;
  hasUsage: boolean;
  isHtmlHeavy: boolean;
}

export const GENERIC_HEADINGS = new Set([
  "about",
  "usage",
  "introduction",
  "table of contents",
  "overview",
  "getting started",
  "installation",
  "documentation",
  "features",
  "contributing",
  "license",
  "sponsors",
  "changelog",
  "requirements",
  "quick start",
  "summary",
  "ai bootstrap",
  "navigation",
  "关于",
  "使用方法",
  "介绍",
  "目录",
  "概述",
  "快速开始",
  "安装",
  "文档",
  "贡献",
  "赞助",
  "特性",
]);

/**
 * Strip HTML tags and unescape common HTML entities.
 * Returns empty string if the content is purely HTML tags with no meaningful text.
 */
export function stripHtml(input: string): string {
  if (!input) return "";

  // 1. Remove HTML comments
  let text = input.replace(/<!--[\s\S]*?-->/g, "");

  // 2. Remove script / style tags
  text = text.replace(/<(script|style)[^>]*>[\s\S]*?<\/\1>/gi, "");

  // 3. Remove all remaining HTML tags
  text = text.replace(/<[^>]+>/g, " ");

  // 4. Unescape common HTML entities
  text = text
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'");

  // 5. Remove any HTML tags that were encoded as entities (e.g. &lt;script&gt;)
  text = text.replace(/<(script|style)[^>]*>[\s\S]*?<\/\1>/gi, "");
  text = text.replace(/<[^>]+>/g, " ");

  // 6. Condense whitespace
  text = text.replace(/\s+/g, " ").trim();

  // If the result has no alphanumeric or CJK characters, treat as empty
  if (!/[\p{L}\p{N}]/u.test(text)) {
    return "";
  }

  return text;
}

/**
 * Check if a heading is a generic documentation heading that should not be used as a Skill name.
 */
export function isGenericHeading(heading: string): boolean {
  const clean = stripHtml(heading).toLowerCase().replace(/^#+\s*/, "").trim();
  return GENERIC_HEADINGS.has(clean);
}

/**
 * Extract meaningful title and description from Markdown/HTML text.
 * Strictly avoids generic headings like "About" and HTML tags like "<p align=\"center\">".
 */
export function extractMarkdownMetadata(
  md: string,
  candidateDirName?: string
): { title: string; desc: string; isGenericTitle: boolean } {
  let title = "";
  let desc = "";
  let isGeneric = false;

  // 1. Check for YAML frontmatter at top of document (common in SKILL.md)
  if (md.startsWith("---")) {
    const endFront = md.indexOf("---", 3);
    if (endFront > 3) {
      const frontContent = md.slice(3, endFront);
      const nameMatch = frontContent.match(/^name:\s*["']?([^\r\n"']+)["']?/m);
      const descMatch = frontContent.match(/^description:\s*["']?([^\r\n"']+)["']?/m);
      if (nameMatch && nameMatch[1]) {
        title = stripHtml(nameMatch[1].trim());
      }
      if (descMatch && descMatch[1]) {
        desc = stripHtml(descMatch[1].trim());
      }
    }
  }

  const lines = md.split("\n");

  // 2. Extract Title if not already found from frontmatter
  if (!title) {
    for (const rawLine of lines) {
      const line = rawLine.trim();
      if (!line) continue;

      // Check Markdown heading: # Title or ## Title
      if (line.startsWith("#")) {
        const candidateTitle = stripHtml(line.replace(/^#+\s*/, ""));
        if (candidateTitle) {
          if (isGenericHeading(candidateTitle)) {
            isGeneric = true;
            // Don't stop immediately; continue looking for a specific title or fallback to candidateDirName
          } else {
            title = candidateTitle;
            break;
          }
        }
      }

      // Check HTML heading: <h1...>Title</h1>
      const h1Match = line.match(/<h[12][^>]*>(.*?)<\/h[12]>/i);
      if (h1Match && h1Match[1]) {
        const candidateTitle = stripHtml(h1Match[1]);
        if (candidateTitle) {
          if (isGenericHeading(candidateTitle)) {
            isGeneric = true;
          } else {
            title = candidateTitle;
            break;
          }
        }
      }
    }
  }

  // 3. Extract Description if not already found from frontmatter
  if (!desc) {
    for (const rawLine of lines) {
      const line = rawLine.trim();
      if (!line) continue;

      // Skip Markdown headings and code blocks
      if (line.startsWith("#") || line.startsWith("```") || line.startsWith("---")) {
        continue;
      }

      // Skip HTML headings and pure anchor links
      if (/<h[1-6]/i.test(line) || /^<a\s+id=/i.test(line)) {
        continue;
      }

      // Skip image badges and shields
      if (
        line.includes("shields.io") ||
        line.includes("img.shields.io") ||
        line.includes("badge") ||
        line.includes("stargazers") ||
        line.includes("trendshift") ||
        (line.startsWith("<p") && line.includes("<img"))
      ) {
        continue;
      }

      // Strip HTML tags and markdown decorations
      const cleaned = stripHtml(line.replace(/^[*_`#>-]+\s*/, ""));

      // Ignore navigation bar style lines with only links
      if (cleaned.includes("·") && cleaned.split("·").length >= 3) {
        continue;
      }

      // Meaningful description line must have substance
      if (cleaned.length >= 10 && !cleaned.toLowerCase().startsWith("if you are an ai agent")) {
        desc = cleaned.slice(0, 200);
        break;
      }
    }
  }

  // If title was generic or missing, use formatted candidateDirName
  if (!title || isGeneric) {
    if (candidateDirName) {
      // e.g. competition-ad-certificate-abuse -> Competition Ad Certificate Abuse
      title = candidateDirName
        .split(/[-_]/)
        .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
        .join(" ");
    } else if (!title) {
      title = "Custom Skill";
    }
  }

  return {
    title: title || "Custom Skill",
    desc: desc || "",
    isGenericTitle: isGeneric,
  };
}

/**
 * Evaluate Candidate Quality Score based on documentation, sections, and repository indicators.
 */
export function evaluateCandidateQuality(options: {
  isRoot?: boolean;
  hasSkillMd: boolean;
  hasManifest: boolean;
  content: string;
}): CandidateQualityResult {
  let score = 0;
  const reasons: string[] = [];

  if (options.hasManifest) {
    score += 100;
    reasons.push("Found skill.yaml manifest (+100)");
  }

  if (options.hasSkillMd) {
    score += 50;
    reasons.push("Found SKILL.md (+50)");
  } else {
    score += 5;
    reasons.push("Only README found (+5)");
  }

  const contentLower = options.content.toLowerCase();
  const lines = options.content.split("\n");
  const first20Lines = lines.slice(0, 20).join("\n").toLowerCase();

  // Check Purpose / When to Use / Scope section
  const hasPurpose =
    contentLower.includes("## purpose") ||
    contentLower.includes("## when to use") ||
    contentLower.includes("## 用途") ||
    contentLower.includes("## 目标") ||
    contentLower.includes("quick start") ||
    contentLower.includes("overview");
  if (hasPurpose) {
    score += 15;
    reasons.push("Contains purpose or overview section (+15)");
  }

  // Check Workflow / Steps section
  const hasWorkflow =
    contentLower.includes("## workflow") ||
    contentLower.includes("## steps") ||
    contentLower.includes("## instructions") ||
    contentLower.includes("## 工作流") ||
    contentLower.includes("## 执行步骤") ||
    contentLower.includes("### 1.") ||
    contentLower.includes("## quick start");
  if (hasWorkflow) {
    score += 15;
    reasons.push("Contains workflow section (+15)");
  } else {
    score -= 20;
    reasons.push("Missing workflow section (-20)");
  }

  // Check Usage instructions
  const hasUsage =
    contentLower.includes("## usage") ||
    contentLower.includes("### usage") ||
    contentLower.includes("使用说明") ||
    contentLower.includes("使用方法");
  if (hasUsage) {
    score += 10;
    reasons.push("Contains usage section (+10)");
  }

  // Check Tool / Task descriptions
  const hasTools =
    contentLower.includes("## tools") ||
    contentLower.includes("## capabilities") ||
    contentLower.includes("## references") ||
    contentLower.includes("mcp") ||
    contentLower.includes("工具");
  if (hasTools) {
    score += 10;
    reasons.push("Contains tools or references (+10)");
  }

  // Deductions:
  // 1. HTML-heavy header: first 20 lines contain <p align, <img, <h1>, <br
  const htmlTagCountInHeader = (first20Lines.match(/<p|<img|<h1|<h3|<br|<div/g) || []).length;
  const isHtmlHeavy = htmlTagCountInHeader >= 3;
  if (isHtmlHeavy) {
    score -= 20;
    reasons.push("HTML-heavy repository header (-20)");
  }

  // 2. About-only metadata (e.g. only "# About" or "## About" with no skill/workflow structure)
  const isAboutOnly =
    (contentLower.includes("## about") || contentLower.includes("# about")) && !hasWorkflow;
  if (isAboutOnly) {
    score -= 20;
    reasons.push("About-only generic metadata (-20)");
  }

  // 3. Badge-only / repository banner content in header
  const isBadgeHeavy =
    (first20Lines.match(/shields\.io|badge|stargazers|trendshift/g) || []).length >= 2;
  if (isBadgeHeavy) {
    score -= 20;
    reasons.push("Badge-heavy repo banner in header (-20)");
  }

  // Minimum threshold for a valid skill candidate:
  // Manifest always valid; SKILL.md always valid; raw README requires score >= 30.
  const isValidCandidate = options.hasManifest || options.hasSkillMd || score >= 30;

  return {
    score,
    isValidCandidate,
    reasons,
    hasSkillMd: options.hasSkillMd,
    hasWorkflow,
    hasUsage,
    isHtmlHeavy,
  };
}

/**
 * Resolve Raw Skill Name based on strict priority:
 * 1. SKILL.md H1 (or frontmatter name)
 * 2. README.md H1 (or frontmatter name)
 * 3. Folder Name
 * 4. ZIP Name
 * Filters out generic headings like About, Overview, Introduction.
 */
export function resolveRawSkillName(options: {
  skillMdContent?: string;
  readmeContent?: string;
  folderName?: string;
  zipName?: string;
}): string {
  // 1. Try SKILL.md
  if (options.skillMdContent) {
    const meta = extractMarkdownMetadata(options.skillMdContent);
    if (meta.title && !meta.isGenericTitle && !isGenericHeading(meta.title)) {
      return meta.title;
    }
  }

  // 2. Try README.md
  if (options.readmeContent) {
    const meta = extractMarkdownMetadata(options.readmeContent);
    if (meta.title && !meta.isGenericTitle && !isGenericHeading(meta.title)) {
      return meta.title;
    }
  }

  // 3. Folder Name
  if (options.folderName && options.folderName.trim()) {
    const cleanFolder = options.folderName.trim().replace(/[/\\]+$/, "");
    const base = cleanFolder.split(/[/\\]/).pop();
    if (base && base.trim() && !isGenericHeading(base)) {
      return base.trim();
    }
  }

  // 4. ZIP Name
  if (options.zipName && options.zipName.trim()) {
    const cleanZip = options.zipName.trim().replace(/\.zip$/i, "");
    if (cleanZip && !isGenericHeading(cleanZip)) {
      return cleanZip;
    }
  }

  return options.folderName || options.zipName || "Custom Skill";
}

