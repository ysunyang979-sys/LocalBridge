import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { SkillValidator } from "../apps/server/src/skills/skill-validator.js";
import { SkillLoader } from "../apps/server/src/skills/skill-loader.js";
import { SkillRegistry } from "../apps/server/src/skills/skill-registry.js";
import { SkillImporter } from "../apps/server/src/skills/skill-importer.js";
import { MCP_TOOL_SCOPE } from "../apps/server/src/mcp/scope-policy.js";

describe("skills-collection-reload-once: Registry Reloads Exactly Once", () => {
  let tmpRoot: string;
  let userDir: string;
  let importer: SkillImporter;
  let registry: SkillRegistry;
  let collectionDir: string;
  const activeTools = new Set(Object.keys(MCP_TOOL_SCOPE));

  beforeEach(() => {
    tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "nexus-reload-once-test-"));
    userDir = path.join(tmpRoot, "user-skills");
    fs.mkdirSync(userDir, { recursive: true });

    collectionDir = path.join(tmpRoot, "large-collection");
    fs.mkdirSync(collectionDir, { recursive: true });

    // Create 8 sub-skills
    for (let i = 1; i <= 8; i++) {
      const child = path.join(collectionDir, `child-skill-${i}`);
      fs.mkdirSync(child, { recursive: true });
      fs.writeFileSync(path.join(child, "SKILL.md"), `# Skill ${i}\nDoc`);
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

  it("reloads the registry exactly once when batch importing 8 skills", async () => {
    const reloadSpy = vi.spyOn(registry, "reload");

    const candidateIds = Array.from({ length: 8 }, (_, i) => `user.child-skill-${i + 1}`);

    const result = await importer.importBatch({
      sourceType: "folder",
      sourcePath: collectionDir,
      target: "user",
      collectionName: "Large Collection",
      selectedCandidateIds: candidateIds,
    });

    expect(result.success).toBe(true);
    expect(result.installedCount).toBe(8);
    expect(result.reloadCount).toBe(1);

    // Spy must have been invoked exactly 1 time
    expect(reloadSpy).toHaveBeenCalledTimes(1);

    reloadSpy.mockRestore();
  });
});
