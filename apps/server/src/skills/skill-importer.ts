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
    projectId?: string
  ): Promise<SkillImportPreview> {
    const normPath = path.resolve(folderPath);
    if (!fs.existsSync(normPath)) {
      return this.createInvalidPreview("folder", "Source folder does not exist");
    }

    const stat = fs.statSync(normPath);
    if (!stat.isDirectory()) {
      return this.createInvalidPreview("folder", "Source path is not a directory");
    }

    const yamlPath = path.join(normPath, "skill.yaml");
    const ymlPath = path.join(normPath, "skill.yml");
    const activeYamlPath = fs.existsSync(yamlPath) ? yamlPath : fs.existsSync(ymlPath) ? ymlPath : null;

    if (!activeYamlPath) {
      return this.createInvalidPreview(
        "folder",
        "Missing required skill.yaml manifest in selected folder"
      );
    }

    const mdPath = path.join(normPath, "SKILL.md");
    let markdownContent = "";
    const errors: string[] = [];

    if (fs.existsSync(mdPath)) {
      try {
        markdownContent = fs.readFileSync(mdPath, "utf-8");
      } catch (err: any) {
        errors.push(`Failed to read SKILL.md: ${err.message}`);
      }
    } else {
      errors.push("Missing required SKILL.md instructions file");
    }

    let rawYaml = "";
    let parsedYaml: any = null;
    try {
      rawYaml = fs.readFileSync(activeYamlPath, "utf-8");
      parsedYaml = YAML.parse(rawYaml);
    } catch (err: any) {
      errors.push(`Failed to parse skill.yaml: ${err.message}`);
    }

    // Scan for executable files in the folder
    const executableFilesFound: string[] = [];
    try {
      const entries = fs.readdirSync(normPath, { recursive: true });
      for (const entry of entries) {
        const strEntry = typeof entry === "string" ? entry : (entry as any).name;
        if (EXECUTABLE_FILE_REGEX.test(strEntry)) {
          executableFilesFound.push(strEntry);
        }
      }
    } catch (err: any) {
      errors.push(`Failed to scan folder: ${err.message}`);
    }

    // Run validator
    const valResult = this.validator.validate(normPath, parsedYaml, markdownContent, {
      isBuiltin: false,
    });
    const allErrors = [...errors, ...valResult.errors];

    return this.buildPreview({
      id: parsedYaml?.id || path.basename(normPath),
      version: parsedYaml?.version || "1.0.0",
      parsedYaml,
      markdownContent,
      rawYaml,
      errors: allErrors,
      securityWarning: valResult.securityWarning,
      executableFilesFound,
      target,
      projectId,
    });
  }

  /**
   * Preview a skill ZIP archive before importing.
   */
  async previewZip(
    zipBufferOrPath: Buffer | string,
    target: "user" | "project" = "user",
    projectId?: string
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

    // Scan for executable files
    const executableFilesFound: string[] = [];
    for (const e of entries) {
      if (!e.isDirectory && EXECUTABLE_FILE_REGEX.test(e.name)) {
        executableFilesFound.push(e.name);
      }
    }

    // Find skill.yaml (root level or 1-level deep)
    let yamlEntry = entries.find(
      (e) => !e.isDirectory && (e.name === "skill.yaml" || e.name === "skill.yml")
    );
    let mdEntry = entries.find(
      (e) => !e.isDirectory && (e.name === "SKILL.md" || e.name.toLowerCase() === "skill.md")
    );

    // If not found at root, check if all files are under a single directory
    if (!yamlEntry) {
      yamlEntry = entries.find(
        (e) => !e.isDirectory && (e.name.endsWith("/skill.yaml") || e.name.endsWith("/skill.yml"))
      );
    }
    if (!mdEntry) {
      mdEntry = entries.find(
        (e) => !e.isDirectory && e.name.toLowerCase().endsWith("/skill.md")
      );
    }

    const errors: string[] = [];
    if (!yamlEntry) {
      errors.push("Missing required skill.yaml manifest in ZIP archive");
    }
    if (!mdEntry) {
      errors.push("Missing required SKILL.md instructions file in ZIP archive");
    }

    let rawYaml = "";
    let parsedYaml: any = null;
    let markdownContent = "";

    if (yamlEntry) {
      try {
        rawYaml = yamlEntry.data.toString("utf-8");
        parsedYaml = YAML.parse(rawYaml);
      } catch (err: any) {
        errors.push(`Failed to parse skill.yaml: ${err.message}`);
      }
    }

    if (mdEntry) {
      try {
        markdownContent = mdEntry.data.toString("utf-8");
      } catch (err: any) {
        errors.push(`Failed to read SKILL.md: ${err.message}`);
      }
    }

    // If executable files were found in the archive
    for (const exe of executableFilesFound) {
      errors.push(`Executable files are strictly forbidden in skills: ${exe}`);
    }

    // Validate using validator (pass dummy dir since ZIP is in memory)
    const valResult = this.validator.validate("", parsedYaml, markdownContent, {
      isBuiltin: false,
    });
    const allErrors = [...errors, ...valResult.errors];

    return this.buildPreview({
      id: parsedYaml?.id || "unknown-skill",
      version: parsedYaml?.version || "1.0.0",
      parsedYaml,
      markdownContent,
      rawYaml,
      errors: allErrors,
      securityWarning: valResult.securityWarning,
      executableFilesFound,
      target,
      projectId,
    });
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
  }): Promise<SkillImportResult> {
    const preview = await this.previewFolder(params.sourcePath, params.target, params.projectId);
    if (!preview.valid) {
      return {
        success: false,
        error: `Validation failed: ${preview.validationErrors.join("; ")}`,
        validationErrors: preview.validationErrors,
      };
    }

    if (preview.isBuiltinConflict) {
      return {
        success: false,
        error: "nexus.* 命名空间仅供 Nexus 官方内置技能使用，无法覆盖内置技能。",
        validationErrors: ["nexus.* 命名空间仅供 Nexus 官方内置技能使用。"],
      };
    }

    if (preview.hasConflict && !params.overwrite) {
      return {
        success: false,
        error: `该 Skill (${preview.id}) 已存在版本 ${preview.existingVersion}，请确认是否替换。`,
      };
    }

    // Determine target directory
    const targetDir = this.resolveTargetDir(
      preview.id,
      params.target,
      params.projectId,
      params.projectRoot
    );

    try {
      // Clean up target directory if replacing
      if (fs.existsSync(targetDir)) {
        fs.rmSync(targetDir, { recursive: true, force: true });
      }
      fs.mkdirSync(targetDir, { recursive: true });

      // Copy folder contents
      this.copyDirRecursive(path.resolve(params.sourcePath), targetDir);

      // Reload skills registry
      const projectDirs =
        params.projectId && params.projectRoot
          ? [{ projectId: params.projectId, rootPath: params.projectRoot }]
          : [];
      this.registry.reload(projectDirs);

      const skill = this.registry.getSkill(preview.id, params.projectId);
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
  }): Promise<SkillImportResult> {
    const preview = await this.previewZip(params.zipBufferOrPath, params.target, params.projectId);
    if (!preview.valid) {
      return {
        success: false,
        error: `Validation failed: ${preview.validationErrors.join("; ")}`,
        validationErrors: preview.validationErrors,
      };
    }

    if (preview.isBuiltinConflict) {
      return {
        success: false,
        error: "nexus.* 命名空间仅供 Nexus 官方内置技能使用，无法覆盖内置技能。",
        validationErrors: ["nexus.* 命名空间仅供 Nexus 官方内置技能使用。"],
      };
    }

    if (preview.hasConflict && !params.overwrite) {
      return {
        success: false,
        error: `该 Skill (${preview.id}) 已存在版本 ${preview.existingVersion}，请确认是否替换。`,
      };
    }

    // Determine target directory
    const targetDir = this.resolveTargetDir(
      preview.id,
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

      // Determine if there is a common prefix folder
      let prefix = "";
      const hasRootYaml = entries.some(
        (e) => !e.isDirectory && (e.name === "skill.yaml" || e.name === "skill.yml")
      );
      if (!hasRootYaml) {
        const nestedYaml = entries.find(
          (e) => !e.isDirectory && (e.name.endsWith("/skill.yaml") || e.name.endsWith("/skill.yml"))
        );
        if (nestedYaml) {
          const parts = nestedYaml.name.split("/");
          prefix = parts.slice(0, parts.length - 1).join("/") + "/";
        }
      }

      for (const entry of entries) {
        let relativeName = entry.name;
        if (prefix && relativeName.startsWith(prefix)) {
          relativeName = relativeName.slice(prefix.length);
        }
        if (!relativeName || relativeName === "/") continue;

        const outPath = path.join(targetDir, relativeName);
        // Security check: ensure outPath does not escape targetDir
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

      // Reload registry
      const projectDirs =
        params.projectId && params.projectRoot
          ? [{ projectId: params.projectId, rootPath: params.projectRoot }]
          : [];
      this.registry.reload(projectDirs);

      const skill = this.registry.getSkill(preview.id, params.projectId);
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
      // Verify path safety
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

      // Reload registry
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
    // Sanitization of skillId
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
        // Skip executable files
        if (!EXECUTABLE_FILE_REGEX.test(entry.name)) {
          fs.copyFileSync(srcPath, destPath);
        }
      }
    }
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
  }): SkillImportPreview {
    const yaml = params.parsedYaml || {};
    const existing = this.registry.getSkill(params.id, params.projectId);

    const hasConflict = Boolean(existing);
    const isBuiltinConflict = existing?.source === "builtin" || params.id.startsWith("nexus.");
    const existingVersion = existing?.version;
    const existingSource = existing?.source;

    // Additional check: namespace protection
    if (params.id.startsWith("nexus.")) {
      params.errors.push("nexus.* 命名空间仅供 Nexus 官方内置技能使用。");
    }

    const valid = params.errors.length === 0;
    const status: SkillValidationStatus = !valid
      ? "invalid"
      : params.securityWarning
      ? "warning"
      : "valid";

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
    };
  }
}
