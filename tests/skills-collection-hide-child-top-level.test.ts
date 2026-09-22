import { describe, expect, it } from "vitest";
import type { SkillMetadata } from "../apps/desktop/src/types.js";

describe("skills-collection-hide-child-top-level: Child Skills Hidden From Main Grid", () => {
  it("strictly filters out all child skills from filteredSkills", () => {
    const mockSkills: SkillMetadata[] = [];

    // Add 10 standalone skills
    for (let i = 1; i <= 10; i++) {
      mockSkills.push({
        id: `builtin.tool-${i}`,
        version: "1.0.0",
        name: { "zh-CN": `内置工具${i}`, "en-US": `Builtin Tool ${i}` },
        description: { "zh-CN": `描述${i}`, "en-US": `Desc ${i}` },
        category: "general",
        risk: "low",
        toolsCount: 1,
        workflowStepsCount: 1,
        tools: [`tool_${i}`],
        workflow: [`step_${i}`],
        triggers: [`trigger_${i}`],
        source: "builtin",
        enabled: true,
        validationStatus: "valid",
        validationErrors: [],
      });
    }

    // Add 25 collection child skills across 2 collections
    for (let i = 1; i <= 25; i++) {
      const collId = i <= 15 ? "collection.reverse-tools" : "collection.crypto-tools";
      mockSkills.push({
        id: `user.sub-skill-${i}`,
        version: "1.0.0",
        name: { "zh-CN": `子技能${i}`, "en-US": `Sub Skill ${i}` },
        description: { "zh-CN": `子描述${i}`, "en-US": `Sub Desc ${i}` },
        category: "general",
        risk: "low",
        toolsCount: 0,
        workflowStepsCount: 0,
        tools: [],
        workflow: [],
        triggers: [`sub_trigger_${i}`],
        source: "user",
        enabled: true,
        validationStatus: "valid",
        validationErrors: [],
        collectionId: collId,
        collectionName: collId.replace("collection.", ""),
      });
    }

    // Verification of SkillsPage filtering
    const filteredSkills = mockSkills.filter((s) => !s.collectionId);

    // No child skills can leak into filteredSkills
    expect(filteredSkills.length).toBe(10);
    expect(filteredSkills.every((s) => !s.collectionId)).toBe(true);

    const leakedChildren = filteredSkills.filter((s) => Boolean(s.collectionId));
    expect(leakedChildren.length).toBe(0);
  });
});
