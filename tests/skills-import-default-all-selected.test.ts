import { describe, expect, it, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { SkillValidator } from "../apps/server/src/skills/skill-validator.js";
import { SkillLoader } from "../apps/server/src/skills/skill-loader.js";
import { SkillRegistry } from "../apps/server/src/skills/skill-registry.js";
import { SkillImporter } from "../apps/server/src/skills/skill-importer.js";
import { MCP_TOOL_SCOPE } from "../apps/server/src/mcp/scope-policy.js";

describe("skills-import-default-all-selected: Default ALL Candidates Selected", () => {
  let tmpRoot: string;
  let userDir: string;
  let importer: SkillImporter;
  let registry: SkillRegistry;
  let collectionDir: string;
  const activeTools = new Set(Object.keys(MCP_TOOL_SCOPE));

  beforeEach(() => {
    tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "nexus-default-all-test-"));
    userDir = path.join(tmpRoot, "user-skills");
    fs.mkdirSync(userDir, { recursive: true });

    collectionDir = path.join(tmpRoot, "sec-collection");
    fs.mkdirSync(collectionDir, { recursive: true });

    for (let i = 1; i <= 5; i++) {
      const child = path.join(collectionDir, `skill-candidate-${i}`);
      fs.mkdirSync(child, { recursive: true });
      fs.writeFileSync(path.join(child, "SKILL.md"), `# Skill ${i}\nDocumentation ${i}`);
    }

    const validator = new SkillValidator(activeTools);
    const loader = new SkillLoader(validator, { userDir });
    registry = new SkillRegistry(loader);
    importer = new SkillImporter({
      validator,
      loader,
      registry,
      validMcpTools: activeTools,
    });
  });

  afterEach(() => {
    try {
      fs.rmSync(tmpRoot, { recursive: true, force: true });
    } catch {}
  });

  it("discovers all 5 candidates and default-selects all candidate IDs (5/5)", async () => {
    const preview = await importer.previewFolder(collectionDir, "user");
    expect(preview.valid).toBe(true);
    expect(preview.candidateSkills).toBeDefined();
    expect(preview.candidateSkills!.length).toBe(5);

    // Simulated default selection from ImportSkillModal
    const allIds = preview.candidateSkills!.map((c) => c.id);
    const defaultSelected = new Set(allIds);
    expect(defaultSelected.size).toBe(5);
    expect(defaultSelected.size).toBe(preview.candidateSkills!.length);

    // Import with default all selected
    const result = await importer.importBatch({
      sourceType: "folder",
      sourcePath: collectionDir,
      target: "user",
      selectedCandidateIds: Array.from(defaultSelected),
    });

    expect(result.success).toBe(true);
    expect(result.installedCount).toBe(5);
    expect(result.skippedCount).toBe(0);

    for (let i = 1; i <= 5; i++) {
      expect(fs.existsSync(path.join(userDir, `user.skill-candidate-${i}`))).toBe(true);
    }
  });
});
