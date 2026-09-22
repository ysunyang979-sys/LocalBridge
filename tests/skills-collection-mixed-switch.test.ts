import { describe, expect, it, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { SkillValidator } from "../apps/server/src/skills/skill-validator.js";
import { SkillLoader } from "../apps/server/src/skills/skill-loader.js";
import { SkillRegistry } from "../apps/server/src/skills/skill-registry.js";
import { MCP_TOOL_SCOPE } from "../apps/server/src/mcp/scope-policy.js";

describe("skills-collection-mixed-switch: 3-State Master Switch & Indeterminate Logic", () => {
  let tmpRoot: string;
  let userDir: string;
  let registry: SkillRegistry;
  const activeTools = new Set(Object.keys(MCP_TOOL_SCOPE));

  beforeEach(() => {
    tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "nexus-mixed-switch-test-"));
    userDir = path.join(tmpRoot, "user-skills");
    fs.mkdirSync(userDir, { recursive: true });

    for (let i = 1; i <= 3; i++) {
      const child = path.join(userDir, `user.cand-${i}`);
      fs.mkdirSync(child, { recursive: true });
      fs.writeFileSync(path.join(child, "SKILL.md"), `# Cand ${i}`);
      fs.writeFileSync(
        path.join(child, "raw-skill.json"),
        JSON.stringify({
          id: `user.cand-${i}`,
          name: `Candidate ${i}`,
          type: "raw",
          enabled: true,
          collectionId: "collection.mixed-test",
          collectionName: "Mixed Test Collection",
        })
      );
    }

    const validator = new SkillValidator(activeTools);
    const loader = new SkillLoader(validator, { userDir });
    registry = new SkillRegistry(loader);
  });

  afterEach(() => {
    try {
      fs.rmSync(tmpRoot, { recursive: true, force: true });
    } catch {}
  });

  it("calculates 3 states correctly and toggles entire collection atomically", () => {
    const collId = "collection.mixed-test";

    // 1. Initially all 3 are enabled -> ON state
    let list = registry.listSkills({ collectionId: collId });
    let total = list.length;
    let enabled = list.filter((s) => s.enabled).length;

    let isAllEnabled = total > 0 && enabled === total;
    let isAllDisabled = total > 0 && enabled === 0;
    let isMixed = total > 0 && !isAllEnabled && !isAllDisabled;

    expect(isAllEnabled).toBe(true);
    expect(isAllDisabled).toBe(false);
    expect(isMixed).toBe(false);

    // 2. Disable 1 child -> Mixed / Indeterminate state
    registry.toggleSkill("user.cand-1", false);
    list = registry.listSkills({ collectionId: collId });
    enabled = list.filter((s) => s.enabled).length;

    isAllEnabled = total > 0 && enabled === total;
    isAllDisabled = total > 0 && enabled === 0;
    isMixed = total > 0 && !isAllEnabled && !isAllDisabled;

    expect(enabled).toBe(2);
    expect(isAllEnabled).toBe(false);
    expect(isAllDisabled).toBe(false);
    expect(isMixed).toBe(true);

    // 3. Batch Toggle All OFF -> OFF state
    const offResult = registry.toggleCollection(collId, false);
    expect(offResult.success).toBe(true);

    list = registry.listSkills({ collectionId: collId });
    enabled = list.filter((s) => s.enabled).length;

    isAllEnabled = total > 0 && enabled === total;
    isAllDisabled = total > 0 && enabled === 0;
    isMixed = total > 0 && !isAllEnabled && !isAllDisabled;

    expect(enabled).toBe(0);
    expect(isAllEnabled).toBe(false);
    expect(isAllDisabled).toBe(true);
    expect(isMixed).toBe(false);

    // 4. Batch Toggle All ON -> ON state
    const onResult = registry.toggleCollection(collId, true);
    expect(onResult.success).toBe(true);

    list = registry.listSkills({ collectionId: collId });
    enabled = list.filter((s) => s.enabled).length;

    isAllEnabled = total > 0 && enabled === total;
    isAllDisabled = total > 0 && enabled === 0;
    isMixed = total > 0 && !isAllEnabled && !isAllDisabled;

    expect(enabled).toBe(3);
    expect(isAllEnabled).toBe(true);
    expect(isAllDisabled).toBe(false);
    expect(isMixed).toBe(false);
  });
});
