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

describe("Skills Compatible: Missing Manifest Detection", () => {
  let tmpRoot: string;
  let userDir: string;
  let importer: SkillImporter;
  const activeTools = new Set(Object.keys(MCP_TOOL_SCOPE));

  beforeEach(() => {
    tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "nexus-compat-missing-manifest-"));
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

  it("yields needs_setup status instead of invalid when SKILL.md exists but skill.yaml is missing", async () => {
    const zip = createZip([
      { path: "my-skill/SKILL.md", data: "# Intelligent Triage\nDiagnose issues in project." },
    ]);

    const preview = await importer.previewZip(zip, "user");
    expect(preview.valid).toBe(false);
    expect(preview.validationStatus).toBe("needs_setup");
    expect(preview.id).toMatch(/^user\./);
    expect(preview.name["zh-CN"]).toContain("Intelligent Triage");
    expect(preview.validationErrors.some((e) => e.includes("skill.yaml"))).toBe(true);
  });

  it("yields needs_setup when only README.md is present", async () => {
    const zip = createZip([
      { path: "my-tool-repo/README.md", data: "# Tool Repo\nHelpful debugging tools." },
    ]);

    const preview = await importer.previewZip(zip, "user");
    expect(preview.validationStatus).toBe("needs_setup");
    expect(preview.skillDocFound).toBe(true);
  });
});
