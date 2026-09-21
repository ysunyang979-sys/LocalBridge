import type {
  SkillDefinition,
  SkillMetadata,
  SkillListFilter,
  SkillMatchResult,
} from "@localbridge/protocol";
import type { SkillLoader } from "./skill-loader.js";
import { SkillResolver } from "./skill-resolver.js";

export class SkillRegistry {
  private skills = new Map<string, SkillDefinition>();
  private readonly resolver: SkillResolver;

  constructor(private readonly loader: SkillLoader) {
    this.resolver = new SkillResolver(this);
    this.reload();
  }

  reload(projectDirs: Array<{ projectId: string; rootPath: string }> = []): void {
    const loaded = this.loader.loadAll(projectDirs);
    this.skills.clear();

    // Pass 1: Register Built-in skills first (they have highest precedence)
    for (const skill of loaded) {
      if (skill.source === "builtin") {
        this.skills.set(skill.id, skill);
      }
    }

    // Pass 2: Register User and Project skills, detecting conflicts
    for (const skill of loaded) {
      if (skill.source === "builtin") continue;

      const existing = this.skills.get(skill.id);
      if (existing) {
        if (existing.source === "builtin") {
          // Cannot override built-in skill
          this.skills.set(`${skill.id}__conflict_${skill.source}_${skill.projectId || "user"}`, {
            ...skill,
            enabled: false,
            validationStatus: "conflict",
            validationErrors: [
              ...(skill.validationErrors || []),
              `Skill ID '${skill.id}' conflicts with official built-in skill namespace and cannot be loaded`,
            ],
          });
        } else {
          // Duplicate user/project skill
          this.skills.set(`${skill.id}__conflict_${Date.now()}`, {
            ...skill,
            enabled: false,
            validationStatus: "conflict",
            validationErrors: [
              ...(skill.validationErrors || []),
              `Duplicate skill ID '${skill.id}' detected from ${skill.sourcePath}`,
            ],
          });
        }
      } else {
        this.skills.set(skill.id, skill);
      }
    }
  }

  listSkills(filter: SkillListFilter = {}): SkillMetadata[] {
    const results: SkillMetadata[] = [];

    for (const skill of this.skills.values()) {
      // Filter out project-scoped skills that belong to other projects
      if (skill.source === "project") {
        if (!filter.projectId || skill.projectId !== filter.projectId) {
          continue;
        }
      }

      if (filter.category && skill.category !== filter.category) {
        continue;
      }

      if (filter.source && skill.source !== filter.source) {
        continue;
      }

      if (filter.enabledOnly && !skill.enabled) {
        continue;
      }

      // Convert definition to metadata (exclude full instructions markdown to save memory / bandwidth)
      const { instructions: _unused, ...meta } = skill;
      results.push(meta);
    }

    return results;
  }

  getSkill(id: string, projectId?: string): SkillDefinition | null {
    const skill = this.skills.get(id);
    if (!skill) {
      return null;
    }

    // If it's a project skill, it can only be accessed with matching projectId
    if (skill.source === "project" && projectId && skill.projectId !== projectId) {
      return null;
    }

    return skill;
  }

  toggleSkill(id: string, enabled: boolean): boolean {
    const skill = this.skills.get(id);
    if (!skill) {
      return false;
    }

    // Cannot enable an invalid or conflict skill
    if (enabled && (skill.validationStatus === "invalid" || skill.validationStatus === "conflict")) {
      return false;
    }

    skill.enabled = enabled;
    return true;
  }

  matchSkills(query: string, projectId?: string, layaRecommendation?: string): SkillMatchResult {
    return this.resolver.resolve(query, projectId, layaRecommendation);
  }
}
