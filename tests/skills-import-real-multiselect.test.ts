import { describe, expect, it, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { SkillValidator } from "../apps/server/src/skills/skill-validator.js";
import { SkillLoader } from "../apps/server/src/skills/skill-loader.js";
import { SkillRegistry } from "../apps/server/src/skills/skill-registry.js";
import { SkillImporter } from "../apps/server/src/skills/skill-importer.js";
import { MCP_TOOL_SCOPE } from "../apps/server/src/mcp/scope-policy.js";

describe("skills-import-real-multiselect: Real Multi-Select Candidate Flow", () => {
  let tmpRoot: string;
  let userDir: string;
  let importer: SkillImporter;
  let registry: SkillRegistry;
  let sampleCollectionDir: string;
  const activeTools = new Set(Object.keys(MCP_TOOL_SCOPE));

  beforeEach(() => {
    tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "nexus-multiselect-test-"));
    userDir = path.join(tmpRoot, "user-skills");
    fs.mkdirSync(userDir, { recursive: true });

    sampleCollectionDir = path.join(tmpRoot, "reverse-skill-main (1)");
    fs.mkdirSync(sampleCollectionDir, { recursive: true });

    // Candidate 1
    const cand1 = path.join(sampleCollectionDir, "competition-android-hooking");
    fs.mkdirSync(cand1, { recursive: true });
    fs.writeFileSync(path.join(cand1, "SKILL.md"), "# Android Hooking\n\nHooking logic");

    // Candidate 2
    const cand2 = path.join(sampleCollectionDir, "competition-reverse-pwn");
    fs.mkdirSync(cand2, { recursive: true });
    fs.writeFileSync(path.join(cand2, "SKILL.md"), "# Reverse Pwn\n\nPwn logic");

    // Candidate 3
    const cand3 = path.join(sampleCollectionDir, "competition-web-runtime");
    fs.mkdirSync(cand3, { recursive: true });
    fs.writeFileSync(path.join(cand3, "SKILL.md"), "# Web Runtime\n\nWeb logic");

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

  it("previews multiple candidates and supports selecting a custom subset of candidate IDs", async () => {
    const preview = await importer.previewFolder(sampleCollectionDir, "user");
    expect(preview.valid).toBe(true);
    expect(preview.isCollection).toBe(true);
    expect(preview.candidateSkills).toBeDefined();
    expect(preview.candidateSkills!.length).toBe(3);

    const candidateIds = preview.candidateSkills!.map((c) => c.id);
    expect(candidateIds).toContain("user.competition-android-hooking");
    expect(candidateIds).toContain("user.competition-reverse-pwn");
    expect(candidateIds).toContain("user.competition-web-runtime");

    // Multi-select only candidate 1 and candidate 3
    const selectedSubset = [
      "user.competition-android-hooking",
      "user.competition-web-runtime",
    ];

    const result = await importer.importBatch({
      sourceType: "folder",
      sourcePath: sampleCollectionDir,
      target: "user",
      selectedCandidateIds: selectedSubset,
    });

    expect(result.success).toBe(true);
    expect(result.installedCount).toBe(2);
    expect(result.skippedCount).toBe(1);

    // Verify only the selected 2 candidates were installed
    expect(fs.existsSync(path.join(userDir, "user.competition-android-hooking"))).toBe(true);
    expect(fs.existsSync(path.join(userDir, "user.competition-web-runtime"))).toBe(true);
    expect(fs.existsSync(path.join(userDir, "user.competition-reverse-pwn"))).toBe(false);
  });
});
