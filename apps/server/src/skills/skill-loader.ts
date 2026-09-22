import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";
import YAML from "yaml";
import type { SkillDefinition, SkillSource } from "@localbridge/protocol";
import type { SkillValidator } from "./skill-validator.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export interface SkillLoaderOptions {
  builtinDir?: string;
  userDir?: string;
  projectDirs?: Array<{ projectId: string; rootPath: string }>;
}

export class SkillLoader {
  private readonly builtinDir: string;
  private readonly userDir: string;
  private readonly defaultProjectDirs: Array<{ projectId: string; rootPath: string }>;

  constructor(
    private readonly validator: SkillValidator,
    options: SkillLoaderOptions = {}
  ) {
    this.builtinDir =
      options.builtinDir ||
      this.resolveDefaultBuiltinDir();

    this.userDir =
      options.userDir ||
      this.resolveDefaultUserDir();

    this.defaultProjectDirs = options.projectDirs || [];
  }

  private resolveDefaultBuiltinDir(): string {
    // 1. Try environment variable
    if (process.env.NEXUS_SKILLS_DIR && fs.existsSync(process.env.NEXUS_SKILLS_DIR)) {
      return process.env.NEXUS_SKILLS_DIR;
    }

    // 2. Try app resources directory
    const candidates = [
      path.resolve(__dirname, "../skills"),
      path.resolve(__dirname, "../../resources/skills"),
      path.resolve(__dirname, "../../../resources/skills"),
      path.resolve(process.cwd(), "resources/skills"),
      path.resolve(process.cwd(), "apps/desktop/src-tauri/resources/skills"),
      path.resolve(process.cwd(), "../resources/skills"),
    ];

    for (const cand of candidates) {
      if (fs.existsSync(path.join(cand, "nexus.project-inspect", "skill.yaml"))) {
        return cand;
      }
    }

    return path.resolve(process.cwd(), "resources/skills");
  }

  private resolveDefaultUserDir(): string {
    if (process.platform === "win32" && process.env.LOCALAPPDATA) {
      return path.join(process.env.LOCALAPPDATA, "LocalBridge", "skills");
    }
    return path.join(os.homedir(), ".localbridge", "skills");
  }

  getBuiltinDir(): string {
    return this.builtinDir;
  }

  getUserDir(): string {
    return this.userDir;
  }

  loadAll(projectDirs: Array<{ projectId: string; rootPath: string }> = []): SkillDefinition[] {
    const skills: SkillDefinition[] = [];

    // 1. Load Built-in skills
    skills.push(...this.loadFromDirectory(this.builtinDir, "builtin"));

    // 2. Load User skills
    skills.push(...this.loadFromDirectory(this.userDir, "user"));

    // 3. Load Project skills
    const activeProjectDirs = projectDirs.length > 0 ? projectDirs : this.defaultProjectDirs;
    for (const proj of activeProjectDirs) {
      const projSkillDir = path.join(proj.rootPath, ".nexus", "skills");
      skills.push(...this.loadFromDirectory(projSkillDir, "project", proj.projectId));
    }

    return skills;
  }

  loadFromDirectory(
    dirPath: string,
    source: SkillSource,
    projectId?: string
  ): SkillDefinition[] {
    if (!fs.existsSync(dirPath)) {
      return [];
    }

    const skills: SkillDefinition[] = [];
    let entries: string[] = [];

    try {
      entries = fs.readdirSync(dirPath);
    } catch {
      return [];
    }

    for (const entry of entries) {
      const skillPath = path.join(dirPath, entry);
      try {
        const stat = fs.statSync(skillPath);
        if (!stat.isDirectory()) {
          continue;
        }

        const skill = this.loadSkillFromPath(skillPath, source, projectId);
        if (skill) {
          skills.push(skill);
        }
      } catch (err: any) {
        // Individual directory access error: record as invalid skill
        skills.push({
          id: entry,
          version: "1.0.0",
          name: { "zh-CN": entry, "en-US": entry },
          description: { "zh-CN": "加载失败", "en-US": "Failed to load skill" },
          category: "general",
          risk: "medium",
          triggers: [],
          tools: [],
          workflow: [],
          enabled: false,
          source,
          sourcePath: skillPath,
          projectId,
          instructions: "",
          validationStatus: "invalid",
          validationErrors: [err?.message || String(err)],
        });
      }
    }

    return skills;
  }

  loadSkillFromPath(
    skillDir: string,
    source: SkillSource,
    projectId?: string
  ): SkillDefinition | null {
    const yamlPath = path.join(skillDir, "skill.yaml");
    const mdPath = path.join(skillDir, "SKILL.md");

    const dirName = path.basename(skillDir);

    if (!fs.existsSync(yamlPath)) {
      return null;
    }

    let parsedYaml: any = null;
    let yamlErrors: string[] = [];
    let markdownContent = "";

    try {
      const rawYaml = fs.readFileSync(yamlPath, "utf-8");
      parsedYaml = YAML.parse(rawYaml);
    } catch (err: any) {
      yamlErrors.push(`Failed to parse skill.yaml: ${err?.message || String(err)}`);
    }

    if (fs.existsSync(mdPath)) {
      try {
        markdownContent = fs.readFileSync(mdPath, "utf-8");
      } catch (err: any) {
        yamlErrors.push(`Failed to read SKILL.md: ${err?.message || String(err)}`);
      }
    } else {
      yamlErrors.push("Missing SKILL.md instructions file");
    }

    // Run validator
    const validation = this.validator.validate(skillDir, parsedYaml, markdownContent, {
      isBuiltin: source === "builtin",
    });
    const combinedErrors = [...yamlErrors, ...validation.errors];

    const finalStatus = combinedErrors.length > 0 ? "invalid" : validation.status;

    return {
      id: parsedYaml?.id || dirName,
      version: parsedYaml?.version || "1.0.0",
      name: parsedYaml?.name || { "zh-CN": dirName, "en-US": dirName },
      description: parsedYaml?.description || { "zh-CN": "", "en-US": "" },
      category: parsedYaml?.category || "general",
      risk: parsedYaml?.risk || "medium",
      triggers: Array.isArray(parsedYaml?.triggers) ? parsedYaml.triggers : [],
      tools: Array.isArray(parsedYaml?.tools) ? parsedYaml.tools : [],
      workflow: Array.isArray(parsedYaml?.workflow) ? parsedYaml.workflow : [],
      enabled: parsedYaml?.enabled ?? (finalStatus === "valid" || finalStatus === "warning"),
      source,
      sourcePath: skillDir,
      projectId,
      instructions: markdownContent,
      validationStatus: finalStatus,
      validationErrors: combinedErrors.length > 0 ? combinedErrors : undefined,
      securityWarning: validation.securityWarning,
    };
  }
}
