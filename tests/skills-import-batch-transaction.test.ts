import { describe, expect, it, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { SkillValidator } from "../apps/server/src/skills/skill-validator.js";
import { SkillLoader } from "../apps/server/src/skills/skill-loader.js";
import { SkillRegistry } from "../apps/server/src/skills/skill-registry.js";
import { SkillImporter } from "../apps/server/src/skills/skill-importer.js";
import { MCP_TOOL_SCOPE } from "../apps/server/src/mcp/scope-policy.js";

describe("skills-import-batch-transaction: Batch Transaction Integrity & Sanitization", () => {
  let tmpRoot: string;
  let userDir: string;
  let importer: SkillImporter;
  let registry: SkillRegistry;
  let collectionDir: string;
  const activeTools = new Set(Object.keys(MCP_TOOL_SCOPE));

  beforeEach(() => {
    tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "test-staging-cleanup-"));
    userDir = path.join(tmpRoot, "user-skills");
    fs.mkdirSync(userDir, { recursive: true });

    collectionDir = path.join(tmpRoot, "reverse-skill-batch");
    fs.mkdirSync(collectionDir, { recursive: true });

    // Candidate 1 has an executable
    const cand1 = path.join(collectionDir, "skill-with-exe");
    fs.mkdirSync(cand1, { recursive: true });
    fs.writeFileSync(path.join(cand1, "SKILL.md"), "# Skill 1\nSafe docs");
    fs.writeFileSync(path.join(cand1, "exploit.exe"), "MZ BINARY MOCK");
    fs.writeFileSync(path.join(cand1, "payload.dll"), "DLL BINARY MOCK");

    // Candidate 2 is clean
    const cand2 = path.join(collectionDir, "clean-skill");
    fs.mkdirSync(cand2, { recursive: true });
    fs.writeFileSync(path.join(cand2, "SKILL.md"), "# Clean Skill\nClean docs");

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

  it("sanitizes executables and cleans up staging directory on transaction finish", async () => {
    const result = await importer.importBatch({
      sourceType: "folder",
      sourcePath: collectionDir,
      target: "user",
      selectedCandidateIds: ["user.skill-with-exe", "user.clean-skill"],
    });

    expect(result.success).toBe(true);
    expect(result.installedCount).toBe(2);

    // Verify executables were strictly excluded/sanitized
    const installed1 = path.join(userDir, "user.skill-with-exe");
    expect(fs.existsSync(installed1)).toBe(true);
    expect(fs.existsSync(path.join(installed1, "SKILL.md"))).toBe(true);
    expect(fs.existsSync(path.join(installed1, "exploit.exe"))).toBe(false);
    expect(fs.existsSync(path.join(installed1, "payload.dll"))).toBe(false);

    // Verify no tmp/skill-batch remains in temp directory
    const tempFiles = fs.readdirSync(os.tmpdir());
    const remainingBatchDirs = tempFiles.filter((f) => f.startsWith("nexus-batch-") || f.startsWith("skill-batch-"));
    // Any remaining batch dirs created during this exact test should be cleaned up
    expect(remainingBatchDirs.length).toBe(0);
  });
});
