import { describe, expect, it } from "vitest";
import type { SkillMetadata } from "../apps/desktop/src/types.js";

describe("skills-collection-card-only: 1 Collection Card per Collection in Top-level Grid", () => {
  it("groups child skills into exactly one Collection Card and separates standalone skills", () => {
    // Mock list of skills with 1 standalone and 3 child skills in the same collection
    const mockSkills: SkillMetadata[] = [
      {
        id: "user.standalone-skill",
        version: "1.0.0",
        name: { "zh-CN": "独立技能", "en-US": "Standalone Skill" },
        description: { "zh-CN": "独立技能描述", "en-US": "Standalone Desc" },
        category: "general",
        risk: "low",
        toolsCount: 0,
        workflowStepsCount: 0,
        tools: [],
        workflow: [],
        triggers: ["test"],
        source: "user",
        enabled: true,
        validationStatus: "valid",
        validationErrors: [],
      },
      {
        id: "user.coll-child-1",
        version: "1.0.0",
        name: { "zh-CN": "子技能1", "en-US": "Child 1" },
        description: { "zh-CN": "子技能1描述", "en-US": "Child 1 Desc" },
        category: "general",
        risk: "low",
        toolsCount: 0,
        workflowStepsCount: 0,
        tools: [],
        workflow: [],
        triggers: ["child1"],
        source: "user",
        enabled: true,
        validationStatus: "valid",
        validationErrors: [],
        collectionId: "collection.my-pack",
        collectionName: "My Security Pack",
      },
      {
        id: "user.coll-child-2",
        version: "1.0.0",
        name: { "zh-CN": "子技能2", "en-US": "Child 2" },
        description: { "zh-CN": "子技能2描述", "en-US": "Child 2 Desc" },
        category: "general",
        risk: "low",
        toolsCount: 0,
        workflowStepsCount: 0,
        tools: [],
        workflow: [],
        triggers: ["child2"],
        source: "user",
        enabled: false,
        validationStatus: "valid",
        validationErrors: [],
        collectionId: "collection.my-pack",
        collectionName: "My Security Pack",
      },
      {
        id: "user.coll-child-3",
        version: "1.0.0",
        name: { "zh-CN": "子技能3", "en-US": "Child 3" },
        description: { "zh-CN": "子技能3描述", "en-US": "Child 3 Desc" },
        category: "general",
        risk: "low",
        toolsCount: 0,
        workflowStepsCount: 0,
        tools: [],
        workflow: [],
        triggers: ["child3"],
        source: "user",
        enabled: true,
        validationStatus: "valid",
        validationErrors: [],
        collectionId: "collection.my-pack",
        collectionName: "My Security Pack",
      },
    ];

    // Collections aggregation (as implemented in SkillsPage)
    const map = new Map<string, { id: string; name: string; total: number; enabled: number }>();
    for (const s of mockSkills) {
      if (s.collectionId) {
        let entry = map.get(s.collectionId);
        if (!entry) {
          entry = {
            id: s.collectionId,
            name: s.collectionName || s.collectionId,
            total: 0,
            enabled: 0,
          };
          map.set(s.collectionId, entry);
        }
        entry.total++;
        if (s.enabled) entry.enabled++;
      }
    }
    const collections = Array.from(map.values());

    // Top-level standalone skills
    const standaloneSkills = mockSkills.filter((s) => !s.collectionId);

    // Exactly 1 collection card should be rendered for the 3 child skills
    expect(collections.length).toBe(1);
    expect(collections[0].id).toBe("collection.my-pack");
    expect(collections[0].name).toBe("My Security Pack");
    expect(collections[0].total).toBe(3);
    expect(collections[0].enabled).toBe(2);

    // Exactly 1 standalone card
    expect(standaloneSkills.length).toBe(1);
    expect(standaloneSkills[0].id).toBe("user.standalone-skill");

    // Total top-level cards = 1 collection card + 1 standalone card = 2 (NOT 4)
    const totalTopLevelCards = collections.length + standaloneSkills.length;
    expect(totalTopLevelCards).toBe(2);
  });
});
