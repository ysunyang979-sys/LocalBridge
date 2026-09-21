import { describe, expect, it } from "vitest";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const desktopSrcDir = path.resolve(__dirname, "../apps/desktop/src");

describe("Zero Management Secret Exposure in React WebView", () => {
  function getAllFiles(dir: string, extFilter = [".ts", ".tsx", ".js", ".jsx"]): string[] {
    const results: string[] = [];
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        results.push(...getAllFiles(fullPath, extFilter));
      } else if (extFilter.some((ext) => entry.name.endsWith(ext))) {
        results.push(fullPath);
      }
    }
    return results;
  }

  it("No hardcoded management token prefix (lm_) exists in frontend source code", () => {
    const files = getAllFiles(desktopSrcDir);
    const violations: { file: string; line: number; match: string }[] = [];

    for (const file of files) {
      const content = fs.readFileSync(file, "utf-8");
      const lines = content.split("\n");
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        // Match literal string occurrences of lm_ followed by hex/alphanumeric secret pattern
        const match = /["'`]\s*lm_[a-fA-F0-9]{8,}/.exec(line);
        if (match) {
          violations.push({
            file: path.relative(desktopSrcDir, file),
            line: i + 1,
            match: match[0],
          });
        }
      }
    }

    expect(violations).toEqual([]);
  });

  it("SkillsPage and SkillDetailDrawer use bridge instead of direct fetch", () => {
    const skillsPagePath = path.join(desktopSrcDir, "pages/SkillsPage.tsx");
    const drawerPath = path.join(desktopSrcDir, "components/skills/SkillDetailDrawer.tsx");

    const skillsPageContent = fs.readFileSync(skillsPagePath, "utf-8");
    const drawerContent = fs.readFileSync(drawerPath, "utf-8");

    // Must not call direct fetch
    expect(skillsPageContent).not.toMatch(/fetch\s*\(/);
    expect(drawerContent).not.toMatch(/fetch\s*\(/);

    // Must use bridge
    expect(skillsPageContent).toMatch(/bridge\.(listSkills|reloadSkills|toggleSkill|matchSkill)/);
  });

  it("api/bridge.ts routes skills calls through Tauri IPC when in Tauri", () => {
    const bridgePath = path.join(desktopSrcDir, "api/bridge.ts");
    const bridgeContent = fs.readFileSync(bridgePath, "utf-8");

    // Must check isTauri() and invoke desktop_*_skill* commands
    expect(bridgeContent).toContain('invoke<{ count: number; skills: SkillMetadata[] }>("desktop_list_skills"');
    expect(bridgeContent).toContain('invoke<SkillDefinition>("desktop_get_skill"');
    expect(bridgeContent).toContain('invoke<{ reloaded: boolean; count: number; skills: SkillMetadata[] }>("desktop_reload_skills"');
    expect(bridgeContent).toContain('invoke<{ success: boolean; skill: SkillDefinition }>("desktop_toggle_skill"');
    expect(bridgeContent).toContain('invoke<SkillMatchResult>("desktop_match_skill"');
  });

  it("Rust Tauri backend defines and registers skills commands in generate_handler", () => {
    const mainRsPath = path.resolve(__dirname, "../apps/desktop/src-tauri/src/main.rs");
    const mainRsContent = fs.readFileSync(mainRsPath, "utf-8");

    expect(mainRsContent).toContain("fn desktop_list_skills(");
    expect(mainRsContent).toContain("fn desktop_get_skill(");
    expect(mainRsContent).toContain("fn desktop_reload_skills(");
    expect(mainRsContent).toContain("fn desktop_toggle_skill(");
    expect(mainRsContent).toContain("fn desktop_match_skill(");

    // Verified in generate_handler
    expect(mainRsContent).toContain("desktop_list_skills,");
    expect(mainRsContent).toContain("desktop_get_skill,");
    expect(mainRsContent).toContain("desktop_reload_skills,");
    expect(mainRsContent).toContain("desktop_toggle_skill,");
    expect(mainRsContent).toContain("desktop_match_skill,");
  });
});
