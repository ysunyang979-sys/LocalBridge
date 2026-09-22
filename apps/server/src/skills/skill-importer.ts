import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import crypto from "node:crypto";
import YAML from "yaml";
import {
  type SkillImportPreview,
  type SkillImportResult,
  type SkillDeleteResult,
  type SkillRawContentResult,
  type SkillCategory,
  type SkillRisk,
  type SkillValidationStatus,
  type SkillCandidate,
  extractMarkdownMetadata,
  evaluateCandidateQuality,
  resolveRawSkillName,
} from "@localbridge/protocol";
import type { SkillValidator } from "./skill-validator.js";
import type { SkillLoader } from "./skill-loader.js";
import type { SkillRegistry } from "./skill-registry.js";
import { parseZip, type ZipEntry } from "./zip-util.js";

const EXECUTABLE_FILE_REGEX =
  /\.(sh|bash|zsh|ps1|bat|cmd|exe|com|msi|vbs|vbe|js|mjs|cjs|py|rb|pl|dll|node|jar|bin|app|so|dylib)$/i;

export interface SkillImporterOptions {
  validator: SkillValidator;
  loader: SkillLoader;
  registry: SkillRegistry;
  validMcpTools?: ReadonlySet<string>;
}

function slugify(str: string): string {
  const slug = str
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^[._-]+|[._-]+$/g, "");
  return slug.slice(0, 50) || "custom-skill";
}


function detectZipRootPrefix(entries: ZipEntry[]): string {
  const nonDirEntries = entries.filter((e) => !e.isDirectory && e.name.length > 0);
  if (nonDirEntries.length === 0) return "";
  const firstSegments = nonDirEntries.map((e) => e.name.split("/")[0]);
  const candidate = firstSegments[0];
  if (candidate && firstSegments.every((s) => s === candidate)) {
    if (nonDirEntries.some((e) => e.name.includes("/"))) {
      return candidate + "/";
    }
  }
  return "";
}

function resolveZipPrefix(entries: ZipEntry[], subPath?: string): string {
  const singleRoot = detectZipRootPrefix(entries);
  if (!subPath) return singleRoot;
  const cleanSub = subPath.replace(/^\/+/, "").replace(/\/+$/, "");
  // Check if cleanSub already matches entries directly
  const directMatch = entries.some(
    (e) => e.name.startsWith(cleanSub + "/") || e.name === cleanSub
  );
  if (directMatch) {
    return cleanSub + "/";
  }
  // Check if singleRoot + cleanSub matches entries
  if (singleRoot) {
    const combined = (singleRoot + cleanSub).replace(/\/?$/, "/");
    const combinedMatch = entries.some(
      (e) => e.name.startsWith(combined) || e.name === combined.replace(/\/$/, "")
    );
    if (combinedMatch) {
      return combined;
    }
  }
  return singleRoot ? (singleRoot + cleanSub).replace(/\/?$/, "/") : cleanSub + "/";
}

function discoverSubCandidatesFromEntries(entries: ZipEntry[], rootPrefix: string): SkillCandidate[] {
  const candidates: SkillCandidate[] = [];
  const seenPaths = new Set<string>();

  for (const e of entries) {
    if (rootPrefix && !e.name.startsWith(rootPrefix)) continue;
    const rel = rootPrefix ? e.name.slice(rootPrefix.length) : e.name;
    const lowerName = e.name.toLowerCase();

    if (
      !e.isDirectory &&
      (lowerName.endsWith("/skill.yaml") ||
        lowerName.endsWith("/skill.yml") ||
        lowerName.endsWith("/skill.md"))
    ) {
      const parts = rel.split("/");
      if (parts.length >= 2 && parts.length <= 4) {
        const subRelPath = parts.slice(0, parts.length - 1).join("/");
        if (!seenPaths.has(subRelPath)) {
          seenPaths.add(subRelPath);
          const name = parts[parts.length - 2] || subRelPath;
          const candidatePrefix = rootPrefix ? `${rootPrefix}${subRelPath}/` : `${subRelPath}/`;
          const hasYaml = entries.some(
            (x) =>
              !x.isDirectory &&
              (x.name === `${candidatePrefix}skill.yaml` ||
                x.name === `${candidatePrefix}skill.yml`)
          );
          const hasMd = entries.some(
            (x) =>
              !x.isDirectory &&
              (x.name === `${candidatePrefix}SKILL.md` ||
                x.name.toLowerCase() === `${candidatePrefix}skill.md`)
          );

          let candidateDoc = "";
          if (hasMd) {
            const docEntry = entries.find(
              (x) =>
                !x.isDirectory &&
                (x.name === `${candidatePrefix}SKILL.md` ||
                  x.name.toLowerCase() === `${candidatePrefix}skill.md`)
            );
            if (docEntry) {
              candidateDoc = docEntry.data.toString("utf-8");
            }
          }
          const quality = evaluateCandidateQuality({
            isRoot: false,
            hasSkillMd: hasMd,
            hasManifest: hasYaml,
            content: candidateDoc,
          });

          candidates.push({
            id: `user.${slugify(name)}`,
            name,
            path: subRelPath,
            hasManifest: hasYaml,
            docPath: hasMd ? `${subRelPath}/SKILL.md` : undefined,
            qualityScore: quality.score,
            isValidCandidate: quality.isValidCandidate,
            qualityReasons: quality.reasons,
            isRoot: false,
          });
        }
      }
    }
  }
  return candidates;
}

function discoverSubCandidatesFromFolder(rootPath: string): SkillCandidate[] {
  const candidates: SkillCandidate[] = [];
  const seenPaths = new Set<string>();

  try {
    const entries = fs.readdirSync(rootPath, { withFileTypes: true, recursive: true });
    for (const entry of entries) {
      if (entry.isFile()) {
        const nameLower = entry.name.toLowerCase();
        if (nameLower === "skill.yaml" || nameLower === "skill.yml" || nameLower === "skill.md") {
          const entryFull = path.join(entry.parentPath || (entry as any).path || rootPath, entry.name);
          const rel = path.relative(rootPath, entryFull).replace(/\\/g, "/");
          const parts = rel.split("/");
          if (parts.length >= 2 && parts.length <= 4) {
            const subRelPath = parts.slice(0, parts.length - 1).join("/");
            if (!seenPaths.has(subRelPath)) {
              seenPaths.add(subRelPath);
              const dirName = parts[parts.length - 2] || subRelPath;
              const subFull = path.join(rootPath, subRelPath);
              const hasYaml =
                fs.existsSync(path.join(subFull, "skill.yaml")) ||
                fs.existsSync(path.join(subFull, "skill.yml"));
              const hasMd =
                fs.existsSync(path.join(subFull, "SKILL.md")) ||
                fs.existsSync(path.join(subFull, "skill.md"));

              let candidateDoc = "";
              const candidateMdPath = path.join(subFull, "SKILL.md");
              const candidateLowerMdPath = path.join(subFull, "skill.md");
              if (fs.existsSync(candidateMdPath)) {
                candidateDoc = fs.readFileSync(candidateMdPath, "utf-8");
              } else if (fs.existsSync(candidateLowerMdPath)) {
                candidateDoc = fs.readFileSync(candidateLowerMdPath, "utf-8");
              }
              const quality = evaluateCandidateQuality({
                isRoot: false,
                hasSkillMd: hasMd,
                hasManifest: hasYaml,
                content: candidateDoc,
              });

              candidates.push({
                id: `user.${slugify(dirName)}`,
                name: dirName,
                path: subRelPath,
                hasManifest: hasYaml,
                docPath: hasMd ? `${subRelPath}/SKILL.md` : undefined,
                qualityScore: quality.score,
                isValidCandidate: quality.isValidCandidate,
                qualityReasons: quality.reasons,
                isRoot: false,
              });
            }
          }
        }
      }
    }
  } catch {}

  return candidates;
}

export class SkillImporter {
  private readonly validator: SkillValidator;
  private readonly loader: SkillLoader;
  private readonly registry: SkillRegistry;

  constructor(options: SkillImporterOptions) {
    this.validator = options.validator;
    this.loader = options.loader;
    this.registry = options.registry;
  }

  private createStagingDir(): string {
    const baseTmp =
      process.platform === "win32" && process.env.LOCALAPPDATA
        ? path.join(process.env.LOCALAPPDATA, "LocalBridge", "tmp", "skill-staging")
        : path.join(os.tmpdir(), "localbridge-skill-staging");
    fs.mkdirSync(baseTmp, { recursive: true });
    const stagingDir = path.join(baseTmp, crypto.randomUUID());
    fs.mkdirSync(stagingDir, { recursive: true });
    return stagingDir;
  }

  private findExecutableFilesInDir(dir: string): string[] {
    const results: string[] = [];
    if (!fs.existsSync(dir)) return results;
    try {
      const entries = fs.readdirSync(dir, { withFileTypes: true, recursive: true });
      for (const entry of entries) {
        const name = typeof entry === "string" ? entry : (entry as any).name;
        if (EXECUTABLE_FILE_REGEX.test(name)) {
          results.push(name);
        }
      }
    } catch {}
    return results;
  }

  /**
   * Preview a skill folder before importing.
   */
  async previewFolder(
    folderPath: string,
    target: "user" | "project" = "user",
    projectId?: string,
    subPath?: string
  ): Promise<SkillImportPreview> {
    const normPath = path.resolve(folderPath);
    if (!fs.existsSync(normPath)) {
      return this.createInvalidPreview("folder", "Source folder does not exist");
    }

    const stat = fs.statSync(normPath);
    if (!stat.isDirectory()) {
      return this.createInvalidPreview("folder", "Source path is not a directory");
    }

    const activeFolder = subPath ? path.resolve(normPath, subPath) : normPath;
    if (!fs.existsSync(activeFolder)) {
      return this.createInvalidPreview("folder", `Specified sub-path does not exist: ${subPath}`);
    }

    const candidateName = subPath
      ? path.basename(subPath.replace(/[\\/]+$/, ""))
      : path.basename(activeFolder);
    const folderName = candidateName;

    const yamlPath = path.join(activeFolder, "skill.yaml");
    const ymlPath = path.join(activeFolder, "skill.yml");
    const activeYamlPath = fs.existsSync(yamlPath) ? yamlPath : fs.existsSync(ymlPath) ? ymlPath : null;

    const mdPath = path.join(activeFolder, "SKILL.md");
    const lowerMdPath = path.join(activeFolder, "skill.md");
    const readmePath = path.join(activeFolder, "README.md");
    const readmeZhPath = path.join(activeFolder, "README_zh.md");
    const activeDocPath = fs.existsSync(mdPath)
      ? mdPath
      : fs.existsSync(lowerMdPath)
      ? lowerMdPath
      : fs.existsSync(readmePath)
      ? readmePath
      : fs.existsSync(readmeZhPath)
      ? readmeZhPath
      : null;

    // Scan for all executables in whole folder vs active subfolder
    const totalFolderExecutables: string[] = [];
    try {
      const allEntries = fs.readdirSync(normPath, { recursive: true });
      for (const entry of allEntries) {
        const strEntry = typeof entry === "string" ? entry : (entry as any).name;
        if (EXECUTABLE_FILE_REGEX.test(strEntry)) {
          totalFolderExecutables.push(strEntry);
        }
      }
    } catch {}

    const executableFilesFound: string[] = [];
    try {
      const entries = fs.readdirSync(activeFolder, { recursive: true });
      for (const entry of entries) {
        const strEntry = typeof entry === "string" ? entry : (entry as any).name;
        if (EXECUTABLE_FILE_REGEX.test(strEntry)) {
          executableFilesFound.push(strEntry);
        }
      }
    } catch {}

    const archiveTotalExecutables = totalFolderExecutables.length;
    const candidateExecutablesCount = executableFilesFound.length;

    const candidateSkills = discoverSubCandidatesFromFolder(normPath);
    let markdownContent = "";
    if (activeDocPath) {
      try {
        markdownContent = fs.readFileSync(activeDocPath, "utf-8");
      } catch {}
    }

    // Case 1: skill.yaml manifest is present
    if (activeYamlPath) {
      let rawYaml = "";
      let parsedYaml: any = null;
      const errors: string[] = [];

      try {
        rawYaml = fs.readFileSync(activeYamlPath, "utf-8");
        parsedYaml = YAML.parse(rawYaml);
      } catch (err: any) {
        errors.push(`Failed to parse skill.yaml: ${err.message}`);
      }

      if (!activeDocPath) {
        errors.push("Missing required SKILL.md instructions file");
      }

      const valResult = this.validator.validate(activeFolder, parsedYaml, markdownContent, {
        isBuiltin: false,
      });
      const allErrors = [...errors, ...valResult.errors];

      let secWarning = valResult.securityWarning;
      if (archiveTotalExecutables > 0 && !secWarning) {
        secWarning =
          candidateExecutablesCount > 0
            ? `文件夹共发现 ${archiveTotalExecutables} 个可执行资源，当前候选包含 ${candidateExecutablesCount} 个，导入时全部排除。`
            : `文件夹共发现 ${archiveTotalExecutables} 个可执行资源，当前候选包含 0 个，导入时全部排除。`;
      }

      return this.buildPreview({
        id: parsedYaml?.id || folderName,
        version: parsedYaml?.version || "1.0.0",
        parsedYaml,
        markdownContent,
        rawYaml,
        errors: allErrors,
        securityWarning: secWarning,
        executableFilesFound,
        target,
        projectId,
        importMode: "native",
        detectedRoot: folderName,
        manifestFound: true,
        skillDocFound: Boolean(activeDocPath),
        candidateSkills: candidateSkills.length > 0 ? candidateSkills : undefined,
        archiveTotalExecutables,
        candidateExecutablesCount,
      });
    }

    // Case 2: No skill.yaml manifest, but documentation exists -> Raw User Skill
    if (activeDocPath) {
      const isRoot = !subPath || subPath === "" || subPath === "/";
      const candidateDocs: string[] = [];
      try {
        const scan = (d: string, prefix = "") => {
          for (const ent of fs.readdirSync(d, { withFileTypes: true })) {
            const rel = prefix ? `${prefix}/${ent.name}` : ent.name;
            if (ent.isDirectory()) {
              if (["references", "docs", "doc", "examples", "agents", "skills"].includes(ent.name.toLowerCase())) {
                scan(path.join(d, ent.name), rel);
              }
            } else if (ent.isFile() && /\.(md|txt)$/i.test(ent.name)) {
              candidateDocs.push(rel);
            }
          }
        };
        scan(activeFolder);
      } catch {}

      const primaryDocName = path.basename(activeDocPath);
      let skillMdText = "";
      let readmeText = "";
      if (primaryDocName.toLowerCase() === "skill.md") {
        skillMdText = markdownContent;
      } else {
        readmeText = markdownContent;
      }

      const otherSkillMd = path.join(activeFolder, "SKILL.md");
      const otherReadme = path.join(activeFolder, "README.md");
      if (!skillMdText && fs.existsSync(otherSkillMd)) {
        try { skillMdText = fs.readFileSync(otherSkillMd, "utf-8"); } catch {}
      }
      if (!readmeText && fs.existsSync(otherReadme)) {
        try { readmeText = fs.readFileSync(otherReadme, "utf-8"); } catch {}
      }

      const resolvedName = resolveRawSkillName({
        skillMdContent: skillMdText,
        readmeContent: readmeText,
        folderName,
      });

      const tentativeId = "user." + slugify(folderName);
      let secWarning: string | undefined;
      if (archiveTotalExecutables > 0) {
        secWarning =
          candidateExecutablesCount > 0
            ? `文件夹共发现 ${archiveTotalExecutables} 个可执行资源，当前候选包含 ${candidateExecutablesCount} 个，导入时全部排除。`
            : `文件夹共发现 ${archiveTotalExecutables} 个可执行资源，当前候选包含 0 个，导入时全部排除。`;
      }

      let rootNotice: string | undefined;
      if (isRoot && candidateSkills.length > 0) {
        rootNotice = "该仓库包含多个子技能候选，你可以直接导入或从下方选择具体技能。";
      }

      const rawValidation = this.validator.validateRaw(activeFolder, {
        id: tentativeId,
        name: resolvedName,
        markdownContent,
      });

      return this.buildPreview({
        id: tentativeId,
        version: "1.0.0",
        parsedYaml: {
          name: { "zh-CN": resolvedName, "en-US": resolvedName },
          description: { "zh-CN": markdownContent.slice(0, 150).replace(/[#*`\n]/g, " ").trim(), "en-US": markdownContent.slice(0, 150).replace(/[#*`\n]/g, " ").trim() },
          category: "general",
          risk: "low",
          triggers: [folderName, folderName.replace(/[-_]/g, " "), resolvedName],
          tools: [],
          workflow: [],
        },
        markdownContent,
        rawYaml: "",
        errors: [],
        securityWarning: secWarning || rawValidation.securityWarning,
        executableFilesFound,
        target,
        projectId,
        validationStatus: secWarning ? "warning" : "valid",
        importMode: "raw",
        skillType: "raw",
        primaryDocument: primaryDocName,
        availableDocuments: candidateDocs.length > 0 ? candidateDocs : [primaryDocName],
        documents: candidateDocs.length > 0 ? candidateDocs : [primaryDocName],
        filesCount: candidateDocs.length,
        detectedRoot: folderName,
        manifestFound: false,
        skillDocFound: true,
        candidateSkills: candidateSkills.length > 0 ? candidateSkills : undefined,
        archiveTotalExecutables,
        candidateExecutablesCount,
        rootQualityNotice: rootNotice,
      });
    }

    // Case 3: Neither manifest nor documentation exists
    return this.createInvalidPreview(
      "folder",
      "Missing required skill.yaml manifest and no documentation found in selected folder"
    );
  }

  /**
   * Preview a skill ZIP archive before importing.
   */
  async previewZip(
    zipBufferOrPath: Buffer | string,
    target: "user" | "project" = "user",
    projectId?: string,
    subPath?: string
  ): Promise<SkillImportPreview> {
    let buffer: Buffer;
    if (typeof zipBufferOrPath === "string") {
      const normPath = path.resolve(zipBufferOrPath);
      if (!fs.existsSync(normPath)) {
        return this.createInvalidPreview("zip", "ZIP file does not exist");
      }
      buffer = fs.readFileSync(normPath);
    } else {
      buffer = zipBufferOrPath;
    }

    let entries: ZipEntry[];
    try {
      entries = parseZip(buffer);
    } catch (err: any) {
      return this.createInvalidPreview("zip", err.message || "Invalid or corrupt ZIP archive");
    }

    const singleRoot = detectZipRootPrefix(entries);
    const rootPrefix = resolveZipPrefix(entries, subPath);

    // Scan for all executable files in entire archive
    const allArchiveExecutables: string[] = [];
    for (const e of entries) {
      if (!e.isDirectory && EXECUTABLE_FILE_REGEX.test(e.name)) {
        allArchiveExecutables.push(e.name);
      }
    }

    // Filter executables belonging to selected candidate
    const candidateExecutables = subPath
      ? allArchiveExecutables.filter((e) => e.startsWith(rootPrefix))
      : allArchiveExecutables;

    const candidateSkills = discoverSubCandidatesFromEntries(entries, singleRoot);

    // Look for manifest under rootPrefix
    let yamlEntry = entries.find(
      (e) =>
        !e.isDirectory &&
        (e.name === `${rootPrefix}skill.yaml` || e.name === `${rootPrefix}skill.yml`)
    );
    if (!yamlEntry && !subPath) {
      yamlEntry = entries.find(
        (e) => !e.isDirectory && (e.name.endsWith("/skill.yaml") || e.name.endsWith("/skill.yml"))
      );
    }

    // Look for documentation under rootPrefix
    let mdEntry = entries.find(
      (e) =>
        !e.isDirectory &&
        (e.name === `${rootPrefix}SKILL.md` ||
          e.name.toLowerCase() === `${rootPrefix}skill.md` ||
          e.name === `${rootPrefix}README.md` ||
          e.name === `${rootPrefix}README_zh.md` ||
          e.name.toLowerCase() === `${rootPrefix}readme.md`)
    );
    if (!mdEntry && !subPath) {
      mdEntry = entries.find(
        (e) =>
          !e.isDirectory &&
          (e.name.toLowerCase().endsWith("/skill.md") || e.name.toLowerCase().endsWith("/readme.md"))
      );
    }

    let markdownContent = "";
    if (mdEntry) {
      try {
        markdownContent = mdEntry.data.toString("utf-8");
      } catch {}
    }

    const candidateName = subPath
      ? path.basename(subPath.replace(/[\\/]+$/, ""))
      : singleRoot.replace(/\/$/, "") ||
        (typeof zipBufferOrPath === "string"
          ? path.basename(zipBufferOrPath, ".zip")
          : "compatible-skill");

    const pkgName = candidateName;
    const archiveTotalExecutables = allArchiveExecutables.length;
    const candidateExecutablesCount = candidateExecutables.length;

    // Case 1: Valid or invalid YAML manifest found
    if (yamlEntry) {
      let rawYaml = "";
      let parsedYaml: any = null;
      const errors: string[] = [];

      try {
        rawYaml = yamlEntry.data.toString("utf-8");
        parsedYaml = YAML.parse(rawYaml);
      } catch (err: any) {
        errors.push(`Failed to parse skill.yaml: ${err.message}`);
      }

      if (!mdEntry) {
        errors.push("Missing required SKILL.md instructions file in ZIP archive");
      }

      const valResult = this.validator.validate("", parsedYaml, markdownContent, {
        isBuiltin: false,
      });
      const allErrors = [...errors, ...valResult.errors];

      let secWarning = valResult.securityWarning;
      if (archiveTotalExecutables > 0 && !secWarning) {
        secWarning =
          candidateExecutablesCount > 0
            ? `归档共发现 ${archiveTotalExecutables} 个可执行资源，当前候选包含 ${candidateExecutablesCount} 个，导入时全部排除。`
            : `归档共发现 ${archiveTotalExecutables} 个可执行资源，当前候选包含 0 个，导入时全部排除。`;
      }

      return this.buildPreview({
        id: parsedYaml?.id || pkgName,
        version: parsedYaml?.version || "1.0.0",
        parsedYaml,
        markdownContent,
        rawYaml,
        errors: allErrors,
        securityWarning: secWarning,
        executableFilesFound: candidateExecutables,
        target,
        projectId,
        importMode: singleRoot ? "compatible" : "native",
        detectedRoot: singleRoot || pkgName,
        manifestFound: true,
        skillDocFound: Boolean(mdEntry),
        candidateSkills: candidateSkills.length > 0 ? candidateSkills : undefined,
        archiveTotalExecutables,
        candidateExecutablesCount,
      });
    }

    // Case 2: No skill.yaml manifest, but documentation exists -> Raw User Skill
    if (mdEntry) {
      const isRoot = !subPath || subPath === "" || subPath === "/";
      const candidateDocs: string[] = [];
      for (const e of entries) {
        if (!e.name.startsWith(rootPrefix) || e.isDirectory) continue;
        const rel = e.name.slice(rootPrefix.length);
        if (/\.(md|txt)$/i.test(rel)) {
          candidateDocs.push(rel);
        }
      }

      let skillMdText = "";
      let readmeText = "";
      const primaryDocName = path.basename(mdEntry.name);
      if (primaryDocName.toLowerCase() === "skill.md") {
        skillMdText = markdownContent;
      } else {
        readmeText = markdownContent;
      }

      const otherSkillMdEntry = entries.find(
        (e) => !e.isDirectory && (e.name === `${rootPrefix}SKILL.md` || e.name.toLowerCase() === `${rootPrefix}skill.md`)
      );
      const otherReadmeEntry = entries.find(
        (e) => !e.isDirectory && (e.name === `${rootPrefix}README.md` || e.name.toLowerCase() === `${rootPrefix}readme.md`)
      );
      if (!skillMdText && otherSkillMdEntry) {
        try { skillMdText = otherSkillMdEntry.data.toString("utf-8"); } catch {}
      }
      if (!readmeText && otherReadmeEntry) {
        try { readmeText = otherReadmeEntry.data.toString("utf-8"); } catch {}
      }

      const resolvedName = resolveRawSkillName({
        skillMdContent: skillMdText,
        readmeContent: readmeText,
        folderName: pkgName,
        zipName: typeof zipBufferOrPath === "string" ? path.basename(zipBufferOrPath) : undefined,
      });

      const tentativeId = "user." + slugify(pkgName);
      let secWarning: string | undefined;
      if (archiveTotalExecutables > 0) {
        secWarning =
          candidateExecutablesCount > 0
            ? `归档共发现 ${archiveTotalExecutables} 个可执行资源，当前候选包含 ${candidateExecutablesCount} 个，导入时全部排除。`
            : `归档共发现 ${archiveTotalExecutables} 个可执行资源，当前候选包含 0 个，导入时全部排除。`;
      }

      let rootNotice: string | undefined;
      if (isRoot && candidateSkills.length > 0) {
        rootNotice = "该仓库包含多个子技能候选，你可以直接导入或从下方选择具体技能。";
      }

      return this.buildPreview({
        id: tentativeId,
        version: "1.0.0",
        parsedYaml: {
          name: { "zh-CN": resolvedName, "en-US": resolvedName },
          description: { "zh-CN": markdownContent.slice(0, 150).replace(/[#*`\n]/g, " ").trim(), "en-US": markdownContent.slice(0, 150).replace(/[#*`\n]/g, " ").trim() },
          category: "general",
          risk: "low",
          triggers: [pkgName, pkgName.replace(/[-_]/g, " "), resolvedName],
          tools: [],
          workflow: [],
        },
        markdownContent,
        rawYaml: "",
        errors: [],
        securityWarning: secWarning,
        executableFilesFound: candidateExecutables,
        target,
        projectId,
        validationStatus: secWarning ? "warning" : "valid",
        importMode: "raw",
        skillType: "raw",
        primaryDocument: primaryDocName,
        availableDocuments: candidateDocs.length > 0 ? candidateDocs : [primaryDocName],
        documents: candidateDocs.length > 0 ? candidateDocs : [primaryDocName],
        filesCount: candidateDocs.length,
        detectedRoot: singleRoot || pkgName,
        manifestFound: false,
        skillDocFound: true,
        candidateSkills: candidateSkills.length > 0 ? candidateSkills : undefined,
        archiveTotalExecutables,
        candidateExecutablesCount,
        rootQualityNotice: rootNotice,
      });
    }

    // Case 3: Neither manifest nor documentation found
    return this.createInvalidPreview(
      "zip",
      "Missing required skill.yaml manifest and no documentation found in ZIP archive"
    );
  }

  /**
   * Import a skill folder via a secure Staging Directory transaction.
   */
  async importFolder(params: {
    sourcePath: string;
    target: "user" | "project";
    projectId?: string;
    projectRoot?: string;
    overwrite?: boolean;
    customYaml?: string;
    subPath?: string;
  }): Promise<SkillImportResult> {
    const stagingDir = this.createStagingDir();

    try {
      // Step 1: Resolve source and candidate path
      const normSrc = path.resolve(params.sourcePath);
      if (!fs.existsSync(normSrc)) {
        return {
          success: false,
          code: "SOURCE_PATH_NOT_FOUND",
          stage: "resolve_subpath",
          message: `源目录不存在: ${params.sourcePath}`,
          error: `源目录不存在: ${params.sourcePath}`,
        };
      }

      const activeSrc = params.subPath ? path.resolve(normSrc, params.subPath) : normSrc;
      if (!fs.existsSync(activeSrc)) {
        return {
          success: false,
          code: "CANDIDATE_PATH_NOT_FOUND",
          stage: "resolve_subpath",
          message: `所选 candidate 路径不存在: ${params.subPath}`,
          error: `所选 candidate 路径不存在: ${params.subPath}`,
        };
      }

      // Step 2: Copy declarative safe content to staging (skipping executables)
      this.copyDirRecursive(activeSrc, stagingDir);

      // Step 3: Assert Executable Files = 0 in staging
      this.sanitizeTargetDir(stagingDir);
      const remainingExecutables = this.findExecutableFilesInDir(stagingDir);
      if (remainingExecutables.length > 0) {
        return {
          success: false,
          code: "EXECUTABLE_FILES_PERSISTED",
          stage: "declarative_sanitization",
          message: `Staging directory contains forbidden executable files after sanitization: ${remainingExecutables.join(", ")}`,
          error: `Staging directory contains forbidden executable files after sanitization: ${remainingExecutables.join(", ")}`,
        };
      }

      // Step 4: Inject customYaml or verify existing manifest in staging
      if (params.customYaml) {
        let parsedCustom: any;
        try {
          parsedCustom = YAML.parse(params.customYaml);
        } catch (err: any) {
          return {
            success: false,
            code: "MANIFEST_PARSE_ERROR",
            stage: "manifest_injection",
            message: `Failed to parse skill.yaml manifest: ${err.message}`,
            error: err.message,
            details: { parseError: err.message },
          };
        }

        let canonicalYaml = params.customYaml;
        try {
          if (parsedCustom && typeof parsedCustom === "object") {
            canonicalYaml = YAML.stringify(parsedCustom, { indent: 2, lineWidth: 0 });
          }
        } catch {}

        fs.writeFileSync(path.join(stagingDir, "skill.yaml"), canonicalYaml, "utf-8");
      }

      const stagingYamlPath = path.join(stagingDir, "skill.yaml");
      const stagingYmlPath = path.join(stagingDir, "skill.yml");
      const activeYaml = fs.existsSync(stagingYamlPath)
        ? stagingYamlPath
        : fs.existsSync(stagingYmlPath)
        ? stagingYmlPath
        : null;

      if (!activeYaml) {
        // Raw User Skill import flow
        const candidateDocs: string[] = [];
        try {
          const scan = (d: string, prefix = "") => {
            for (const ent of fs.readdirSync(d, { withFileTypes: true })) {
              const rel = prefix ? `${prefix}/${ent.name}` : ent.name;
              if (ent.isDirectory()) {
                if (["references", "docs", "doc", "examples", "agents", "skills"].includes(ent.name.toLowerCase())) {
                  scan(path.join(d, ent.name), rel);
                }
              } else if (ent.isFile() && /\.(md|txt)$/i.test(ent.name)) {
                candidateDocs.push(rel);
              }
            }
          };
          scan(stagingDir);
        } catch {}

        const mdPath = path.join(stagingDir, "SKILL.md");
        const lowerMdPath = path.join(stagingDir, "skill.md");
        const readmePath = path.join(stagingDir, "README.md");
        const readmeZhPath = path.join(stagingDir, "README_zh.md");
        const activeDocPath = fs.existsSync(mdPath)
          ? mdPath
          : fs.existsSync(lowerMdPath)
          ? lowerMdPath
          : fs.existsSync(readmePath)
          ? readmePath
          : fs.existsSync(readmeZhPath)
          ? readmeZhPath
          : candidateDocs.length > 0
          ? path.join(stagingDir, candidateDocs[0])
          : null;

        if (!activeDocPath) {
          return {
            success: false,
            code: "DOCUMENTATION_MISSING",
            stage: "staging_validation",
            message: "未发现有效文档 (SKILL.md 或 README.md)",
            error: "未发现有效文档 (SKILL.md 或 README.md)",
            validationErrors: ["Missing documentation file (SKILL.md or README.md)"],
          };
        }

        const primaryDocName = path.relative(stagingDir, activeDocPath).replace(/\\/g, "/");
        let markdownContent = "";
        try {
          markdownContent = fs.readFileSync(activeDocPath, "utf-8");
        } catch {}

        let skillMdText = "";
        let readmeText = "";
        if (primaryDocName.toLowerCase() === "skill.md") {
          skillMdText = markdownContent;
        } else {
          readmeText = markdownContent;
        }
        if (!skillMdText && (fs.existsSync(mdPath) || fs.existsSync(lowerMdPath))) {
          try { skillMdText = fs.readFileSync(fs.existsSync(mdPath) ? mdPath : lowerMdPath, "utf-8"); } catch {}
        }
        if (!readmeText && (fs.existsSync(readmePath) || fs.existsSync(readmeZhPath))) {
          try { readmeText = fs.readFileSync(fs.existsSync(readmePath) ? readmePath : readmeZhPath, "utf-8"); } catch {}
        }

        const candidateName = params.subPath
          ? path.basename(params.subPath.replace(/[\\/]+$/, ""))
          : path.basename(normSrc);
        const folderName = candidateName;

        const resolvedName = resolveRawSkillName({
          skillMdContent: skillMdText,
          readmeContent: readmeText,
          folderName,
        });

        const skillId = "user." + slugify(folderName);

        // Namespace protection
        if (skillId.startsWith("nexus.")) {
          return {
            success: false,
            code: "RESERVED_BUILTIN_NAMESPACE",
            stage: "conflict_check",
            message: "nexus.* 命名空间仅供 Nexus 官方内置技能使用，无法覆盖内置技能。",
            error: "nexus.* 命名空间仅供 Nexus 官方内置技能使用，无法覆盖内置技能。",
            validationErrors: ["nexus.* 命名空间仅供 Nexus 官方内置技能使用。"],
          };
        }

        // Existing skill conflict check
        const existing = this.registry.getSkill(skillId, params.projectId);
        if (existing && !params.overwrite) {
          return {
            success: false,
            code: "SKILL_ALREADY_EXISTS",
            stage: "conflict_check",
            message: `该 Skill (${skillId}) 已存在版本 ${existing.version}，请确认是否替换。`,
            error: `该 Skill (${skillId}) 已存在版本 ${existing.version}，请确认是否替换。`,
          };
        }

        // Validate raw skill
        const rawVal = this.validator.validateRaw(stagingDir, {
          id: skillId,
          name: resolvedName,
          markdownContent,
        });

        if (!rawVal.valid) {
          return {
            success: false,
            code: "SKILL_IMPORT_VALIDATION_FAILED",
            stage: "staging_validation",
            message: rawVal.errors.join("; "),
            error: `Raw Skill 校验失败: ${rawVal.errors.join("; ")}`,
            validationErrors: rawVal.errors,
          };
        }

        // Write raw-skill.json into staging
        const rawSkillManifest = {
          id: skillId,
          name: resolvedName,
          type: "raw",
          version: "1.0.0",
          description: markdownContent.slice(0, 150).replace(/[#*`\n]/g, " ").trim(),
          primaryDocument: primaryDocName,
          availableDocuments: candidateDocs.length > 0 ? candidateDocs : [primaryDocName],
          documents: candidateDocs.length > 0 ? candidateDocs : [primaryDocName],
          importedAt: new Date().toISOString(),
        };
        fs.writeFileSync(
          path.join(stagingDir, "raw-skill.json"),
          JSON.stringify(rawSkillManifest, null, 2),
          "utf-8"
        );

        // Atomic Install from Staging to Destination
        const targetDir = this.resolveTargetDir(
          skillId,
          params.target,
          params.projectId,
          params.projectRoot
        );

        if (fs.existsSync(targetDir)) {
          fs.rmSync(targetDir, { recursive: true, force: true });
        }
        fs.mkdirSync(targetDir, { recursive: true });

        this.copyDirRecursive(stagingDir, targetDir);
        this.sanitizeTargetDir(targetDir);

        if (!fs.existsSync(path.join(targetDir, "raw-skill.json")) && !fs.existsSync(path.join(targetDir, primaryDocName))) {
          return {
            success: false,
            code: "FILESYSTEM_COMMIT_FAILED",
            stage: "filesystem_commit",
            message: "安装提交失败：目标目录缺少关键文件",
            error: "安装提交失败：目标目录缺少关键文件",
          };
        }

        // Registry reload
        const projectDirs =
          params.projectId && params.projectRoot
            ? [{ projectId: params.projectId, rootPath: params.projectRoot }]
            : [];
        this.registry.reload(projectDirs);

        const skill = this.registry.getSkill(skillId, params.projectId);
        if (!skill) {
          return {
            success: false,
            code: "REGISTRY_RELOAD_FAILED",
            stage: "registry_reload",
            message: "Skill 已写入磁盘，但未能成功加载至技能注册表中",
            error: "Skill 已写入磁盘，但未能成功加载至技能注册表中",
          };
        }

        const { instructions: _unused, ...meta } = skill;
        return {
          success: true,
          skill: meta,
        };
      }

      let parsedYaml: any;
      try {
        const rawYaml = fs.readFileSync(activeYaml, "utf-8");
        parsedYaml = YAML.parse(rawYaml);
      } catch (err: any) {
        return {
          success: false,
          code: "MANIFEST_PARSE_ERROR",
          stage: "manifest_injection",
          message: `Failed to parse skill.yaml manifest: ${err.message}`,
          error: `Failed to parse skill.yaml manifest: ${err.message}`,
          validationErrors: [err.message],
        };
      }

      // Preserve / ensure SKILL.md in staging
      const stagingMdPath = path.join(stagingDir, "SKILL.md");
      const stagingLowerMdPath = path.join(stagingDir, "skill.md");
      const hasStagingMd = fs.existsSync(stagingMdPath) || fs.existsSync(stagingLowerMdPath);

      if (!hasStagingMd) {
        if (params.customYaml) {
          const readme = path.join(stagingDir, "README.md");
          const readmeZh = path.join(stagingDir, "README_zh.md");
          if (fs.existsSync(readme)) {
            fs.copyFileSync(readme, stagingMdPath);
          } else if (fs.existsSync(readmeZh)) {
            fs.copyFileSync(readmeZh, stagingMdPath);
          } else {
            fs.writeFileSync(
              stagingMdPath,
              `# ${parsedYaml?.id || "skill"}\n\n${parsedYaml?.name?.["zh-CN"] || ""}\n`,
              "utf-8"
            );
          }
        } else {
          return {
            success: false,
            code: "SKILL_IMPORT_VALIDATION_FAILED",
            stage: "staging_validation",
            message: "Missing required SKILL.md instructions file",
            error: "Missing required SKILL.md instructions file",
            validationErrors: ["Missing required SKILL.md instructions file"],
          };
        }
      }

      const activeMd = fs.existsSync(stagingMdPath) ? stagingMdPath : stagingLowerMdPath;
      const markdownContent = fs.readFileSync(activeMd, "utf-8");

      // Step 5: Strict Validate STAGING DIRECTORY
      const valResult = this.validator.validate(stagingDir, parsedYaml, markdownContent, {
        isBuiltin: false,
        strictExecutables: true,
      });

      if (!valResult.valid) {
        return {
          success: false,
          code: "SKILL_IMPORT_VALIDATION_FAILED",
          stage: "staging_validation",
          message: valResult.errors.join("; "),
          error: `声明式配置校验失败: ${valResult.errors.join("; ")}`,
          validationErrors: valResult.errors,
          details: valResult.errors,
        };
      }

      const skillId = parsedYaml.id;

      // Step 6: Namespace protection and conflict check
      if (skillId.startsWith("nexus.")) {
        return {
          success: false,
          code: "RESERVED_BUILTIN_NAMESPACE",
          stage: "conflict_check",
          message: "nexus.* 命名空间仅供 Nexus 官方内置技能使用，无法覆盖内置技能。",
          error: "nexus.* 命名空间仅供 Nexus 官方内置技能使用，无法覆盖内置技能。",
          validationErrors: ["nexus.* 命名空间仅供 Nexus 官方内置技能使用。"],
        };
      }

      const existing = this.registry.getSkill(skillId, params.projectId);
      if (existing && !params.overwrite) {
        return {
          success: false,
          code: "SKILL_ALREADY_EXISTS",
          stage: "conflict_check",
          message: `该 Skill (${skillId}) 已存在版本 ${existing.version}，请确认是否替换。`,
          error: `该 Skill (${skillId}) 已存在版本 ${existing.version}，请确认是否替换。`,
        };
      }

      // Step 7: Atomic Install from Staging to Destination
      const targetDir = this.resolveTargetDir(
        skillId,
        params.target,
        params.projectId,
        params.projectRoot
      );

      if (fs.existsSync(targetDir)) {
        fs.rmSync(targetDir, { recursive: true, force: true });
      }
      fs.mkdirSync(targetDir, { recursive: true });

      this.copyDirRecursive(stagingDir, targetDir);
      this.sanitizeTargetDir(targetDir);

      if (!fs.existsSync(path.join(targetDir, "skill.yaml")) || !fs.existsSync(path.join(targetDir, "SKILL.md"))) {
        return {
          success: false,
          code: "FILESYSTEM_COMMIT_FAILED",
          stage: "filesystem_commit",
          message: "安装提交失败：目标目录缺少关键文件",
          error: "安装提交失败：目标目录缺少关键文件",
        };
      }

      // Step 8: Registry Reload
      const projectDirs =
        params.projectId && params.projectRoot
          ? [{ projectId: params.projectId, rootPath: params.projectRoot }]
          : [];
      this.registry.reload(projectDirs);

      const skill = this.registry.getSkill(skillId, params.projectId);
      if (!skill) {
        return {
          success: false,
          code: "REGISTRY_RELOAD_FAILED",
          stage: "registry_reload",
          message: "Skill 已写入磁盘，但未能成功加载至技能注册表中",
          error: "Skill 已写入磁盘，但未能成功加载至技能注册表中",
        };
      }

      const { instructions: _unused, ...meta } = skill;
      return {
        success: true,
        skill: meta,
      };
    } catch (err: any) {
      return {
        success: false,
        code: "UNEXPECTED_IMPORT_ERROR",
        stage: "filesystem_commit",
        message: err.message || String(err),
        error: `导入失败: ${err.message || String(err)}`,
      };
    } finally {
      // Step 9: Clean up staging directory
      try {
        if (fs.existsSync(stagingDir)) {
          fs.rmSync(stagingDir, { recursive: true, force: true });
        }
      } catch {}
    }
  }

  /**
   * Import a skill ZIP archive via a secure Staging Directory transaction.
   */
  async importZip(params: {
    zipBufferOrPath: Buffer | string;
    target: "user" | "project";
    projectId?: string;
    projectRoot?: string;
    overwrite?: boolean;
    customYaml?: string;
    subPath?: string;
  }): Promise<SkillImportResult> {
    const stagingDir = this.createStagingDir();

    try {
      // Step 1: Read and parse zip
      let buffer: Buffer;
      if (typeof params.zipBufferOrPath === "string") {
        const resolvedZip = path.resolve(params.zipBufferOrPath);
        if (!fs.existsSync(resolvedZip)) {
          return {
            success: false,
            code: "ZIP_NOT_FOUND",
            stage: "resolve_subpath",
            message: `ZIP 文件未找到: ${params.zipBufferOrPath}`,
            error: `ZIP 文件未找到: ${params.zipBufferOrPath}`,
          };
        }
        buffer = fs.readFileSync(resolvedZip);
      } else {
        buffer = params.zipBufferOrPath;
      }

      let entries: ZipEntry[];
      try {
        entries = parseZip(buffer);
      } catch (err: any) {
        return {
          success: false,
          code: "INVALID_ZIP_ARCHIVE",
          stage: "staging_init",
          message: `Failed to parse ZIP archive: ${err.message}`,
          error: `Failed to parse ZIP archive: ${err.message}`,
        };
      }

      // Step 2: Resolve root prefix & subPath
      const rootPrefix = resolveZipPrefix(entries, params.subPath);

      // Verify subPath exists in zip entries if specified
      if (params.subPath) {
        const subExists = entries.some(
          (e) => e.name.startsWith(rootPrefix) || e.name === rootPrefix.replace(/\/$/, "")
        );
        if (!subExists) {
          return {
            success: false,
            code: "CANDIDATE_PATH_NOT_FOUND",
            stage: "resolve_subpath",
            message: `所选 candidate 路径不存在于 ZIP 归档中: ${params.subPath}`,
            error: `所选 candidate 路径不存在于 ZIP 归档中: ${params.subPath}`,
          };
        }
      }

      // Step 3: Extract safe declarative files into staging directory (Declarative Sanitization)
      for (const entry of entries) {
        if (!entry.name.startsWith(rootPrefix)) continue;
        const relativeName = entry.name.slice(rootPrefix.length);
        if (!relativeName || relativeName === "/") continue;

        // Declarative Sanitization: Skip executable files
        if (!entry.isDirectory && EXECUTABLE_FILE_REGEX.test(relativeName)) {
          continue;
        }

        const outPath = path.join(stagingDir, relativeName);
        const resolvedOut = path.resolve(outPath);
        if (!resolvedOut.startsWith(path.resolve(stagingDir))) {
          return {
            success: false,
            code: "ZIP_SLIP_ATTEMPT",
            stage: "declarative_sanitization",
            message: `Zip Slip security violation: '${entry.name}' escapes staging directory`,
            error: `Zip Slip security violation: '${entry.name}' escapes staging directory`,
          };
        }

        if (entry.isDirectory) {
          fs.mkdirSync(resolvedOut, { recursive: true });
        } else {
          fs.mkdirSync(path.dirname(resolvedOut), { recursive: true });
          fs.writeFileSync(resolvedOut, entry.data);
        }
      }

      // Step 4: Assert Executable Files = 0 in staging directory
      this.sanitizeTargetDir(stagingDir);
      const remainingExecutables = this.findExecutableFilesInDir(stagingDir);
      if (remainingExecutables.length > 0) {
        return {
          success: false,
          code: "EXECUTABLE_FILES_PERSISTED",
          stage: "declarative_sanitization",
          message: `Staging directory contains forbidden executable files after sanitization: ${remainingExecutables.join(", ")}`,
          error: `Staging directory contains forbidden executable files after sanitization: ${remainingExecutables.join(", ")}`,
        };
      }

      // Step 5: Manifest Injection / Setup in Staging
      if (params.customYaml) {
        let parsedCustom: any;
        try {
          parsedCustom = YAML.parse(params.customYaml);
        } catch (err: any) {
          return {
            success: false,
            code: "MANIFEST_PARSE_ERROR",
            stage: "manifest_injection",
            message: `Failed to parse skill.yaml manifest: ${err.message}`,
            error: err.message,
            details: { parseError: err.message },
          };
        }

        let canonicalYaml = params.customYaml;
        try {
          if (parsedCustom && typeof parsedCustom === "object") {
            canonicalYaml = YAML.stringify(parsedCustom, { indent: 2, lineWidth: 0 });
          }
        } catch {}

        fs.writeFileSync(path.join(stagingDir, "skill.yaml"), canonicalYaml, "utf-8");
      }

      const stagingYamlPath = path.join(stagingDir, "skill.yaml");
      const stagingYmlPath = path.join(stagingDir, "skill.yml");
      const activeYaml = fs.existsSync(stagingYamlPath)
        ? stagingYamlPath
        : fs.existsSync(stagingYmlPath)
        ? stagingYmlPath
        : null;

      if (!activeYaml) {
        // Raw User Skill import flow for ZIP
        const candidateDocs: string[] = [];
        try {
          const scan = (d: string, prefix = "") => {
            for (const ent of fs.readdirSync(d, { withFileTypes: true })) {
              const rel = prefix ? `${prefix}/${ent.name}` : ent.name;
              if (ent.isDirectory()) {
                if (["references", "docs", "doc", "examples", "agents", "skills"].includes(ent.name.toLowerCase())) {
                  scan(path.join(d, ent.name), rel);
                }
              } else if (ent.isFile() && /\.(md|txt)$/i.test(ent.name)) {
                candidateDocs.push(rel);
              }
            }
          };
          scan(stagingDir);
        } catch {}

        const mdPath = path.join(stagingDir, "SKILL.md");
        const lowerMdPath = path.join(stagingDir, "skill.md");
        const readmePath = path.join(stagingDir, "README.md");
        const readmeZhPath = path.join(stagingDir, "README_zh.md");
        const activeDocPath = fs.existsSync(mdPath)
          ? mdPath
          : fs.existsSync(lowerMdPath)
          ? lowerMdPath
          : fs.existsSync(readmePath)
          ? readmePath
          : fs.existsSync(readmeZhPath)
          ? readmeZhPath
          : candidateDocs.length > 0
          ? path.join(stagingDir, candidateDocs[0])
          : null;

        if (!activeDocPath) {
          return {
            success: false,
            code: "DOCUMENTATION_MISSING",
            stage: "staging_validation",
            message: "未发现有效文档 (SKILL.md 或 README.md)",
            error: "未发现有效文档 (SKILL.md 或 README.md)",
            validationErrors: ["Missing documentation file (SKILL.md or README.md) in ZIP archive"],
          };
        }

        const primaryDocName = path.relative(stagingDir, activeDocPath).replace(/\\/g, "/");
        let markdownContent = "";
        try {
          markdownContent = fs.readFileSync(activeDocPath, "utf-8");
        } catch {}

        let skillMdText = "";
        let readmeText = "";
        if (primaryDocName.toLowerCase() === "skill.md") {
          skillMdText = markdownContent;
        } else {
          readmeText = markdownContent;
        }
        if (!skillMdText && (fs.existsSync(mdPath) || fs.existsSync(lowerMdPath))) {
          try { skillMdText = fs.readFileSync(fs.existsSync(mdPath) ? mdPath : lowerMdPath, "utf-8"); } catch {}
        }
        if (!readmeText && (fs.existsSync(readmePath) || fs.existsSync(readmeZhPath))) {
          try { readmeText = fs.readFileSync(fs.existsSync(readmePath) ? readmePath : readmeZhPath, "utf-8"); } catch {}
        }

        const singleRoot = detectZipRootPrefix(entries);
        const pkgName = params.subPath
          ? path.basename(params.subPath.replace(/[\\/]+$/, ""))
          : singleRoot
          ? singleRoot.replace(/\/$/, "")
          : typeof params.zipBufferOrPath === "string"
          ? path.basename(params.zipBufferOrPath, ".zip")
          : "custom-skill";

        const resolvedName = resolveRawSkillName({
          skillMdContent: skillMdText,
          readmeContent: readmeText,
          folderName: pkgName,
          zipName: typeof params.zipBufferOrPath === "string" ? path.basename(params.zipBufferOrPath) : undefined,
        });

        const skillId = "user." + slugify(pkgName);

        // Namespace protection
        if (skillId.startsWith("nexus.")) {
          return {
            success: false,
            code: "RESERVED_BUILTIN_NAMESPACE",
            stage: "conflict_check",
            message: "nexus.* 命名空间仅供 Nexus 官方内置技能使用，无法覆盖内置技能。",
            error: "nexus.* 命名空间仅供 Nexus 官方内置技能使用，无法覆盖内置技能。",
            validationErrors: ["nexus.* 命名空间仅供 Nexus 官方内置技能使用。"],
          };
        }

        // Existing skill conflict check
        const existing = this.registry.getSkill(skillId, params.projectId);
        if (existing && !params.overwrite) {
          return {
            success: false,
            code: "SKILL_ALREADY_EXISTS",
            stage: "conflict_check",
            message: `该 Skill (${skillId}) 已存在版本 ${existing.version}，请确认是否替换。`,
            error: `该 Skill (${skillId}) 已存在版本 ${existing.version}，请确认是否替换。`,
          };
        }

        // Validate raw skill
        const rawVal = this.validator.validateRaw(stagingDir, {
          id: skillId,
          name: resolvedName,
          markdownContent,
        });

        if (!rawVal.valid) {
          return {
            success: false,
            code: "SKILL_IMPORT_VALIDATION_FAILED",
            stage: "staging_validation",
            message: rawVal.errors.join("; "),
            error: `Raw Skill 校验失败: ${rawVal.errors.join("; ")}`,
            validationErrors: rawVal.errors,
          };
        }

        // Write raw-skill.json into staging
        const rawSkillManifest = {
          id: skillId,
          name: resolvedName,
          type: "raw",
          version: "1.0.0",
          description: markdownContent.slice(0, 150).replace(/[#*`\n]/g, " ").trim(),
          primaryDocument: primaryDocName,
          availableDocuments: candidateDocs.length > 0 ? candidateDocs : [primaryDocName],
          documents: candidateDocs.length > 0 ? candidateDocs : [primaryDocName],
          importedAt: new Date().toISOString(),
        };
        fs.writeFileSync(
          path.join(stagingDir, "raw-skill.json"),
          JSON.stringify(rawSkillManifest, null, 2),
          "utf-8"
        );

        // Atomic Install from Staging to Destination
        const targetDir = this.resolveTargetDir(
          skillId,
          params.target,
          params.projectId,
          params.projectRoot
        );

        if (fs.existsSync(targetDir)) {
          fs.rmSync(targetDir, { recursive: true, force: true });
        }
        fs.mkdirSync(targetDir, { recursive: true });

        this.copyDirRecursive(stagingDir, targetDir);
        this.sanitizeTargetDir(targetDir);

        if (!fs.existsSync(path.join(targetDir, "raw-skill.json")) && !fs.existsSync(path.join(targetDir, primaryDocName))) {
          return {
            success: false,
            code: "FILESYSTEM_COMMIT_FAILED",
            stage: "filesystem_commit",
            message: "安装提交失败：目标目录缺少关键文件",
            error: "安装提交失败：目标目录缺少关键文件",
          };
        }

        // Registry reload
        const projectDirs =
          params.projectId && params.projectRoot
            ? [{ projectId: params.projectId, rootPath: params.projectRoot }]
            : [];
        this.registry.reload(projectDirs);

        const skill = this.registry.getSkill(skillId, params.projectId);
        if (!skill) {
          return {
            success: false,
            code: "REGISTRY_RELOAD_FAILED",
            stage: "registry_reload",
            message: "Skill 已写入磁盘，但未能成功加载至技能注册表中",
            error: "Skill 已写入磁盘，但未能成功加载至技能注册表中",
          };
        }

        const { instructions: _unused, ...meta } = skill;
        return {
          success: true,
          skill: meta,
        };
      }

      let parsedYaml: any;
      try {
        const rawYaml = fs.readFileSync(activeYaml, "utf-8");
        parsedYaml = YAML.parse(rawYaml);
      } catch (err: any) {
        return {
          success: false,
          code: "MANIFEST_PARSE_ERROR",
          stage: "manifest_injection",
          message: `Failed to parse skill.yaml manifest: ${err.message}`,
          error: `Failed to parse skill.yaml manifest: ${err.message}`,
          validationErrors: [err.message],
        };
      }

      // Preserve / ensure SKILL.md in staging
      const stagingMdPath = path.join(stagingDir, "SKILL.md");
      const stagingLowerMdPath = path.join(stagingDir, "skill.md");
      const hasStagingMd = fs.existsSync(stagingMdPath) || fs.existsSync(stagingLowerMdPath);

      if (!hasStagingMd) {
        if (params.customYaml) {
          const readme = path.join(stagingDir, "README.md");
          const readmeZh = path.join(stagingDir, "README_zh.md");
          if (fs.existsSync(readme)) {
            fs.copyFileSync(readme, stagingMdPath);
          } else if (fs.existsSync(readmeZh)) {
            fs.copyFileSync(readmeZh, stagingMdPath);
          } else {
            fs.writeFileSync(
              stagingMdPath,
              `# ${parsedYaml?.id || "skill"}\n\n${parsedYaml?.name?.["zh-CN"] || ""}\n`,
              "utf-8"
            );
          }
        } else {
          return {
            success: false,
            code: "SKILL_IMPORT_VALIDATION_FAILED",
            stage: "staging_validation",
            message: "Missing required SKILL.md instructions file in ZIP archive",
            error: "Missing required SKILL.md instructions file in ZIP archive",
            validationErrors: ["Missing required SKILL.md instructions file in ZIP archive"],
          };
        }
      }

      const activeMd = fs.existsSync(stagingMdPath) ? stagingMdPath : stagingLowerMdPath;
      const markdownContent = fs.readFileSync(activeMd, "utf-8");

      // Step 6: Strict Validate STAGING DIRECTORY
      const valResult = this.validator.validate(stagingDir, parsedYaml, markdownContent, {
        isBuiltin: false,
        strictExecutables: true, // Strict mode on sanitized staging
      });

      if (!valResult.valid) {
        return {
          success: false,
          code: "SKILL_IMPORT_VALIDATION_FAILED",
          stage: "staging_validation",
          message: valResult.errors.join("; "),
          error: `声明式配置校验失败: ${valResult.errors.join("; ")}`,
          validationErrors: valResult.errors,
          details: valResult.errors,
        };
      }

      const skillId = parsedYaml.id;

      // Step 7: Check Namespace & Existing Conflict
      if (skillId.startsWith("nexus.")) {
        return {
          success: false,
          code: "RESERVED_BUILTIN_NAMESPACE",
          stage: "conflict_check",
          message: "nexus.* 命名空间仅供 Nexus 官方内置技能使用，无法覆盖内置技能。",
          error: "nexus.* 命名空间仅供 Nexus 官方内置技能使用，无法覆盖内置技能。",
          validationErrors: ["nexus.* 命名空间仅供 Nexus 官方内置技能使用。"],
        };
      }

      const existing = this.registry.getSkill(skillId, params.projectId);
      if (existing && !params.overwrite) {
        return {
          success: false,
          code: "SKILL_ALREADY_EXISTS",
          stage: "conflict_check",
          message: `该 Skill (${skillId}) 已存在版本 ${existing.version}，请确认是否替换。`,
          error: `该 Skill (${skillId}) 已存在版本 ${existing.version}，请确认是否替换。`,
        };
      }

      // Step 8: Atomic Install from Staging to Destination
      const targetDir = this.resolveTargetDir(
        skillId,
        params.target,
        params.projectId,
        params.projectRoot
      );

      if (fs.existsSync(targetDir)) {
        fs.rmSync(targetDir, { recursive: true, force: true });
      }
      fs.mkdirSync(targetDir, { recursive: true });

      this.copyDirRecursive(stagingDir, targetDir);
      this.sanitizeTargetDir(targetDir);

      if (!fs.existsSync(path.join(targetDir, "skill.yaml")) || !fs.existsSync(path.join(targetDir, "SKILL.md"))) {
        return {
          success: false,
          code: "FILESYSTEM_COMMIT_FAILED",
          stage: "filesystem_commit",
          message: "安装提交失败：目标目录缺少关键文件",
          error: "安装提交失败：目标目录缺少关键文件",
        };
      }

      // Step 9: Registry Reload
      const projectDirs =
        params.projectId && params.projectRoot
          ? [{ projectId: params.projectId, rootPath: params.projectRoot }]
          : [];
      this.registry.reload(projectDirs);

      const skill = this.registry.getSkill(skillId, params.projectId);
      if (!skill) {
        return {
          success: false,
          code: "REGISTRY_RELOAD_FAILED",
          stage: "registry_reload",
          message: "Skill 已写入磁盘，但未能成功加载至技能注册表中",
          error: "Skill 已写入磁盘，但未能成功加载至技能注册表中",
        };
      }

      const { instructions: _unused, ...meta } = skill;
      return {
        success: true,
        skill: meta,
      };
    } catch (err: any) {
      return {
        success: false,
        code: "UNEXPECTED_IMPORT_ERROR",
        stage: "filesystem_commit",
        message: err.message || String(err),
        error: `导入失败: ${err.message || String(err)}`,
      };
    } finally {
      // Step 10: Clean up staging directory
      try {
        if (fs.existsSync(stagingDir)) {
          fs.rmSync(stagingDir, { recursive: true, force: true });
        }
      } catch {}
    }
  }

  /**
   * Delete a user or project skill. Built-in skills cannot be deleted.
   */
  async deleteSkill(params: {
    skillId: string;
    target?: "user" | "project";
    projectId?: string;
    projectRoot?: string;
  }): Promise<SkillDeleteResult> {
    const existing = this.registry.getSkill(params.skillId, params.projectId);
    if (!existing) {
      return {
        success: false,
        skillId: params.skillId,
        error: `Skill '${params.skillId}' not found`,
      };
    }

    if (existing.source === "builtin") {
      return {
        success: false,
        skillId: params.skillId,
        error: "内置技能不可删除",
      };
    }

    const source = params.target || existing.source;
    let targetDir: string;

    if (source === "user") {
      const userDir = path.resolve(this.loader.getUserDir());
      targetDir = path.join(userDir, params.skillId);
      if (!path.resolve(targetDir).startsWith(userDir)) {
        return {
          success: false,
          skillId: params.skillId,
          error: "Invalid skill path traversal attempt",
        };
      }
    } else if (source === "project") {
      const pRoot = params.projectRoot || (existing.sourcePath ? path.resolve(existing.sourcePath, "../../..") : undefined);
      if (!pRoot) {
        return {
          success: false,
          skillId: params.skillId,
          error: "Project root required to delete project skill",
        };
      }
      const projectSkillsDir = path.resolve(pRoot, ".nexus", "skills");
      targetDir = path.join(projectSkillsDir, params.skillId);
      if (!path.resolve(targetDir).startsWith(projectSkillsDir)) {
        return {
          success: false,
          skillId: params.skillId,
          error: "Invalid skill path traversal attempt",
        };
      }
    } else {
      return {
        success: false,
        skillId: params.skillId,
        error: `Cannot delete skill with source '${source}'`,
      };
    }

    try {
      if (fs.existsSync(targetDir)) {
        fs.rmSync(targetDir, { recursive: true, force: true });
      }

      const projectDirs =
        params.projectId && params.projectRoot
          ? [{ projectId: params.projectId, rootPath: params.projectRoot }]
          : [];
      this.registry.reload(projectDirs);

      return {
        success: true,
        skillId: params.skillId,
        removedPath: targetDir,
      };
    } catch (err: any) {
      return {
        success: false,
        skillId: params.skillId,
        error: `Failed to remove skill directory: ${err.message}`,
      };
    }
  }

  /**
   * Get raw config (skill.yaml and SKILL.md) for a skill.
   */
  getRawContent(skillId: string, projectId?: string): SkillRawContentResult {
    const skill = this.registry.getSkill(skillId, projectId);
    if (!skill) {
      throw new Error(`Skill '${skillId}' not found`);
    }

    let rawYaml = "";
    let markdownContent = skill.instructions || "";

    const yamlPath = path.join(skill.sourcePath, "skill.yaml");
    const ymlPath = path.join(skill.sourcePath, "skill.yml");
    const activeYaml = fs.existsSync(yamlPath) ? yamlPath : fs.existsSync(ymlPath) ? ymlPath : null;

    if (activeYaml && fs.existsSync(activeYaml)) {
      try {
        rawYaml = fs.readFileSync(activeYaml, "utf-8");
      } catch {
        rawYaml = "";
      }
    }

    return {
      skillId,
      rawYaml,
      markdownContent,
    };
  }

  private resolveTargetDir(
    skillId: string,
    target: "user" | "project",
    _projectId?: string,
    projectRoot?: string
  ): string {
    if (
      skillId.includes("..") ||
      skillId.includes("/") ||
      skillId.includes("\\") ||
      /^[a-zA-Z]:/i.test(skillId)
    ) {
      throw new Error(`Invalid skill ID '${skillId}': contains directory traversal characters`);
    }

    if (target === "user") {
      const userDir = path.resolve(this.loader.getUserDir());
      const dest = path.join(userDir, skillId);
      if (!path.resolve(dest).startsWith(userDir)) {
        throw new Error("Path traversal attempt in user skill destination");
      }
      return dest;
    } else if (target === "project") {
      if (!projectRoot) {
        throw new Error("Project root path is required for project skills");
      }
      const projectSkillsDir = path.resolve(projectRoot, ".nexus", "skills");
      const dest = path.join(projectSkillsDir, skillId);
      if (!path.resolve(dest).startsWith(projectSkillsDir)) {
        throw new Error("Path traversal attempt in project skill destination");
      }
      return dest;
    }

    throw new Error(`Unknown target '${target}'`);
  }

  private copyDirRecursive(src: string, dest: string): void {
    fs.mkdirSync(dest, { recursive: true });
    const entries = fs.readdirSync(src, { withFileTypes: true });

    for (const entry of entries) {
      const srcPath = path.join(src, entry.name);
      const destPath = path.join(dest, entry.name);

      if (entry.isDirectory()) {
        this.copyDirRecursive(srcPath, destPath);
      } else if (entry.isFile()) {
        if (!EXECUTABLE_FILE_REGEX.test(entry.name)) {
          fs.copyFileSync(srcPath, destPath);
        }
      }
    }
  }

  private sanitizeTargetDir(dir: string): void {
    if (!fs.existsSync(dir)) return;
    try {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          this.sanitizeTargetDir(fullPath);
        } else if (entry.isFile()) {
          if (EXECUTABLE_FILE_REGEX.test(entry.name)) {
            try {
              fs.unlinkSync(fullPath);
            } catch {}
          }
        }
      }
    } catch {}
  }

  private buildPreview(params: {
    id: string;
    version: string | number;
    parsedYaml: any;
    markdownContent: string;
    rawYaml: string;
    errors: string[];
    securityWarning?: string;
    executableFilesFound: string[];
    target: "user" | "project";
    projectId?: string;
    validationStatus?: SkillValidationStatus;
    importMode?: "native" | "compatible" | "raw";
    skillType?: "nexus" | "raw";
    primaryDocument?: string;
    availableDocuments?: string[];
    documents?: string[];
    filesCount?: number;
    detectedRoot?: string;
    manifestFound?: boolean;
    skillDocFound?: boolean;
    candidateSkills?: SkillCandidate[];
    archiveTotalExecutables?: number;
    candidateExecutablesCount?: number;
    manifestRoundTripValid?: boolean;
    rootQualityNotice?: string;
    candidateQualityScore?: number;
    candidateQualityReasons?: string[];
  }): SkillImportPreview {
    const yaml = params.parsedYaml || {};
    const existing = this.registry.getSkill(params.id, params.projectId);

    const hasConflict = Boolean(existing);
    const isBuiltinConflict = existing?.source === "builtin" || params.id.startsWith("nexus.");
    const existingVersion = existing?.version;
    const existingSource = existing?.source;

    if (params.id.startsWith("nexus.")) {
      params.errors.push("nexus.* 命名空间仅供 Nexus 官方内置技能使用。");
    }

    const valid = params.validationStatus
      ? params.validationStatus === "valid" || params.validationStatus === "warning"
      : params.errors.length === 0;
    const status: SkillValidationStatus =
      params.validationStatus ||
      (!valid ? "invalid" : params.securityWarning ? "warning" : "valid");

    const nameText =
      yaml.name && typeof yaml.name === "object"
        ? yaml.name
        : typeof yaml.name === "string"
        ? { "zh-CN": yaml.name, "en-US": yaml.name }
        : { "zh-CN": params.id, "en-US": params.id };

    const descText =
      yaml.description && typeof yaml.description === "object"
        ? yaml.description
        : typeof yaml.description === "string"
        ? { "zh-CN": yaml.description, "en-US": yaml.description }
        : { "zh-CN": "", "en-US": "" };

    const tools = Array.isArray(yaml.tools) ? yaml.tools : [];
    const workflow = Array.isArray(yaml.workflow) ? yaml.workflow : [];
    const triggers = Array.isArray(yaml.triggers) ? yaml.triggers : [];

    const excludedCount =
      params.candidateExecutablesCount !== undefined
        ? params.candidateExecutablesCount
        : params.executableFilesFound.length;

    return {
      valid,
      id: params.id,
      version: params.version,
      name: nameText,
      description: descText,
      category: (yaml.category as SkillCategory) || "general",
      risk: (yaml.risk as SkillRisk) || "medium",
      toolsCount: tools.length,
      workflowStepsCount: workflow.length,
      tools,
      workflow,
      triggers,
      validationStatus: status,
      validationErrors: params.errors,
      securityWarning: params.securityWarning,
      hasConflict,
      existingVersion,
      existingSource,
      isBuiltinConflict,
      executableFilesFound:
        params.executableFilesFound.length > 0 ? params.executableFilesFound : undefined,
      rawYaml: params.rawYaml,
      markdownContent: params.markdownContent,
      importMode: params.importMode || "native",
      skillType: params.skillType || (params.manifestFound ? "nexus" : "raw"),
      primaryDocument: params.primaryDocument || "SKILL.md",
      availableDocuments: params.availableDocuments,
      documents: params.documents || params.availableDocuments,
      filesCount: params.filesCount,
      detectedRoot: params.detectedRoot,
      manifestFound: params.manifestFound ?? true,
      skillDocFound: params.skillDocFound ?? true,
      candidateSkills: params.candidateSkills,
      excludedFilesCount: excludedCount,
      archiveTotalExecutables: params.archiveTotalExecutables,
      candidateExecutablesCount: params.candidateExecutablesCount,
      manifestRoundTripValid: params.manifestRoundTripValid ?? (params.validationStatus === "valid"),
      rootQualityNotice: params.rootQualityNotice,
      candidateQualityScore: params.candidateQualityScore,
      candidateQualityReasons: params.candidateQualityReasons,
    };
  }

  private createInvalidPreview(_sourceType: "folder" | "zip", reason: string): SkillImportPreview {
    return {
      valid: false,
      id: "unknown",
      version: "1.0.0",
      name: { "zh-CN": "无效技能", "en-US": "Invalid Skill" },
      description: { "zh-CN": reason, "en-US": reason },
      category: "general",
      risk: "medium",
      toolsCount: 0,
      workflowStepsCount: 0,
      tools: [],
      workflow: [],
      triggers: [],
      validationStatus: "invalid",
      validationErrors: [reason],
      hasConflict: false,
      isBuiltinConflict: false,
      importMode: "native",
      manifestFound: false,
      skillDocFound: false,
      excludedFilesCount: 0,
    };
  }
}
