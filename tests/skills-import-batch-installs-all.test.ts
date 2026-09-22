import { describe, expect, it, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { SkillValidator } from "../apps/server/src/skills/skill-validator.js";
import { SkillLoader } from "../apps/server/src/skills/skill-loader.js";
import { SkillRegistry } from "../apps/server/src/skills/skill-registry.js";
import { SkillImporter } from "../apps/server/src/skills/skill-importer.js";
import { MCP_TOOL_SCOPE } from "../apps/server/src/mcp/scope-policy.js";

describe("skills-import-batch-installs-all: Comprehensive Batch Installation & Metadata", () => {
  let tmpRoot: string;
  let userDir: string;
  let importer: SkillImporter;
  let registry: SkillRegistry;
  let collectionDir: string;
  const activeTools = new Set(Object.keys(MCP_TOOL_SCOPE));

  beforeEach(() => {
    tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "nexus-batch-install-all-"));
    userDir = path.join(tmpRoot, "user-skills");
    fs.mkdirSync(userDir, { recursive: true });

    collectionDir = path.join(tmpRoot, "reverse-skill-main");
    fs.mkdirSync(collectionDir, { recursive: true });

    // 3 sub-skills
    const subs = ["competition-android-hooking", "competition-pcap-protocol", "competition-firmware-layout"];
    for (const sub of subs) {
      const subDir = path.join(collectionDir, sub);
      fs.mkdirSync(subDir, { recursive: true });
      fs.writeFileSync(path.join(subDir, "SKILL.md"), `# ${sub}\nDocumentation for ${sub}`);
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

  it("installs all candidates with raw-skill.json metadata and creates collection record", async () => {
    const selectedIds = [
      "user.competition-android-hooking",
      "user.competition-pcap-protocol",
      "user.competition-firmware-layout",
    ];

    const result = await importer.importBatch({
      sourceType: "folder",
      sourcePath: collectionDir,
      target: "user",
      collectionName: "Reverse Engineering Skill Collection",
      selectedCandidateIds: selectedIds,
    });

    expect(result.success).toBe(true);
    expect(result.installedCount).toBe(3);

    const collId = result.collection.id;
    expect(collId).toMatch(/^collection\./);

    // Verify raw-skill.json for each child skill
    for (const id of selectedIds) {
      const childDir = path.join(userDir, id);
      expect(fs.existsSync(childDir)).toBe(true);

      const rawJsonPath = path.join(childDir, "raw-skill.json");
      expect(fs.existsSync(rawJsonPath)).toBe(true);

      const rawMeta = JSON.parse(fs.readFileSync(rawJsonPath, "utf-8"));
      expect(rawMeta.id).toBe(id);
      expect(rawMeta.type).toBe("raw");
      expect(rawMeta.enabled).toBe(true);
      expect(rawMeta.collectionId).toBe(collId);
      expect(rawMeta.collectionName).toBe("Reverse Engineering Skill Collection");
      expect(rawMeta.relativeSourcePath).toBeDefined();
    }

    // Verify collections/<collectionId>.json
    const collRecordPath = path.join(userDir, "collections", `${collId}.json`);
    expect(fs.existsSync(collRecordPath)).toBe(true);

    const collRecord = JSON.parse(fs.readFileSync(collRecordPath, "utf-8"));
    expect(collRecord.id).toBe(collId);
    expect(collRecord.name).toBe("Reverse Engineering Skill Collection");
    expect(collRecord.totalSkills).toBe(3);
    expect([...collRecord.skills].sort()).toEqual([...selectedIds].sort());
    expect(collRecord.importedAt).toBeDefined();
  });
});
