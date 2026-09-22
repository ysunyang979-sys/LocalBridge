import fs from "node:fs";
import path from "node:path";
import YAML from "yaml";
import type {
  SkillImportPreview,
  SkillImportResult,
  SkillDeleteResult,
  SkillRawContentResult,
  SkillCategory,
  SkillRisk,
  SkillValidationStatus,
  SkillCandidate,
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

function extractMarkdownTitleAndDesc(md: string): { title: string; desc: string } {
  let title = "";
  let desc = "";
  const lines = md.split("\n");
  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;
    if (!title && line.startsWith("#")) {
      title = line.replace(/^#+\s*/, "").trim();
      continue;
    }
    if (title && !desc && !line.startsWith("#") && !line.startsWith("[![") && !line.startsWith("![")) {
      desc = line;
      break;
    }
  }
  return { title: title || "Custom Skill", desc: desc || "Imported Skill Package" };
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

function discoverSubCandidatesFromEntries(entries: ZipEntry[], rootPrefix: string): SkillCandidate[] {
  const candidates: SkillCandidate[] = [];
  const seenPaths = new Set<string>();

  for (const e of entries) {
    if (!e.name.startsWith(rootPrefix)) continue;
    const rel = e.name.slice(rootPrefix.length);
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
          const hasYaml = entries.some(
            (x) =>
              !x.isDirectory &&
              (x.name === `${rootPrefix}${subRelPath}/skill.yaml` ||
                x.name === `${rootPrefix}${subRelPath}/skill.yml`)
          );
          const hasMd = entries.some(
            (x) =>
              !x.isDirectory &&
              (x.name === `${rootPrefix}${subRelPath}/SKILL.md` ||
                x.name.toLowerCase() === `${rootPrefix}${subRelPath}/skill.md`)
          );

          candidates.push({
            id: `user.${slugify(name)}`,
            name,
            path: subRelPath,
            hasManifest: hasYaml,
            docPath: hasMd ? `${subRelPath}/SKILL.md` : undefined,
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

  function scanDir(currentPath: string, relPath: string, depth: number) {
    if (depth > 2) return;
    try {
      const entries = fs.readdirSync(currentPath, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.isDirectory()) {
          if (entry.name.startsWith(".") || entry.name === "node_modules") continue;
          const nextRel = relPath ? `${relPath}/${entry.name}` : entry.name;
          const nextFull = path.join(currentPath, entry.name);

          const hasYaml =
            fs.existsSync(path.join(nextFull, "skill.yaml")) ||
            fs.existsSync(path.join(nextFull, "skill.yml"));
          const hasMd =
            fs.existsSync(path.join(nextFull, "SKILL.md")) ||
            fs.existsSync(path.join(nextFull, "skill.md"));

          if ((hasYaml || hasMd) && !seenPaths.has(nextRel)) {
            seenPaths.add(nextRel);
            candidates.push({
              id: `user.${slugify(entry.name)}`,
              name: entry.name,
              path: nextRel,
              hasManifest: hasYaml,
              docPath: hasMd ? `${nextRel}/SKILL.md` : undefined,
            });
          }

          scanDir(nextFull, nextRel, depth + 1);
        }
      }
    } catch {}
  }

  scanDir(rootPath, "", 1);
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

    const folderName = path.basename(activeFolder);
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

    // Scan for executable files in folder
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
      if (executableFilesFound.length > 0 && !secWarning) {
        secWarning = `发现 ${executableFilesFound.length} 个可执行资源。出于安全原因，这些文件不会被导入或执行。`;
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
      });
    }

    // Case 2: No skill.yaml manifest, but documentation exists -> Needs Setup
    if (activeDocPath) {
      const { title, desc } = extractMarkdownTitleAndDesc(markdownContent);
      const tentativeId = "user." + slugify(folderName);
      let secWarning: string | undefined;
      if (executableFilesFound.length > 0) {
        secWarning = `发现 ${executableFilesFound.length} 个可执行资源。出于安全原因，这些文件不会被导入或执行。`;
      }

      return this.buildPreview({
        id: tentativeId,
        version: "1.0.0",
        parsedYaml: {
          name: { "zh-CN": title, "en-US": title },
          description: { "zh-CN": desc, "en-US": desc },
          category: "general",
          risk: "medium",
          triggers: [folderName],
          tools: [],
          workflow: [],
        },
        markdownContent,
        rawYaml: "",
        errors: ["未发现 Nexus Skill Manifest (skill.yaml)。你可以将此包转换为 Nexus 声明式 Skill。"],
        securityWarning: secWarning,
        executableFilesFound,
        target,
        projectId,
        validationStatus: "needs_setup",
        importMode: "compatible",
        detectedRoot: folderName,
        manifestFound: false,
        skillDocFound: true,
        candidateSkills: candidateSkills.length > 0 ? candidateSkills : undefined,
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
    const rootPrefix = subPath
      ? (singleRoot + subPath).replace(/\/?$/, "/")
      : singleRoot;

    // Scan for executable files in archive
    const executableFilesFound: string[] = [];
    for (const e of entries) {
      if (!e.isDirectory && EXECUTABLE_FILE_REGEX.test(e.name)) {
        executableFilesFound.push(e.name);
      }
    }

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

    const pkgName = singleRoot.replace(/\/$/, "") || (typeof zipBufferOrPath === "string" ? path.basename(zipBufferOrPath, ".zip") : "compatible-skill");

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
      if (executableFilesFound.length > 0 && !secWarning) {
        secWarning = `发现 ${executableFilesFound.length} 个可执行资源。出于安全原因，这些文件不会被导入或执行。`;
      }

      return this.buildPreview({
        id: parsedYaml?.id || pkgName,
        version: parsedYaml?.version || "1.0.0",
        parsedYaml,
        markdownContent,
        rawYaml,
        errors: allErrors,
        securityWarning: secWarning,
        executableFilesFound,
        target,
        projectId,
        importMode: singleRoot ? "compatible" : "native",
        detectedRoot: singleRoot || pkgName,
        manifestFound: true,
        skillDocFound: Boolean(mdEntry),
        candidateSkills: candidateSkills.length > 0 ? candidateSkills : undefined,
      });
    }

    // Case 2: No skill.yaml manifest, but documentation exists -> Needs Setup
    if (mdEntry) {
      const { title, desc } = extractMarkdownTitleAndDesc(markdownContent);
      const tentativeId = "user." + slugify(pkgName);
      let secWarning: string | undefined;
      if (executableFilesFound.length > 0) {
        secWarning = `发现 ${executableFilesFound.length} 个可执行资源。出于安全原因，这些文件不会被导入或执行。`;
      }

      return this.buildPreview({
        id: tentativeId,
        version: "1.0.0",
        parsedYaml: {
          name: { "zh-CN": title, "en-US": title },
          description: { "zh-CN": desc, "en-US": desc },
          category: "general",
          risk: "medium",
          triggers: [pkgName],
          tools: [],
          workflow: [],
        },
        markdownContent,
        rawYaml: "",
        errors: ["未发现 Nexus Skill Manifest (skill.yaml)。你可以将此包转换为 Nexus 声明式 Skill。"],
        securityWarning: secWarning,
        executableFilesFound,
        target,
        projectId,
        validationStatus: "needs_setup",
        importMode: "compatible",
        detectedRoot: singleRoot || pkgName,
        manifestFound: false,
        skillDocFound: true,
        candidateSkills: candidateSkills.length > 0 ? candidateSkills : undefined,
      });
    }

    // Case 3: Neither manifest nor documentation found
    return this.createInvalidPreview(
      "zip",
      "Missing required skill.yaml manifest and no documentation found in ZIP archive"
    );
  }

  /**
   * Import a skill folder.
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
    let parsedYaml: any = null;
    let skillId = "";

    if (params.customYaml) {
      try {
        parsedYaml = YAML.parse(params.customYaml);
      } catch (err: any) {
        return {
          success: false,
          error: `Failed to parse provided custom YAML: ${err.message}`,
          validationErrors: [err.message],
        };
      }
      const val = this.validator.validate("", parsedYaml, "", { isBuiltin: false });
      if (!val.valid) {
        return {
          success: false,
          error: `Validation failed for custom YAML: ${val.errors.join("; ")}`,
          validationErrors: val.errors,
        };
      }
      skillId = parsedYaml.id;
    } else {
      const preview = await this.previewFolder(params.sourcePath, params.target, params.projectId, params.subPath);
      if (!preview.valid) {
        return {
          success: false,
          error: `Validation failed: ${preview.validationErrors.join("; ")}`,
          validationErrors: preview.validationErrors,
        };
      }
      skillId = preview.id;
    }

    if (skillId.startsWith("nexus.")) {
      return {
        success: false,
        error: "nexus.* 命名空间仅供 Nexus 官方内置技能使用，无法覆盖内置技能。",
        validationErrors: ["nexus.* 命名空间仅供 Nexus 官方内置技能使用。"],
      };
    }

    const existing = this.registry.getSkill(skillId, params.projectId);
    if (existing && !params.overwrite) {
      return {
        success: false,
        error: `该 Skill (${skillId}) 已存在版本 ${existing.version}，请确认是否替换。`,
      };
    }

    const targetDir = this.resolveTargetDir(
      skillId,
      params.target,
      params.projectId,
      params.projectRoot
    );

    try {
      if (fs.existsSync(targetDir)) {
        fs.rmSync(targetDir, { recursive: true, force: true });
      }
      fs.mkdirSync(targetDir, { recursive: true });

      const normSrc = path.resolve(params.sourcePath);
      const activeSrc = params.subPath ? path.resolve(normSrc, params.subPath) : normSrc;

      // Copy folder contents with declarative sanitization (excluding executables)
      this.copyDirRecursive(activeSrc, targetDir);

      // If custom YAML was supplied, write it as skill.yaml
      if (params.customYaml) {
        fs.writeFileSync(path.join(targetDir, "skill.yaml"), params.customYaml, "utf-8");
      }

      // If SKILL.md does not exist, check README.md fallback
      const targetMd = path.join(targetDir, "SKILL.md");
      if (!fs.existsSync(targetMd)) {
        const readme = path.join(targetDir, "README.md");
        const readmeZh = path.join(targetDir, "README_zh.md");
        if (fs.existsSync(readme)) {
          fs.copyFileSync(readme, targetMd);
        } else if (fs.existsSync(readmeZh)) {
          fs.copyFileSync(readmeZh, targetMd);
        } else {
          fs.writeFileSync(targetMd, `# ${skillId}\n\nImported compatible skill documentation.\n`, "utf-8");
        }
      }

      // Strict post-install sanitization verification
      this.sanitizeTargetDir(targetDir);

      // Reload skills registry
      const projectDirs =
        params.projectId && params.projectRoot
          ? [{ projectId: params.projectId, rootPath: params.projectRoot }]
          : [];
      this.registry.reload(projectDirs);

      const skill = this.registry.getSkill(skillId, params.projectId);
      if (!skill) {
        return {
          success: false,
          error: "Skill imported to disk but failed to load into registry",
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
        error: `Failed to import skill folder: ${err.message}`,
      };
    }
  }

  /**
   * Import a skill ZIP archive.
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
    let parsedYaml: any = null;
    let skillId = "";

    if (params.customYaml) {
      try {
        parsedYaml = YAML.parse(params.customYaml);
      } catch (err: any) {
        return {
          success: false,
          error: `Failed to parse custom YAML: ${err.message}`,
          validationErrors: [err.message],
        };
      }
      const val = this.validator.validate("", parsedYaml, "", { isBuiltin: false });
      if (!val.valid) {
        return {
          success: false,
          error: `Validation failed for custom YAML: ${val.errors.join("; ")}`,
          validationErrors: val.errors,
        };
      }
      skillId = parsedYaml.id;
    } else {
      const preview = await this.previewZip(params.zipBufferOrPath, params.target, params.projectId, params.subPath);
      if (!preview.valid) {
        return {
          success: false,
          error: `Validation failed: ${preview.validationErrors.join("; ")}`,
          validationErrors: preview.validationErrors,
        };
      }
      skillId = preview.id;
    }

    if (skillId.startsWith("nexus.")) {
      return {
        success: false,
        error: "nexus.* 命名空间仅供 Nexus 官方内置技能使用，无法覆盖内置技能。",
        validationErrors: ["nexus.* 命名空间仅供 Nexus 官方内置技能使用。"],
      };
    }

    const existing = this.registry.getSkill(skillId, params.projectId);
    if (existing && !params.overwrite) {
      return {
        success: false,
        error: `该 Skill (${skillId}) 已存在版本 ${existing.version}，请确认是否替换。`,
      };
    }

    const targetDir = this.resolveTargetDir(
      skillId,
      params.target,
      params.projectId,
      params.projectRoot
    );

    let buffer: Buffer;
    if (typeof params.zipBufferOrPath === "string") {
      buffer = fs.readFileSync(path.resolve(params.zipBufferOrPath));
    } else {
      buffer = params.zipBufferOrPath;
    }

    let entries: ZipEntry[];
    try {
      entries = parseZip(buffer);
    } catch (err: any) {
      return {
        success: false,
        error: `Failed to parse ZIP: ${err.message}`,
      };
    }

    try {
      if (fs.existsSync(targetDir)) {
        fs.rmSync(targetDir, { recursive: true, force: true });
      }
      fs.mkdirSync(targetDir, { recursive: true });

      const singleRoot = detectZipRootPrefix(entries);
      const rootPrefix = params.subPath
        ? (singleRoot + params.subPath).replace(/\/?$/, "/")
        : singleRoot;

      for (const entry of entries) {
        if (!entry.name.startsWith(rootPrefix)) continue;
        let relativeName = entry.name.slice(rootPrefix.length);
        if (!relativeName || relativeName === "/") continue;

        // Declarative Sanitization: Skip executable files
        if (!entry.isDirectory && EXECUTABLE_FILE_REGEX.test(relativeName)) {
          continue;
        }

        const outPath = path.join(targetDir, relativeName);
        const resolvedOut = path.resolve(outPath);
        if (!resolvedOut.startsWith(path.resolve(targetDir))) {
          throw new Error(`Zip Slip detected: '${entry.name}' escapes target directory`);
        }

        if (entry.isDirectory) {
          fs.mkdirSync(resolvedOut, { recursive: true });
        } else {
          fs.mkdirSync(path.dirname(resolvedOut), { recursive: true });
          fs.writeFileSync(resolvedOut, entry.data);
        }
      }

      // If custom YAML was supplied, write it as skill.yaml
      if (params.customYaml) {
        fs.writeFileSync(path.join(targetDir, "skill.yaml"), params.customYaml, "utf-8");
      }

      // If SKILL.md does not exist, check README.md fallback
      const targetMd = path.join(targetDir, "SKILL.md");
      if (!fs.existsSync(targetMd)) {
        const readme = path.join(targetDir, "README.md");
        const readmeZh = path.join(targetDir, "README_zh.md");
        if (fs.existsSync(readme)) {
          fs.copyFileSync(readme, targetMd);
        } else if (fs.existsSync(readmeZh)) {
          fs.copyFileSync(readmeZh, targetMd);
        } else {
          fs.writeFileSync(targetMd, `# ${skillId}\n\nImported compatible skill documentation.\n`, "utf-8");
        }
      }

      // Strict post-install sanitization verification
      this.sanitizeTargetDir(targetDir);

      // Reload registry
      const projectDirs =
        params.projectId && params.projectRoot
          ? [{ projectId: params.projectId, rootPath: params.projectRoot }]
          : [];
      this.registry.reload(projectDirs);

      const skill = this.registry.getSkill(skillId, params.projectId);
      if (!skill) {
        return {
          success: false,
          error: "Skill extracted to disk but failed to load into registry",
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
        error: `Failed to extract ZIP skill: ${err.message}`,
      };
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
    importMode?: "native" | "compatible";
    detectedRoot?: string;
    manifestFound?: boolean;
    skillDocFound?: boolean;
    candidateSkills?: SkillCandidate[];
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

    const valid = params.validationStatus ? params.validationStatus === "valid" || params.validationStatus === "warning" : params.errors.length === 0;
    const status: SkillValidationStatus = params.validationStatus || (
      !valid
        ? "invalid"
        : params.securityWarning
        ? "warning"
        : "valid"
    );

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
      detectedRoot: params.detectedRoot,
      manifestFound: params.manifestFound ?? true,
      skillDocFound: params.skillDocFound ?? true,
      candidateSkills: params.candidateSkills,
      excludedFilesCount: params.executableFilesFound.length,
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
