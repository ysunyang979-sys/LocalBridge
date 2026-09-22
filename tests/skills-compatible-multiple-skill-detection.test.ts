import { describe, expect, it, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { SkillValidator } from "../apps/server/src/skills/skill-validator.js";
import { SkillLoader } from "../apps/server/src/skills/skill-loader.js";
import { SkillRegistry } from "../apps/server/src/skills/skill-registry.js";
import { SkillImporter } from "../apps/server/src/skills/skill-importer.js";
import { MCP_TOOL_SCOPE } from "../apps/server/src/mcp/scope-policy.js";
import { createZip } from "../apps/server/src/skills/zip-util.js";

describe("Skills Compatible: Multiple Skill Candidate Detection", () => {
  let tmpRoot: string;
  let userDir: string;
  let importer: SkillImporter;
  const activeTools = new Set(Object.keys(MCP_TOOL_SCOPE));

  beforeEach(() => {
    tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "nexus-compat-multi-skill-"));
    userDir = path.join(tmpRoot, "user-skills");
    fs.mkdirSync(userDir, { recursive: true });

    const validator = new SkillValidator(activeTools);
    const loader = new SkillLoader(validator, { userDir });
    const registry = new SkillRegistry(loader);
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

  it("discovers sub-skills in 1-level subdirectories and allows subPath targeting", async () => {
    const zip = createZip([
      { path: "repo/skills/alpha/SKILL.md", data: "# Alpha Skill" },
      { path: "repo/skills/beta/SKILL.md", data: "# Beta Skill" },
    ]);

    const preview = await importer.previewZip(zip, "user");
    expect(preview.candidateSkills?.length).toBeGreaterThanOrEqual(1);

    // Target specific sub-skill
    const targetedPreview = await importer.previewZip(zip, "user", undefined, "skills/alpha");
    expect(targetedPreview.name["zh-CN"]).toContain("Alpha Skill");
  });
});
