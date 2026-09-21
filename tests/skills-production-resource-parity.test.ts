import { describe, expect, it } from "vitest";
import path from "node:path";
import fs from "node:fs";
import { parse as parseYaml } from "yaml";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const sourceSkillsDir = path.resolve(__dirname, "../resources/skills");
const bundledSkillsDir = path.resolve(__dirname, "../apps/desktop/src-tauri/resources/skills");

const EXPECTED_BUILTIN_SKILLS = [
  "nexus.project-inspect",
  "nexus.fix-build",
  "nexus.run-tests",
  "nexus.code-debug",
  "nexus.safe-refactor",
  "nexus.git-review",
  "nexus.start-dev-runtime",
  "nexus.project-cleanup",
];

describe("Production Skills Resource Parity & Integrity", () => {
  it("Source skills directory contains all 8 official built-in skills", () => {
    expect(fs.existsSync(sourceSkillsDir)).toBe(true);
    const entries = fs.readdirSync(sourceSkillsDir);
    for (const skillId of EXPECTED_BUILTIN_SKILLS) {
      expect(entries).toContain(skillId);
      const skillYamlPath = path.join(sourceSkillsDir, skillId, "skill.yaml");
      const skillMdPath = path.join(sourceSkillsDir, skillId, "SKILL.md");
      expect(fs.existsSync(skillYamlPath)).toBe(true);
      expect(fs.existsSync(skillMdPath)).toBe(true);
    }
  });

  it("Bundled skills directory exists in Tauri resources and contains all 8 official skills", () => {
    expect(fs.existsSync(bundledSkillsDir)).toBe(true);
    const entries = fs.readdirSync(bundledSkillsDir);
    for (const skillId of EXPECTED_BUILTIN_SKILLS) {
      expect(entries).toContain(skillId);
      const skillYamlPath = path.join(bundledSkillsDir, skillId, "skill.yaml");
      const skillMdPath = path.join(bundledSkillsDir, skillId, "SKILL.md");
      expect(fs.existsSync(skillYamlPath)).toBe(true);
      expect(fs.existsSync(skillMdPath)).toBe(true);
    }
  });

  it("Source and bundled skill.yaml and SKILL.md contents are 100% identical byte-for-byte", () => {
    for (const skillId of EXPECTED_BUILTIN_SKILLS) {
      const srcYaml = fs.readFileSync(path.join(sourceSkillsDir, skillId, "skill.yaml"));
      const dstYaml = fs.readFileSync(path.join(bundledSkillsDir, skillId, "skill.yaml"));
      expect(Buffer.compare(srcYaml, dstYaml)).toBe(0);

      const srcMd = fs.readFileSync(path.join(sourceSkillsDir, skillId, "SKILL.md"));
      const dstMd = fs.readFileSync(path.join(bundledSkillsDir, skillId, "SKILL.md"));
      expect(Buffer.compare(srcMd, dstMd)).toBe(0);
    }
  });

  it("All bundled skills have valid YAML schema and non-empty markdown guides", () => {
    for (const skillId of EXPECTED_BUILTIN_SKILLS) {
      const rawYaml = fs.readFileSync(path.join(bundledSkillsDir, skillId, "skill.yaml"), "utf-8");
      const parsed = parseYaml(rawYaml);

      expect(parsed.id).toBe(skillId);
      expect(parsed.name).toBeDefined();
      expect(parsed.description).toBeDefined();
      expect(parsed.category).toBeDefined();
      expect(parsed.risk).toBeDefined();
      expect(Array.isArray(parsed.triggers)).toBe(true);
      expect(parsed.triggers.length).toBeGreaterThan(0);
      expect(Array.isArray(parsed.tools)).toBe(true);
      expect(parsed.tools.length).toBeGreaterThan(0);

      const rawMd = fs.readFileSync(path.join(bundledSkillsDir, skillId, "SKILL.md"), "utf-8");
      expect(rawMd.length).toBeGreaterThan(200);
      expect(rawMd).toContain("# ");
    }
  });

  it("Bundled skills directory contains no foreign or temporary files", () => {
    const entries = fs.readdirSync(bundledSkillsDir, { withFileTypes: true });
    for (const entry of entries) {
      expect(entry.isDirectory()).toBe(true);
      expect(EXPECTED_BUILTIN_SKILLS).toContain(entry.name);
    }
  });
});
