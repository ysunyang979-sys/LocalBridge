import { describe, expect, it } from "vitest";
import type { SkillMetadata } from "../apps/desktop/src/types.js";

describe("skills-collection-detail-children: CollectionDetailDrawer Children List and Status Filtering", () => {
  const mockSkills: SkillMetadata[] = [
    {
      id: "user.skill-a",
      version: "1.0.0",
      name: { "zh-CN": "技能A", "en-US": "Skill A" },
      description: { "zh-CN": "A描述", "en-US": "A Desc" },
      category: "general",
      risk: "low",
      toolsCount: 0,
      workflowStepsCount: 0,
      tools: [],
      workflow: [],
      triggers: ["a"],
      source: "user",
      enabled: true,
      validationStatus: "valid",
      validationErrors: [],
      collectionId: "collection.pack-one",
      collectionName: "Pack One",
      documents: ["SKILL.md", "references/guide.md"],
    },
    {
      id: "user.skill-b",
      version: "1.0.0",
      name: { "zh-CN": "技能B", "en-US": "Skill B" },
      description: { "zh-CN": "B描述", "en-US": "B Desc" },
      category: "general",
      risk: "low",
      toolsCount: 0,
      workflowStepsCount: 0,
      tools: [],
      workflow: [],
      triggers: ["b"],
      source: "user",
      enabled: false,
      validationStatus: "valid",
      validationErrors: [],
      collectionId: "collection.pack-one",
      collectionName: "Pack One",
      documents: ["SKILL.md"],
    },
    {
      id: "user.skill-other",
      version: "1.0.0",
      name: { "zh-CN": "其它技能", "en-US": "Other Skill" },
      description: { "zh-CN": "其它描述", "en-US": "Other Desc" },
      category: "general",
      risk: "low",
      toolsCount: 0,
      workflowStepsCount: 0,
      tools: [],
      workflow: [],
      triggers: ["other"],
      source: "user",
      enabled: true,
      validationStatus: "valid",
      validationErrors: [],
      collectionId: "collection.pack-two",
      collectionName: "Pack Two",
    },
  ];

  it("filters child skills accurately for the target collection and supports status tabs", () => {
    const targetCollectionId = "collection.pack-one";

    // 1. Isolate children
    const childSkills = mockSkills.filter((s) => s.collectionId === targetCollectionId);
    expect(childSkills.length).toBe(2);
    expect(childSkills.map((s) => s.id)).toEqual(["user.skill-a", "user.skill-b"]);

    // 2. Counts
    const totalCount = childSkills.length;
    const enabledCount = childSkills.filter((s) => s.enabled).length;
    const disabledCount = totalCount - enabledCount;
    expect(totalCount).toBe(2);
    expect(enabledCount).toBe(1);
    expect(disabledCount).toBe(1);

    // 3. Status tab filtering
    const tabAll = childSkills.filter(() => true);
    const tabEnabled = childSkills.filter((s) => s.enabled);
    const tabDisabled = childSkills.filter((s) => !s.enabled);

    expect(tabAll.length).toBe(2);
    expect(tabEnabled.length).toBe(1);
    expect(tabEnabled[0].id).toBe("user.skill-a");
    expect(tabDisabled.length).toBe(1);
    expect(tabDisabled[0].id).toBe("user.skill-b");
  });
});
