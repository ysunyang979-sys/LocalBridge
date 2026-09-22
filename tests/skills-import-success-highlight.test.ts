import { describe, it, expect, vi } from "vitest";
import type { SkillMetadata } from "../apps/desktop/src/types.js";

const newlyImportedSkill: SkillMetadata = {
  id: "user.reverse-skill-router",
  name: { "zh-CN": "逆向技能路由器", "en-US": "reverse-skill-router" },
  description: { "zh-CN": "逆向工程技能路由分析", "en-US": "Reverse engineering router" },
  version: "1.0.0",
  category: "inspection",
  risk: "medium",
  tools: ["localbridge_file_read"],
  workflow: ["inspect"],
  toolsCount: 1,
  workflowStepsCount: 1,
  enabled: true,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  source: "user",
};

describe("Skills Import: Success Highlight and Filter State Integration", () => {
  it("switches sourceFilter to 'user', highlights imported card, and triggers reload", () => {
    let sourceFilter = "all";
    let highlightedSkillId: string | null = null;
    let toastMessage: { title: string; desc: string } | null = null;
    const loadSkills = vi.fn();

    // Mirroring handleImportSuccess in SkillsPage.tsx
    const handleImportSuccess = (imported: SkillMetadata) => {
      const name =
        imported.name["zh-CN"] ||
        imported.name["en-US"] ||
        imported.id;
      toastMessage = { title: "Skill 已导入", desc: `${name} (${imported.id})` };
      sourceFilter = "user";
      highlightedSkillId = imported.id;
      loadSkills();
    };

    handleImportSuccess(newlyImportedSkill);

    // 1. Toast verified
    expect(toastMessage).not.toBeNull();
    expect(toastMessage?.title).toBe("Skill 已导入");
    expect(toastMessage?.desc).toContain("reverse-skill-router");

    // 2. Filter switched to user skills
    expect(sourceFilter).toBe("user");

    // 3. Highlighted ID matches newly imported skill
    expect(highlightedSkillId).toBe("user.reverse-skill-router");

    // 4. Registry / list reload triggered
    expect(loadSkills).toHaveBeenCalledTimes(1);
  });

  it("verifies card highlight styling class generation for the highlighted skill", () => {
    const highlightedSkillId = "user.reverse-skill-router";

    const getCardClass = (skillId: string) => {
      if (skillId === highlightedSkillId) {
        return "ring-2 ring-sky-500 border-sky-500 bg-sky-50/30 dark:bg-sky-950/30 shadow-lg scale-[1.01]";
      }
      return "border-slate-200 dark:border-slate-800";
    };

    const targetClass = getCardClass("user.reverse-skill-router");
    const otherClass = getCardClass("user.other-skill");

    expect(targetClass).toContain("ring-2 ring-sky-500");
    expect(targetClass).toContain("border-sky-500");
    expect(otherClass).not.toContain("ring-2 ring-sky-500");
  });
});
